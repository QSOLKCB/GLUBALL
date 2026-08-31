// SPDX-License-Identifier: MPL-2.0
// GLUBALL CUDA Runtime V3.1: additive pre-rental efficiency observer.
// V2 remains the frozen performance oracle and V3 remains the merged baseline.

#include <cuda_runtime.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iomanip>
#include <iostream>
#include <limits>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <vector>

#ifndef GLUBALL_CUDA_ARCHITECTURES
#define GLUBALL_CUDA_ARCHITECTURES "unspecified"
#endif

namespace gluball_cuda_v31 {

constexpr const char* kSchema = "GLUBALL-CUDA-RUNTIME-V31-SIDECAR-V1";
constexpr const char* kContract = "GLUBALL-CUDA-RUNTIME-V3.1";
constexpr const char* kV3Contract = "GLUBALL-CUDA-RUNTIME-V3";
constexpr const char* kV3ReferenceBlobSha = "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0";
constexpr const char* kV2Contract = "GLUBALL-CUDA-RUNTIME-V2";
constexpr const char* kV2ReferenceBlobSha = "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1";
constexpr const char* kLegacyCudaContract = "GLUBALL-MULTI-DEVICE-CUDA-V1";
constexpr const char* kAcceptanceContract = "GLUBALL-CUDA-ACCEPTANCE-V1";
constexpr const char* kGeometryContract = "GLUBALL-KNOT-V1";
constexpr const char* kHostRuntimeContract = "GLUBALL-RUST-RUNTIME-V1";
constexpr const char* kFloatingPointAdapterProfile = "gluball-cuda-f32-v1";
constexpr std::uint32_t kDefaultU = 16384;
constexpr std::uint32_t kDefaultV = 128;
constexpr std::uint32_t kDefaultRepeats = 1;
constexpr std::uint32_t kDefaultBlockSize = 256;
constexpr std::uint32_t kDefaultWarmup = 2;
constexpr std::uint32_t kDefaultIterations = 10;
constexpr std::uint32_t kMaximumDevices = 16;
constexpr std::uint32_t kWarpSize = 32;
constexpr std::uint32_t kReductionThreads = 256;
constexpr float kRadiusObservationGate = 5.0e-5F;
constexpr std::int64_t kScale = 1000000;
constexpr std::int64_t kMajorRadiusFixed = 2100000;
constexpr std::int64_t kMinorRadiusFixed = 850000;
constexpr std::int64_t kTubeRadiusFixed = 340000;
constexpr float kTau = 6.2831853071795864769F;

struct TorusSignature {
  std::uint32_t first;
  std::uint32_t second;
};

constexpr TorusSignature swap_torus_signature(TorusSignature signature) {
  return TorusSignature{signature.second, signature.first};
}

constexpr TorusSignature kCanonicalTorusSignature{2U, 3U};
constexpr TorusSignature kSwappedTorusSignature = swap_torus_signature(kCanonicalTorusSignature);
constexpr TorusSignature kDoubleSwappedTorusSignature = swap_torus_signature(kSwappedTorusSignature);
static_assert(kSwappedTorusSignature.first == 3U && kSwappedTorusSignature.second == 2U,
              "canonical (2,3) torus signature must swap to (3,2)");
static_assert(kDoubleSwappedTorusSignature.first == kCanonicalTorusSignature.first
                  && kDoubleSwappedTorusSignature.second == kCanonicalTorusSignature.second,
              "torus signature coordinate swap must remain involutive");
static_assert(kCanonicalTorusSignature.first != kSwappedTorusSignature.first
                  || kCanonicalTorusSignature.second != kSwappedTorusSignature.second,
              "(2,3) and (3,2) remain distinct ordered signatures");

enum class ReductionMode {
  Atomic,
  TwoStage,
};

inline const char* reduction_mode_name(ReductionMode mode) {
  return mode == ReductionMode::Atomic ? "atomic" : "two-stage";
}

struct Options {
  std::uint32_t u = kDefaultU;
  std::uint32_t v = kDefaultV;
  std::uint32_t repeats = kDefaultRepeats;
  std::uint32_t block_size = kDefaultBlockSize;
  std::uint32_t warmup = kDefaultWarmup;
  std::uint32_t iterations = kDefaultIterations;
  std::uint32_t repeat_run = 0;
  bool cuda_graphs = false;
  ReductionMode reduction_mode = ReductionMode::Atomic;
  std::vector<int> devices;
};

struct Frame {
  float3 centre;
  float3 normal;
  float3 binormal;
};

struct alignas(8) CompactMetrics {
  unsigned long long digest;
  unsigned int max_radius_bits;
  unsigned int reserved;
  unsigned long long nonfinite_count;
};
static_assert(sizeof(CompactMetrics) == 24, "V3.1 compact metric record must remain 24 bytes");
static_assert(alignof(CompactMetrics) >= 8, "V3.1 compact metric record requires 8-byte alignment");

struct DeviceContext {
  int cuda_index = -1;
  cudaDeviceProp properties{};
  cudaStream_t stream = nullptr;
  cudaEvent_t start_event = nullptr;
  cudaEvent_t stop_event = nullptr;
  cudaGraph_t graph = nullptr;
  cudaGraphExec_t graph_exec = nullptr;
  Frame* frames = nullptr;
  float2* weighted_angles = nullptr;
  CompactMetrics* metrics = nullptr;
  CompactMetrics* block_metrics = nullptr;
  std::uint64_t ring_start = 0;
  std::uint64_t ring_end = 0;
  std::uint64_t start = 0;
  std::uint64_t end = 0;
  std::uint64_t blocks = 0;
  CompactMetrics host_metrics{};
  std::uint32_t compiled_arch_code = 0;
  std::string redacted_id;
  std::vector<double> kernel_samples_ms;
};

inline void check_cuda(cudaError_t status, const char* operation) {
  if (status != cudaSuccess) {
    throw std::runtime_error(std::string(operation) + ": " + cudaGetErrorString(status));
  }
}

inline std::uint64_t parse_unsigned(std::string_view text, std::string_view option) {
  const std::string value(text);
  std::size_t consumed = 0;
  const unsigned long long parsed = std::stoull(value, &consumed, 10);
  if (consumed != value.size()) {
    throw std::runtime_error(std::string(option) + " requires an unsigned integer");
  }
  return static_cast<std::uint64_t>(parsed);
}

inline bool is_power_of_two(std::uint32_t value) {
  return value != 0 && (value & (value - 1U)) == 0;
}

inline std::vector<int> parse_devices(std::string_view text) {
  std::vector<int> devices;
  std::set<int> seen;
  std::size_t start = 0;
  while (start < text.size()) {
    const std::size_t comma = text.find(',', start);
    const std::size_t end = comma == std::string_view::npos ? text.size() : comma;
    if (end == start) throw std::runtime_error("--devices contains an empty index");
    const auto parsed = parse_unsigned(text.substr(start, end - start), "--devices");
    if (parsed > static_cast<std::uint64_t>(std::numeric_limits<int>::max())) {
      throw std::runtime_error("--devices index outside int range");
    }
    const int index = static_cast<int>(parsed);
    if (!seen.insert(index).second) throw std::runtime_error("--devices contains a duplicate index");
    devices.push_back(index);
    if (comma == std::string_view::npos) break;
    start = comma + 1;
  }
  if (devices.empty() || devices.size() > kMaximumDevices) {
    throw std::runtime_error("--devices must select between 1 and 16 unique devices");
  }
  return devices;
}

inline Options parse_options(int argc, char** argv) {
  Options options;
  for (int index = 1; index < argc; ++index) {
    const std::string_view argument(argv[index]);
    auto require_value = [&](std::string_view name) -> std::string_view {
      if (index + 1 >= argc) throw std::runtime_error(std::string(name) + " requires a value");
      return argv[++index];
    };
    if (argument == "--u") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value < 12 || value > 1000000ULL) throw std::runtime_error("--u must be in [12,1000000]");
      options.u = static_cast<std::uint32_t>(value);
    } else if (argument == "--v") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value < 6 || value > 65536ULL) throw std::runtime_error("--v must be in [6,65536]");
      options.v = static_cast<std::uint32_t>(value);
    } else if (argument == "--repeats") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value == 0 || value > std::numeric_limits<std::uint32_t>::max()) throw std::runtime_error("--repeats outside range");
      options.repeats = static_cast<std::uint32_t>(value);
    } else if (argument == "--block-size") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value < kWarpSize || value > 1024ULL || !is_power_of_two(static_cast<std::uint32_t>(value))) {
        throw std::runtime_error("--block-size must be a power of two in [32,1024]");
      }
      options.block_size = static_cast<std::uint32_t>(value);
    } else if (argument == "--warmup") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value > 1000) throw std::runtime_error("--warmup must be in [0,1000]");
      options.warmup = static_cast<std::uint32_t>(value);
    } else if (argument == "--iterations") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value == 0 || value > 10000) throw std::runtime_error("--iterations must be in [1,10000]");
      options.iterations = static_cast<std::uint32_t>(value);
    } else if (argument == "--devices") {
      options.devices = parse_devices(require_value(argument));
    } else if (argument == "--cuda-graphs") {
      const std::string value(require_value(argument));
      if (value == "on") options.cuda_graphs = true;
      else if (value == "off") options.cuda_graphs = false;
      else throw std::runtime_error("--cuda-graphs must be on or off");
    } else if (argument == "--reduction") {
      const std::string value(require_value(argument));
      if (value == "atomic") options.reduction_mode = ReductionMode::Atomic;
      else if (value == "two-stage") options.reduction_mode = ReductionMode::TwoStage;
      else throw std::runtime_error("--reduction must be atomic or two-stage");
    } else if (argument == "--mode") {
      const std::string value(require_value(argument));
      if (value != "throughput") {
        throw std::runtime_error("Runtime V3.1 is throughput-only; use the V1 evidence path for correctness evidence");
      }
    } else if (argument == "--repeat-run") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value > std::numeric_limits<std::uint32_t>::max()) throw std::runtime_error("--repeat-run outside range");
      options.repeat_run = static_cast<std::uint32_t>(value);
    } else if (argument == "--help" || argument == "-h") {
      std::cout
          << "GLUBALL CUDA Runtime V3.1 efficiency observer\n\n"
          << "  --u N                 u segments (default 16384)\n"
          << "  --v N                 v segments (default 128)\n"
          << "  --repeats N           repeat full mesh N times\n"
          << "  --devices A,B,...     1..16 unique CUDA indices\n"
          << "  --block-size N        power of two in [32,1024] (default 256)\n"
          << "  --warmup N            in-process warmup iterations (default 2)\n"
          << "  --iterations N        measured in-process iterations (default 10)\n"
          << "  --cuda-graphs on|off  capture fixed work per device (default off)\n"
          << "  --reduction MODE      atomic|two-stage (default atomic)\n"
          << "  --mode throughput     accepted for campaign-script symmetry\n"
          << "  --repeat-run N        audit run ordinal\n";
      std::exit(EXIT_SUCCESS);
    } else {
      throw std::runtime_error("unknown option: " + std::string(argument));
    }
  }
  return options;
}

__host__ __device__ inline float3 vadd(float3 a, float3 b) {
  return make_float3(a.x + b.x, a.y + b.y, a.z + b.z);
}
__host__ __device__ inline float3 vsub(float3 a, float3 b) {
  return make_float3(a.x - b.x, a.y - b.y, a.z - b.z);
}
__host__ __device__ inline float3 vscale(float3 a, float s) {
  return make_float3(a.x * s, a.y * s, a.z * s);
}
__host__ __device__ inline float vdot(float3 a, float3 b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
__host__ __device__ inline float3 vcross(float3 a, float3 b) {
  return make_float3(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x);
}
__host__ __device__ inline float vnorm(float3 a) {
  return sqrtf(vdot(a, a));
}
__host__ __device__ inline float3 vnormalize(float3 a) {
  const float norm = vnorm(a);
  return norm > 0.0F ? vscale(a, 1.0F / norm) : make_float3(0.0F, 0.0F, 0.0F);
}
__host__ __device__ inline float major_radius() {
  return static_cast<float>(kMajorRadiusFixed) / static_cast<float>(kScale);
}
__host__ __device__ inline float minor_radius() {
  return static_cast<float>(kMinorRadiusFixed) / static_cast<float>(kScale);
}
__host__ __device__ inline float tube_radius() {
  return static_cast<float>(kTubeRadiusFixed) / static_cast<float>(kScale);
}

// V3.1 factors the canonical T(2,3) trigonometric terms once per u frame.
__global__ void precompute_frames_v31(Frame* frames, std::uint32_t u_count) {
  const std::uint32_t u = blockIdx.x * blockDim.x + threadIdx.x;
  if (u >= u_count) return;
  const float t = kTau * static_cast<float>(u) / static_cast<float>(u_count);
  const float major = 2.0F * t;
  const float minor = 3.0F * t;
  const float cos_major = cosf(major);
  const float sin_major = sinf(major);
  const float cos_minor = cosf(minor);
  const float sin_minor = sinf(minor);
  const float minor_r = minor_radius();
  const float radial = major_radius() + minor_r * cos_minor;
  const float radial_prime = -minor_r * 3.0F * sin_minor;
  const float3 centre = make_float3(
      radial * cos_major,
      radial * sin_major,
      minor_r * sin_minor);
  const float3 derivative = make_float3(
      radial_prime * cos_major - 2.0F * radial * sin_major,
      radial_prime * sin_major + 2.0F * radial * cos_major,
      minor_r * 3.0F * cos_minor);
  const float3 tangent = vnormalize(derivative);
  const float3 normal = make_float3(
      cos_minor * cos_major,
      cos_minor * sin_major,
      sin_minor);
  const float3 binormal = vnormalize(vcross(tangent, normal));
  frames[u] = Frame{centre, normal, binormal};
}

// The radius multiplication is moved into immutable setup, preserving one f32
// multiply after cosf/sinf rather than repeating it for every (u,v) point.
__global__ void precompute_weighted_angles(float2* weighted_angles, std::uint32_t v_count) {
  const std::uint32_t v = blockIdx.x * blockDim.x + threadIdx.x;
  if (v >= v_count) return;
  const float angle = kTau * static_cast<float>(v) / static_cast<float>(v_count);
  weighted_angles[v] = make_float2(
      cosf(angle) * tube_radius(),
      sinf(angle) * tube_radius());
}

__device__ inline Frame warp_broadcast_frame(const Frame* frames, std::uint32_t u) {
  constexpr unsigned int mask = 0xffffffffU;
  const unsigned int lane = threadIdx.x & (kWarpSize - 1U);
  Frame frame{};
  if (lane == 0U) frame = frames[u];
  frame.centre.x = __shfl_sync(mask, frame.centre.x, 0);
  frame.centre.y = __shfl_sync(mask, frame.centre.y, 0);
  frame.centre.z = __shfl_sync(mask, frame.centre.z, 0);
  frame.normal.x = __shfl_sync(mask, frame.normal.x, 0);
  frame.normal.y = __shfl_sync(mask, frame.normal.y, 0);
  frame.normal.z = __shfl_sync(mask, frame.normal.z, 0);
  frame.binormal.x = __shfl_sync(mask, frame.binormal.x, 0);
  frame.binormal.y = __shfl_sync(mask, frame.binormal.y, 0);
  frame.binormal.z = __shfl_sync(mask, frame.binormal.z, 0);
  return frame;
}

__device__ inline float3 surface_point_weighted(
    const Frame& frame,
    const float2& weighted_angle,
    float* radius_error) {
  const float3 offset = vadd(
      vscale(frame.normal, weighted_angle.x),
      vscale(frame.binormal, weighted_angle.y));
  const float3 point = vadd(frame.centre, offset);
  *radius_error = fabsf(vnorm(vsub(point, frame.centre)) - tube_radius());
  return point;
}

__device__ inline std::uint64_t mix64(std::uint64_t value) {
  value ^= value >> 30;
  value *= 0xbf58476d1ce4e5b9ULL;
  value ^= value >> 27;
  value *= 0x94d049bb133111ebULL;
  value ^= value >> 31;
  return value;
}

__global__ void record_compiled_arch(std::uint32_t* code) {
  if (blockIdx.x == 0U && threadIdx.x == 0U) {
#ifdef __CUDA_ARCH__
    *code = static_cast<std::uint32_t>(__CUDA_ARCH__);
#else
    *code = 0U;
#endif
  }
}

__global__ void evaluate_rings_v31(
    std::uint64_t ring_start,
    std::uint64_t ring_count,
    std::uint32_t u_count,
    std::uint32_t v_count,
    const Frame* __restrict__ frames,
    const float2* __restrict__ weighted_angles,
    CompactMetrics* metrics,
    CompactMetrics* block_metrics,
    bool two_stage) {
  __shared__ unsigned long long warp_digest[32];
  __shared__ unsigned int warp_radius[32];
  __shared__ unsigned long long warp_nonfinite[32];

  constexpr unsigned int mask = 0xffffffffU;
  const unsigned int lane = threadIdx.x & (kWarpSize - 1U);
  const unsigned int warp_index = threadIdx.x / kWarpSize;
  const unsigned int warps_per_block = blockDim.x / kWarpSize;
  const std::uint64_t local_ring = static_cast<std::uint64_t>(blockIdx.x) * warps_per_block + warp_index;

  unsigned long long token = 0ULL;
  unsigned int radius_bits = 0U;
  unsigned long long nonfinite = 0ULL;

  if (local_ring < ring_count) {
    const std::uint64_t ring_task = ring_start + local_ring;
    const std::uint64_t repeat_index = ring_task / u_count;
    const auto u = static_cast<std::uint32_t>(ring_task - repeat_index * u_count);
    const Frame frame = warp_broadcast_frame(frames, u);

    for (std::uint32_t v = lane; v < v_count; v += kWarpSize) {
      float radius_error = 0.0F;
      const float2 weighted_angle = weighted_angles[v];
      const float3 point = surface_point_weighted(frame, weighted_angle, &radius_error);
      const bool finite = isfinite(point.x) && isfinite(point.y) && isfinite(point.z) && isfinite(radius_error);
      if (finite) {
        radius_bits = max(radius_bits, __float_as_uint(radius_error));
      } else {
        ++nonfinite;
      }

      const std::uint64_t linear = ring_task * static_cast<std::uint64_t>(v_count) + v;
      const std::uint64_t packed_xy =
          (static_cast<std::uint64_t>(__float_as_uint(point.x)) << 32)
          | static_cast<std::uint64_t>(__float_as_uint(point.y));
      const std::uint64_t packed_ze =
          (static_cast<std::uint64_t>(__float_as_uint(point.z)) << 32)
          | static_cast<std::uint64_t>(__float_as_uint(radius_error));
      token ^= static_cast<unsigned long long>(mix64(linear) ^ mix64(packed_xy) ^ mix64(packed_ze));
    }
  }

  for (unsigned int offset = kWarpSize / 2U; offset > 0U; offset >>= 1U) {
    token ^= __shfl_down_sync(mask, token, offset);
    radius_bits = max(radius_bits, __shfl_down_sync(mask, radius_bits, offset));
    nonfinite += __shfl_down_sync(mask, nonfinite, offset);
  }

  if (lane == 0U) {
    warp_digest[warp_index] = token;
    warp_radius[warp_index] = radius_bits;
    warp_nonfinite[warp_index] = nonfinite;
  }
  __syncthreads();

  if (warp_index == 0U) {
    unsigned long long block_digest = lane < warps_per_block ? warp_digest[lane] : 0ULL;
    unsigned int block_radius = lane < warps_per_block ? warp_radius[lane] : 0U;
    unsigned long long block_nonfinite = lane < warps_per_block ? warp_nonfinite[lane] : 0ULL;

    for (unsigned int offset = kWarpSize / 2U; offset > 0U; offset >>= 1U) {
      block_digest ^= __shfl_down_sync(mask, block_digest, offset);
      block_radius = max(block_radius, __shfl_down_sync(mask, block_radius, offset));
      block_nonfinite += __shfl_down_sync(mask, block_nonfinite, offset);
    }

    if (lane == 0U) {
      if (two_stage) {
        block_metrics[blockIdx.x] = CompactMetrics{
            block_digest,
            block_radius,
            0U,
            block_nonfinite};
      } else {
        atomicXor(&metrics->digest, block_digest);
        atomicMax(&metrics->max_radius_bits, block_radius);
        if (block_nonfinite != 0ULL) {
          atomicAdd(&metrics->nonfinite_count, block_nonfinite);
        }
      }
    }
  }
}

__global__ void reduce_block_metrics_v31(
    const CompactMetrics* __restrict__ block_metrics,
    std::uint64_t block_count,
    CompactMetrics* output) {
  __shared__ unsigned long long warp_digest[32];
  __shared__ unsigned int warp_radius[32];
  __shared__ unsigned long long warp_nonfinite[32];

  constexpr unsigned int mask = 0xffffffffU;
  const unsigned int lane = threadIdx.x & (kWarpSize - 1U);
  const unsigned int warp_index = threadIdx.x / kWarpSize;
  const unsigned int warps_per_block = blockDim.x / kWarpSize;

  unsigned long long digest = 0ULL;
  unsigned int radius = 0U;
  unsigned long long nonfinite = 0ULL;
  for (std::uint64_t index = threadIdx.x; index < block_count; index += blockDim.x) {
    const CompactMetrics value = block_metrics[index];
    digest ^= value.digest;
    radius = max(radius, value.max_radius_bits);
    nonfinite += value.nonfinite_count;
  }

  for (unsigned int offset = kWarpSize / 2U; offset > 0U; offset >>= 1U) {
    digest ^= __shfl_down_sync(mask, digest, offset);
    radius = max(radius, __shfl_down_sync(mask, radius, offset));
    nonfinite += __shfl_down_sync(mask, nonfinite, offset);
  }
  if (lane == 0U) {
    warp_digest[warp_index] = digest;
    warp_radius[warp_index] = radius;
    warp_nonfinite[warp_index] = nonfinite;
  }
  __syncthreads();

  if (warp_index == 0U) {
    unsigned long long final_digest = lane < warps_per_block ? warp_digest[lane] : 0ULL;
    unsigned int final_radius = lane < warps_per_block ? warp_radius[lane] : 0U;
    unsigned long long final_nonfinite = lane < warps_per_block ? warp_nonfinite[lane] : 0ULL;
    for (unsigned int offset = kWarpSize / 2U; offset > 0U; offset >>= 1U) {
      final_digest ^= __shfl_down_sync(mask, final_digest, offset);
      final_radius = max(final_radius, __shfl_down_sync(mask, final_radius, offset));
      final_nonfinite += __shfl_down_sync(mask, final_nonfinite, offset);
    }
    if (lane == 0U) {
      output[0] = CompactMetrics{final_digest, final_radius, 0U, final_nonfinite};
    }
  }
}

inline std::uint64_t fnv_update(
    std::uint64_t state,
    const unsigned char* data,
    std::size_t size) {
  constexpr std::uint64_t prime = 0x100000001b3ULL;
  for (std::size_t index = 0; index < size; ++index) {
    state ^= static_cast<std::uint64_t>(data[index]);
    state *= prime;
  }
  return state;
}

inline std::string redacted_device_id(const cudaUUID_t& uuid) {
  std::uint64_t state = 0xcbf29ce484222325ULL;
  state = fnv_update(state, reinterpret_cast<const unsigned char*>(kContract), std::strlen(kContract));
  state = fnv_update(state, reinterpret_cast<const unsigned char*>(uuid.bytes), sizeof(uuid.bytes));
  std::ostringstream output;
  output << std::hex << std::setw(16) << std::setfill('0') << state;
  return output.str();
}

inline std::string json_escape(std::string_view input) {
  std::ostringstream output;
  for (const unsigned char character : input) {
    if (character == '"') output << "\\\"";
    else if (character == '\\') output << "\\\\";
    else if (character < 0x20U) output << '?';
    else output << static_cast<char>(character);
  }
  return output.str();
}

inline std::string format_cuda_version(int value) {
  if (value <= 0) return "unknown";
  std::ostringstream output;
  output << value / 1000 << '.' << (value % 1000) / 10;
  if (value % 10 != 0) output << '.' << value % 10;
  return output.str();
}

inline std::string format_sm_arch(std::uint32_t cuda_arch_code) {
  if (cuda_arch_code == 0U) return "unknown";
  std::ostringstream output;
  output << "sm_" << cuda_arch_code / 10U;
  return output.str();
}

inline float float_from_bits(std::uint32_t bits) {
  float value = 0.0F;
  static_assert(sizeof(value) == sizeof(bits), "float/u32 size mismatch");
  std::memcpy(&value, &bits, sizeof(value));
  return value;
}

inline double median(std::vector<double> values) {
  if (values.empty()) return 0.0;
  std::sort(values.begin(), values.end());
  const std::size_t middle = values.size() / 2U;
  if (values.size() % 2U == 1U) return values[middle];
  return (values[middle - 1U] + values[middle]) / 2.0;
}

inline std::uint32_t probe_compiled_architecture() {
  std::uint32_t* device_code = nullptr;
  std::uint32_t host_code = 0U;
  check_cuda(cudaMalloc(reinterpret_cast<void**>(&device_code), sizeof(std::uint32_t)), "cudaMalloc(compiled_arch_probe)");
  try {
    record_compiled_arch<<<1, 1>>>(device_code);
    check_cuda(cudaGetLastError(), "record_compiled_arch launch");
    check_cuda(cudaDeviceSynchronize(), "cudaDeviceSynchronize(compiled_arch_probe)");
    check_cuda(cudaMemcpy(&host_code, device_code, sizeof(host_code), cudaMemcpyDeviceToHost), "cudaMemcpy(compiled_arch_probe)");
    check_cuda(cudaFree(device_code), "cudaFree(compiled_arch_probe)");
  } catch (...) {
    cudaFree(device_code);
    throw;
  }
  return host_code;
}

inline void precompute_geometry(DeviceContext& device, const Options& options) {
  constexpr unsigned int threads = 256U;
  const unsigned int frame_blocks = (options.u + threads - 1U) / threads;
  const unsigned int angle_blocks = (options.v + threads - 1U) / threads;
  precompute_frames_v31<<<frame_blocks, threads, 0, device.stream>>>(device.frames, options.u);
  check_cuda(cudaGetLastError(), "precompute_frames_v31 launch");
  precompute_weighted_angles<<<angle_blocks, threads, 0, device.stream>>>(device.weighted_angles, options.v);
  check_cuda(cudaGetLastError(), "precompute_weighted_angles launch");
  check_cuda(cudaStreamSynchronize(device.stream), "cudaStreamSynchronize(precompute_geometry)");
}

inline void enqueue_iteration(DeviceContext& device, const Options& options) {
  check_cuda(cudaMemsetAsync(device.metrics, 0, sizeof(CompactMetrics), device.stream), "cudaMemsetAsync(compact_metrics)");
  check_cuda(cudaEventRecord(device.start_event, device.stream), "cudaEventRecord(kernel-start)");
  const bool two_stage = options.reduction_mode == ReductionMode::TwoStage;
  evaluate_rings_v31<<<
      static_cast<unsigned int>(device.blocks),
      options.block_size,
      0,
      device.stream>>>(
      device.ring_start,
      device.ring_end - device.ring_start,
      options.u,
      options.v,
      device.frames,
      device.weighted_angles,
      device.metrics,
      device.block_metrics,
      two_stage);
  check_cuda(cudaGetLastError(), "evaluate_rings_v31 launch");
  if (two_stage) {
    reduce_block_metrics_v31<<<1, kReductionThreads, 0, device.stream>>>(
        device.block_metrics,
        device.blocks,
        device.metrics);
    check_cuda(cudaGetLastError(), "reduce_block_metrics_v31 launch");
  }
  check_cuda(cudaEventRecord(device.stop_event, device.stream), "cudaEventRecord(kernel-stop)");
}

inline void launch_iteration(DeviceContext& device, const Options& options) {
  if (options.cuda_graphs) {
    check_cuda(cudaGraphLaunch(device.graph_exec, device.stream), "cudaGraphLaunch");
  } else {
    enqueue_iteration(device, options);
  }
}

inline void read_compact_metrics(DeviceContext& device) {
  check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
  check_cuda(cudaMemcpy(
      &device.host_metrics,
      device.metrics,
      sizeof(CompactMetrics),
      cudaMemcpyDeviceToHost),
      "cudaMemcpy(compact_metrics)");
}

inline void cleanup(std::vector<DeviceContext>& devices) {
  for (DeviceContext& device : devices) {
    cudaSetDevice(device.cuda_index);
    if (device.graph_exec != nullptr) cudaGraphExecDestroy(device.graph_exec);
    if (device.graph != nullptr) cudaGraphDestroy(device.graph);
    if (device.block_metrics != nullptr) cudaFree(device.block_metrics);
    if (device.metrics != nullptr) cudaFree(device.metrics);
    if (device.weighted_angles != nullptr) cudaFree(device.weighted_angles);
    if (device.frames != nullptr) cudaFree(device.frames);
    if (device.start_event != nullptr) cudaEventDestroy(device.start_event);
    if (device.stop_event != nullptr) cudaEventDestroy(device.stop_event);
    if (device.stream != nullptr) cudaStreamDestroy(device.stream);
    device.graph_exec = nullptr;
    device.graph = nullptr;
    device.block_metrics = nullptr;
    device.metrics = nullptr;
    device.weighted_angles = nullptr;
    device.frames = nullptr;
    device.start_event = nullptr;
    device.stop_event = nullptr;
    device.stream = nullptr;
  }
}

}  // namespace gluball_cuda_v31

int main(int argc, char** argv) {
  using namespace gluball_cuda_v31;
  std::vector<DeviceContext> devices;
  try {
    const Options options = parse_options(argc, argv);
    const std::uint64_t per_repeat = static_cast<std::uint64_t>(options.u) * options.v;
    if (per_repeat > std::numeric_limits<std::uint64_t>::max() / options.repeats) {
      throw std::runtime_error("total point count overflow");
    }
    const std::uint64_t total_points = per_repeat * options.repeats;
    const std::uint64_t total_rings = static_cast<std::uint64_t>(options.u) * options.repeats;
    const std::uint32_t warps_per_block = options.block_size / kWarpSize;
    const auto setup_start = std::chrono::steady_clock::now();

    int detected_device_count = 0;
    check_cuda(cudaGetDeviceCount(&detected_device_count), "cudaGetDeviceCount");
    if (detected_device_count < 1) throw std::runtime_error("no CUDA devices detected");

    std::vector<int> selected = options.devices;
    if (selected.empty()) selected = {0};
    if (total_rings < selected.size()) {
      throw std::runtime_error("Runtime V3.1 requires at least one complete u-ring per selected device");
    }

    for (const int device_index : selected) {
      if (device_index < 0 || device_index >= detected_device_count) {
        throw std::runtime_error("requested CUDA device index is unavailable");
      }
      DeviceContext context;
      context.cuda_index = device_index;
      check_cuda(cudaSetDevice(device_index), "cudaSetDevice");
      check_cuda(cudaGetDeviceProperties(&context.properties, device_index), "cudaGetDeviceProperties");
      if (options.block_size > static_cast<std::uint32_t>(context.properties.maxThreadsPerBlock)) {
        throw std::runtime_error("block size exceeds a selected device limit");
      }
      if (context.properties.warpSize != static_cast<int>(kWarpSize)) {
        throw std::runtime_error("Runtime V3.1 requires CUDA warpSize=32");
      }
      check_cuda(cudaStreamCreateWithFlags(&context.stream, cudaStreamNonBlocking), "cudaStreamCreateWithFlags");
      check_cuda(cudaEventCreate(&context.start_event), "cudaEventCreate(start)");
      check_cuda(cudaEventCreate(&context.stop_event), "cudaEventCreate(stop)");
      check_cuda(cudaMalloc(reinterpret_cast<void**>(&context.frames), sizeof(Frame) * options.u), "cudaMalloc(frames)");
      check_cuda(cudaMalloc(reinterpret_cast<void**>(&context.weighted_angles), sizeof(float2) * options.v), "cudaMalloc(weighted_angles)");
      check_cuda(cudaMalloc(reinterpret_cast<void**>(&context.metrics), sizeof(CompactMetrics)), "cudaMalloc(compact_metrics)");
      context.compiled_arch_code = probe_compiled_architecture();
      context.redacted_id = redacted_device_id(context.properties.uuid);
      precompute_geometry(context, options);
      devices.push_back(context);
    }

    const std::uint64_t base_rings = total_rings / devices.size();
    const std::uint64_t remainder_rings = total_rings % devices.size();
    std::uint64_t ring_cursor = 0;
    std::uint64_t total_blocks = 0;
    for (std::size_t slot = 0; slot < devices.size(); ++slot) {
      DeviceContext& device = devices[slot];
      const std::uint64_t ring_length = base_rings + (slot < remainder_rings ? 1ULL : 0ULL);
      if (ring_length == 0) throw std::runtime_error("selected device received an empty ring shard");
      device.ring_start = ring_cursor;
      device.ring_end = ring_cursor + ring_length;
      ring_cursor = device.ring_end;
      device.start = device.ring_start * options.v;
      device.end = device.ring_end * options.v;
      device.blocks = (ring_length + warps_per_block - 1ULL) / warps_per_block;
      if (device.properties.maxGridSize[0] <= 0) {
        throw std::runtime_error("selected device reports an invalid x-grid limit");
      }
      if (device.blocks > static_cast<std::uint64_t>(device.properties.maxGridSize[0])) {
        throw std::runtime_error("CUDA grid exceeds selected device maxGridSize[0]");
      }
      if (device.blocks > static_cast<std::uint64_t>(std::numeric_limits<unsigned int>::max())) {
        throw std::runtime_error("CUDA grid exceeds host launch index representation");
      }
      if (options.reduction_mode == ReductionMode::TwoStage) {
        if (device.blocks > std::numeric_limits<std::size_t>::max() / sizeof(CompactMetrics)) {
          throw std::runtime_error("two-stage block-metric allocation size overflow");
        }
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        check_cuda(cudaMalloc(
            reinterpret_cast<void**>(&device.block_metrics),
            static_cast<std::size_t>(device.blocks) * sizeof(CompactMetrics)),
            "cudaMalloc(block_metrics)");
      }
      total_blocks += device.blocks;
    }
    if (ring_cursor != total_rings) throw std::runtime_error("device ring partition coverage invariant failed");

    if (options.cuda_graphs) {
      for (DeviceContext& device : devices) {
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        check_cuda(cudaStreamBeginCapture(device.stream, cudaStreamCaptureModeGlobal), "cudaStreamBeginCapture");
        enqueue_iteration(device, options);
        check_cuda(cudaStreamEndCapture(device.stream, &device.graph), "cudaStreamEndCapture");
        check_cuda(cudaGraphInstantiate(&device.graph_exec, device.graph, nullptr, nullptr, 0), "cudaGraphInstantiate");
      }
    }

    const auto setup_stop = std::chrono::steady_clock::now();
    const double setup_ms = std::chrono::duration<double, std::milli>(setup_stop - setup_start).count();

    for (std::uint32_t warm = 0; warm < options.warmup; ++warm) {
      for (DeviceContext& device : devices) {
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        launch_iteration(device, options);
      }
      for (DeviceContext& device : devices) {
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        check_cuda(cudaStreamSynchronize(device.stream), "cudaStreamSynchronize(warmup)");
      }
    }

    std::vector<double> wall_samples_ms;
    std::vector<double> readback_samples_ms;
    wall_samples_ms.reserve(options.iterations);
    readback_samples_ms.reserve(options.iterations);
    bool repeatable_compact_metrics = true;
    bool compact_metrics_clean = true;
    bool have_reference_metrics = false;
    std::uint64_t reference_digest = 0;
    std::uint32_t reference_max_radius_bits = 0;
    std::uint64_t reference_nonfinite = 0;
    float observed_max_radius_error = 0.0F;
    std::uint64_t observed_max_nonfinite = 0;

    for (std::uint32_t iteration = 0; iteration < options.iterations; ++iteration) {
      const auto wall_start = std::chrono::steady_clock::now();
      for (DeviceContext& device : devices) {
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        launch_iteration(device, options);
      }
      for (DeviceContext& device : devices) {
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        check_cuda(cudaStreamSynchronize(device.stream), "cudaStreamSynchronize(measured)");
        float kernel_ms = 0.0F;
        check_cuda(cudaEventElapsedTime(&kernel_ms, device.start_event, device.stop_event), "cudaEventElapsedTime(kernel-only)");
        device.kernel_samples_ms.push_back(static_cast<double>(kernel_ms));
      }
      const auto wall_stop = std::chrono::steady_clock::now();
      wall_samples_ms.push_back(std::chrono::duration<double, std::milli>(wall_stop - wall_start).count());

      const auto readback_start = std::chrono::steady_clock::now();
      for (DeviceContext& device : devices) read_compact_metrics(device);
      const auto readback_stop = std::chrono::steady_clock::now();
      readback_samples_ms.push_back(std::chrono::duration<double, std::milli>(readback_stop - readback_start).count());

      std::uint64_t aggregate_digest = 0;
      std::uint32_t aggregate_max_radius_bits = 0;
      std::uint64_t aggregate_nonfinite = 0;
      for (const DeviceContext& device : devices) {
        aggregate_digest ^= device.host_metrics.digest;
        aggregate_max_radius_bits = std::max(aggregate_max_radius_bits, device.host_metrics.max_radius_bits);
        aggregate_nonfinite += device.host_metrics.nonfinite_count;
      }
      const float iteration_max_radius = float_from_bits(aggregate_max_radius_bits);
      observed_max_radius_error = std::max(observed_max_radius_error, iteration_max_radius);
      observed_max_nonfinite = std::max(observed_max_nonfinite, aggregate_nonfinite);
      compact_metrics_clean = compact_metrics_clean
          && aggregate_nonfinite == 0
          && std::isfinite(iteration_max_radius)
          && iteration_max_radius <= kRadiusObservationGate;

      if (!have_reference_metrics) {
        have_reference_metrics = true;
        reference_digest = aggregate_digest;
        reference_max_radius_bits = aggregate_max_radius_bits;
        reference_nonfinite = aggregate_nonfinite;
      } else {
        repeatable_compact_metrics = repeatable_compact_metrics
            && aggregate_digest == reference_digest
            && aggregate_max_radius_bits == reference_max_radius_bits
            && aggregate_nonfinite == reference_nonfinite;
      }
    }

    int driver_version = 0;
    int runtime_version = 0;
    check_cuda(cudaDriverGetVersion(&driver_version), "cudaDriverGetVersion");
    check_cuda(cudaRuntimeGetVersion(&runtime_version), "cudaRuntimeGetVersion");

    const double median_wall_ms = median(wall_samples_ms);
    const double median_readback_ms = median(readback_samples_ms);
    const double min_wall_ms = *std::min_element(wall_samples_ms.begin(), wall_samples_ms.end());
    const double max_wall_ms = *std::max_element(wall_samples_ms.begin(), wall_samples_ms.end());
    const double points_per_second = median_wall_ms > 0.0
        ? static_cast<double>(total_points) / (median_wall_ms / 1000.0)
        : 0.0;
    constexpr std::uint64_t compact_logical_bytes_per_device =
        sizeof(std::uint64_t) + sizeof(std::uint32_t) + sizeof(std::uint64_t);
    const std::uint64_t compact_resident_bytes_per_device = sizeof(CompactMetrics);
    const std::uint64_t compact_readback_bytes = compact_resident_bytes_per_device * devices.size();
    const std::uint64_t frame_bytes_per_device = sizeof(Frame) * static_cast<std::uint64_t>(options.u);
    const std::uint64_t angle_bytes_per_device = sizeof(float2) * static_cast<std::uint64_t>(options.v);
    const std::uint64_t block_summary_bytes = options.reduction_mode == ReductionMode::TwoStage
        ? total_blocks * sizeof(CompactMetrics)
        : 0ULL;
    const bool atomic_mode = options.reduction_mode == ReductionMode::Atomic;

    std::set<std::string> resolved_architectures;
    for (const DeviceContext& device : devices) {
      resolved_architectures.insert(format_sm_arch(device.compiled_arch_code));
    }

    std::cout
        << "{\n"
        << "  \"schema\": \"" << kSchema << "\",\n"
        << "  \"contract\": \"" << kContract << "\",\n"
        << "  \"v3_reference_contract\": \"" << kV3Contract << "\",\n"
        << "  \"v3_reference_source_blob_sha\": \"" << kV3ReferenceBlobSha << "\",\n"
        << "  \"v2_reference_contract\": \"" << kV2Contract << "\",\n"
        << "  \"v2_reference_source_blob_sha\": \"" << kV2ReferenceBlobSha << "\",\n"
        << "  \"legacy_cuda_contract\": \"" << kLegacyCudaContract << "\",\n"
        << "  \"acceptance_contract\": \"" << kAcceptanceContract << "\",\n"
        << "  \"geometry_contract\": \"" << kGeometryContract << "\",\n"
        << "  \"torus_knot_ordered_signature\": [" << kCanonicalTorusSignature.first << ", " << kCanonicalTorusSignature.second << "],\n"
        << "  \"torus_knot_swapped_signature\": [" << kSwappedTorusSignature.first << ", " << kSwappedTorusSignature.second << "],\n"
        << "  \"torus_knot_signature_swap_involutive\": true,\n"
        << "  \"torus_knot_ordered_signatures_equal\": false,\n"
        << "  \"torus_knot_canonical_geometry_signature_preserved\": true,\n"
        << "  \"torus_knot_swapped_embedding_enabled\": false,\n"
        << "  \"host_runtime_contract\": \"" << kHostRuntimeContract << "\",\n"
        << "  \"floating_point_adapter_profile\": \"" << kFloatingPointAdapterProfile << "\",\n"
        << "  \"status\": \"OBSERVED\",\n"
        << "  \"mode\": \"throughput\",\n"
        << "  \"repeat_run\": " << options.repeat_run << ",\n"
        << "  \"actual_cuda_execution\": true,\n"
        << "  \"actual_multi_device_execution\": " << (devices.size() >= 2 ? "true" : "false") << ",\n"
        << "  \"single_host_execution\": true,\n"
        << "  \"distributed_execution\": false,\n"
        << "  \"performance_observation_only\": true,\n"
        << "  \"reference_residual_checked\": false,\n"
        << "  \"conformance_acceptance\": false,\n"
        << "  \"geometry_receipt_authority\": false,\n"
        << "  \"universal_speedup_claim\": false,\n"
        << "  \"raw_device_uuid_published\": false,\n"
        << "  \"complete_output_readback\": false,\n"
        << "  \"full_output_buffer_allocated\": false,\n"
        << "  \"full_point_cache_enabled\": false,\n"
        << "  \"cached_radius_error_field_enabled\": false,\n"
        << "  \"cached_final_digest_enabled\": false,\n"
        << "  \"cached_complete_observation_enabled\": false,\n"
        << "  \"v1_evidence_path_unchanged\": true,\n"
        << "  \"v2_runtime_unchanged\": true,\n"
        << "  \"v3_runtime_unchanged\": true,\n"
        << "  \"v2_exact_equivalence_homogeneous_devices_required\": true,\n"
        << "  \"precomputed_u_frames\": true,\n"
        << "  \"precomputed_radius_weighted_v_angles\": true,\n"
        << "  \"precomputed_geometry_buffers_immutable_after_setup\": true,\n"
        << "  \"frame_trig_factored_by_canonical_signature\": true,\n"
        << "  \"frame_trig_evaluations_per_u_setup\": 4,\n"
        << "  \"v3_reference_frame_trig_evaluations_per_u_setup\": 16,\n"
        << "  \"hot_point_radius_multiplications_removed\": 2,\n"
        << "  \"warp_per_u_ring_topology\": true,\n"
        << "  \"per_point_uv_divmod_eliminated\": true,\n"
        << "  \"warp_shuffle_compact_metric_reduction\": true,\n"
        << "  \"packed_compact_metric_record\": true,\n"
        << "  \"metric_reset_operations_per_iteration_per_device\": 1,\n"
        << "  \"metric_readback_operations_per_iteration_per_device\": 1,\n"
        << "  \"reduction_mode\": \"" << reduction_mode_name(options.reduction_mode) << "\",\n"
        << "  \"two_stage_reduction_enabled\": " << (atomic_mode ? "false" : "true") << ",\n"
        << "  \"kernel_timing_includes_two_stage_reduction\": true,\n"
        << "  \"symmetry_orbit_compression_enabled\": false,\n"
        << "  \"symmetry_orbit_candidate_only\": true,\n"
        << "  \"persistent_device_contexts\": true,\n"
        << "  \"persistent_compact_metric_buffers\": true,\n"
        << "  \"cuda_graphs_enabled\": " << (options.cuda_graphs ? "true" : "false") << ",\n"
        << "  \"kernel_timing_excludes_metric_resets\": true,\n"
        << "  \"repeatable_compact_metrics\": " << (repeatable_compact_metrics ? "true" : "false") << ",\n"
        << "  \"compact_metrics_clean\": " << (compact_metrics_clean ? "true" : "false") << ",\n"
        << "  \"assignment_policy\": \"contiguous-complete-u-ring-quotient-remainder-per-device-v1\",\n"
        << "  \"u_segments\": " << options.u << ",\n"
        << "  \"v_segments\": " << options.v << ",\n"
        << "  \"repeats\": " << options.repeats << ",\n"
        << "  \"total_points_per_iteration\": " << total_points << ",\n"
        << "  \"total_u_rings_per_iteration\": " << total_rings << ",\n"
        << "  \"warmup_iterations\": " << options.warmup << ",\n"
        << "  \"measured_iterations\": " << options.iterations << ",\n"
        << "  \"block_size\": " << options.block_size << ",\n"
        << "  \"warps_per_block\": " << warps_per_block << ",\n"
        << "  \"detected_device_count\": " << detected_device_count << ",\n"
        << "  \"used_device_count\": " << devices.size() << ",\n"
        << "  \"global_digest_atomics_per_iteration\": " << (atomic_mode ? total_blocks : 0ULL) << ",\n"
        << "  \"global_radius_atomics_per_iteration\": " << (atomic_mode ? total_blocks : 0ULL) << ",\n"
        << "  \"nonfinite_global_atomic_upper_bound_per_iteration\": " << (atomic_mode ? total_blocks : 0ULL) << ",\n"
        << "  \"two_stage_block_summary_records_per_iteration\": " << (atomic_mode ? 0ULL : total_blocks) << ",\n"
        << "  \"two_stage_reduction_kernel_launches_per_iteration\": " << (atomic_mode ? 0ULL : devices.size()) << ",\n"
        << std::fixed << std::setprecision(6)
        << "  \"runtime_setup_milliseconds\": " << setup_ms << ",\n"
        << "  \"iteration_wall_milliseconds_median\": " << median_wall_ms << ",\n"
        << "  \"iteration_wall_milliseconds_min\": " << min_wall_ms << ",\n"
        << "  \"iteration_wall_milliseconds_max\": " << max_wall_ms << ",\n"
        << "  \"compact_readback_milliseconds_median\": " << median_readback_ms << ",\n"
        << "  \"model_points_per_second_median\": " << points_per_second << ",\n"
        << std::defaultfloat
        << "  \"frame_precompute_bytes_per_device\": " << frame_bytes_per_device << ",\n"
        << "  \"angle_precompute_bytes_per_device\": " << angle_bytes_per_device << ",\n"
        << "  \"compact_metric_logical_bytes_per_device\": " << compact_logical_bytes_per_device << ",\n"
        << "  \"compact_metric_resident_bytes_per_device\": " << compact_resident_bytes_per_device << ",\n"
        << "  \"compact_readback_bytes_per_iteration\": " << compact_readback_bytes << ",\n"
        << "  \"two_stage_block_summary_bytes_per_iteration\": " << block_summary_bytes << ",\n"
        << "  \"observed_nonfinite_records_max\": " << observed_max_nonfinite << ",\n"
        << std::scientific << std::setprecision(17)
        << "  \"observed_max_tube_radius_error\": " << observed_max_radius_error << ",\n"
        << "  \"tube_radius_observation_gate\": " << kRadiusObservationGate << ",\n"
        << std::defaultfloat
        << "  \"aggregate_diagnostic_xor64\": \""
        << std::hex << std::setw(16) << std::setfill('0') << reference_digest << std::dec << "\",\n"
        << "  \"compiled_architecture_policy\": \"" << json_escape(GLUBALL_CUDA_ARCHITECTURES) << "\",\n"
        << "  \"resolved_compiled_architectures\": [";

    std::size_t arch_index = 0;
    for (const std::string& arch : resolved_architectures) {
      std::cout << (arch_index++ == 0 ? "" : ", ") << "\"" << json_escape(arch) << "\"";
    }
    std::cout
        << "],\n"
        << "  \"cuda_driver_api_version\": " << driver_version << ",\n"
        << "  \"cuda_driver_api\": \"" << format_cuda_version(driver_version) << "\",\n"
        << "  \"cuda_runtime_version\": " << runtime_version << ",\n"
        << "  \"cuda_runtime\": \"" << format_cuda_version(runtime_version) << "\",\n"
        << "  \"cuda_compile_version\": " << CUDART_VERSION << ",\n"
        << "  \"devices\": [\n";

    for (std::size_t slot = 0; slot < devices.size(); ++slot) {
      const DeviceContext& device = devices[slot];
      std::cout
          << "    {\"logical_slot\": " << slot
          << ", \"cuda_index\": " << device.cuda_index
          << ", \"name\": \"" << json_escape(device.properties.name)
          << "\", \"redacted_device_id\": \"" << device.redacted_id
          << "\", \"compute_capability\": \"" << device.properties.major << '.' << device.properties.minor
          << "\", \"compiled_cuda_arch_code\": " << device.compiled_arch_code
          << ", \"resolved_compiled_architecture\": \"" << format_sm_arch(device.compiled_arch_code)
          << "\", \"max_grid_size_x\": " << device.properties.maxGridSize[0]
          << ", \"total_memory_bytes\": " << static_cast<unsigned long long>(device.properties.totalGlobalMem)
          << ", \"ring_start\": " << device.ring_start
          << ", \"ring_end\": " << device.ring_end
          << ", \"rings\": " << device.ring_end - device.ring_start
          << ", \"start\": " << device.start
          << ", \"end\": " << device.end
          << ", \"points\": " << device.end - device.start
          << ", \"reduction_mode\": \"" << reduction_mode_name(options.reduction_mode)
          << "\", \"kernel_milliseconds_median\": " << median(device.kernel_samples_ms)
          << "}"
          << (slot + 1U == devices.size() ? "\n" : ",\n");
    }
    std::cout << "  ]\n}\n";

    cleanup(devices);
    return EXIT_SUCCESS;
  } catch (const std::exception& error) {
    cleanup(devices);
    std::cerr << "gluball-cuda-runtime-v31: " << error.what() << '\n';
    return 2;
  }
}
