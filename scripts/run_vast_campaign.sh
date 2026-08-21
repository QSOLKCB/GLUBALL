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
ARTIFACT_DIR=${ARTIFACT_DIR:-artifacts/vast-campaign}

mkdir -p "$ARTIFACT_DIR"

printf '%s\n' '== GLUBALL Rust reference =='
cargo test --all-targets
cargo build --release
cargo run --release -- self-test | tee "$ARTIFACT_DIR/rust-self-test.json"
cargo run --release -- simulate \
  --u "$U" --v "$V" --repeats "$REPEATS" \
  --workers "${RUST_WORKERS:-32}" \
  --device-slots "${LOGICAL_DEVICE_SLOTS:-1}" \
  | tee "$ARTIFACT_DIR/rust-reference.json"

printf '%s\n' '== CUDA preflight =='
sh scripts/cuda_preflight.sh | tee "$ARTIFACT_DIR/cuda-preflight.txt"

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
  find . -maxdepth 1 -type f -print | LC_ALL=C sort | xargs sha256sum > SHA256SUMS.txt
)

printf '\nCampaign artifacts: %s\n' "$ARTIFACT_DIR"
printf '%s\n' 'NOTE: CUDA sidecars remain non-conformance observations until an independent Rust residual harness accepts them.'
