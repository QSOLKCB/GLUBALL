import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const v2 = await readFile(new URL("../native/cuda/gluball_runtime_v2.cu", import.meta.url));
const v3 = await readFile(new URL("../native/cuda/gluball_runtime_v3.cu", import.meta.url));
const source = await readFile(new URL("../native/cuda/gluball_runtime_v31.cu", import.meta.url), "utf8");
const cmake = await readFile(new URL("../native/cuda/CMakeLists.txt", import.meta.url), "utf8");
const runScript = await readFile(new URL("../scripts/run_cuda_runtime_v31.sh", import.meta.url), "utf8");
const compareScript = await readFile(new URL("../scripts/compare_cuda_runtime_v2_v3_v31.sh", import.meta.url), "utf8");
const tuneScript = await readFile(new URL("../scripts/tune_cuda_runtime_v31.sh", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_CONTRACT.json", import.meta.url), "utf8"));

function gitBlobSha(buffer) {
  const prefix = Buffer.from(`blob ${buffer.byteLength}\0`, "utf8");
  return createHash("sha1").update(prefix).update(buffer).digest("hex");
}

const frozenV2Blob = "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1";
const frozenV3Blob = "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0";
assert.equal(gitBlobSha(v2), frozenV2Blob, "Runtime V2 source must remain the frozen V3.1 reference");
assert.equal(gitBlobSha(v3), frozenV3Blob, "Runtime V3 source must remain the frozen V3.1 performance and digest baseline");
assert.equal(contract.schema, "gluball-cuda-runtime-v31-contract/2");
assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V3.1");
assert.equal(contract.v2_reference_source_blob_sha, frozenV2Blob);
assert.equal(contract.v3_reference_source_blob_sha, frozenV3Blob);
assert.equal(contract.compatibility.v2_source_unchanged, true);
assert.equal(contract.compatibility.v3_source_unchanged, true);

const packed = contract.optimization_invariants.packed_compact_metrics;
assert.equal(packed.enabled, true);
assert.equal(packed.logical_bytes, 20);
assert.equal(packed.resident_bytes, 24);
assert.equal(packed.reset_operations_per_iteration_per_device, 1);
assert.equal(packed.readback_operations_per_iteration_per_device, 1);
assert.equal(contract.optimization_invariants.radius_weighted_v_angles.enabled, true);
assert.equal(contract.optimization_invariants.radius_weighted_v_angles.hot_point_float_multiplications_removed, 2);
assert.equal(contract.optimization_invariants.canonical_23_frame_trig_factoring.trig_evaluations_per_u_setup, 4);
assert.equal(contract.optimization_invariants.canonical_23_frame_trig_factoring.v3_reference_trig_evaluations_per_u_setup, 16);
assert.deepEqual(contract.optimization_invariants.reduction_topologies.declared, ["atomic", "two-stage"]);
assert.equal(contract.optimization_invariants.reduction_topologies.two_stage_global_metric_atomics, 0);
assert.deepEqual(contract.optimization_invariants.reduction_topologies.two_stage_associative_receivers, ["xor_u64", "max_u32", "sum_u64"]);
assert.equal(contract.optimization_invariants.stream_reduce_discard.complete_point_field_materialized, false);
assert.equal(contract.optimization_invariants.stream_reduce_discard.per_iteration_output_memory_depends_on_u_times_v, false);
assert.equal(contract.cache_boundary.full_point_cache_enabled, false);
assert.equal(contract.cache_boundary.cached_radius_error_field_enabled, false);
assert.equal(contract.cache_boundary.cached_final_digest_enabled, false);
assert.equal(contract.cache_boundary.cached_complete_observation_enabled, false);
assert.equal(contract.comparison_gate.minimum_measured_iterations, 2);
assert.equal(contract.comparison_gate.selected_devices_must_be_homogeneous, true);
assert.deepEqual(contract.comparison_gate.must_match_exactly_across_v2_v3_v31, [
  "total_points_per_iteration",
  "used_device_count",
  "observed_max_tube_radius_error",
  "observed_nonfinite_records_max",
  "resolved_compiled_architectures",
]);
assert.deepEqual(contract.comparison_gate.must_match_exactly_v3_v31, ["aggregate_diagnostic_xor64"]);
assert.equal(contract.comparison_gate.v2_v3_digest_equality_required, false);
assert.equal(contract.comparison_gate.v3_v31_digest_equality_required, true);
assert.equal(contract.comparison_gate.raw_float_bit_digest_is_geometry_authority, false);
assert.equal(contract.comparison_gate.physical_boundary_source_run, 33450200284);
assert.deepEqual(contract.bounded_tuning.default_block_sizes, [32,64,128,256,512,1024]);
assert.deepEqual(contract.bounded_tuning.default_cuda_graph_modes, ["off","on"]);
assert.deepEqual(contract.bounded_tuning.default_reduction_modes, ["atomic","two-stage"]);
assert.equal(contract.bounded_tuning.default_candidate_count, 24);
assert.equal(contract.bounded_tuning.shared_v2_observation_equivalence_required, true);
assert.equal(contract.bounded_tuning.v2_v3_digest_equality_required, false);
assert.equal(contract.bounded_tuning.matched_v3_v31_digest_equality_required, true);
assert.equal(contract.bounded_tuning.rigorous_global_optimum_claim, false);
assert.equal(contract.observation_semantics.performance_observation_only, true);
assert.equal(contract.observation_semantics.reference_residual_checked, false);
assert.equal(contract.observation_semantics.conformance_acceptance, false);
assert.equal(contract.observation_semantics.complete_output_readback, false);
assert.equal(contract.observation_semantics.geometry_receipt_authority, false);
assert.equal(contract.observation_semantics.universal_speedup_claim, false);
assert.equal(contract.observation_semantics.raw_device_uuid_published, false);
assert.equal(contract.observation_semantics.raw_float_bit_digest_is_geometry_authority, false);

assert.match(cmake, /gluball-cuda-runtime-v31/);
assert.match(cmake, /gluball_runtime_v31\.cu/);
assert.match(cmake, /gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 gluball-cuda-runtime-v31/);

assert.match(source, /GLUBALL-CUDA-RUNTIME-V3\.1/);
assert.match(source, new RegExp(frozenV2Blob));
assert.match(source, new RegExp(frozenV3Blob));
assert.match(source, /struct alignas\(8\) CompactMetrics/);
assert.match(source, /static_assert\(sizeof\(CompactMetrics\) == 24/);
assert.match(source, /precompute_frames_v31/);
assert.match(source, /const float cos_major = cosf\(major\)/);
assert.match(source, /const float sin_major = sinf\(major\)/);
assert.match(source, /const float cos_minor = cosf\(minor\)/);
assert.match(source, /const float sin_minor = sinf\(minor\)/);
assert.match(source, /precompute_weighted_angles/);
assert.match(source, /cosf\(angle\) \* tube_radius\(\)/);
assert.match(source, /sinf\(angle\) \* tube_radius\(\)/);
assert.match(source, /surface_point_weighted/);
assert.match(source, /ReductionMode::TwoStage/);
assert.match(source, /reduce_block_metrics_v31/);
assert.match(source, /block_metrics\[blockIdx\.x\] = CompactMetrics/);
assert.match(source, /cudaMemsetAsync\(device\.metrics, 0, sizeof\(CompactMetrics\)/);
assert.match(source, /cudaMemcpy\(\s*&device\.host_metrics,\s*device\.metrics,\s*sizeof\(CompactMetrics\)/s);
assert.match(source, /full_point_cache_enabled\\\": false/);
assert.match(source, /cached_radius_error_field_enabled\\\": false/);
assert.match(source, /cached_final_digest_enabled\\\": false/);
assert.match(source, /cached_complete_observation_enabled\\\": false/);
assert.match(source, /metric_reset_operations_per_iteration_per_device\\\": 1/);
assert.match(source, /metric_readback_operations_per_iteration_per_device\\\": 1/);
assert.match(source, /frame_trig_evaluations_per_u_setup\\\": 4/);
assert.match(source, /v3_reference_frame_trig_evaluations_per_u_setup\\\": 16/);
assert.match(source, /hot_point_radius_multiplications_removed\\\": 2/);
assert.match(source, /performance_observation_only\\\": true/);
assert.match(source, /geometry_receipt_authority\\\": false/);
assert.match(source, /universal_speedup_claim\\\": false/);
assert.match(source, /raw_device_uuid_published\\\": false/);
assert.doesNotMatch(source, /\"device_uuid\"/);

// The V3.1 runtime must not allocate a complete U*V point field.
for (const allocation of source.matchAll(/cudaMalloc\([\s\S]*?\);/g)) {
  assert.doesNotMatch(allocation[0], /total_points|per_repeat/, "V3.1 must not materialize an O(U*V) point field");
}

// XOR, max and unsigned integer sum are grouping-invariant compact receivers.
const samples = [
  { digest: 0x1111n, radius: 3, nonfinite: 0n },
  { digest: 0x2222n, radius: 7, nonfinite: 2n },
  { digest: 0x4444n, radius: 5, nonfinite: 1n },
  { digest: 0x8888n, radius: 11, nonfinite: 0n },
];
const combine = (a,b) => ({ digest: a.digest ^ b.digest, radius: Math.max(a.radius,b.radius), nonfinite: a.nonfinite + b.nonfinite });
const identity = { digest: 0n, radius: 0, nonfinite: 0n };
const leftFold = samples.reduce(combine, identity);
const paired = combine(combine(samples[0],samples[1]), combine(samples[2],samples[3]));
assert.deepEqual(leftFold, paired, "two-stage receiver grouping must preserve compact result");

assert.match(runScript, /gluball-cuda-runtime-v31/);
assert.match(runScript, /REDUCTION=\$\{REDUCTION:-atomic\}/);
assert.match(runScript, /--reduction "\$REDUCTION"/);
assert.match(compareScript, /gluball-cuda-runtime-v2/);
assert.match(compareScript, /gluball-cuda-runtime-v3/);
assert.match(compareScript, /gluball-cuda-runtime-v31/);
assert.match(compareScript, /ITERATIONS must be an integer in \[2,10000\]/);
assert.match(compareScript, /shared_keys = \('total_points_per_iteration','used_device_count','observed_max_tube_radius_error','observed_nonfinite_records_max'\)/);
assert.match(compareScript, /if d3 != d31:/);
assert.match(compareScript, /V3\/V3\.1 diagnostic digest mismatch/);
assert.match(compareScript, /v2_v3_digest_equality_required':False/);
assert.match(compareScript, /v3_v31_digest_equality_required':True/);
assert.match(compareScript, /raw_float_bit_digest_is_geometry_authority':False/);
assert.match(compareScript, /observed_v31_break_even_iterations_vs_v3/);
assert.match(compareScript, /shared_observation_equivalence/);
assert.match(tuneScript, /REDUCTION_MODES=\$\{REDUCTION_MODES:-atomic,two-stage\}/);
assert.match(tuneScript, /BLOCK_SIZES=\$\{BLOCK_SIZES:-32,64,128,256,512,1024\}/);
assert.match(tuneScript, /GRAPH_MODES=\$\{GRAPH_MODES:-off,on\}/);
assert.match(tuneScript, /V2 baseline diagnostic digest not repeatable/);
assert.match(tuneScript, /V3 diagnostic digest changed across launch shapes or trials/);
assert.match(tuneScript, /V3\.1 diagnostic digest mismatch vs matched V3/);
assert.match(tuneScript, /v2_v3_digest_equality_required':False/);
assert.match(tuneScript, /v3_v31_digest_equality_required':True/);
assert.match(tuneScript, /shared_v2_observation_equivalence_required':True/);
assert.match(tuneScript, /bounded-exhaustive-combinatorial-performance-observation/);
assert.match(tuneScript, /best_observed_candidate_within_declared_set/);
assert.match(tuneScript, /rigorous_global_optimum_claim/);

console.log("GLUBALL CUDA Runtime V3.1 source contract: PASS");
