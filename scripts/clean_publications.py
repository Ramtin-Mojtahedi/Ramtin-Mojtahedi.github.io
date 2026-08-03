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
    r"\bdoctoral dissertation\b",
    r"\bph\.?d\.? thesis\b",
    r"\bmaster'?s thesis\b",
)

EXCLUDED_CITATION_PATTERNS = (
    r"\bdoctoral dissertation\b",
    r"\bph\.?d\.? thesis\b",
    r"\bmaster'?s thesis\b",
    r"^queen[’']s university\b",
    r"^proquest dissertations?\b",
)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_publication(record: dict[str, Any]) -> bool:
    # Every manually curated CV record is authoritative and must be preserved.
    if record.get("manual"):
        return True

    title = clean(record.get("title")).lower()
    identifier = clean(record.get("doi")).lower()
    citation = clean(record.get("citation")).lower()
    source = clean(record.get("source")).lower()

    if any(re.search(pattern, title, re.I) for pattern in EXCLUDED_TITLE_PATTERNS):
        return False
    if any(re.search(pattern, citation, re.I) for pattern in EXCLUDED_CITATION_PATTERNS):
        return False
    if "/review" in identifier or identifier.endswith("/review"):
        return False

    # Google Scholar also indexes theses, institutional repository records,
    # review reports, and other profile items. An automatically discovered item
    # with no DOI and only a university as its venue is not treated as a
    # peer-reviewed publication unless it is already part of the curated CV.
    university_only = bool(
        re.fullmatch(
            r"[^,]*(?:university|college|institute)\s*,?\s*\d{4}(?:\s*,\s*\d{4})?",
            citation,
            re.I,
        )
    )
    if source == "google scholar" and not identifier and university_only:
        return False

    return True


def deduplicate(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()

    for record in records:
        identifier = clean(record.get("doi")).lower()
        title = re.sub(r"[^a-z0-9]+", " ", clean(record.get("title")).lower()).strip()
        key = ("doi", identifier) if identifier else ("title", title)

        if key in seen:
            if record.get("manual"):
                output = [
                    existing
                    for existing in output
                    if not (
                        (identifier and clean(existing.get("doi")).lower() == identifier)
                        or (
                            not identifier
                            and re.sub(
                                r"[^a-z0-9]+",
                                " ",
                                clean(existing.get("title")).lower(),
                            ).strip()
                            == title
                        )
                    )
                ]
            else:
                continue

        output.append(record)
        seen.add(key)

    return output


def main() -> int:
    records = json.loads(PUBS.read_text(encoding="utf-8"))
    before = len(records)
    records = deduplicate([record for record in records if is_publication(record)])

    manual_count = sum(bool(record.get("manual")) for record in records)
    automatic_count = len(records) - manual_count
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
    peer_count = sum(
        bool(record.get("peer_reviewed"))
        if isinstance(record.get("peer_reviewed"), bool)
        else clean(record.get("status")).lower() != "submitted"
        for record in records
    )
    submitted_count = sum(clean(record.get("status")).lower() == "submitted" for record in records)
    metrics["publication_count"] = len(records)
    metrics["peer_reviewed_or_accepted_count"] = peer_count
    metrics["submitted_count"] = submitted_count
    metrics["auto_added_count"] = automatic_count
    metrics["minimum_preserved_records"] = manual_count
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
    print(
        f"Publication cleanup: {before} -> {len(records)} records; "
        f"manual baseline {manual_count}; automatic additions {automatic_count}."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
