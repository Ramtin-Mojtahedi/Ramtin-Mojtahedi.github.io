#!/usr/bin/env python3
"""Resilient entry point for the Google Scholar publication monitor."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone

import sync_google_scholar as sync


def fetch_openalex_fallback() -> list[sync.Publication]:
    author = sync.request_json(
        f"https://api.openalex.org/authors/https://orcid.org/{sync.ORCID}",
        params={"mailto": sync.PUBLIC_EMAIL},
    )
    author_id = str(author.get("id") or "").rsplit("/", 1)[-1]
    if not author_id:
        raise RuntimeError("OpenAlex did not return an author identifier")

    payload = sync.request_json(
        "https://api.openalex.org/works",
        params={
            "filter": f"authorships.author.id:{author_id}",
            "sort": "publication_date:desc",
            "per-page": "100",
            "mailto": sync.PUBLIC_EMAIL,
        },
    )

    publications: list[sync.Publication] = []
    for work in payload.get("results") or []:
        title = str(work.get("title") or "").strip()
        year = sync.integer(work.get("publication_year"))

        author_names: list[str] = []
        for authorship in work.get("authorships") or []:
            author_payload = authorship.get("author") or {}
            name = str(author_payload.get("display_name") or "").strip()
            if name:
                author_names.append(name)
        authors = ", ".join(author_names)

        primary_location = work.get("primary_location") or {}
        source_payload = primary_location.get("source") or {}
        venue = str(source_payload.get("display_name") or "").strip()
        doi = str(work.get("doi") or "").strip()
        record_url = doi or str(work.get("id") or "").strip()

        if title and year and sync.authored_by_ramtin(authors):
            publications.append(
                sync.Publication(
                    title=title,
                    authors=authors,
                    venue=venue,
                    year=year,
                    url=record_url,
                    citations=sync.integer(work.get("cited_by_count")),
                    source="OpenAlex fallback",
                )
            )

    if not publications:
        raise RuntimeError("OpenAlex returned no validated publications")
    return publications


def write_profile_json(publications: list[sync.Publication], source: str) -> None:
    sync.PROFILE_JSON.parent.mkdir(parents=True, exist_ok=True)
    records = [asdict(item) for item in publications]
    stable_payload = {
        "profile": sync.SCHOLAR_PROFILE,
        "scholar_user_id": sync.SCHOLAR_USER_ID,
        "orcid": sync.ORCID,
        "source_used": source,
        "publication_count": len(publications),
        "publications": records,
    }

    if sync.PROFILE_JSON.exists():
        try:
            existing = json.loads(sync.PROFILE_JSON.read_text(encoding="utf-8"))
            existing_stable = {key: existing.get(key) for key in stable_payload}
            if existing_stable == stable_payload:
                return
        except (OSError, ValueError, TypeError):
            pass

    payload = {
        **stable_payload,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
    sync.PROFILE_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


sync.fetch_openalex_fallback = fetch_openalex_fallback
sync.write_profile_json = write_profile_json

if __name__ == "__main__":
    raise SystemExit(sync.main())
