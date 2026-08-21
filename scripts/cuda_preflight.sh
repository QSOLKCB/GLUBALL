#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Report GLUBALL CUDA build readiness without installing packages or changing the host.
set -u

ready=1

section() {
  printf '\n== %s ==\n' "$1"
}

run_required() {
  label=$1
  shift
  printf '%s: ' "$label"
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'not found\n'
    ready=0
    return
  fi
  printf '\n'
  if "$@"; then
    :
  else
    status=$?
    printf '%s failed with exit %s\n' "$label" "$status" >&2
    ready=0
  fi
}

section "Host"
uname -a || ready=0
if [ -r /etc/os-release ]; then
  cat /etc/os-release || ready=0
fi
getconf GNU_LIBC_VERSION 2>/dev/null || true

section "Toolchain"
run_required "CMake" cmake --version
run_required "C++ compiler" c++ --version
run_required "Rust compiler" rustc --version
run_required "Cargo" cargo --version
run_required "CUDA compiler" nvcc --version

section "NVIDIA runtime"
if command -v nvidia-smi >/dev/null 2>&1; then
  nvidia-smi || ready=0
  printf '\nDetected devices:\n'
  nvidia-smi --query-gpu=index,name,driver_version,compute_cap,memory.total --format=csv || ready=0
  printf '\nSuggested device list:\n'
  nvidia-smi --query-gpu=index --format=csv,noheader 2>/dev/null | paste -sd, - || true
  capability=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader 2>/dev/null | sed -n '1p' | tr -d '. ')
  if [ -n "$capability" ]; then
    printf 'Suggested CMake option: -DGLUBALL_CUDA_ARCHITECTURES=%s\n' "$capability"
  else
    printf 'Unable to determine CUDA compute capability.\n' >&2
    ready=0
  fi
else
  printf 'nvidia-smi: not found\n'
  ready=0
fi

section "Diagnostics"
if command -v compute-sanitizer >/dev/null 2>&1; then
  compute-sanitizer --version || printf 'compute-sanitizer could not report its version (optional)\n' >&2
else
  printf 'compute-sanitizer: not found (optional)\n'
fi

section "GLUBALL build hints"
printf '%s\n' \
  'cargo build --release' \
  'cargo run --release -- self-test' \
  'cmake -S native/cuda -B build/cuda -DGLUBALL_CUDA_ARCHITECTURES=native' \
  'cmake --build build/cuda --target gluball-multi-cuda --parallel'

if [ "$ready" -eq 1 ]; then
  printf '\nGLUBALL CUDA preflight: READY\n'
  exit 0
fi
printf '\nGLUBALL CUDA preflight: BLOCKED BY ENVIRONMENT\n'
exit 2
