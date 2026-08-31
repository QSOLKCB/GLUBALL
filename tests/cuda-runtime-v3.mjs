import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const v2 = await readFile(new URL("../native/cuda/gluball_runtime_v2.cu", import.meta.url));
const source = await readFile(new URL("../native/cuda/gluball_runtime_v3.cu", import.meta.url), "utf8");
const cmake = await readFile(new URL("../native/cuda/CMakeLists.txt", import.meta.url), "utf8");
const runScript = await readFile(new URL("../scripts/run_cuda_runtime_v3.sh", import.meta.url), "utf8");
const compareScript = await readFile(new URL("../scripts/compare_cuda_runtime_v2_v3.sh", import.meta.url), "utf8");
const tuneScript = await readFile(new URL("../scripts/tune_cuda_runtime_v3.sh", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V3_CONTRACT.json", import.meta.url), "utf8"));

function gitBlobSha(buffer) {
  const prefix = Buffer.from(`blob ${buffer.byteLength}\0`, "utf8");
  return createHash("sha1").update(prefix).update(buffer).digest("hex");
}

const frozenV2Blob = "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1";
assert.equal(gitBlobSha(v2), frozenV2Blob, "Runtime V2 source must remain the frozen V3 A/B oracle");
assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V3");
assert.equal(contract.v2_reference_contract, "GLUBALL-CUDA-RUNTIME-V2");
assert.equal(contract.v2_reference_source_blob_sha, frozenV2Blob);
assert.equal(contract.compatibility.v2_source_unchanged, true);
assert.equal(contract.compatibility.may_replace_v1_acceptance_evidence, false);
assert.equal(contract.optimization_invariants.precomputed_u_frames.enabled, true);
assert.equal(contract.optimization_invariants.precomputed_u_frames.immutability_after_setup, true);
assert.equal(contract.optimization_invariants.precomputed_v_angles.enabled, true);
assert.equal(contract.optimization_invariants.warp_per_u_ring_topology.enabled, true);
assert.equal(contract.optimization_invariants.warp_per_u_ring_topology.per_point_uv_divmod_eliminated, true);
assert.equal(contract.optimization_invariants.warp_shuffle_compact_reduction.enabled, true);
assert.equal(contract.optimization_invariants.conditional_nonfinite_global_atomic.enabled, true);
assert.equal(contract.optimization_invariants.conditional_nonfinite_global_atomic.clean_case_global_nonfinite_atomics, 0);
assert.equal(contract.optimization_invariants.symmetry_orbit_compression.enabled, false);
assert.equal(contract.optimization_invariants.symmetry_orbit_compression.candidate_only, true);
assert.equal(contract.bounded_tuning.candidate_enumeration_deterministic, true);
assert.equal(contract.bounded_tuning.best_observed_candidate_within_declared_set_only, true);
assert.equal(contract.bounded_tuning.rigorous_global_optimum_claim, false);
assert.equal(contract.bounded_tuning.unbounded_configuration_space_global_optimum_claim, false);
assert.deepEqual(contract.bounded_tuning.default_block_sizes, [32, 64, 128, 256, 512, 1024]);
assert.deepEqual(contract.bounded_tuning.default_cuda_graph_modes, ["off", "on"]);
assert.equal(contract.observation_semantics.performance_observation_only, true);
assert.equal(contract.observation_semantics.reference_residual_checked, false);
assert.equal(contract.observation_semantics.conformance_acceptance, false);
assert.equal(contract.observation_semantics.complete_output_readback, false);
assert.equal(contract.observation_semantics.geometry_receipt_authority, false);
assert.equal(contract.observation_semantics.universal_speedup_claim, false);
assert.equal(contract.observation_semantics.raw_device_uuid_published, false);

assert.match(cmake, /gluball-cuda-runtime-v3/);
assert.match(cmake, /gluball_runtime_v3\.cu/);
assert.match(cmake, /gluball-cuda-runtime-v2 gluball-cuda-runtime-v3/);
assert.match(cmake, /gluball_runtime_v2_event_compat\.cuh/);

assert.match(source, /GLUBALL-CUDA-RUNTIME-V3/);
assert.match(source, /GLUBALL-CUDA-RUNTIME-V2/);
assert.match(source, new RegExp(frozenV2Blob));
assert.match(source, /struct Frame/);
assert.match(source, /precompute_frames/);
assert.match(source, /precompute_angles/);
assert.match(source, /warp_broadcast_frame/);
assert.match(source, /surface_point_precomputed/);
assert.match(source, /evaluate_rings_v3/);
assert.match(source, /__shfl_sync/);
assert.match(source, /__shfl_down_sync/);
assert.match(source, /warp_per_u_ring_topology\\\": true/);
assert.match(source, /per_point_uv_divmod_eliminated\\\": true/);
assert.match(source, /conditional_nonfinite_global_atomic\\\": true/);
assert.match(source, /symmetry_orbit_compression_enabled\\\": false/);
assert.match(source, /performance_observation_only\\\": true/);
assert.match(source, /reference_residual_checked\\\": false/);
assert.match(source, /conformance_acceptance\\\": false/);
assert.match(source, /complete_output_readback\\\": false/);
assert.match(source, /geometry_receipt_authority\\\": false/);
assert.match(source, /universal_speedup_claim\\\": false/);
assert.match(source, /raw_device_uuid_published\\\": false/);
assert.doesNotMatch(source, /\"device_uuid\"/);

const kernel = source.match(/__global__ void evaluate_rings_v3[\s\S]*?\n}\n\ninline std::uint64_t fnv_update/);
assert.ok(kernel, "V3 evaluation kernel boundary must be discoverable");
assert.doesNotMatch(kernel[0], /point_index/);
assert.doesNotMatch(kernel[0], /\/ v_count/);
assert.doesNotMatch(kernel[0], /% v_count/);
assert.match(kernel[0], /ring_task \/ u_count/);
assert.match(kernel[0], /ring_task - repeat_index \* u_count/);
assert.ok((kernel[0].match(/__shfl_down_sync/g) ?? []).length >= 6, "V3 must reduce both warp-local and block-leader metrics with shuffles");
assert.equal((kernel[0].match(/atomicXor/g) ?? []).length, 1);
assert.equal((kernel[0].match(/atomicMax/g) ?? []).length, 1);
assert.equal((kernel[0].match(/atomicAdd/g) ?? []).length, 1);
assert.match(kernel[0], /if \(block_nonfinite != 0ULL\) \{\s*atomicAdd/);

assert.match(runScript, /gluball-cuda-runtime-v3/);
assert.match(runScript, /--mode throughput/);
assert.match(runScript, /python3 -m json\.tool/);
assert.match(compareScript, /GLUBALL-CUDA-RUNTIME-V2/);
assert.match(compareScript, /GLUBALL-CUDA-RUNTIME-V3/);
assert.match(compareScript, /aggregate_diagnostic_xor64/);
assert.match(compareScript, /observed_max_tube_radius_error/);
assert.match(compareScript, /exact_observation_equivalence/);
assert.match(tuneScript, /BLOCK_SIZES=\$\{BLOCK_SIZES:-32,64,128,256,512,1024\}/);
assert.match(tuneScript, /GRAPH_MODES=\$\{GRAPH_MODES:-off,on\}/);
assert.match(tuneScript, /bounded-exhaustive-combinatorial-performance-observation/);
assert.match(tuneScript, /best_observed_candidate_within_declared_set/);
assert.match(tuneScript, /rigorous_global_optimum_claim/);
assert.match(tuneScript, /unbounded_configuration_space_global_optimum_claim/);

// SAW-1-inspired candidate proof pattern only. This is not enabled in the CUDA kernel.
function mirrorV(v, count) {
  return (count - v) % count;
}
for (let count = 6; count <= 257; count += 1) {
  for (let v = 0; v < count; v += 1) {
    const mirrored = mirrorV(v, count);
    assert.ok(mirrored >= 0 && mirrored < count, "mirror candidate must stay inside the v domain");
    assert.equal(mirrorV(mirrored, count), v, "mirror candidate must be an involution");
  }
}

// Exhaustively verify the complete-ring quotient/remainder partition used by V3.
for (const u of [12, 13, 64, 127]) {
  for (const repeats of [1, 2, 3]) {
    const rings = u * repeats;
    for (const deviceCount of [1, 2, 4, 8, 16]) {
      if (deviceCount > rings) continue;
      const base = Math.floor(rings / deviceCount);
      const remainder = rings % deviceCount;
      let cursor = 0;
      const seen = new Set();
      for (let slot = 0; slot < deviceCount; slot += 1) {
        const length = base + (slot < remainder ? 1 : 0);
        assert.ok(length > 0);
        const start = cursor;
        const end = cursor + length;
        for (let ring = start; ring < end; ring += 1) {
          assert.equal(seen.has(ring), false, "ring shards must not overlap");
          seen.add(ring);
          const repeat = Math.floor(ring / u);
          const coordinateU = ring - repeat * u;
          assert.ok(repeat >= 0 && repeat < repeats);
          assert.ok(coordinateU >= 0 && coordinateU < u);
          for (const v of [0, 1, 5]) {
            const vv = v % 6;
            const linear = ring * 6 + vv;
            assert.equal(linear, ((repeat * u) + coordinateU) * 6 + vv);
          }
        }
        cursor = end;
      }
      assert.equal(cursor, rings);
      assert.equal(seen.size, rings, "ring partition must cover the complete logical ring domain exactly once");
    }
  }
}

console.log("GLUBALL CUDA Runtime V3 source contract: PASS");
