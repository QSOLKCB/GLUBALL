#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Bind a verified frozen measured-build-input receipt into a V3.1 architecture bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


_SCHEMA = "gluball-cuda-runtime-v31-frozen-build-input-validation/1"
_EXPECTED_BUILD_INPUTS = {
    "native/cuda/CMakeLists.txt": "c752caed1c972a680c3cf404657c8e9f9562663e",
    "native/cuda/gluball_runtime_v2.cu": "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1",
    "native/cuda/gluball_runtime_v2_event_compat.cuh": "2be5d30b9d55552214f977b5057bcaf364b59192",
    "native/cuda/gluball_runtime_v3.cu": "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0",
    "native/cuda/gluball_runtime_v31.cu": "045fbf37725beb5d65b2332309626ccfa727f874",
}


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        value = json.loads(path.read_text())
    except Exception:  # noqa: BLE001 - evidence binder must fail closed
        return None
    return value if isinstance(value, dict) else None


def valid_receipt(payload: dict[str, Any] | None) -> bool:
    if not isinstance(payload, dict):
        return False
    if payload.get("schema") != _SCHEMA or payload.get("status") != "PASS":
        return False
    if payload.get("contract_matches_frozen_expected_map") is not True:
        return False
    if payload.get("expected_git_blob_ids") != _EXPECTED_BUILD_INPUTS:
        return False
    if payload.get("observed_git_blob_ids") != _EXPECTED_BUILD_INPUTS:
        return False
    if payload.get("build_input_matches_expected") != {key: True for key in _EXPECTED_BUILD_INPUTS}:
        return False
    if payload.get("includes_cuda_cmake_target_definition") is not True:
        return False
    if payload.get("includes_event_timing_compat_header") is not True:
        return False
    if payload.get("measured_build_inputs_frozen_during_measurement") is not True:
        return False
    if payload.get("geometry_receipt_authority") is not False:
        return False
    if payload.get("universal_speedup_claim") is not False:
        return False
    return True


def bind_payload(path: Path, marker_key: str, receipt: dict[str, Any] | None, valid: bool) -> bool:
    payload = load_json(path)
    if payload is None:
        return False
    markers = payload.get(marker_key)
    if not isinstance(markers, dict):
        markers = {}
        payload[marker_key] = markers
    markers["frozen_measured_build_inputs"] = valid
    payload["frozen_measured_build_input_validation"] = receipt

    completed = payload.get("completed_required_stages")
    if not isinstance(completed, list):
        completed = []
    completed = [item for item in completed if item != "frozen_measured_build_inputs"]
    if valid:
        completed.append("frozen_measured_build_inputs")
    payload["completed_required_stages"] = completed

    if not valid:
        payload["status"] = "FAIL"
        if payload.get("first_incomplete_required_stage") is None:
            payload["first_incomplete_required_stage"] = "frozen_measured_build_inputs"
    elif payload.get("first_incomplete_required_stage") == "frozen_measured_build_inputs":
        payload["first_incomplete_required_stage"] = None

    if path.name == "VALIDATION_STATUS.json":
        payload["frozen_measured_build_input_validation_present"] = receipt is not None
        payload["frozen_measured_build_input_validation_valid"] = valid

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

    archived = root / "FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json"
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
