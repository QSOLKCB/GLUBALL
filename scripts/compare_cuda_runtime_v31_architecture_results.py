#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Compare two completed Runtime V3.1 architecture-ladder results."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise SystemExit(f"{path}: expected JSON object")
    if value.get("schema") != "gluball-cuda-runtime-v31-architecture-result/1":
        raise SystemExit(f"{path}: unexpected schema")
    if value.get("status") != "PASS":
        raise SystemExit(f"{path}: architecture result must be PASS")
    return value


def best(payload: dict[str, Any], label: str) -> dict[str, Any]:
    tuning = payload.get("bounded_tuning")
    if not isinstance(tuning, dict):
        raise SystemExit(f"{label}: bounded_tuning missing")
    value = tuning.get("best_observed_candidate_within_declared_set")
    if not isinstance(value, dict):
        raise SystemExit(f"{label}: best candidate missing")
    return value


def wall(candidate: dict[str, Any], label: str) -> float:
    value = candidate.get("observed_wall_milliseconds_median_of_trials")
    if not isinstance(value, (int, float)) or isinstance(value, bool) or value <= 0:
        raise SystemExit(f"{label}: invalid best-candidate wall time")
    return float(value)


def digest(payload: dict[str, Any]) -> str | None:
    atomic = payload.get("atomic_equivalence")
    if not isinstance(atomic, dict):
        return None
    digests = atomic.get("diagnostic_digests")
    if not isinstance(digests, dict):
        return None
    value = digests.get("v31")
    return value if isinstance(value, str) else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("left", type=Path)
    parser.add_argument("right", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    left = load(args.left)
    right = load(args.right)
    if left.get("profile") == right.get("profile"):
        raise SystemExit("architecture profiles must differ")
    if left.get("source_commit") != right.get("source_commit"):
        raise SystemExit("cross-profile comparison requires the same source commit")
    if left.get("canonical_workload") != right.get("canonical_workload"):
        raise SystemExit("cross-profile comparison requires the same canonical workload")

    left_best = best(left, "left")
    right_best = best(right, "right")
    left_wall = wall(left_best, "left")
    right_wall = wall(right_best, "right")

    result = {
        "schema": "gluball-cuda-runtime-v31-cross-architecture-comparison/1",
        "status": "PASS",
        "source_commit": left.get("source_commit"),
        "canonical_workload": left.get("canonical_workload"),
        "left": {
            "profile": left.get("profile"),
            "gpu": left.get("gpu"),
            "best_observed_candidate": left_best,
            "v31_diagnostic_digest": digest(left),
        },
        "right": {
            "profile": right.get("profile"),
            "gpu": right.get("gpu"),
            "best_observed_candidate": right_best,
            "v31_diagnostic_digest": digest(right),
        },
        "observed_left_over_right_best_wall_ratio": left_wall / right_wall,
        "observed_right_over_left_best_wall_ratio": right_wall / left_wall,
        "cross_device_digest_match_observed": digest(left) == digest(right),
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
