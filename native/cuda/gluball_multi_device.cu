// SPDX-License-Identifier: MPL-2.0
// Evidence-first CUDA adapter for GLUBALL-KNOT-V1.
// Engineering pattern adapted from QSOLKCB/RSH multi-device CUDA work.
// This file does not define canonical geometry authority.

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

namespace gluball_cuda {

constexpr const char* kSchema = "GLUBALL-MULTI-DEVICE-CUDA-SIDECAR-V1";
constexpr const char* kContract = "GLUBALL-MULTI-DEVICE-CUDA-V1";
constexpr const char* kGeometryContract = "GLUBALL-KNOT-V1";
constexpr const char* kHostRuntimeContract = "GLUBALL-RUST-RUNTIME-V1";
constexpr std::uint32_t kDefaultU = 4096;
constexpr std::uint32_t kDefaultV = 64;
constexpr std::uint32_t kDefaultRepeats = 1;
constexpr std::uint32_t kDefaultBlockSize = 256;
constexpr std::uint32_t kMaximumDevices = 8;
constexpr std::uint64_t kDefaultMaxEvidencePoints = 16ULL * 1024ULL * 1024ULL;
constexpr float kRadiusGate = 5.0e-5F;
constexpr std::int64_t kScale = 1000000;
constexpr std::int64_t kMajorRadiusFixed = 2100000;
constexpr std::int64_t kMinorRadiusFixed = 850000;
constexpr std::int64_t kTubeRadiusFixed = 340000;
constexpr float kTau = 6.2831853071795864769F;

struct Options {
  std::uint32_t u = kDefaultU;
  std::uint32_t v = kDefaultV;
  std::uint32_t repeats = kDefaultRepeats;
  std::uint32_t block_size = kDefaultBlockSize;
  std::uint64_t max_evidence_points = kDefaultMaxEvidencePoints;
  std::vector<int> devices;
  std::string mode = "evidence";
  std::uint32_t repeat_run = 0;
};

struct DeviceContext {
  int cuda_index = -1;
  cudaDeviceProp properties{};
  cudaStream_t stream = nullptr;
  cudaEvent_t start_event = nullptr;
  cudaEvent_t stop_event = nullptr;
  std::uint64_t* digest = nullptr;
  float4* output = nullptr;
  std::uint64_t start = 0;
  std::uint64_t end = 0;
  std::uint64_t digest_value = 0;
  std::string redacted_id;
  float kernel_ms = 0.0F;
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
    throw std::runtime_error("--devices must select between 1 and 8 unique devices");
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
      if (value == 0 || value > 1024ULL) throw std::runtime_error("--block-size must be in [1,1024]");
      options.block_size = static_cast<std::uint32_t>(value);
    } else if (argument == "--devices") {
      options.devices = parse_devices(require_value(argument));
    } else if (argument == "--mode") {
      options.mode = std::string(require_value(argument));
      if (options.mode != "evidence" && options.mode != "throughput") {
        throw std::runtime_error("--mode must be evidence or throughput");
      }
    } else if (argument == "--max-evidence-points") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value == 0) throw std::runtime_error("--max-evidence-points must be positive");
      options.max_evidence_points = value;
    } else if (argument == "--repeat-run") {
      const auto value = parse_unsigned(require_value(argument), argument);
      if (value > std::numeric_limits<std::uint32_t>::max()) throw std::runtime_error("--repeat-run outside range");
      options.repeat_run = static_cast<std::uint32_t>(value);
    } else if (argument == "--help" || argument == "-h") {
      std::cout
          << "GLUBALL multi-device CUDA adapter\n\n"
          << "  --u N                    u segments (default 4096)\n"
          << "  --v N                    v segments (default 64)\n"
          << "  --repeats N              repeat full mesh N times\n"
          << "  --devices A,B,...        1..8 unique CUDA indices\n"
          << "  --block-size N           CUDA block size (default 256)\n"
          << "  --mode evidence|throughput\n"
          << "  --max-evidence-points N  cap full readback allocations\n"
          << "  --repeat-run N           audit run ordinal\n";
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

__host__ __device__ inline float3 centerline(float t) {
  const float major = 2.0F * t;
  const float minor = 3.0F * t;
  const float radial = major_radius() + minor_radius() * cosf(minor);
  return make_float3(
      radial * cosf(major),
      radial * sinf(major),
      minor_radius() * sinf(minor));
}

__host__ __device__ inline float3 derivative(float t) {
  const float major = 2.0F * t;
  const float minor = 3.0F * t;
  const float radial = major_radius() + minor_radius() * cosf(minor);
  const float radial_prime = -minor_radius() * 3.0F * sinf(minor);
  return make_float3(
      radial_prime * cosf(major) - 2.0F * radial * sinf(major),
      radial_prime * sinf(major) + 2.0F * radial * cosf(major),
      minor_radius() * 3.0F * cosf(minor));
}

__host__ __device__ inline float3 torus_normal(float t) {
  const float major = 2.0F * t;
  const float minor = 3.0F * t;
  return make_float3(
      cosf(minor) * cosf(major),
      cosf(minor) * sinf(major),
      sinf(minor));
}

__host__ __device__ inline float3 surface_point(
    std::uint32_t u,
    std::uint32_t u_count,
    std::uint32_t v,
    std::uint32_t v_count,
    float* radius_error) {
  const float t = kTau * static_cast<float>(u) / static_cast<float>(u_count);
  const float angle = kTau * static_cast<float>(v) / static_cast<float>(v_count);
  const float3 centre = centerline(t);
  const float3 tangent = vnormalize(derivative(t));
  const float3 normal = torus_normal(t);
  const float3 binormal = vnormalize(vcross(tangent, normal));
  const float3 offset = vadd(
      vscale(normal, cosf(angle) * tube_radius()),
      vscale(binormal, sinf(angle) * tube_radius()));
  const float3 point = vadd(centre, offset);
  *radius_error = fabsf(vnorm(vsub(point, centre)) - tube_radius());
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

__global__ void evaluate_range(
    std::uint64_t start,
    std::uint64_t count,
    std::uint32_t u_count,
    std::uint32_t v_count,
    float4* output,
    std::uint64_t* digest) {
  const std::uint64_t local = static_cast<std::uint64_t>(blockIdx.x) * blockDim.x + threadIdx.x;
  if (local >= count) return;
  const std::uint64_t linear = start + local;
  const std::uint64_t per_repeat = static_cast<std::uint64_t>(u_count) * v_count;
  const std::uint64_t point_index = linear % per_repeat;
  const auto u = static_cast<std::uint32_t>(point_index / v_count);
  const auto v = static_cast<std::uint32_t>(point_index % v_count);
  float radius_error = 0.0F;
  const float3 point = surface_point(u, u_count, v, v_count, &radius_error);
  if (output != nullptr) {
    output[local] = make_float4(point.x, point.y, point.z, radius_error);
  }
  const std::uint64_t packed_xy =
      (static_cast<std::uint64_t>(__float_as_uint(point.x)) << 32)
      | static_cast<std::uint64_t>(__float_as_uint(point.y));
  const std::uint64_t packed_ze =
      (static_cast<std::uint64_t>(__float_as_uint(point.z)) << 32)
      | static_cast<std::uint64_t>(__float_as_uint(radius_error));
  const std::uint64_t token = mix64(linear) ^ mix64(packed_xy) ^ mix64(packed_ze);
  atomicXor(
      reinterpret_cast<unsigned long long*>(digest),
      static_cast<unsigned long long>(token));
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
  state = fnv_update(
      state,
      reinterpret_cast<const unsigned char*>(kContract),
      std::strlen(kContract));
  state = fnv_update(
      state,
      reinterpret_cast<const unsigned char*>(uuid.bytes),
      sizeof(uuid.bytes));
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

inline void cleanup(std::vector<DeviceContext>& devices) {
  for (DeviceContext& device : devices) {
    cudaSetDevice(device.cuda_index);
    if (device.output != nullptr) cudaFree(device.output);
    if (device.digest != nullptr) cudaFree(device.digest);
    if (device.start_event != nullptr) cudaEventDestroy(device.start_event);
    if (device.stop_event != nullptr) cudaEventDestroy(device.stop_event);
    if (device.stream != nullptr) cudaStreamDestroy(device.stream);
    device.output = nullptr;
    device.digest = nullptr;
    device.start_event = nullptr;
    device.stop_event = nullptr;
    device.stream = nullptr;
  }
}

}  // namespace gluball_cuda

int main(int argc, char** argv) {
  using namespace gluball_cuda;
  std::vector<DeviceContext> devices;
  try {
    const Options options = parse_options(argc, argv);
    const std::uint64_t per_repeat = static_cast<std::uint64_t>(options.u) * options.v;
    if (per_repeat > std::numeric_limits<std::uint64_t>::max() / options.repeats) {
      throw std::runtime_error("total point count overflow");
    }
    const std::uint64_t total_points = per_repeat * options.repeats;
    if (options.mode == "evidence" && total_points > options.max_evidence_points) {
      throw std::runtime_error(
          "evidence mode exceeds --max-evidence-points; use throughput mode or explicitly raise the cap");
    }

    int detected_device_count = 0;
    check_cuda(cudaGetDeviceCount(&detected_device_count), "cudaGetDeviceCount");
    if (detected_device_count < 1) throw std::runtime_error("no CUDA devices detected");

    std::vector<int> selected = options.devices;
    if (selected.empty()) selected = {0};
    for (const int device_index : selected) {
      if (device_index < 0 || device_index >= detected_device_count) {
        throw std::runtime_error("requested CUDA device index is unavailable");
      }
      DeviceContext context;
      context.cuda_index = device_index;
      check_cuda(cudaSetDevice(device_index), "cudaSetDevice");
      check_cuda(
          cudaGetDeviceProperties(&context.properties, device_index),
          "cudaGetDeviceProperties");
      if (options.block_size > static_cast<std::uint32_t>(context.properties.maxThreadsPerBlock)) {
        throw std::runtime_error("block size exceeds a selected device limit");
      }
      check_cuda(
          cudaStreamCreateWithFlags(&context.stream, cudaStreamNonBlocking),
          "cudaStreamCreateWithFlags");
      check_cuda(cudaEventCreate(&context.start_event), "cudaEventCreate(start)");
      check_cuda(cudaEventCreate(&context.stop_event), "cudaEventCreate(stop)");
      context.redacted_id = redacted_device_id(context.properties.uuid);
      devices.push_back(context);
    }

    const std::uint64_t base = total_points / devices.size();
    const std::uint64_t remainder = total_points % devices.size();
    std::uint64_t cursor = 0;
    for (std::size_t slot = 0; slot < devices.size(); ++slot) {
      DeviceContext& device = devices[slot];
      const std::uint64_t length = base + (slot < remainder ? 1ULL : 0ULL);
      if (length == 0) throw std::runtime_error("selected device received an empty shard");
      device.start = cursor;
      device.end = cursor + length;
      cursor = device.end;
      check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
      check_cuda(
          cudaMalloc(reinterpret_cast<void**>(&device.digest), sizeof(std::uint64_t)),
          "cudaMalloc(digest)");
      check_cuda(
          cudaMemsetAsync(device.digest, 0, sizeof(std::uint64_t), device.stream),
          "cudaMemsetAsync(digest)");
      if (options.mode == "evidence") {
        const std::uint64_t bytes = length * sizeof(float4);
        if (bytes > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
          throw std::runtime_error("output allocation exceeds host size_t");
        }
        check_cuda(
            cudaMalloc(reinterpret_cast<void**>(&device.output), static_cast<std::size_t>(bytes)),
            "cudaMalloc(output)");
      }
    }
    if (cursor != total_points) throw std::runtime_error("device partition coverage invariant failed");

    const auto wall_start = std::chrono::steady_clock::now();
    for (DeviceContext& device : devices) {
      check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
      const std::uint64_t count = device.end - device.start;
      const std::uint64_t blocks = (count + options.block_size - 1ULL) / options.block_size;
      if (blocks > std::numeric_limits<unsigned int>::max()) {
        throw std::runtime_error("CUDA grid exceeds one-dimensional block bound");
      }
      check_cuda(cudaEventRecord(device.start_event, device.stream), "cudaEventRecord(start)");
      evaluate_range<<<
          static_cast<unsigned int>(blocks),
          options.block_size,
          0,
          device.stream>>>(
          device.start,
          count,
          options.u,
          options.v,
          device.output,
          device.digest);
      check_cuda(cudaGetLastError(), "evaluate_range launch");
      check_cuda(cudaEventRecord(device.stop_event, device.stream), "cudaEventRecord(stop)");
    }

    for (DeviceContext& device : devices) {
      check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
      check_cuda(cudaStreamSynchronize(device.stream), "cudaStreamSynchronize");
      check_cuda(
          cudaEventElapsedTime(&device.kernel_ms, device.start_event, device.stop_event),
          "cudaEventElapsedTime");
      check_cuda(
          cudaMemcpy(
              &device.digest_value,
              device.digest,
              sizeof(std::uint64_t),
              cudaMemcpyDeviceToHost),
          "cudaMemcpy(digest)");
    }
    const auto wall_stop = std::chrono::steady_clock::now();
    const double wall_ms =
        std::chrono::duration<double, std::milli>(wall_stop - wall_start).count();

    bool pass_finite = true;
    float max_radius_error = 0.0F;
    std::uint64_t readback_points = 0;
    if (options.mode == "evidence") {
      for (DeviceContext& device : devices) {
        const std::uint64_t count = device.end - device.start;
        std::vector<float4> host(static_cast<std::size_t>(count));
        check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
        check_cuda(
            cudaMemcpy(
                host.data(),
                device.output,
                host.size() * sizeof(float4),
                cudaMemcpyDeviceToHost),
            "cudaMemcpy(output)");
        readback_points += count;
        for (const float4 value : host) {
          pass_finite = pass_finite
              && std::isfinite(value.x)
              && std::isfinite(value.y)
              && std::isfinite(value.z)
              && std::isfinite(value.w);
          max_radius_error = std::max(max_radius_error, value.w);
        }
      }
    }

    int driver_version = 0;
    int runtime_version = 0;
    check_cuda(cudaDriverGetVersion(&driver_version), "cudaDriverGetVersion");
    check_cuda(cudaRuntimeGetVersion(&runtime_version), "cudaRuntimeGetVersion");

    const bool complete_output_readback =
        options.mode == "evidence" && readback_points == total_points;
    const bool local_invariant_acceptance =
        complete_output_readback && pass_finite && max_radius_error <= kRadiusGate;
    const bool actual_multi_device_execution = devices.size() >= 2;

    std::uint64_t aggregate_digest = 0;
    for (const DeviceContext& device : devices) {
      aggregate_digest ^= device.digest_value;
    }

    std::cout
        << "{\n"
        << "  \"schema\": \"" << kSchema << "\",\n"
        << "  \"contract\": \"" << kContract << "\",\n"
        << "  \"geometry_contract\": \"" << kGeometryContract << "\",\n"
        << "  \"host_runtime_contract\": \"" << kHostRuntimeContract << "\",\n"
        << "  \"status\": \""
        << (options.mode == "evidence" && !local_invariant_acceptance ? "FAIL" : "OBSERVED")
        << "\",\n"
        << "  \"mode\": \"" << options.mode << "\",\n"
        << "  \"repeat_run\": " << options.repeat_run << ",\n"
        << "  \"actual_cuda_execution\": true,\n"
        << "  \"actual_multi_device_execution\": "
        << (actual_multi_device_execution ? "true" : "false") << ",\n"
        << "  \"single_host_execution\": true,\n"
        << "  \"distributed_execution\": false,\n"
        << "  \"universal_speedup_claim\": false,\n"
        << "  \"geometry_receipt_authority\": false,\n"
        << "  \"raw_device_uuid_published\": false,\n"
        << "  \"reference_residual_checked\": false,\n"
        << "  \"conformance_acceptance\": false,\n"
        << "  \"performance_observation_only\": "
        << (options.mode == "throughput" ? "true" : "false") << ",\n"
        << "  \"complete_output_readback\": "
        << (complete_output_readback ? "true" : "false") << ",\n"
        << "  \"local_invariant_acceptance\": "
        << (local_invariant_acceptance ? "true" : "false") << ",\n"
        << "  \"assignment_policy\": \"contiguous-quotient-remainder-per-device-v1\",\n"
        << "  \"u_segments\": " << options.u << ",\n"
        << "  \"v_segments\": " << options.v << ",\n"
        << "  \"repeats\": " << options.repeats << ",\n"
        << "  \"total_points\": " << total_points << ",\n"
        << "  \"readback_points\": " << readback_points << ",\n"
        << "  \"block_size\": " << options.block_size << ",\n"
        << "  \"detected_device_count\": " << detected_device_count << ",\n"
        << "  \"used_device_count\": " << devices.size() << ",\n"
        << "  \"fixed_point_scale\": " << kScale << ",\n"
        << "  \"major_radius_fixed\": " << kMajorRadiusFixed << ",\n"
        << "  \"minor_radius_fixed\": " << kMinorRadiusFixed << ",\n"
        << "  \"tube_radius_fixed\": " << kTubeRadiusFixed << ",\n"
        << std::scientific << std::setprecision(17)
        << "  \"max_tube_radius_error\": " << max_radius_error << ",\n"
        << "  \"tube_radius_gate\": " << kRadiusGate << ",\n"
        << "  \"wall_milliseconds\": " << wall_ms << ",\n"
        << std::defaultfloat
        << "  \"aggregate_diagnostic_xor64\": \""
        << std::hex << std::setw(16) << std::setfill('0') << aggregate_digest
        << std::dec << "\",\n"
        << "  \"compiled_architectures\": \""
        << json_escape(GLUBALL_CUDA_ARCHITECTURES) << "\",\n"
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
          << "\", \"total_memory_bytes\": "
          << static_cast<unsigned long long>(device.properties.totalGlobalMem)
          << ", \"start\": " << device.start
          << ", \"end\": " << device.end
          << ", \"points\": " << device.end - device.start
          << ", \"kernel_milliseconds\": " << device.kernel_ms
          << ", \"diagnostic_xor64\": \""
          << std::hex << std::setw(16) << std::setfill('0') << device.digest_value << std::dec
          << "\"}"
          << (slot + 1U == devices.size() ? "\n" : ",\n");
    }
    std::cout << "  ]\n}\n";

    const bool success = options.mode == "throughput" || local_invariant_acceptance;
    cleanup(devices);
    return success ? EXIT_SUCCESS : EXIT_FAILURE;
  } catch (const std::exception& error) {
    cleanup(devices);
    std::cerr << "gluball-multi-cuda: " << error.what() << '\n';
    return 2;
  }
}
