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

if [ "$MODE" != evidence ] && [ "$MODE" != throughput ]; then
  printf 'MODE must be evidence or throughput\n' >&2
  exit 2
fi

if [ -d "$ARTIFACT_DIR" ] && find "$ARTIFACT_DIR" -mindepth 1 -maxdepth 1 -print -quit | grep -q .; then
  printf 'refusing to reuse non-empty ARTIFACT_DIR: %s\n' "$ARTIFACT_DIR" >&2
  printf '%s\n' 'choose a fresh ARTIFACT_DIR or a new CAMPAIGN_ID so evidence from separate campaigns cannot mix.' >&2
  exit 2
fi
mkdir -p "$ARTIFACT_DIR"

finalize_artifacts() {
  if [ ! -d "$ARTIFACT_DIR" ]; then
    return
  fi
  (
    cd "$ARTIFACT_DIR"
    find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -print \
      | LC_ALL=C sort \
      | xargs -r sha256sum \
      > SHA256SUMS.txt
  ) || printf '%s\n' 'WARNING: unable to finalize SHA256SUMS.txt' >&2
}
trap finalize_artifacts EXIT

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

capture_audit() {
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
    mv "$temporary" "$destination"
    return "$status"
  fi
}

printf '%s\n' '== GLUBALL Rust reference =='
cargo test --all-targets
cargo build --release
capture_stdout "$ARTIFACT_DIR/rust-self-test.json" \
  cargo run --release --bin gluball-runtime -- self-test
capture_stdout "$ARTIFACT_DIR/rust-reference.json" \
  cargo run --release --bin gluball-runtime -- simulate \
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
cmake --build "$BUILD_DIR" --target gluball-multi-cuda gluball-cuda-evidence --parallel

run=1
while [ "$run" -le "$RUNS" ]; do
  printf '== CUDA run %s/%s ==\n' "$run" "$RUNS"
  sidecar="$ARTIFACT_DIR/cuda-run-$run.json"
  if [ "$MODE" = evidence ]; then
    evidence_output="$ARTIFACT_DIR/cuda-output-$run.f32le"
    acceptance="$ARTIFACT_DIR/cuda-acceptance-$run.json"

    if "$BUILD_DIR/gluball-cuda-evidence" \
      --mode evidence \
      --u "$U" \
      --v "$V" \
      --repeats "$REPEATS" \
      --devices "$DEVICES" \
      --repeat-run "$run" \
      --evidence-output "$evidence_output" \
      > "$sidecar"; then
      :
    else
      status=$?
      python3 -m json.tool "$sidecar" >/dev/null 2>&1 || true
      printf 'CUDA evidence producer rejected run %s with exit %s; artifacts retained.\n' "$run" "$status" >&2
      exit "$status"
    fi
    python3 -m json.tool "$sidecar" >/dev/null

    if capture_audit "$acceptance" \
      target/release/gluball-cuda-accept \
        --input "$evidence_output" \
        --cuda-sidecar "$sidecar" \
        --u "$U" \
        --v "$V" \
        --repeats "$REPEATS" \
        --repeat-run "$run"; then
      python3 -m json.tool "$acceptance" >/dev/null
    else
      status=$?
      python3 -m json.tool "$acceptance" >/dev/null 2>&1 || true
      printf 'Rust residual acceptance rejected CUDA run %s with exit %s; audit retained.\n' "$run" "$status" >&2
      exit "$status"
    fi
  else
    "$BUILD_DIR/gluball-multi-cuda" \
      --mode throughput \
      --u "$U" \
      --v "$V" \
      --repeats "$REPEATS" \
      --devices "$DEVICES" \
      --repeat-run "$run" \
      > "$sidecar"
    python3 -m json.tool "$sidecar" >/dev/null
  fi
  run=$((run + 1))
done

if command -v compute-sanitizer >/dev/null 2>&1; then
  printf '%s\n' '== Compute Sanitizer memcheck =='
  compute-sanitizer --tool memcheck --error-exitcode 86 \
    "$BUILD_DIR/gluball-multi-cuda" \
    --mode evidence --u "$U" --v "$V" --repeats 1 \
    --devices "$DEVICES" --repeat-run 999 \
    > "$ARTIFACT_DIR/memcheck-run.json" \
    2> "$ARTIFACT_DIR/memcheck.txt"

  printf '%s\n' '== Compute Sanitizer racecheck =='
  compute-sanitizer --tool racecheck --error-exitcode 87 \
    "$BUILD_DIR/gluball-multi-cuda" \
    --mode evidence --u "$U" --v "$V" --repeats 1 \
    --devices "$DEVICES" --repeat-run 1000 \
    > "$ARTIFACT_DIR/racecheck-run.json" \
    2> "$ARTIFACT_DIR/racecheck.txt"
else
  printf '%s\n' 'compute-sanitizer unavailable; sanitizer evidence not produced.'
fi

printf '\nCampaign artifacts: %s\n' "$ARTIFACT_DIR"
if [ "$MODE" = evidence ]; then
  printf '%s\n' 'Evidence mode completed with independent Rust full-readback residual acceptance.'
else
  printf '%s\n' 'Throughput mode is performance observation only and is not conformance evidence.'
fi
