// SPDX-License-Identifier: MPL-2.0
// Physical CUDA evidence producer for GLUBALL-KNOT-V1.
//
// Reuse the PR #5 CUDA kernel and helper implementation in one translation
// unit, but replace its CLI entrypoint with a bounded evidence-only entrypoint
// that serializes every read-back float4 record for independent Rust residual
// acceptance.

#define main gluball_multi_device_observation_main
#include "gluball_multi_device.cu"
#undef main

#include <fstream>

namespace gluball_cuda_evidence {

constexpr const char* kEvidenceSchema =
    "GLUBALL-MULTI-DEVICE-CUDA-EVIDENCE-SIDECAR-V1";
constexpr const char* kEvidenceOutputFormat = "GLUBALL-CUDA-F32LE-XYZR-V1";
constexpr std::uint64_t kEvidenceRecordBytes = 16;
constexpr const char* kAcceptanceContract = "GLUBALL-CUDA-ACCEPTANCE-V1";

inline void write_u32_le(std::ostream& output, std::uint32_t value) {
  const char bytes[4] = {
      static_cast<char>(value & 0xffU),
      static_cast<char>((value >> 8U) & 0xffU),
      static_cast<char>((value >> 16U) & 0xffU),
      static_cast<char>((value >> 24U) & 0xffU),
  };
  output.write(bytes, sizeof(bytes));
}

inline void write_f32_le(std::ostream& output, float value) {
  std::uint32_t bits = 0;
  static_assert(sizeof(bits) == sizeof(value), "f32/u32 width mismatch");
  std::memcpy(&bits, &value, sizeof(bits));
  write_u32_le(output, bits);
}

struct ParsedEvidenceOptions {
  gluball_cuda::Options cuda;
  std::string evidence_output;
};

inline ParsedEvidenceOptions parse_evidence_options(int argc, char** argv) {
  std::vector<std::string> filtered;
  filtered.reserve(static_cast<std::size_t>(argc));
  filtered.emplace_back(argv[0]);
  std::string evidence_output;

  for (int index = 1; index < argc; ++index) {
    const std::string_view argument(argv[index]);
    if (argument == "--evidence-output") {
      if (index + 1 >= argc) {
        throw std::runtime_error("--evidence-output requires a path");
      }
      evidence_output = argv[++index];
      if (evidence_output.empty()) {
        throw std::runtime_error("--evidence-output may not be empty");
      }
      continue;
    }
    filtered.emplace_back(argv[index]);
  }

  if (evidence_output.empty()) {
    throw std::runtime_error("evidence mode requires --evidence-output PATH");
  }

  std::vector<char*> forwarded;
  forwarded.reserve(filtered.size());
  for (std::string& value : filtered) {
    forwarded.push_back(value.data());
  }
  gluball_cuda::Options cuda =
      gluball_cuda::parse_options(static_cast<int>(forwarded.size()), forwarded.data());
  if (cuda.mode != "evidence") {
    throw std::runtime_error(
        "gluball-cuda-evidence accepts only --mode evidence; use gluball-multi-cuda for throughput observations");
  }
  return ParsedEvidenceOptions{cuda, evidence_output};
}

}  // namespace gluball_cuda_evidence

int main(int argc, char** argv) {
  using namespace gluball_cuda;
  using namespace gluball_cuda_evidence;
  std::vector<DeviceContext> devices;
  try {
    const ParsedEvidenceOptions parsed = parse_evidence_options(argc, argv);
    const Options& options = parsed.cuda;
    const std::uint64_t per_repeat = static_cast<std::uint64_t>(options.u) * options.v;
    if (per_repeat > std::numeric_limits<std::uint64_t>::max() / options.repeats) {
      throw std::runtime_error("total point count overflow");
    }
    const std::uint64_t total_points = per_repeat * options.repeats;
    if (total_points > options.max_evidence_points) {
      throw std::runtime_error(
          "evidence mode exceeds --max-evidence-points; explicitly raise the bounded evidence cap if complete readback remains operationally reasonable");
    }

    const std::uint64_t expected_output_bytes =
        total_points > std::numeric_limits<std::uint64_t>::max() / kEvidenceRecordBytes
            ? throw std::runtime_error("evidence output byte count overflow")
            : total_points * kEvidenceRecordBytes;

    int detected_device_count = 0;
    check_cuda(cudaGetDeviceCount(&detected_device_count), "cudaGetDeviceCount");
    if (detected_device_count < 1) {
      throw std::runtime_error("no CUDA devices detected");
    }

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
      if (options.block_size >
          static_cast<std::uint32_t>(context.properties.maxThreadsPerBlock)) {
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
      if (length == 0) {
        throw std::runtime_error("selected device received an empty shard");
      }
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
      const std::uint64_t bytes = length * sizeof(float4);
      if (bytes > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        throw std::runtime_error("output allocation exceeds host size_t");
      }
      check_cuda(
          cudaMalloc(
              reinterpret_cast<void**>(&device.output),
              static_cast<std::size_t>(bytes)),
          "cudaMalloc(output)");
    }
    if (cursor != total_points) {
      throw std::runtime_error("device partition coverage invariant failed");
    }

    const auto wall_start = std::chrono::steady_clock::now();
    for (DeviceContext& device : devices) {
      check_cuda(cudaSetDevice(device.cuda_index), "cudaSetDevice");
      const std::uint64_t count = device.end - device.start;
      const std::uint64_t blocks =
          (count + options.block_size - 1ULL) / options.block_size;
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

    std::ofstream evidence_output(
        parsed.evidence_output,
        std::ios::binary | std::ios::out | std::ios::trunc);
    if (!evidence_output) {
      throw std::runtime_error("unable to create evidence output artifact");
    }

    bool pass_finite = true;
    float max_radius_error = 0.0F;
    std::uint64_t readback_points = 0;
    for (DeviceContext& device : devices) {
      const std::uint64_t count = device.end - device.start;
      if (count > static_cast<std::uint64_t>(std::numeric_limits<std::size_t>::max())) {
        throw std::runtime_error("host readback count exceeds size_t");
      }
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
        write_f32_le(evidence_output, value.x);
        write_f32_le(evidence_output, value.y);
        write_f32_le(evidence_output, value.z);
        write_f32_le(evidence_output, value.w);
      }
      if (!evidence_output) {
        throw std::runtime_error("failed while writing evidence output artifact");
      }
    }
    evidence_output.flush();
    if (!evidence_output) {
      throw std::runtime_error("failed to flush evidence output artifact");
    }
    evidence_output.close();

    std::ifstream evidence_size_check(parsed.evidence_output, std::ios::binary | std::ios::ate);
    if (!evidence_size_check) {
      throw std::runtime_error("unable to reopen evidence output artifact");
    }
    const std::streamoff observed_size = evidence_size_check.tellg();
    if (observed_size < 0
        || static_cast<std::uint64_t>(observed_size) != expected_output_bytes) {
      throw std::runtime_error("serialized evidence output byte count mismatch");
    }

    int driver_version = 0;
    int runtime_version = 0;
    check_cuda(cudaDriverGetVersion(&driver_version), "cudaDriverGetVersion");
    check_cuda(cudaRuntimeGetVersion(&runtime_version), "cudaRuntimeGetVersion");

    const bool complete_output_readback = readback_points == total_points;
    const bool local_invariant_acceptance =
        complete_output_readback && pass_finite && max_radius_error <= kRadiusGate;
    const bool multi_device_launch_observed = devices.size() >= 2;
    const bool actual_multi_device_execution =
        multi_device_launch_observed && local_invariant_acceptance;

    std::uint64_t aggregate_digest = 0;
    for (const DeviceContext& device : devices) {
      aggregate_digest ^= device.digest_value;
    }

    std::cout
        << "{\n"
        << "  \"schema\": \"" << kEvidenceSchema << "\",\n"
        << "  \"contract\": \"" << kContract << "\",\n"
        << "  \"geometry_contract\": \"" << kGeometryContract << "\",\n"
        << "  \"host_runtime_contract\": \"" << kHostRuntimeContract << "\",\n"
        << "  \"floating_point_adapter_profile\": \""
        << kFloatingPointAdapterProfile << "\",\n"
        << "  \"floating_point_precision\": \"f32\",\n"
        << "  \"status\": \""
        << (local_invariant_acceptance ? "OBSERVED" : "FAIL") << "\",\n"
        << "  \"mode\": \"evidence\",\n"
        << "  \"repeat_run\": " << options.repeat_run << ",\n"
        << "  \"actual_cuda_execution\": true,\n"
        << "  \"multi_device_launch_observed\": "
        << (multi_device_launch_observed ? "true" : "false") << ",\n"
        << "  \"actual_multi_device_execution\": "
        << (actual_multi_device_execution ? "true" : "false") << ",\n"
        << "  \"single_host_execution\": true,\n"
        << "  \"distributed_execution\": false,\n"
        << "  \"universal_speedup_claim\": false,\n"
        << "  \"geometry_receipt_authority\": false,\n"
        << "  \"raw_device_uuid_published\": false,\n"
        << "  \"reference_residual_checked\": false,\n"
        << "  \"conformance_acceptance\": false,\n"
        << "  \"acceptance_required\": \"" << kAcceptanceContract << "\",\n"
        << "  \"complete_output_readback\": "
        << (complete_output_readback ? "true" : "false") << ",\n"
        << "  \"local_invariant_acceptance\": "
        << (local_invariant_acceptance ? "true" : "false") << ",\n"
        << "  \"evidence_output_format\": \"" << kEvidenceOutputFormat << "\",\n"
        << "  \"evidence_output_record_bytes\": " << kEvidenceRecordBytes << ",\n"
        << "  \"evidence_output_path\": \""
        << json_escape(parsed.evidence_output) << "\",\n"
        << "  \"evidence_output_bytes\": " << expected_output_bytes << ",\n"
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
          << "\", \"compute_capability\": \"" << device.properties.major << '.'
          << device.properties.minor
          << "\", \"total_memory_bytes\": "
          << static_cast<unsigned long long>(device.properties.totalGlobalMem)
          << ", \"start\": " << device.start
          << ", \"end\": " << device.end
          << ", \"points\": " << device.end - device.start
          << ", \"kernel_milliseconds\": " << device.kernel_ms
          << ", \"diagnostic_xor64\": \""
          << std::hex << std::setw(16) << std::setfill('0') << device.digest_value
          << std::dec << "\"}"
          << (slot + 1U == devices.size() ? "\n" : ",\n");
    }
    std::cout << "  ]\n}\n";

    cleanup(devices);
    return local_invariant_acceptance ? EXIT_SUCCESS : EXIT_FAILURE;
  } catch (const std::exception& error) {
    cleanup(devices);
    std::cerr << "gluball-cuda-evidence: " << error.what() << '\n';
    return 2;
  }
}
