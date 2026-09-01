#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Verify one bounded physical V1 CUDA evidence campaign."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from pathlib import Path


def is_int(value: object, minimum: int | None = None) -> bool:
    return (
        isinstance(value, int)
        and not isinstance(value, bool)
        and (minimum is None or value >= minimum)
    )


def is_positive_int(value: object) -> bool:
    return is_int(value, 1)


def is_nonnegative_number(value: object) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
        and float(value) >= 0.0
    )


def is_fnv1a64(value: object) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{16}", value) is not None


def numbered(
    root: Path,
    pattern: str,
    regex: str,
    label: str,
    expected_ordinals: set[int],
    issues: list[str],
) -> dict[int, Path]:
    found: dict[int, Path] = {}
    for path in root.glob(pattern):
        match = re.fullmatch(regex, path.name)
        if not match:
            continue
        ordinal = int(match.group(1))
        if ordinal in found:
            issues.append(
                f"duplicate {label} ordinal {ordinal}: {found[ordinal].name}, {path.name}"
            )
            continue
        found[ordinal] = path
    actual_ordinals = set(found)
    if actual_ordinals != expected_ordinals:
        issues.append(
            f"{label} ordinals must equal {sorted(expected_ordinals)}, "
            f"found {sorted(actual_ordinals)}"
        )
    return found


def find_clean_summary(expected: str, candidates: list[Path]) -> Path | None:
    for path in candidates:
        if path.is_file() and path.stat().st_size > 0:
            if expected in path.read_text(errors="replace"):
                return path
    return None


def verify(root: Path, expected_runs: int) -> dict[str, object]:
    expected_ordinals = set(range(1, expected_runs + 1))
    issues: list[str] = []

    records = numbered(
        root,
        "cuda-acceptance-*.json",
        r"cuda-acceptance-(\d+)\.json",
        "V1 acceptance record",
        expected_ordinals,
        issues,
    )
    outputs = numbered(
        root,
        "cuda-output-*.f32le",
        r"cuda-output-(\d+)\.f32le",
        "V1 output field",
        expected_ordinals,
        issues,
    )
    sidecars = numbered(
        root,
        "cuda-run-*.json",
        r"cuda-run-(\d+)\.json",
        "V1 CUDA sidecar",
        expected_ordinals,
        issues,
    )

    if len(records) != expected_runs:
        issues.append(f"expected {expected_runs} V1 acceptance records, found {len(records)}")
    if len(outputs) != expected_runs:
        issues.append(f"expected {expected_runs} V1 output fields, found {len(outputs)}")
    if len(sidecars) != expected_runs:
        issues.append(f"expected {expected_runs} V1 CUDA sidecars, found {len(sidecars)}")

    stable_field_validators = {
        "total_points": is_positive_int,
        "checked_points": is_positive_int,
        "max_component_residual": is_nonnegative_number,
        "max_euclidean_residual": is_nonnegative_number,
        "max_reported_tube_radius_error": is_nonnegative_number,
        "worst_linear_index": lambda value: is_int(value, 0),
        "evidence_artifact_fnv1a64": is_fnv1a64,
    }

    payloads: dict[int, dict[str, object]] = {}
    for ordinal in sorted(expected_ordinals):
        path = records.get(ordinal)
        if path is None:
            continue
        try:
            payload = json.loads(path.read_text())
        except Exception as exc:  # noqa: BLE001 - verifier must report malformed evidence
            issues.append(f"cannot parse {path.name}: {exc}")
            continue
        if not isinstance(payload, dict):
            issues.append(f"{path.name}: acceptance payload must be an object")
            continue
        payloads[ordinal] = payload

        for field, validator in stable_field_validators.items():
            if field not in payload:
                issues.append(f"{path.name}: missing required stable field {field}")
            elif not validator(payload[field]):
                issues.append(f"{path.name}: invalid type/value for stable field {field}")

        discovered_output = outputs.get(ordinal)
        discovered_sidecar = sidecars.get(ordinal)
        evidence_output_path = payload.get("evidence_output_path")
        cuda_sidecar_path = payload.get("cuda_sidecar_path")
        checks = {
            "status": payload.get("status") == "PASS",
            "repeat_run": is_int(payload.get("repeat_run"), 1)
            and payload.get("repeat_run") == ordinal,
            "complete_output_readback": payload.get("complete_output_readback") is True,
            "reference_residual_checked": payload.get("reference_residual_checked") is True,
            "conformance_acceptance": payload.get("conformance_acceptance") is True,
            "geometry_receipt_authority": payload.get("geometry_receipt_authority") is False,
            "universal_speedup_claim": payload.get("universal_speedup_claim") is False,
            "checked_points_equal_total": (
                is_positive_int(payload.get("checked_points"))
                and is_positive_int(payload.get("total_points"))
                and payload.get("checked_points") == payload.get("total_points")
            ),
            "nonfinite_records_zero": is_int(payload.get("nonfinite_records"), 0)
            and payload.get("nonfinite_records") == 0,
            "matching_output_path": (
                discovered_output is not None
                and isinstance(evidence_output_path, str)
                and Path(evidence_output_path).name == discovered_output.name
            ),
            "matching_sidecar_path": (
                discovered_sidecar is not None
                and isinstance(cuda_sidecar_path, str)
                and Path(cuda_sidecar_path).name == discovered_sidecar.name
            ),
        }
        for name, passed in checks.items():
            if not passed:
                issues.append(f"{path.name}: failed {name}")

    stable_values: dict[str, object] = {}
    if set(payloads) == expected_ordinals:
        for field, validator in stable_field_validators.items():
            values = [payloads[ordinal].get(field) for ordinal in sorted(expected_ordinals)]
            if not all(validator(value) for value in values):
                continue
            stable_values[field] = values[0]
            if any(value != values[0] for value in values[1:]):
                issues.append(f"V1 acceptance field not repeatable: {field}")

    output_sha256_by_run = {
        str(ordinal): hashlib.sha256(outputs[ordinal].read_bytes()).hexdigest()
        for ordinal in sorted(expected_ordinals)
        if ordinal in outputs
    }
    output_sha256 = [
        output_sha256_by_run[str(ordinal)]
        for ordinal in sorted(expected_ordinals)
        if str(ordinal) in output_sha256_by_run
    ]
    output_repeatable = (
        set(outputs) == expected_ordinals
        and len(output_sha256) == expected_runs
        and len(set(output_sha256)) == 1
    )
    if set(outputs) == expected_ordinals and not output_repeatable:
        issues.append("V1 complete output fields are not byte-identical across repeats")

    memcheck_source = find_clean_summary(
        "ERROR SUMMARY: 0 errors",
        [root / "memcheck.txt", root / "memcheck-run.json"],
    )
    racecheck_source = find_clean_summary(
        "RACECHECK SUMMARY: 0 hazards displayed (0 errors, 0 warnings)",
        [root / "racecheck.txt", root / "racecheck-run.json"],
    )
    if memcheck_source is None:
        issues.append("clean V1 memcheck summary not found in either archival location")
    if racecheck_source is None:
        issues.append("clean V1 racecheck summary not found in either archival location")

    summary: dict[str, object] = {
        "schema": "gluball-runtime-v31-v1-validation/1",
        "status": "PASS" if not issues else "FAIL",
        "expected_runs": expected_runs,
        "expected_ordinals": sorted(expected_ordinals),
        "acceptance_record_ordinals": sorted(records),
        "cuda_sidecar_ordinals": sorted(sidecars),
        "output_ordinals": sorted(outputs),
        "acceptance_record_files": [records[o].name for o in sorted(records)],
        "cuda_sidecar_files": [sidecars[o].name for o in sorted(sidecars)],
        "output_files": [outputs[o].name for o in sorted(outputs)],
        "acceptance_record_count": len(records),
        "cuda_sidecar_count": len(sidecars),
        "output_file_count": len(outputs),
        "output_sha256": output_sha256,
        "output_sha256_by_run": output_sha256_by_run,
        "output_repeatable_byte_identical": output_repeatable,
        "stable_acceptance_fields": stable_values,
        "memcheck_clean_summary_source": memcheck_source.name if memcheck_source else None,
        "racecheck_clean_summary_source": racecheck_source.name if racecheck_source else None,
        "dual_location_sanitizer_archive_observed": bool(
            memcheck_source
            and racecheck_source
            and (
                memcheck_source.name.endswith("-run.json")
                or racecheck_source.name.endswith("-run.json")
            )
        ),
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
        "issues": issues,
    }
    return summary


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("campaign_dir", type=Path)
    parser.add_argument("--expected-runs", type=int, default=3)
    args = parser.parse_args()
    if args.expected_runs < 1:
        raise SystemExit("--expected-runs must be positive")

    summary = verify(args.campaign_dir, args.expected_runs)
    output = args.campaign_dir / "V1_VALIDATION.json"
    output.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    if summary["status"] != "PASS":
        raise SystemExit("; ".join(summary["issues"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
