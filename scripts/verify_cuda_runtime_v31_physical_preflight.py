#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Fail-closed physical preflight for Runtime V3.1 architecture-ladder rentals."""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
from io import StringIO
from pathlib import Path
from typing import Any


_SCHEMA = "gluball-cuda-runtime-v31-physical-preflight/1"
_PROFILE_SCHEMA = "gluball-cuda-runtime-v31-architecture-profiles/1"
_LADDER_SCHEMA = "gluball-cuda-runtime-v31-architecture-ladder/1"


def load_object(path: Path, schema: str, label: str) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict) or value.get("schema") != schema:
        raise SystemExit(f"unexpected {label} schema")
    return value


def parse_decimal(name: str, raw: str) -> int:
    if not raw.isdecimal():
        raise SystemExit(f"{name} must be a decimal integer")
    return int(raw)


def safe_mig_query() -> tuple[int, str, str | None]:
    command = [
        "nvidia-smi",
        "-i",
        "0",
        "--query-gpu=index,name,compute_cap,memory.total,mig.mode.current",
        "--format=csv,noheader,nounits",
    ]
    completed = subprocess.run(command, text=True, capture_output=True, check=False)
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip() or None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument("--u", required=True)
    parser.add_argument("--v", required=True)
    parser.add_argument("--warmup", required=True)
    parser.add_argument("--iterations", required=True)
    parser.add_argument("--trials", required=True)
    parser.add_argument(
        "--profile-registry",
        type=Path,
        default=Path("docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json"),
    )
    parser.add_argument(
        "--ladder-contract",
        type=Path,
        default=Path("docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json"),
    )
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    registry = load_object(args.profile_registry, _PROFILE_SCHEMA, "architecture profile registry")
    ladder = load_object(args.ladder_contract, _LADDER_SCHEMA, "architecture ladder contract")
    profiles = registry.get("profiles")
    definition = profiles.get(args.profile) if isinstance(profiles, dict) else None
    if not isinstance(definition, dict):
        raise SystemExit(f"unsupported architecture profile: {args.profile}")

    required_full_gpu = definition.get("requires_full_gpu") is True
    model_pattern = definition.get("expected_model_regex_case_insensitive")
    expected_cc = definition.get("expected_compute_capability")
    if not required_full_gpu:
        raise SystemExit(f"profile {args.profile} is not declared as a full-GPU profile")
    if not isinstance(model_pattern, str) or not model_pattern:
        raise SystemExit("profile model regex missing")
    if not isinstance(expected_cc, str) or not expected_cc:
        raise SystemExit("profile compute capability missing")

    canonical = ladder.get("canonical_workload")
    if not isinstance(canonical, dict):
        raise SystemExit("canonical workload missing from ladder contract")
    expected_workload = {
        "u_segments": canonical.get("u_segments"),
        "v_segments": canonical.get("v_segments"),
        "repeats": canonical.get("repeats"),
        "warmup_iterations": canonical.get("warmup_iterations"),
        "measured_iterations": canonical.get("measured_iterations"),
        "trials_per_candidate": canonical.get("trials_per_candidate"),
        "fixed_across_profiles": canonical.get("fixed_across_profiles"),
    }
    observed_workload = {
        "u_segments": parse_decimal("U", args.u),
        "v_segments": parse_decimal("V", args.v),
        "repeats": 1,
        "warmup_iterations": parse_decimal("WARMUP", args.warmup),
        "measured_iterations": parse_decimal("ITERATIONS", args.iterations),
        "trials_per_candidate": parse_decimal("TRIALS", args.trials),
        "fixed_across_profiles": True,
    }
    canonical_workload_match = observed_workload == expected_workload

    query_status, query_output, query_error = safe_mig_query()
    inventory: dict[str, Any] | None = None
    mig_mode: str | None = None
    mig_query_supported = query_status == 0 and bool(query_output)
    mig_partition_observed = False
    model_match = False
    capability_match = False

    if mig_query_supported:
        rows = list(csv.reader(StringIO(query_output)))
        if len(rows) == 1 and len(rows[0]) == 5:
            index, model, capability, memory_total, mode = (field.strip() for field in rows[0])
            mig_mode = mode
            inventory = {
                "index": index,
                "name": model,
                "compute_capability": capability,
                "memory_total_mib": memory_total,
                "mig_mode_current": mode,
            }
            try:
                model_match = re.fullmatch(model_pattern, model, flags=re.IGNORECASE) is not None
            except re.error as exc:
                raise SystemExit(f"invalid profile model regex: {exc}") from exc
            capability_match = capability == expected_cc
            mig_partition_observed = "mig" in model.casefold()
        else:
            mig_query_supported = False

    cc_major = int(expected_cc.split(".", 1)[0]) if expected_cc.split(".", 1)[0].isdigit() else 0
    mig_capable_profile = cc_major >= 8
    normalized_mode = (mig_mode or "").strip().casefold()
    mig_enabled = normalized_mode == "enabled"
    if mig_query_supported:
        if mig_capable_profile:
            mig_mode_acceptable = normalized_mode == "disabled"
        else:
            mig_mode_acceptable = normalized_mode in {"disabled", "n/a", "[n/a]", "not supported"}
    else:
        mig_mode_acceptable = not mig_capable_profile
        if not mig_capable_profile:
            model_match = True
            capability_match = True
            mig_mode = "not-applicable-query-unavailable"

    status = "PASS" if all((
        canonical_workload_match,
        required_full_gpu,
        mig_mode_acceptable,
        not mig_enabled,
        not mig_partition_observed,
        model_match,
        capability_match,
    )) else "FAIL"

    payload = {
        "schema": _SCHEMA,
        "status": status,
        "profile": args.profile,
        "canonical_workload_expected": expected_workload,
        "canonical_workload_observed": observed_workload,
        "canonical_workload_match": canonical_workload_match,
        "full_gpu_required": required_full_gpu,
        "mig_capable_profile": mig_capable_profile,
        "mig_query_supported": mig_query_supported,
        "mig_query_exit_code": query_status,
        "mig_query_error": query_error,
        "mig_mode_current": mig_mode,
        "mig_mode_acceptable": mig_mode_acceptable,
        "mig_enabled": mig_enabled,
        "mig_partition_observed": mig_partition_observed,
        "safe_gpu_inventory": inventory,
        "profile_model_match": model_match,
        "profile_compute_capability_match": capability_match,
        "performance_observation_only": True,
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
        "raw_device_uuid_published": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
