#!/usr/bin/env python3
"""Repair and synchronize the portfolio statistics markup.

The publication counter is sourced from _data/site_metrics.json. This script
replaces the complete first statistic element rather than editing an attribute
with regex backreferences, preventing malformed HTML and NaN counters.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRICS_PATH = ROOT / "_data" / "site_metrics.json"
HERO_PATH = ROOT / "_includes" / "site-part-1.html"


def main() -> int:
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    publication_count = int(metrics.get("publication_count", 0))
    if publication_count < 1:
        raise RuntimeError("Publication count must be a positive integer.")

    source = HERO_PATH.read_text(encoding="utf-8")
    pattern = re.compile(
        r"(<section class='statsSec'>.*?<div class='stat'>)"
        r"<b.*?</b><span>Peer-reviewed, accepted, and published works</span>",
        flags=re.DOTALL,
    )

    def replacement(match: re.Match[str]) -> str:
        return (
            match.group(1)
            + f"<b data-count='{publication_count}'>{publication_count}</b>"
            + "<span>Peer-reviewed, accepted, and published works</span>"
        )

    repaired, replacements = pattern.subn(replacement, source, count=1)
    if replacements != 1:
        raise RuntimeError(
            "Could not locate exactly one publication statistic in site-part-1.html."
        )

    if "NaN" in repaired or "\x88" in repaired:
        raise RuntimeError("Invalid counter text remains after repair.")

    expected = f"<b data-count='{publication_count}'>{publication_count}</b>"
    if expected not in repaired:
        raise RuntimeError("The publication counter was not written correctly.")

    HERO_PATH.write_text(repaired, encoding="utf-8")
    print(f"Publication counter repaired and synchronized to {publication_count}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
