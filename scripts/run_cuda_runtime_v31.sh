#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
set -eu

U=${U:-16384}
V=${V:-128}
REPEATS=${REPEATS:-1}
DEVICES=${DEVICES:-0}
BLOCK_SIZE=${BLOCK_SIZE:-256}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
CUDA_GRAPHS=${CUDA_GRAPHS:-off}
REDUCTION=${REDUCTION:-atomic}
REPEAT_RUN=${REPEAT_RUN:-0}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v31}
OUTPUT=${OUTPUT:-}

case "$CUDA_GRAPHS" in on|off) ;; *) echo 'CUDA_GRAPHS must be on or off' >&2; exit 2 ;; esac
case "$REDUCTION" in atomic|two-stage) ;; *) echo 'REDUCTION must be atomic or two-stage' >&2; exit 2 ;; esac

cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v31 --parallel

run() {
  "$BUILD_DIR/gluball-cuda-runtime-v31" \
    --mode throughput \
    --u "$U" \
    --v "$V" \
    --repeats "$REPEATS" \
    --devices "$DEVICES" \
    --block-size "$BLOCK_SIZE" \
    --warmup "$WARMUP" \
    --iterations "$ITERATIONS" \
    --cuda-graphs "$CUDA_GRAPHS" \
    --reduction "$REDUCTION" \
    --repeat-run "$REPEAT_RUN"
}

if [ -n "$OUTPUT" ]; then
  mkdir -p "$(dirname "$OUTPUT")"
  run > "$OUTPUT.tmp"
  python3 -m json.tool "$OUTPUT.tmp" >/dev/null
  mv "$OUTPUT.tmp" "$OUTPUT"
else
  run
fi
