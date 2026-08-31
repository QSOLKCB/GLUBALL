cmake_minimum_required(VERSION 3.24)
project(gluball_cuda LANGUAGES CXX CUDA)

set(
  GLUBALL_CUDA_ARCHITECTURES
  "native"
  CACHE STRING
  "CUDA architectures for GLUBALL adapters (examples: native, 86, 89, 120)"
)

if(GLUBALL_CUDA_ARCHITECTURES)
  set(CMAKE_CUDA_ARCHITECTURES "${GLUBALL_CUDA_ARCHITECTURES}")
endif()

if(CMAKE_CUDA_ARCHITECTURES)
  string(REPLACE ";" "," GLUBALL_CUDA_ARCHITECTURES_LABEL "${CMAKE_CUDA_ARCHITECTURES}")
else()
  set(GLUBALL_CUDA_ARCHITECTURES_LABEL "compiler-default")
endif()

message(STATUS "GLUBALL CUDA architectures: ${GLUBALL_CUDA_ARCHITECTURES_LABEL}")

function(gluball_cuda_target target source)
  add_executable(${target} ${source})
  target_compile_features(${target} PRIVATE cxx_std_17)
  target_compile_definitions(
    ${target}
    PRIVATE GLUBALL_CUDA_ARCHITECTURES="${GLUBALL_CUDA_ARCHITECTURES_LABEL}"
  )
  set_target_properties(
    ${target}
    PROPERTIES
      CUDA_STANDARD 17
      CUDA_STANDARD_REQUIRED YES
  )
  if(CMAKE_CUDA_ARCHITECTURES)
    set_property(
      TARGET ${target}
      PROPERTY CUDA_ARCHITECTURES "${CMAKE_CUDA_ARCHITECTURES}"
    )
  endif()
endfunction()

gluball_cuda_target(gluball-multi-cuda gluball_multi_device.cu)
gluball_cuda_target(gluball-cuda-evidence gluball_evidence.cu)
gluball_cuda_target(gluball-cuda-runtime-v2 gluball_runtime_v2.cu)

target_compile_options(
  gluball-cuda-runtime-v2
  PRIVATE
    $<$<COMPILE_LANGUAGE:CUDA>:--pre-include=${CMAKE_CURRENT_SOURCE_DIR}/gluball_runtime_v2_event_compat.cuh>
)
