#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Verify the complete Runtime V2/V3/V3.1 measured CUDA build-input surface."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any


_SCHEMA = "gluball-cuda-runtime-v31-frozen-build-input-validation/1"
_CONTRACT_RELATIVE = Path("docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json")
_EXPECTED_BUILD_INPUTS = {
    "native/cuda/CMakeLists.txt": "c752caed1c972a680c3cf404657c8e9f9562663e",
    "native/cuda/gluball_runtime_v2.cu": "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1",
    "native/cuda/gluball_runtime_v2_event_compat.cuh": "2be5d30b9d55552214f977b5057bcaf364b59192",
    "native/cuda/gluball_runtime_v3.cu": "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0",
    "native/cuda/gluball_runtime_v31.cu": "045fbf37725beb5d65b2332309626ccfa727f874",
}


def load_contract(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise SystemExit("architecture ladder contract must be a JSON object")
    if value.get("schema") != "gluball-cuda-runtime-v31-architecture-ladder/1":
        raise SystemExit("unexpected architecture ladder contract schema")
    return value


def git_blob_id(repo_root: Path, relative: str) -> str:
    return subprocess.check_output(
        ["git", "hash-object", "--", relative],
        cwd=repo_root,
        text=True,
    ).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--contract", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    repo_root = args.repo_root.resolve()
    contract_path = args.contract.resolve() if args.contract else repo_root / _CONTRACT_RELATIVE
    contract = load_contract(contract_path)
    contract_map = contract.get("frozen_measured_build_inputs")
    contract_matches_expected = contract_map == _EXPECTED_BUILD_INPUTS

    observed: dict[str, str | None] = {}
    matches: dict[str, bool] = {}
    for relative, expected in _EXPECTED_BUILD_INPUTS.items():
        path = repo_root / relative
        if not path.is_file():
            observed[relative] = None
            matches[relative] = False
            continue
        try:
            value = git_blob_id(repo_root, relative)
        except (OSError, subprocess.CalledProcessError):
            value = None
        observed[relative] = value
        matches[relative] = value == expected

    status = "PASS" if contract_matches_expected and all(matches.values()) else "FAIL"
    payload = {
        "schema": _SCHEMA,
        "status": status,
        "contract_path": str(contract_path.relative_to(repo_root)) if contract_path.is_relative_to(repo_root) else str(contract_path),
        "contract_matches_frozen_expected_map": contract_matches_expected,
        "expected_git_blob_ids": _EXPECTED_BUILD_INPUTS,
        "observed_git_blob_ids": observed,
        "build_input_matches_expected": matches,
        "includes_cuda_cmake_target_definition": True,
        "includes_event_timing_compat_header": True,
        "measured_build_inputs_frozen_during_measurement": True,
        "performance_observation_only": True,
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
