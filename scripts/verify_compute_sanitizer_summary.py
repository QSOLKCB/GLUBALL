#!/usr/bin/env python3
# SPDX-License-Identifier: MPL-2.0
"""Fail closed unless an archived Compute Sanitizer transcript reports a clean summary."""

from __future__ import annotations

import argparse
import re
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool", choices=("memcheck", "racecheck"), required=True)
    parser.add_argument("--file", type=Path, required=True)
    return parser.parse_args()


def clean_memcheck(text: str) -> bool:
    for line in text.splitlines():
        if "ERROR SUMMARY:" not in line:
            continue
        match = re.search(r"ERROR SUMMARY:\s*(\d+)\s+errors?\b", line)
        if match is not None:
            return int(match.group(1)) == 0
    return False


def clean_racecheck(text: str) -> bool:
    for line in text.splitlines():
        if "RACECHECK SUMMARY:" not in line:
            continue
        tail = line.split("RACECHECK SUMMARY:", 1)[1]
        hazards = re.search(r"(?<!\d)(\d+)\s+hazards?\b", tail)
        if hazards is None or int(hazards.group(1)) != 0:
            continue

        dirty_optional_count = False
        for label in ("errors?", "warnings?"):
            count = re.search(rf"(?<!\d)(\d+)\s+{label}\b", tail)
            if count is not None and int(count.group(1)) != 0:
                dirty_optional_count = True
                break
        if not dirty_optional_count:
            return True
    return False


def main() -> int:
    args = parse_args()
    text = args.file.read_text(encoding="utf-8", errors="replace")
    clean = clean_memcheck(text) if args.tool == "memcheck" else clean_racecheck(text)
    if not clean:
        raise SystemExit(f"{args.tool} clean summary not found in {args.file}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
