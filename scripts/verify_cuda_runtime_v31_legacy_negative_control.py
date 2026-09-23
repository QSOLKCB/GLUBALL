#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Verify an exact legacy NVIDIA host as a modern-CUDA-unavailable negative control."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path
from typing import Any


_PROFILE_SCHEMA = "gluball-cuda-runtime-v31-architecture-profiles/1"
_PCI_ADDRESS_PATTERN = r"(?:(?:[0-9a-fA-F]{4}):)?[0-9a-fA-F]{2}:[0-9a-fA-F]{2}\\.[0-7]"
_NVCC_RELEASE_PATTERN = re.compile(r"\\brelease\\s+([0-9]+\\.[0-9]+)\\b")


def run(command: list[str]) -> tuple[int, str, str]:
    try:
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
    except OSError as exc:
        return 127, "", f"{command[0]} unavailable: {exc}"
    return completed.returncode, completed.stdout.strip(), completed.stderr.strip()


def load_profile(path: Path, profile: str) -> dict[str, Any]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, dict) or payload.get("schema") != _PROFILE_SCHEMA:
        raise SystemExit("unexpected legacy negative profile registry schema")
    profiles = payload.get("profiles")
    definition = profiles.get(profile) if isinstance(profiles, dict) else None
    if not isinstance(definition, dict):
        raise SystemExit(f"unsupported legacy negative profile: {profile}")
    if definition.get("negative_control") is not True:
        raise SystemExit(f"profile {profile} is not declared as a negative control")
    return definition


def first_prefixed_line(text: str, prefix: str) -> str | None:
    for raw in text.splitlines():
        if raw.startswith(prefix):
            return raw[len(prefix):].strip()
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--profile", required=True)
    parser.add_argument(
        "--profile-registry",
        type=Path,
        default=Path("docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_PROFILES.json"),
    )
    parser.add_argument("--dev-root", type=Path, default=Path("/dev"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    definition = load_profile(args.profile_registry, args.profile)
    required_strings = (
        "expected_pci_device_id",
        "expected_lspci_model_regex_case_insensitive",
        "expected_kernel_driver",
        "expected_opengl_vendor_regex_case_insensitive",
        "expected_opengl_renderer",
        "expected_compute_capability",
        "expected_sm",
        "expected_nvcc_release",
        "expected_nvcc_compute_target",
        "expected_nvcc_sm_target",
        "expected_architecture_preflight_status",
    )
    missing = [
        key
        for key in required_strings
        if not isinstance(definition.get(key), str) or not definition[key]
    ]
    if missing:
        raise SystemExit(f"profile {args.profile} missing fields: {', '.join(missing)}")
    if definition.get("expected_nvidia_smi_usable") is not False:
        raise SystemExit("negative control must require nvidia-smi to be unusable")
    if definition.get("expected_nvidia_device_nodes_present") is not False:
        raise SystemExit("negative control must require NVIDIA device nodes to be absent")

    try:
        model_pattern = re.compile(
            definition["expected_lspci_model_regex_case_insensitive"],
            flags=re.IGNORECASE,
        )
        opengl_vendor_pattern = re.compile(
            definition["expected_opengl_vendor_regex_case_insensitive"],
            flags=re.IGNORECASE,
        )
    except re.error as exc:
        raise SystemExit(f"invalid profile regex: {exc}") from exc

    pci_id = definition["expected_pci_device_id"].casefold()
    lspci_status, lspci_out, lspci_err = run(["lspci", "-nnk"])
    blocks = re.split(rf"\\n(?={_PCI_ADDRESS_PATTERN} )", lspci_out)
    gpu_block = next((block for block in blocks if f"[{pci_id}]" in block.casefold()), "")
    gpu_line = gpu_block.splitlines()[0] if gpu_block else ""
    model_match = bool(gpu_line and model_pattern.search(gpu_line))

    driver_match = re.search(r"Kernel driver in use:\\s*(\\S+)", gpu_block)
    observed_driver = driver_match.group(1) if driver_match else None

    glx_status, glx_out, glx_err = run(["glxinfo", "-B"])
    opengl_vendor = first_prefixed_line(glx_out, "OpenGL vendor string:")
    opengl_renderer = first_prefixed_line(glx_out, "OpenGL renderer string:")
    opengl_version = first_prefixed_line(glx_out, "OpenGL version string:")

    nvcc_status, nvcc_out, nvcc_err = run(["nvcc", "--version"])
    nvcc_release_match = _NVCC_RELEASE_PATTERN.search(nvcc_out) if nvcc_status == 0 else None
    observed_nvcc_release = nvcc_release_match.group(1) if nvcc_release_match else None
    arch_status, arch_out, arch_err = run(["nvcc", "--list-gpu-arch"])
    code_status, code_out, code_err = run(["nvcc", "--list-gpu-code"])
    advertised_arches = [line.strip() for line in arch_out.splitlines() if line.strip()]
    advertised_codes = [line.strip() for line in code_out.splitlines() if line.strip()]

    smi_status, smi_out, smi_err = run(["nvidia-smi"])
    device_nodes = sorted(path.name for path in args.dev_root.glob("nvidia*"))

    ldconfig_status, ldconfig_out, ldconfig_err = run(["ldconfig", "-p"])
    cuda_library_lines = [
        line.strip()
        for line in ldconfig_out.splitlines()
        if "libcuda" in line or "libcudart" in line
    ]

    checks = {
        "lspci_probe_succeeded": lspci_status == 0,
        "expected_pci_device_present": bool(gpu_block),
        "expected_lspci_model_match": model_match,
        "expected_kernel_driver_match": observed_driver == definition["expected_kernel_driver"],
        "opengl_probe_succeeded": glx_status == 0,
        "expected_opengl_vendor_match": (
            opengl_vendor is not None and opengl_vendor_pattern.fullmatch(opengl_vendor) is not None
        ),
        "expected_opengl_renderer_match": opengl_renderer == definition["expected_opengl_renderer"],
        "nvcc_version_probe_succeeded": nvcc_status == 0,
        "expected_nvcc_release_match": observed_nvcc_release == definition["expected_nvcc_release"],
        "nvcc_arch_probe_succeeded": arch_status == 0,
        "nvcc_code_probe_succeeded": code_status == 0,
        "legacy_compute_target_absent_from_toolkit": (
            definition["expected_nvcc_compute_target"] not in advertised_arches
        ),
        "legacy_sm_target_absent_from_toolkit": (
            definition["expected_nvcc_sm_target"] not in advertised_codes
        ),
        "nvidia_smi_unusable_as_expected": smi_status != 0,
        "nvidia_device_nodes_absent_as_expected": len(device_nodes) == 0,
    }
    status = "PASS" if all(checks.values()) else "FAIL"

    payload = {
        "schema": "gluball-cuda-runtime-v31-legacy-negative-control/1",
        "status": status,
        "profile": args.profile,
        "profile_definition": definition,
        "checks": checks,
        "pci": {
            "expected_device_id": definition["expected_pci_device_id"],
            "selected_lspci_line": gpu_line or None,
            "kernel_driver_in_use": observed_driver,
            "lspci_exit_code": lspci_status,
            "lspci_error": lspci_err or None,
        },
        "graphics": {
            "glxinfo_exit_code": glx_status,
            "expected_vendor_regex": definition["expected_opengl_vendor_regex_case_insensitive"],
            "vendor": opengl_vendor,
            "renderer": opengl_renderer,
            "version": opengl_version,
            "error": glx_err or None,
        },
        "cuda_toolkit": {
            "nvcc_exit_code": nvcc_status,
            "nvcc_version_output": nvcc_out or None,
            "expected_release": definition["expected_nvcc_release"],
            "observed_release": observed_nvcc_release,
            "nvcc_error": nvcc_err or None,
            "list_gpu_arch_exit_code": arch_status,
            "advertised_compute_targets": advertised_arches,
            "list_gpu_arch_error": arch_err or None,
            "list_gpu_code_exit_code": code_status,
            "advertised_sm_targets": advertised_codes,
            "list_gpu_code_error": code_err or None,
            "legacy_compute_target_expected_absent": definition["expected_nvcc_compute_target"],
            "legacy_sm_target_expected_absent": definition["expected_nvcc_sm_target"],
        },
        "nvidia_runtime": {
            "nvidia_smi_exit_code": smi_status,
            "nvidia_smi_stdout": smi_out or None,
            "nvidia_smi_stderr": smi_err or None,
            "device_nodes": device_nodes,
            "libcuda_or_libcudart_entries": cuda_library_lines,
            "ldconfig_exit_code": ldconfig_status,
            "ldconfig_error": ldconfig_err or None,
        },
        "interpretation": {
            "nvidia_pci_hardware_present": bool(gpu_block),
            "graphics_stack_usable": glx_status == 0,
            "cuda_toolkit_userspace_present": nvcc_status == 0,
            "proprietary_nvidia_runtime_usable": smi_status == 0 and bool(device_nodes),
            "modern_cuda_execution_expected": False,
            "negative_control_only": True,
        },
        "claim_boundary": {
            "performance_observation_only": True,
            "geometry_receipt_authority": False,
            "universal_speedup_claim": False,
            "cross_device_portability_claim": False,
            "raw_device_uuid_queried": False,
            "raw_device_uuid_published": False,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    return 0 if status == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
