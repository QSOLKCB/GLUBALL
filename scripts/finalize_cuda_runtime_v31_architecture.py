#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Finalize one Runtime V3.1 architecture-ladder physical campaign."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


_PROFILE_SCHEMA = "gluball-cuda-runtime-v31-architecture-profile-definition/1"
_CC_PATTERN = re.compile(r"[0-9]+\.[0-9]+")
_SM_PATTERN = re.compile(r"sm_[0-9]+")


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text())
    except Exception:  # noqa: BLE001 - finalizer records unreadable evidence
        return {"status": "UNREADABLE"}
    return value if isinstance(value, dict) else {"status": "UNREADABLE"}


def read_text(path: Path) -> str | None:
    if not path.exists():
        return None
    return path.read_text(errors="replace").strip()


def validated_profile_definition(payload: dict[str, Any] | None, profile: str) -> dict[str, Any] | None:
    if not isinstance(payload, dict):
        return None
    if payload.get("schema") != _PROFILE_SCHEMA or payload.get("profile") != profile:
        return None
    definition = payload.get("definition")
    if not isinstance(definition, dict):
        return None
    required_strings = (
        "expected_model_regex_case_insensitive",
        "expected_compute_capability",
        "expected_sm",
        "architecture_family",
        "device_class",
        "measurement_role",
        "status",
    )
    if any(not isinstance(definition.get(key), str) or not definition[key] for key in required_strings):
        return None
    try:
        re.compile(definition["expected_model_regex_case_insensitive"], flags=re.IGNORECASE)
    except re.error:
        return None
    capability = definition["expected_compute_capability"]
    expected_sm = definition["expected_sm"]
    if _CC_PATTERN.fullmatch(capability) is None or _SM_PATTERN.fullmatch(expected_sm) is None:
        return None
    if expected_sm != f"sm_{capability.replace('.', '')}":
        return None
    return definition


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--profile", required=True)
    parser.add_argument("--u", type=int, required=True)
    parser.add_argument("--v", type=int, required=True)
    parser.add_argument("--warmup", type=int, required=True)
    parser.add_argument("--iterations", type=int, required=True)
    parser.add_argument("--trials", type=int, required=True)
    args = parser.parse_args()

    root = args.root
    root.mkdir(parents=True, exist_ok=True)

    profile_payload = load_json(root / "PROFILE_DEFINITION.json")
    profile_definition = validated_profile_definition(profile_payload, args.profile)

    marker_paths = {
        "frozen_runtime_sources": root / "FROZEN_RUNTIME_SOURCES.ok",
        "host_validation": root / "HOST_VALIDATION.ok",
        "v1_validation": root / "V1_VALIDATION.ok",
        "atomic_equivalence": root / "ab-atomic" / "EQUIVALENCE.json",
        "two_stage_equivalence": root / "ab-two-stage" / "EQUIVALENCE.json",
        "bounded_tuning": root / "tuning" / "TUNING_RESULT.json",
        "v31_sanitizer": root / "V31_SANITIZER.ok",
    }
    required = {"profile_definition": profile_definition is not None}
    required.update({key: path.exists() for key, path in marker_paths.items()})
    status = "PASS" if all(required.values()) else "FAIL"
    completed = [key for key, present in required.items() if present]
    first_incomplete = next((key for key, present in required.items() if not present), None)

    v1 = load_json(root / "v1-acceptance" / "V1_VALIDATION.json")
    atomic = load_json(root / "ab-atomic" / "EQUIVALENCE.json")
    two_stage = load_json(root / "ab-two-stage" / "EQUIVALENCE.json")
    tuning = load_json(root / "tuning" / "TUNING_RESULT.json")
    resource = load_json(root / "compiler-resources" / "RESOURCE_CAPTURE_STATUS.json")
    frozen_sources = load_json(root / "FROZEN_RUNTIME_SOURCE_VALIDATION.json")

    model = read_text(root / "SELECTED_GPU_MODEL.txt")
    capability = read_text(root / "EXPECTED_COMPUTE_CAPABILITY.txt")
    expected_sm = read_text(root / "EXPECTED_SM.txt")
    source_commit = read_text(root / "SOURCE_COMMIT.txt")

    best = tuning.get("best_observed_candidate_within_declared_set") if isinstance(tuning, dict) else None
    if not isinstance(best, dict):
        best = None

    architecture_result: dict[str, Any] = {
        "schema": "gluball-cuda-runtime-v31-architecture-result/1",
        "status": status,
        "profile": args.profile,
        "profile_definition": profile_definition,
        "source_commit": source_commit,
        "frozen_runtime_source_validation": frozen_sources,
        "gpu": {
            "model": model,
            "compute_capability": capability,
            "expected_sm": expected_sm,
            "raw_device_uuid_published": False,
        },
        "canonical_workload": {
            "u_segments": args.u,
            "v_segments": args.v,
            "repeats": 1,
            "warmup_iterations": args.warmup,
            "measured_iterations": args.iterations,
            "trials_per_candidate": args.trials,
            "fixed_across_profiles": True,
        },
        "required_stages": required,
        "completed_required_stages": completed,
        "first_incomplete_required_stage": first_incomplete,
        "v1_correctness_anchor": {
            "status": v1.get("status") if isinstance(v1, dict) else None,
            "acceptance_record_count": v1.get("acceptance_record_count") if isinstance(v1, dict) else None,
            "output_repeatable_byte_identical": v1.get("output_repeatable_byte_identical") if isinstance(v1, dict) else None,
            "stable_acceptance_fields": v1.get("stable_acceptance_fields") if isinstance(v1, dict) else None,
            "geometry_receipt_authority": False,
        },
        "atomic_equivalence": {
            "status": atomic.get("status") if isinstance(atomic, dict) else None,
            "shared_observation_equivalence": atomic.get("shared_observation_equivalence") if isinstance(atomic, dict) else None,
            "v3_v31_exact_digest_equivalence": atomic.get("v3_v31_exact_digest_equivalence") if isinstance(atomic, dict) else None,
            "diagnostic_digests": atomic.get("diagnostic_digests") if isinstance(atomic, dict) else None,
            "observed_v2_over_v31_wall_ratio": atomic.get("observed_v2_over_v31_wall_ratio") if isinstance(atomic, dict) else None,
            "observed_v3_over_v31_wall_ratio": atomic.get("observed_v3_over_v31_wall_ratio") if isinstance(atomic, dict) else None,
        },
        "two_stage_equivalence": {
            "status": two_stage.get("status") if isinstance(two_stage, dict) else None,
            "shared_observation_equivalence": two_stage.get("shared_observation_equivalence") if isinstance(two_stage, dict) else None,
            "v3_v31_exact_digest_equivalence": two_stage.get("v3_v31_exact_digest_equivalence") if isinstance(two_stage, dict) else None,
            "diagnostic_digests": two_stage.get("diagnostic_digests") if isinstance(two_stage, dict) else None,
            "observed_v2_over_v31_wall_ratio": two_stage.get("observed_v2_over_v31_wall_ratio") if isinstance(two_stage, dict) else None,
            "observed_v3_over_v31_wall_ratio": two_stage.get("observed_v3_over_v31_wall_ratio") if isinstance(two_stage, dict) else None,
        },
        "bounded_tuning": {
            "status": tuning.get("status") if isinstance(tuning, dict) else None,
            "candidate_count": tuning.get("candidate_count") if isinstance(tuning, dict) else None,
            "matched_v3_baseline_configuration_count": tuning.get("matched_v3_baseline_configuration_count") if isinstance(tuning, dict) else None,
            "best_observed_candidate_within_declared_set": best,
            "rigorous_global_optimum_claim": False,
        },
        "compiler_resource_telemetry": resource,
        "comparison_boundary": {
            "cross_device_digest_equality_required": False,
            "within_device_v3_v31_digest_equality_required": True,
            "raw_float_bit_digest_is_geometry_authority": False,
            "cross_hardware_timing_ratio_is_diagnostic_only": True,
        },
        "claim_boundary": {
            "performance_observation_only": True,
            "geometry_receipt_authority": False,
            "universal_speedup_claim": False,
            "raw_device_uuid_published": False,
            "cross_device_portability_claim": False,
            "full_point_cache_enabled": False,
            "cached_complete_observation_enabled": False,
        },
    }
    (root / "ARCHITECTURE_RESULT.json").write_text(
        json.dumps(architecture_result, indent=2, sort_keys=True) + "\n"
    )

    excluded = {"VALIDATION_STATUS.json", "BUNDLE_SHA256SUMS.txt"}
    retained = sorted(
        str(path.relative_to(root))
        for path in root.rglob("*")
        if path.is_file() and path.name not in excluded
    )
    validation_status = {
        "schema": "gluball-runtime-v31-architecture-status/1",
        "status": status,
        "profile": args.profile,
        "profile_definition_present": profile_payload is not None,
        "profile_definition_valid": profile_definition is not None,
        "frozen_runtime_source_validation_present": frozen_sources is not None,
        "required_markers": required,
        "completed_required_stages": completed,
        "first_incomplete_required_stage": first_incomplete,
        "evidence_retained": bool(retained),
        "partial_evidence_retained": status != "PASS" and bool(retained),
        "retained_evidence_file_count": len(retained),
        "architecture_result_present": True,
        "compiler_resource_telemetry_is_graduation_gate": False,
        "performance_observation_only": True,
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
        "raw_device_uuid_published": False,
    }
    (root / "VALIDATION_STATUS.json").write_text(
        json.dumps(validation_status, indent=2, sort_keys=True) + "\n"
    )
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
