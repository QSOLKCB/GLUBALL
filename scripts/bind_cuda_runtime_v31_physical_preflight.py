#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Bind a verified Runtime V3.1 physical-preflight receipt into an evidence bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


_SCHEMA = "gluball-cuda-runtime-v31-physical-preflight/1"
_CANONICAL = {
    "u_segments": 16384,
    "v_segments": 128,
    "repeats": 1,
    "warmup_iterations": 20,
    "measured_iterations": 1000,
    "trials_per_candidate": 3,
    "fixed_across_profiles": True,
}


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text())
    except Exception:  # noqa: BLE001 - evidence binding fails closed
        return None
    return value if isinstance(value, dict) else None


def valid_receipt(payload: dict[str, Any] | None) -> bool:
    if not isinstance(payload, dict):
        return False
    checks = (
        payload.get("schema") == _SCHEMA,
        payload.get("status") == "PASS",
        payload.get("canonical_workload_expected") == _CANONICAL,
        payload.get("canonical_workload_observed") == _CANONICAL,
        payload.get("canonical_workload_match") is True,
        payload.get("full_gpu_required") is True,
        payload.get("mig_mode_acceptable") is True,
        payload.get("mig_enabled") is False,
        payload.get("mig_partition_observed") is False,
        payload.get("profile_model_match") is True,
        payload.get("profile_compute_capability_match") is True,
        payload.get("geometry_receipt_authority") is False,
        payload.get("universal_speedup_claim") is False,
        payload.get("raw_device_uuid_published") is False,
    )
    return all(checks)


def bind_payload(path: Path, marker_key: str, receipt: dict[str, Any] | None, valid: bool) -> bool:
    payload = load_json(path)
    if payload is None:
        return False
    markers = payload.get(marker_key)
    if not isinstance(markers, dict):
        markers = {}
        payload[marker_key] = markers
    markers["physical_preflight"] = valid
    payload["physical_preflight_validation"] = receipt

    completed = payload.get("completed_required_stages")
    if not isinstance(completed, list):
        completed = []
    completed = [item for item in completed if item != "physical_preflight"]
    if valid:
        completed.append("physical_preflight")
    payload["completed_required_stages"] = completed

    if not valid:
        payload["status"] = "FAIL"
        if payload.get("first_incomplete_required_stage") is None:
            payload["first_incomplete_required_stage"] = "physical_preflight"
    elif payload.get("first_incomplete_required_stage") == "physical_preflight":
        payload["first_incomplete_required_stage"] = None

    if path.name == "VALIDATION_STATUS.json":
        payload["physical_preflight_validation_present"] = receipt is not None
        payload["physical_preflight_validation_valid"] = valid

    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return True


def regenerate_manifest(root: Path) -> None:
    output = root / "BUNDLE_SHA256SUMS.txt"
    temporary = root / "BUNDLE_SHA256SUMS.txt.tmp"
    excluded = {output.name, temporary.name}
    lines: list[str] = []
    for path in sorted(
        (p for p in root.rglob("*") if p.is_file() and p.name not in excluded),
        key=lambda p: p.relative_to(root).as_posix(),
    ):
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            while True:
                chunk = handle.read(1024 * 1024)
                if not chunk:
                    break
                digest.update(chunk)
        lines.append(f"{digest.hexdigest()}  ./{path.relative_to(root).as_posix()}\n")
    temporary.write_text("".join(lines))
    temporary.replace(output)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("receipt", type=Path)
    args = parser.parse_args()

    root = args.root
    root.mkdir(parents=True, exist_ok=True)
    receipt = load_json(args.receipt)
    valid = valid_receipt(receipt)

    archived = root / "PHYSICAL_PREFLIGHT_VALIDATION.json"
    if receipt is not None:
        archived.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")

    validation_bound = bind_payload(root / "VALIDATION_STATUS.json", "required_markers", receipt, valid)
    result_bound = bind_payload(root / "ARCHITECTURE_RESULT.json", "required_stages", receipt, valid)
    if not validation_bound or not result_bound:
        valid = False

    regenerate_manifest(root)
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
