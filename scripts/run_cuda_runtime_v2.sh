#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Build and run the additive GLUBALL CUDA Runtime V2 throughput observer.
set -eu

U=${U:-16384}
V=${V:-128}
REPEATS=${REPEATS:-1}
DEVICES=${DEVICES:-0}
BLOCK_SIZE=${BLOCK_SIZE:-256}
WARMUP=${WARMUP:-2}
ITERATIONS=${ITERATIONS:-10}
CUDA_GRAPHS=${CUDA_GRAPHS:-off}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v2}
OUTPUT=${OUTPUT:-}
REPEAT_RUN=${REPEAT_RUN:-0}

case "$CUDA_GRAPHS" in
  on|off) ;;
  *) printf 'CUDA_GRAPHS must be on or off\n' >&2; exit 2 ;;
esac

cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v2 --parallel

run_runtime() {
  "$BUILD_DIR/gluball-cuda-runtime-v2" \
    --mode throughput \
    --u "$U" \
    --v "$V" \
    --repeats "$REPEATS" \
    --devices "$DEVICES" \
    --block-size "$BLOCK_SIZE" \
    --warmup "$WARMUP" \
    --iterations "$ITERATIONS" \
    --cuda-graphs "$CUDA_GRAPHS" \
    --repeat-run "$REPEAT_RUN"
}

if [ -n "$OUTPUT" ]; then
  temporary="$OUTPUT.tmp"
  rm -f "$temporary"
  if run_runtime > "$temporary"; then
    python3 -m json.tool "$temporary" >/dev/null
    mv "$temporary" "$OUTPUT"
    cat "$OUTPUT"
  else
    status=$?
    cat "$temporary" 2>/dev/null || true
    rm -f "$temporary"
    exit "$status"
  fi
else
  run_runtime
fi
