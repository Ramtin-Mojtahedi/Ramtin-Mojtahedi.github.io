#!/usr/bin/env python3
"""Remove non-publication artifacts while preserving every curated CV record."""

from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
PUBS = ROOT / "_data/publications.json"
METRICS = ROOT / "_data/site_metrics.json"
FEED = ROOT / "publications.json"
MINIMUM = 18

EXCLUDED_TITLE_PATTERNS = (
    r"^review for\b",
    r"^peer review\b",
    r"^reviewer report\b",
    r"^editorial decision\b",
    r"^author response\b",
)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_publication(record: dict[str, Any]) -> bool:
    if record.get("manual"):
        return True
    title = clean(record.get("title")).lower()
    identifier = clean(record.get("doi")).lower()
    if any(re.search(pattern, title, re.I) for pattern in EXCLUDED_TITLE_PATTERNS):
        return False
    if "/review" in identifier or identifier.endswith("/review"):
        return False
    return True


def deduplicate(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output = []
    seen_doi, seen_title = set(), set()
    for record in records:
        identifier = clean(record.get("doi")).lower()
        title = re.sub(r"[^a-z0-9]+", " ", clean(record.get("title")).lower()).strip()
        key = ("doi", identifier) if identifier else ("title", title)
        if key in seen_doi or key in seen_title:
            if record.get("manual"):
                output = [
                    existing for existing in output
                    if not (
                        (identifier and clean(existing.get("doi")).lower() == identifier)
                        or (
                            not identifier
                            and re.sub(r"[^a-z0-9]+", " ", clean(existing.get("title")).lower()).strip() == title
                        )
                    )
                ]
            else:
                continue
        output.append(record)
        (seen_doi if identifier else seen_title).add(key)
    return output


def main() -> int:
    records = json.loads(PUBS.read_text(encoding="utf-8"))
    before = len(records)
    records = deduplicate([record for record in records if is_publication(record)])
    manual_count = sum(bool(record.get("manual")) for record in records)
    if manual_count < MINIMUM:
        raise RuntimeError("Publication cleanup would reduce the curated CV baseline.")

    records.sort(
        key=lambda record: (
            clean(record.get("publication_date")),
            int(record.get("year") or 0),
            clean(record.get("title")),
        ),
        reverse=True,
    )

    metrics = json.loads(METRICS.read_text(encoding="utf-8"))
    peer_count = sum(clean(record.get("status")).lower() != "submitted" for record in records)
    metrics["publication_count"] = len(records)
    metrics["peer_reviewed_or_accepted_count"] = peer_count
    metrics["submitted_count"] = len(records) - peer_count
    metrics["invalid_nonpublication_records_removed"] = before - len(records)

    feed = {
        "schema_version": 1,
        "profile": {
            "name": "Ramtin Mojtahedi",
            "orcid": "https://orcid.org/0000-0002-3953-3256",
            "google_scholar": "https://scholar.google.com/citations?user=KjUrlGUAAAAJ&hl=en",
            "website": "https://ramtin-mojtahedi.github.io/",
        },
        "updated_at": metrics.get("publication_sync_timestamp")
        or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "publication_count": len(records),
        "publications": records,
    }

    PUBS.write_text(json.dumps(records, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    METRICS.write_text(json.dumps(metrics, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    FEED.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Publication cleanup: {before} -> {len(records)} records; manual baseline {manual_count}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
