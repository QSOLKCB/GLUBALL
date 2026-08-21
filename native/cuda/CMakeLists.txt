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

add_executable(gluball-multi-cuda gluball_multi_device.cu)
target_compile_features(gluball-multi-cuda PRIVATE cxx_std_17)
target_compile_definitions(
  gluball-multi-cuda
  PRIVATE GLUBALL_CUDA_ARCHITECTURES="${GLUBALL_CUDA_ARCHITECTURES_LABEL}"
)
set_target_properties(
  gluball-multi-cuda
  PROPERTIES
    CUDA_STANDARD 17
    CUDA_STANDARD_REQUIRED YES
)

if(CMAKE_CUDA_ARCHITECTURES)
  set_property(
    TARGET gluball-multi-cuda
    PROPERTY CUDA_ARCHITECTURES "${CMAKE_CUDA_ARCHITECTURES}"
  )
endif()
