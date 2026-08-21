#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Convenience runner for a rented multi-GPU GLUBALL host.
# It never installs drivers or patches vendor toolkits.
set -eu

MODE=${MODE:-evidence}
U=${U:-4096}
V=${V:-64}
REPEATS=${REPEATS:-1}
RUNS=${RUNS:-3}
DEVICES=${DEVICES:-}
BUILD_DIR=${BUILD_DIR:-build/cuda}
CAMPAIGN_ID=${CAMPAIGN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}
ARTIFACT_DIR=${ARTIFACT_DIR:-artifacts/vast-campaign-$CAMPAIGN_ID}

if [ -d "$ARTIFACT_DIR" ] && find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  printf 'refusing to reuse non-empty ARTIFACT_DIR: %s\n' "$ARTIFACT_DIR" >&2
  printf '%s\n' 'choose a fresh ARTIFACT_DIR or a new CAMPAIGN_ID so evidence from separate campaigns cannot mix.' >&2
  exit 2
fi
mkdir -p "$ARTIFACT_DIR"

capture_stdout() {
  destination=$1
  shift
  temporary="$destination.tmp"
  rm -f "$temporary"
  if "$@" >"$temporary"; then
    cat "$temporary"
    mv "$temporary" "$destination"
  else
    status=$?
    cat "$temporary"
    rm -f "$temporary"
    return "$status"
  fi
}

printf '%s\n' '== GLUBALL Rust reference =='
cargo test --all-targets
cargo build --release
capture_stdout "$ARTIFACT_DIR/rust-self-test.json" \
  cargo run --release -- self-test
capture_stdout "$ARTIFACT_DIR/rust-reference.json" \
  cargo run --release -- simulate \
    --u "$U" --v "$V" --repeats "$REPEATS" \
    --workers "${RUST_WORKERS:-32}" \
    --device-slots "${LOGICAL_DEVICE_SLOTS:-1}"

printf '%s\n' '== CUDA preflight =='
capture_stdout "$ARTIFACT_DIR/cuda-preflight.txt" \
  sh scripts/cuda_preflight.sh

if [ -z "$DEVICES" ]; then
  DEVICES=$(nvidia-smi --query-gpu=index --format=csv,noheader | paste -sd, -)
fi
printf 'Selected devices: %s\n' "$DEVICES" | tee "$ARTIFACT_DIR/selected-devices.txt"

ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
printf '%s\n' '== CUDA build =='
cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-multi-cuda --parallel

run=1
while [ "$run" -le "$RUNS" ]; do
  printf '== CUDA run %s/%s ==\n' "$run" "$RUNS"
  "$BUILD_DIR/gluball-multi-cuda" \
    --mode "$MODE" \
    --u "$U" \
    --v "$V" \
    --repeats "$REPEATS" \
    --devices "$DEVICES" \
    --repeat-run "$run" \
    > "$ARTIFACT_DIR/cuda-run-$run.json"
  python3 -m json.tool "$ARTIFACT_DIR/cuda-run-$run.json" >/dev/null
  run=$((run + 1))
done

if command -v compute-sanitizer >/dev/null 2>&1; then
  printf '%s\n' '== Compute Sanitizer memcheck =='
  compute-sanitizer --tool memcheck \
    "$BUILD_DIR/gluball-multi-cuda" \
    --mode evidence --u "$U" --v "$V" --repeats 1 \
    --devices "$DEVICES" --repeat-run 999 \
    > "$ARTIFACT_DIR/memcheck-run.json" \
    2> "$ARTIFACT_DIR/memcheck.txt"

  printf '%s\n' '== Compute Sanitizer racecheck =='
  compute-sanitizer --tool racecheck \
    "$BUILD_DIR/gluball-multi-cuda" \
    --mode evidence --u "$U" --v "$V" --repeats 1 \
    --devices "$DEVICES" --repeat-run 1000 \
    > "$ARTIFACT_DIR/racecheck-run.json" \
    2> "$ARTIFACT_DIR/racecheck.txt"
else
  printf '%s\n' 'compute-sanitizer unavailable; sanitizer evidence not produced.'
fi

(
  cd "$ARTIFACT_DIR"
  find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print \
    | LC_ALL=C sort \
    | xargs sha256sum \
    > SHA256SUMS.txt
)

printf '\nCampaign artifacts: %s\n' "$ARTIFACT_DIR"
printf '%s\n' 'NOTE: CUDA sidecars remain non-conformance observations until an independent Rust residual harness accepts them.'
