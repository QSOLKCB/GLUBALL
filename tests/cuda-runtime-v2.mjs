import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../native/cuda/gluball_runtime_v2.cu", import.meta.url), "utf8");
const eventCompat = await readFile(new URL("../native/cuda/gluball_runtime_v2_event_compat.cuh", import.meta.url), "utf8");
const cmake = await readFile(new URL("../native/cuda/CMakeLists.txt", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/run_cuda_runtime_v2.sh", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V2_CONTRACT.json", import.meta.url), "utf8"));

assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V2");
assert.equal(contract.mode, "throughput-only");
assert.equal(contract.compatibility.v1_full_readback_evidence_path_unchanged, true);
assert.equal(contract.compatibility.may_replace_v1_acceptance_evidence, false);
assert.equal(contract.optimizations.hierarchical_digest_reduction.enabled, true);
assert.equal(contract.optimizations.hierarchical_radius_reduction.enabled, true);
assert.equal(contract.optimizations.hierarchical_nonfinite_reduction.enabled, true);
assert.equal(contract.optimizations.compact_resident_metrics.bytes_per_device, 20);
assert.equal(contract.optimizations.persistent_device_contexts, true);
assert.equal(contract.optimizations.cuda_graph_replay_optional, true);
assert.equal(contract.optimizations.kernel_event_timing_excludes_metric_resets, true);
assert.equal(contract.observation_semantics.performance_observation_only, true);
assert.equal(contract.observation_semantics.reference_residual_checked, false);
assert.equal(contract.observation_semantics.conformance_acceptance, false);
assert.equal(contract.observation_semantics.complete_output_readback, false);
assert.equal(contract.observation_semantics.geometry_receipt_authority, false);
assert.equal(contract.observation_semantics.universal_speedup_claim, false);
assert.equal(contract.observation_semantics.raw_device_uuid_published, false);
assert.equal(contract.hardware_policy.maximum_selected_devices, 16);
assert.equal(contract.hardware_policy.validate_grid_against_device_max_grid_size_x, true);
assert.equal(contract.hardware_policy.resolved_compile_architecture_must_be_recorded, true);
assert.deepEqual(contract.phase5c_policy.strong_scaling_device_counts, [1, 2, 4, 8]);
assert.equal(contract.phase5c_policy.sanitizer_timings_are_performance_evidence, false);

assert.match(cmake, /gluball-cuda-runtime-v2/);
assert.match(cmake, /gluball_runtime_v2\.cu/);
assert.match(cmake, /gluball_runtime_v2_event_compat\.cuh/);
assert.match(cmake, /--pre-include=/);

assert.match(eventCompat, /cudaStreamIsCapturing/);
assert.match(eventCompat, /cudaStreamCaptureStatusActive/);
assert.match(eventCompat, /cudaEventRecordWithFlags/);
assert.match(eventCompat, /cudaEventRecordExternal/);
assert.match(eventCompat, /cudaEventRecordDefault/);
assert.match(eventCompat, /#define cudaEventRecord\(event, stream\)/);

assert.match(source, /GLUBALL-CUDA-RUNTIME-V2/);
assert.match(source, /GLUBALL-MULTI-DEVICE-CUDA-V1/);
assert.match(source, /GLUBALL-CUDA-ACCEPTANCE-V1/);
assert.match(source, /evaluate_range_v2/);
assert.match(source, /extern __shared__ unsigned char shared_raw/);
assert.match(source, /shared_digest/);
assert.match(source, /shared_radius/);
assert.match(source, /shared_nonfinite/);
assert.match(source, /atomicXor/);
assert.match(source, /atomicMax/);
assert.match(source, /atomicAdd/);
assert.match(source, /cudaStreamCreateWithFlags/);
assert.match(source, /cudaGraphLaunch/);
assert.match(source, /cudaStreamBeginCapture/);
assert.match(source, /cudaGraphInstantiate/);
assert.match(source, /persistent_device_contexts\\\": true/);
assert.match(source, /persistent_compact_metric_buffers\\\": true/);
assert.match(source, /hierarchical_compact_metric_reduction\\\": true/);
assert.match(source, /kernel_timing_excludes_metric_resets\\\": true/);
assert.match(source, /performance_observation_only\\\": true/);
assert.match(source, /reference_residual_checked\\\": false/);
assert.match(source, /conformance_acceptance\\\": false/);
assert.match(source, /complete_output_readback\\\": false/);
assert.match(source, /geometry_receipt_authority\\\": false/);
assert.match(source, /universal_speedup_claim\\\": false/);
assert.match(source, /raw_device_uuid_published\\\": false/);
assert.match(source, /Runtime V2 is throughput-only/);
assert.match(source, /maxGridSize\[0\]/);
assert.match(source, /record_compiled_arch/);
assert.match(source, /__CUDA_ARCH__/);
assert.match(source, /compiled_architecture_policy/);
assert.match(source, /resolved_compiled_architectures/);
assert.match(source, /resolved_compiled_architecture/);
assert.doesNotMatch(source, /\"device_uuid\"/);

const kernel = source.match(/__global__ void evaluate_range_v2[\s\S]*?\n}\n\ninline std::uint64_t fnv_update/);
assert.ok(kernel, "V2 kernel boundary must be discoverable");
assert.equal((kernel[0].match(/atomicXor/g) ?? []).length, 1, "digest path must use one source-level global atomic site after block reduction");
assert.equal((kernel[0].match(/atomicMax/g) ?? []).length, 1, "radius path must use one source-level global atomic site after block reduction");
assert.equal((kernel[0].match(/atomicAdd/g) ?? []).length, 1, "nonfinite path must use one source-level global atomic site after block reduction");
const leader = kernel[0].match(/if \(threadIdx\.x == 0U\) \{[\s\S]*?\n  \}/);
assert.ok(leader, "compact metric global atomics must be block-leader only");
assert.match(leader[0], /atomicXor/);
assert.match(leader[0], /atomicMax/);
assert.match(leader[0], /atomicAdd/);

const enqueue = source.match(/inline void enqueue_iteration[\s\S]*?\n}\n\ninline void launch_iteration/);
assert.ok(enqueue, "iteration enqueue boundary must be discoverable");
const lastReset = Math.max(
  enqueue[0].lastIndexOf("cudaMemsetAsync(device.digest"),
  enqueue[0].lastIndexOf("cudaMemsetAsync(device.max_radius_bits"),
  enqueue[0].lastIndexOf("cudaMemsetAsync(device.nonfinite_count")
);
const startEvent = enqueue[0].indexOf("cudaEventRecord(device.start_event");
const kernelLaunch = enqueue[0].indexOf("evaluate_range_v2<<<");
const stopEvent = enqueue[0].indexOf("cudaEventRecord(device.stop_event");
assert.ok(lastReset >= 0 && startEvent > lastReset, "kernel start event must be recorded after compact metric resets");
assert.ok(kernelLaunch > startEvent && stopEvent > kernelLaunch, "CUDA events must bracket only the evaluation kernel");

assert.match(script, /--mode throughput/);
assert.match(script, /--warmup/);
assert.match(script, /--iterations/);
assert.match(script, /--cuda-graphs/);
assert.match(script, /python3 -m json\.tool/);

console.log("GLUBALL CUDA Runtime V2 source contract: PASS");
