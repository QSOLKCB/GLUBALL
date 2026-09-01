#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Compare two completed Runtime V3.1 architecture-ladder results."""

from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path
from typing import Any


_SHA40 = re.compile(r"[0-9a-fA-F]{40}")
_HEX64 = re.compile(r"[0-9a-fA-F]{16}")
_PROFILE_REGISTRY = (
    Path(__file__).resolve().parents[1] / "docs" / "CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json"
)
_PROFILE_IDENTITY_FIELDS = (
    "expected_model_regex_case_insensitive",
    "expected_compute_capability",
    "expected_sm",
    "architecture_family",
    "device_class",
    "measurement_role",
)


def load_profile_registry() -> dict[str, dict[str, Any]]:
    payload = json.loads(_PROFILE_REGISTRY.read_text())
    if payload.get("schema") != "gluball-cuda-runtime-v31-architecture-profiles/1":
        raise SystemExit("architecture profile registry has unexpected schema")
    profiles = payload.get("profiles")
    if not isinstance(profiles, dict) or not profiles:
        raise SystemExit("architecture profile registry has no profiles")
    return profiles


_PROFILE_DEFINITIONS = load_profile_registry()


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise SystemExit(f"{path}: expected JSON object")
    if value.get("schema") != "gluball-cuda-runtime-v31-architecture-result/1":
        raise SystemExit(f"{path}: unexpected schema")
    if value.get("status") != "PASS":
        raise SystemExit(f"{path}: architecture result must be PASS")
    return value


def immutable_profile_identity(definition: Any, label: str) -> dict[str, Any]:
    if not isinstance(definition, dict):
        raise SystemExit(f"{label}: profile definition missing")
    status = definition.get("status")
    if not isinstance(status, str) or not status:
        raise SystemExit(f"{label}: profile lifecycle status missing or invalid")
    identity: dict[str, Any] = {}
    for key in _PROFILE_IDENTITY_FIELDS:
        value = definition.get(key)
        if not isinstance(value, str) or not value:
            raise SystemExit(f"{label}: profile identity field missing or invalid: {key}")
        identity[key] = value
    return identity


def profile(payload: dict[str, Any], label: str) -> str:
    value = payload.get("profile")
    if not isinstance(value, str) or value not in _PROFILE_DEFINITIONS:
        raise SystemExit(f"{label}: invalid or missing architecture profile")
    definition = _PROFILE_DEFINITIONS[value]
    gpu = payload.get("gpu")
    if not isinstance(gpu, dict):
        raise SystemExit(f"{label}: gpu identity object missing")
    model = gpu.get("model")
    capability = gpu.get("compute_capability")
    expected_sm = gpu.get("expected_sm")
    model_pattern = definition.get("expected_model_regex_case_insensitive")
    registry_capability = definition.get("expected_compute_capability")
    registry_sm = definition.get("expected_sm")
    if not isinstance(model, str) or not isinstance(model_pattern, str) or not model_pattern:
        raise SystemExit(f"{label}: GPU model/profile pattern missing")
    try:
        model_matches = re.fullmatch(model_pattern, model, flags=re.IGNORECASE) is not None
    except re.error as exc:
        raise SystemExit(f"{label}: invalid model regex in profile registry: {exc}") from exc
    if not model_matches:
        raise SystemExit(f"{label}: GPU model does not match profile registry")
    if capability != registry_capability:
        raise SystemExit(f"{label}: compute capability does not match profile registry")
    if expected_sm != registry_sm:
        raise SystemExit(f"{label}: native SM does not match profile registry")

    embedded_identity = immutable_profile_identity(
        payload.get("profile_definition"), f"{label}: embedded"
    )
    registry_identity = immutable_profile_identity(definition, f"{label}: registry")
    if embedded_identity != registry_identity:
        raise SystemExit(f"{label}: embedded profile definition does not match profile registry")
    # Lifecycle metadata such as profile_definition.status is schema-validated
    # above but intentionally excluded from identity equality. A valid archived
    # measurement must remain comparable after its lifecycle status changes.
    return value


def source_commit(payload: dict[str, Any], label: str) -> str:
    value = payload.get("source_commit")
    if not isinstance(value, str) or _SHA40.fullmatch(value) is None:
        raise SystemExit(f"{label}: source_commit must be a 40-hex commit identifier")
    return value.lower()


def positive_int(value: Any, minimum: int = 1) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum


def canonical_workload(payload: dict[str, Any], label: str) -> dict[str, Any]:
    value = payload.get("canonical_workload")
    if not isinstance(value, dict):
        raise SystemExit(f"{label}: canonical_workload must be a complete object")
    checks = {
        "u_segments": positive_int(value.get("u_segments"), 12),
        "v_segments": positive_int(value.get("v_segments"), 6),
        "repeats": value.get("repeats") == 1,
        "warmup_iterations": positive_int(value.get("warmup_iterations"), 0),
        "measured_iterations": positive_int(value.get("measured_iterations"), 2),
        "trials_per_candidate": positive_int(value.get("trials_per_candidate"), 1),
        "fixed_across_profiles": value.get("fixed_across_profiles") is True,
    }
    failed = [name for name, passed in checks.items() if not passed]
    if failed:
        raise SystemExit(f"{label}: incomplete/invalid canonical_workload fields: {', '.join(failed)}")
    return value


def best(payload: dict[str, Any], label: str) -> dict[str, Any]:
    tuning = payload.get("bounded_tuning")
    if not isinstance(tuning, dict) or tuning.get("status") != "PASS":
        raise SystemExit(f"{label}: bounded_tuning missing or not PASS")
    value = tuning.get("best_observed_candidate_within_declared_set")
    if not isinstance(value, dict):
        raise SystemExit(f"{label}: best candidate missing")
    return value


def wall(candidate: dict[str, Any], label: str) -> float:
    value = candidate.get("observed_wall_milliseconds_median_of_trials")
    if (
        not isinstance(value, (int, float))
        or isinstance(value, bool)
        or not math.isfinite(float(value))
        or value <= 0
    ):
        raise SystemExit(f"{label}: invalid best-candidate wall time")
    return float(value)


def digest(payload: dict[str, Any], label: str) -> str:
    atomic = payload.get("atomic_equivalence")
    if not isinstance(atomic, dict) or atomic.get("status") != "PASS":
        raise SystemExit(f"{label}: atomic_equivalence missing or not PASS")
    if atomic.get("shared_observation_equivalence") is not True:
        raise SystemExit(f"{label}: atomic shared observation equivalence missing")
    if atomic.get("v3_v31_exact_digest_equivalence") is not True:
        raise SystemExit(f"{label}: within-device V3/V3.1 digest equivalence missing")
    digests = atomic.get("diagnostic_digests")
    if not isinstance(digests, dict):
        raise SystemExit(f"{label}: atomic diagnostic_digests missing")
    value = digests.get("v31")
    if not isinstance(value, str) or _HEX64.fullmatch(value) is None:
        raise SystemExit(f"{label}: V3.1 diagnostic digest must be 16 hex characters")
    return value.lower()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("left", type=Path)
    parser.add_argument("right", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    left = load(args.left)
    right = load(args.right)
    left_profile = profile(left, "left")
    right_profile = profile(right, "right")
    if left_profile == right_profile:
        raise SystemExit("architecture profiles must differ")

    left_commit = source_commit(left, "left")
    right_commit = source_commit(right, "right")
    if left_commit != right_commit:
        raise SystemExit("cross-profile comparison requires the same source commit")

    left_workload = canonical_workload(left, "left")
    right_workload = canonical_workload(right, "right")
    if left_workload != right_workload:
        raise SystemExit("cross-profile comparison requires the same canonical workload")

    left_best = best(left, "left")
    right_best = best(right, "right")
    left_wall = wall(left_best, "left")
    right_wall = wall(right_best, "right")
    left_digest = digest(left, "left")
    right_digest = digest(right, "right")

    result = {
        "schema": "gluball-cuda-runtime-v31-cross-architecture-comparison/1",
        "status": "PASS",
        "source_commit": left_commit,
        "canonical_workload": left_workload,
        "profile_identity_fields": list(_PROFILE_IDENTITY_FIELDS),
        "profile_lifecycle_status_is_identity": False,
        "left": {
            "profile": left_profile,
            "gpu": left.get("gpu"),
            "best_observed_candidate": left_best,
            "v31_diagnostic_digest": left_digest,
        },
        "right": {
            "profile": right_profile,
            "gpu": right.get("gpu"),
            "best_observed_candidate": right_best,
            "v31_diagnostic_digest": right_digest,
        },
        "observed_left_over_right_best_wall_ratio": left_wall / right_wall,
        "observed_right_over_left_best_wall_ratio": right_wall / left_wall,
        "cross_device_digest_match_observed": left_digest == right_digest,
        "cross_device_digest_observation_available": True,
        "cross_device_digest_equality_required": False,
        "within_device_v3_v31_digest_equality_required": True,
        "cross_hardware_timing_ratio_is_diagnostic_only": True,
        "raw_float_bit_digest_is_geometry_authority": False,
        "performance_observation_only": True,
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
        "cross_device_portability_claim": False,
    }

    text = json.dumps(result, indent=2, sort_keys=True) + "\n"
    if args.output:
        args.output.write_text(text)
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
