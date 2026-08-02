#!/usr/bin/env python3
"""Twice-weekly publication sync. Curated CV records are never deleted."""

from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any

import requests
from bs4 import BeautifulSoup
from rapidfuzz import fuzz

ROOT = Path(__file__).resolve().parents[1]
PUBS = ROOT / "_data/publications.json"
METRICS = ROOT / "_data/site_metrics.json"
FEED = ROOT / "publications.json"

NAME = "Ramtin Mojtahedi"
EMAIL = "Ramtin.Mojtahedi@utoronto.ca"
SCHOLAR_ID = "KjUrlGUAAAAJ"
SCHOLAR_URL = f"https://scholar.google.com/citations?user={SCHOLAR_ID}&hl=en"
ORCID = "0000-0002-3953-3256"
ORCID_URL = f"https://orcid.org/{ORCID}"
MINIMUM = 18

session = requests.Session()
session.headers.update(
    {
        "User-Agent": (
            "Ramtin-Mojtahedi-Portfolio-Sync/1.0 "
            f"(+https://ramtin-mojtahedi.github.io/; mailto:{EMAIL})"
        ),
        "Accept-Language": "en-CA,en;q=0.9",
    }
)


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", clean(value)).encode("ascii", "ignore").decode()
    value = value.lower().replace("tumour", "tumor").replace("multi modal", "multimodal")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9]+", " ", value)).strip()


def doi(value: Any) -> str:
    value = clean(value).lower()
    value = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", value)
    return re.sub(r"^doi:\s*", "", value).rstrip(" .);,")


def valid_year(value: Any) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        return 0
    return result if 1900 <= result <= dt.date.today().year + 2 else 0


def date_from_parts(parts: Any) -> str:
    try:
        values = list(parts[0])
    except (TypeError, IndexError):
        return ""
    y = valid_year(values[0] if values else 0)
    if not y:
        return ""
    m = int(values[1]) if len(values) > 1 and values[1] else 1
    d = int(values[2]) if len(values) > 2 and values[2] else 1
    try:
        return dt.date(y, m, d).isoformat()
    except ValueError:
        return f"{y:04d}-01-01"


def group(y: int, status: str = "") -> str:
    if status.lower() == "submitted":
        return "submitted"
    if y >= 2026:
        return "2026"
    if y == 2025:
        return "2025"
    return "2022-24" if y >= 2022 else "earlier"


def author_match(authors: list[str]) -> bool:
    joined = " | ".join(authors)
    return bool(
        re.search(r"\bramtin\s+mojtahedi\b", joined, re.I)
        or re.search(r"\br\.?\s+mojtahedi\b", joined, re.I)
    )


def render_authors(authors: list[str]) -> str:
    output = ", ".join(html.escape(clean(a), quote=False) for a in authors if clean(a)) or "R. Mojtahedi"
    output = re.sub(
        r"\b(?:Ramtin|R\.?)\s+Mojtahedi\b",
        lambda match: f"<strong>{match.group(0)}</strong>",
        output,
        flags=re.I,
    )
    return output.rstrip(".") + "."


def item(
    title: Any,
    y: Any,
    source: str,
    authors: list[str],
    *,
    published: str = "",
    citation: str = "",
    identifier: Any = "",
    url: Any = "",
    trusted: bool = False,
) -> dict[str, Any] | None:
    title, y = clean(title), valid_year(y)
    authors = [clean(a) for a in authors if clean(a)]
    identifier = doi(identifier)
    if len(title) < 8 or not y or (not trusted and not author_match(authors)):
        return None
    return {
        "title": title,
        "year": y,
        "publication_date": published or f"{y:04d}-01-01",
        "status": "Peer-reviewed",
        "authors": authors,
        "authors_html": render_authors(authors),
        "citation": clean(citation) or str(y),
        "doi": identifier,
        "url": f"https://doi.org/{identifier}" if identifier else clean(url),
        "source": source,
    }


def get_json(url: str, **kwargs: Any) -> Any:
    response = session.get(url, timeout=(10, 30), **kwargs)
    response.raise_for_status()
    return response.json()


def fetch_scholar() -> list[dict[str, Any]]:
    response = session.get(
        "https://scholar.google.com/citations",
        params={
            "user": SCHOLAR_ID,
            "hl": "en",
            "view_op": "list_works",
            "sortby": "pubdate",
            "pagesize": 100,
        },
        timeout=(10, 30),
    )
    response.raise_for_status()
    lowered = response.text.lower()
    if "unusual traffic" in lowered or "captcha" in lowered or "/sorry/" in response.url:
        raise RuntimeError("Google Scholar returned an automated-access challenge")
    soup = BeautifulSoup(response.text, "html.parser")
    rows = soup.select(".gsc_a_tr")
    if not rows:
        raise RuntimeError("Google Scholar returned no publication rows")
    records = []
    for row in rows:
        title_node, year_node = row.select_one(".gsc_a_at"), row.select_one(".gsc_a_y span")
        gray = row.select(".gs_gray")
        if not title_node or not year_node:
            continue
        authors = [a.strip() for a in clean(gray[0].get_text(" ")).split(",")] if gray else [NAME]
        venue = clean(gray[1].get_text(" ")) if len(gray) > 1 else ""
        href = clean(title_node.get("href"))
        record = item(
            title_node.get_text(" "),
            year_node.get_text(" "),
            "Google Scholar",
            authors,
            citation=", ".join(filter(None, [venue, clean(year_node.get_text(" "))])),
            url=f"https://scholar.google.com{href}" if href.startswith("/") else href,
            trusted=True,
        )
        if record:
            records.append(record)
    return records


def fetch_openalex() -> list[dict[str, Any]]:
    author = get_json(
        f"https://api.openalex.org/authors/https://orcid.org/{ORCID}",
        params={"mailto": EMAIL},
    )
    author_id = clean(author.get("id")).rsplit("/", 1)[-1]
    if not author_id:
        raise RuntimeError("OpenAlex could not resolve the ORCID record")
    payload = get_json(
        "https://api.openalex.org/works",
        params={
            "filter": f"authorships.author.id:{author_id}",
            "per-page": 200,
            "sort": "publication_date:desc",
            "mailto": EMAIL,
        },
    )
    records = []
    for work in payload.get("results", []):
        authors = [
            clean(entry.get("author", {}).get("display_name"))
            for entry in work.get("authorships", [])
            if clean(entry.get("author", {}).get("display_name"))
        ]
        location = work.get("primary_location") or {}
        source = location.get("source") or {}
        record = item(
            work.get("display_name") or work.get("title"),
            work.get("publication_year"),
            "OpenAlex/ORCID",
            authors,
            published=clean(work.get("publication_date")),
            citation=clean(source.get("display_name")),
            identifier=work.get("doi"),
            url=location.get("landing_page_url"),
            trusted=True,
        )
        if record:
            records.append(record)
    return records


def fetch_crossref() -> list[dict[str, Any]]:
    payload = get_json(
        "https://api.crossref.org/works",
        params={
            "query.author": NAME,
            "filter": "from-pub-date:2000-01-01",
            "rows": 100,
            "select": "DOI,title,author,published-print,published-online,issued,container-title,URL",
            "mailto": EMAIL,
        },
    )
    records = []
    for record in payload.get("message", {}).get("items", []):
        author_objects = record.get("author", [])
        exact = any(
            clean(a.get("family")).lower() == "mojtahedi"
            and (
                clean(a.get("given")).lower().startswith("ramtin")
                or clean(a.get("given")).lower() in {"r", "r."}
                or clean(a.get("ORCID")).endswith(ORCID)
            )
            for a in author_objects
        )
        if not exact:
            continue
        authors = [clean(" ".join(filter(None, [a.get("given"), a.get("family")]))) for a in author_objects]
        titles = record.get("title") or []
        title = titles[0] if isinstance(titles, list) and titles else titles
        published = (
            date_from_parts((record.get("published-online") or {}).get("date-parts"))
            or date_from_parts((record.get("published-print") or {}).get("date-parts"))
            or date_from_parts((record.get("issued") or {}).get("date-parts"))
        )
        containers = record.get("container-title") or []
        venue = containers[0] if isinstance(containers, list) and containers else clean(containers)
        candidate = item(
            title,
            published[:4] if published else 0,
            "Crossref",
            authors,
            published=published,
            citation=venue,
            identifier=record.get("DOI"),
            url=record.get("URL"),
            trusted=True,
        )
        if candidate:
            records.append(candidate)
    return records


def fetch_dblp() -> list[dict[str, Any]]:
    payload = get_json(
        "https://dblp.org/search/publ/api",
        params={"q": 'author:"Ramtin Mojtahedi"', "format": "json", "h": 1000},
        headers={"Accept": "application/json"},
    )
    hits = payload.get("result", {}).get("hits", {}).get("hit", [])
    hits = [hits] if isinstance(hits, dict) else hits
    records = []
    for hit in hits:
        info = hit.get("info", {})
        author_nodes = (info.get("authors") or {}).get("author", [])
        author_nodes = [author_nodes] if isinstance(author_nodes, (str, dict)) else author_nodes
        authors = [
            clean(author if isinstance(author, str) else author.get("text") or author.get("#text"))
            for author in author_nodes
        ]
        ee = info.get("ee", "")
        ee = ee[0] if isinstance(ee, list) and ee else ee
        identifier = doi(ee) if "doi.org/" in clean(ee) else ""
        candidate = item(
            info.get("title"),
            info.get("year"),
            "DBLP",
            authors,
            citation=", ".join(filter(None, [clean(info.get("venue")), clean(info.get("pages"))])),
            identifier=identifier,
            url=ee or info.get("url"),
        )
        if candidate:
            records.append(candidate)
    return records


SOURCES = {
    "google_scholar": fetch_scholar,
    "openalex_orcid": fetch_openalex,
    "crossref": fetch_crossref,
    "dblp": fetch_dblp,
}


def similarity(left: str, right: str) -> float:
    left, right = normalize(left), normalize(right)
    return max(fuzz.ratio(left, right), fuzz.token_set_ratio(left, right)) if left and right else 0


def match(publications: list[dict[str, Any]], candidate: dict[str, Any]) -> dict[str, Any] | None:
    identifier = doi(candidate.get("doi"))
    if identifier:
        for publication in publications:
            if doi(publication.get("doi")) == identifier:
                return publication
    matches = []
    for publication in publications:
        titles = [publication.get("title", ""), *(publication.get("title_aliases") or [])]
        score = max(similarity(title, candidate.get("title", "")) for title in titles)
        if score >= 93:
            matches.append((score, publication))
    return max(matches, default=(0, None), key=lambda value: value[0])[1]


def enrich(publication: dict[str, Any], candidate: dict[str, Any], checked: str) -> bool:
    changed = False
    identifier = doi(candidate.get("doi"))
    if identifier and doi(publication.get("doi")) != identifier:
        publication.update(doi=identifier, url=f"https://doi.org/{identifier}", link_label="DOI ↗")
        changed = True
    for field in ("url", "publication_date", "citation", "authors_html"):
        if clean(candidate.get(field)) and not clean(publication.get(field)):
            publication[field] = candidate[field]
            changed = True
    if clean(publication.get("status")).lower() in {"submitted", "in preparation"}:
        publication["status"] = candidate.get("status") or "Peer-reviewed"
        publication["peer_reviewed"] = True
        publication["group"] = group(int(candidate.get("year") or publication.get("year")), publication["status"])
        changed = True
    sources = [value.strip() for value in clean(publication.get("source")).split(";") if value.strip()]
    if candidate.get("source") and candidate["source"] not in sources:
        sources.append(candidate["source"])
        publication["source"] = "; ".join(sources)
        changed = True
    publication["last_verified"] = checked
    return changed


def new_record(candidate: dict[str, Any], checked: str) -> dict[str, Any]:
    identifier = doi(candidate.get("doi"))
    pub_year = int(candidate["year"])
    return {
        "id": f"{re.sub(r'[^a-z0-9]+', '-', normalize(candidate['title'])).strip('-')[:100]}-{pub_year}",
        "title": candidate["title"],
        "year": pub_year,
        "publication_date": candidate.get("publication_date") or str(pub_year),
        "group": group(pub_year),
        "status": "Peer-reviewed",
        "peer_reviewed": True,
        "authors_html": candidate.get("authors_html") or render_authors(candidate.get("authors", [])),
        "citation": candidate.get("citation") or str(pub_year),
        "doi": identifier,
        "url": f"https://doi.org/{identifier}" if identifier else candidate.get("url", ""),
        "link_label": "DOI ↗" if identifier else "View ↗",
        "manual": False,
        "source": candidate.get("source", "Automated scholarly source"),
        "last_verified": checked,
        "title_aliases": [],
    }


def write(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()

    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    checked = now.date().isoformat()
    publications = json.loads(PUBS.read_text(encoding="utf-8"))
    manual_count = sum(bool(record.get("manual")) for record in publications)
    if manual_count < MINIMUM:
        raise RuntimeError(f"Only {manual_count} curated records remain; refusing to continue.")

    statuses = {"cv_baseline": f"preserved {manual_count} records"}
    discovered: list[dict[str, Any]] = []
    if args.offline:
        statuses.update({name: "offline validation" for name in SOURCES})
    else:
        for name, fetcher in SOURCES.items():
            try:
                records = fetcher()
                discovered.extend(records)
                statuses[name] = f"ok ({len(records)} records)"
            except Exception as exc:
                statuses[name] = f"unavailable: {clean(exc)[:220]}"
                print(f"warning: {name}: {clean(exc)[:220]}", file=sys.stderr)

    added = enriched_count = 0
    for candidate in discovered:
        existing = match(publications, candidate)
        if existing:
            enriched_count += int(enrich(existing, candidate, checked))
        elif candidate.get("source") in {"Google Scholar", "OpenAlex/ORCID"} or author_match(candidate.get("authors", [])):
            publications.append(new_record(candidate, checked))
            added += 1

    publications.sort(
        key=lambda record: (
            clean(record.get("publication_date")) or f"{valid_year(record.get('year')):04d}-01-01",
            valid_year(record.get("year")),
            normalize(record.get("title", "")),
        ),
        reverse=True,
    )
    if sum(bool(record.get("manual")) for record in publications) < MINIMUM:
        raise RuntimeError("The curated publication baseline was unexpectedly reduced.")

    peer_count = sum(
        bool(record.get("peer_reviewed"))
        if isinstance(record.get("peer_reviewed"), bool)
        else clean(record.get("status")).lower() != "submitted"
        for record in publications
    )
    submitted_count = sum(
        clean(record.get("status")).lower() == "submitted" for record in publications
    )
    metrics = {
        "publication_count": len(publications),
        "peer_reviewed_or_accepted_count": peer_count,
        "submitted_count": submitted_count,
        "publication_sync_date": checked,
        "publication_sync_timestamp": now.isoformat().replace("+00:00", "Z"),
        "publication_source_note": "CV baseline preserved; external scholarly sources checked twice weekly.",
        "google_scholar_profile": SCHOLAR_URL,
        "orcid": ORCID_URL,
        "sources": ["Google Scholar", "ORCID/OpenAlex", "Crossref", "DBLP"],
        "source_status": statuses,
        "auto_added_count": added,
        "enriched_record_count": enriched_count,
        "minimum_preserved_records": MINIMUM,
    }
    feed = {
        "schema_version": 1,
        "profile": {
            "name": NAME,
            "orcid": ORCID_URL,
            "google_scholar": SCHOLAR_URL,
            "website": "https://ramtin-mojtahedi.github.io/",
        },
        "updated_at": metrics["publication_sync_timestamp"],
        "publication_count": len(publications),
        "publications": publications,
    }
    write(PUBS, publications)
    write(METRICS, metrics)
    write(FEED, feed)

    print(
        json.dumps(
            {
                "publication_count": len(publications),
                "manual_records_preserved": manual_count,
                "auto_added": added,
                "enriched": enriched_count,
                "source_status": statuses,
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
