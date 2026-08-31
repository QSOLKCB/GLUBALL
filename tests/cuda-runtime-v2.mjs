import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../native/cuda/gluball_runtime_v2.cu", import.meta.url), "utf8");
const cmake = await readFile(new URL("../native/cuda/CMakeLists.txt", import.meta.url), "utf8");
const script = await readFile(new URL("../scripts/run_cuda_runtime_v2.sh", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V2_CONTRACT.json", import.meta.url), "utf8"));

assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V2");
assert.equal(contract.mode, "throughput-only");
assert.equal(contract.compatibility.v1_full_readback_evidence_path_unchanged, true);
assert.equal(contract.compatibility.may_replace_v1_acceptance_evidence, false);
assert.equal(contract.optimizations.hierarchical_digest_reduction.enabled, true);
assert.equal(contract.optimizations.compact_resident_metrics.bytes_per_device, 20);
assert.equal(contract.optimizations.persistent_device_contexts, true);
assert.equal(contract.optimizations.cuda_graph_replay_optional, true);
assert.equal(contract.observation_semantics.performance_observation_only, true);
assert.equal(contract.observation_semantics.reference_residual_checked, false);
assert.equal(contract.observation_semantics.conformance_acceptance, false);
assert.equal(contract.observation_semantics.complete_output_readback, false);
assert.equal(contract.observation_semantics.geometry_receipt_authority, false);
assert.equal(contract.observation_semantics.universal_speedup_claim, false);
assert.equal(contract.observation_semantics.raw_device_uuid_published, false);
assert.equal(contract.hardware_policy.maximum_selected_devices, 16);
assert.deepEqual(contract.phase5c_policy.strong_scaling_device_counts, [1, 2, 4, 8]);
assert.equal(contract.phase5c_policy.sanitizer_timings_are_performance_evidence, false);

assert.match(cmake, /gluball-cuda-runtime-v2/);
assert.match(cmake, /gluball_runtime_v2\.cu/);

assert.match(source, /GLUBALL-CUDA-RUNTIME-V2/);
assert.match(source, /GLUBALL-MULTI-DEVICE-CUDA-V1/);
assert.match(source, /GLUBALL-CUDA-ACCEPTANCE-V1/);
assert.match(source, /evaluate_range_v2/);
assert.match(source, /extern __shared__ unsigned long long shared_digest/);
assert.match(source, /atomicXor/);
assert.match(source, /atomicMax/);
assert.match(source, /nonfinite_count/);
assert.match(source, /cudaStreamCreateWithFlags/);
assert.match(source, /cudaGraphLaunch/);
assert.match(source, /cudaStreamBeginCapture/);
assert.match(source, /cudaGraphInstantiate/);
assert.match(source, /persistent_device_contexts\\\": true/);
assert.match(source, /persistent_compact_metric_buffers\\\": true/);
assert.match(source, /hierarchical_digest_reduction\\\": true/);
assert.match(source, /performance_observation_only\\\": true/);
assert.match(source, /reference_residual_checked\\\": false/);
assert.match(source, /conformance_acceptance\\\": false/);
assert.match(source, /complete_output_readback\\\": false/);
assert.match(source, /geometry_receipt_authority\\\": false/);
assert.match(source, /universal_speedup_claim\\\": false/);
assert.match(source, /raw_device_uuid_published\\\": false/);
assert.match(source, /Runtime V2 is throughput-only/);
assert.doesNotMatch(source, /\"device_uuid\"/);

const kernel = source.match(/__global__ void evaluate_range_v2[\s\S]*?\n}\n\ninline std::uint64_t fnv_update/);
assert.ok(kernel, "V2 kernel boundary must be discoverable");
assert.equal((kernel[0].match(/atomicXor/g) ?? []).length, 1, "digest path must use one source-level global atomic site after block reduction");
assert.match(kernel[0], /if \(threadIdx\.x == 0U\)/, "only block leader may issue the digest global atomic");

assert.match(script, /--mode throughput/);
assert.match(script, /--warmup/);
assert.match(script, /--iterations/);
assert.match(script, /--cuda-graphs/);
assert.match(script, /python3 -m json\.tool/);

console.log("GLUBALL CUDA Runtime V2 source contract: PASS");
