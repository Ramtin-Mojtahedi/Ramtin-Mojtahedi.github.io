#!/usr/bin/env python3
"""Refresh recent publications from Ramtin Mojtahedi's public Scholar profile.

The curated CV publication list remains authoritative and is never deleted. This
script checks Google Scholar first, falls back to OpenAlex when Scholar blocks an
automated request, and writes only newly detected records that are not already in
the curated website list.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import time
import unicodedata
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
CURATED_HTML = ROOT / "_includes" / "site-part-2.html"
AUTO_HTML = ROOT / "_includes" / "google-scholar-auto-items.html"
PROFILE_JSON = ROOT / "data" / "google-scholar-publications.json"
HERO_HTML = ROOT / "_includes" / "site-part-1.html"

SCHOLAR_USER_ID = "KjUrlGUAAAAJ"
SCHOLAR_PROFILE = (
    "https://scholar.google.com/citations"
    f"?user={SCHOLAR_USER_ID}&hl=en&pagesize=100&sortby=pubdate"
)
ORCID = "0000-0002-3953-3256"
PUBLIC_EMAIL = "Ramtin.Mojtahedi@utoronto.ca"
RECENT_YEAR_WINDOW = 3

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)


@dataclass(frozen=True)
class Publication:
    title: str
    authors: str
    venue: str
    year: int
    url: str
    citations: int
    source: str


def normalize_title(value: str) -> str:
    value = html.unescape(value or "")
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower().replace("tumour", "tumor")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def same_work(left: str, right: str) -> bool:
    a = normalize_title(left)
    b = normalize_title(right)
    if not a or not b:
        return False
    if a == b:
        return True
    ratio = SequenceMatcher(None, a, b).ratio()
    a_tokens = set(a.split())
    b_tokens = set(b.split())
    union = a_tokens | b_tokens
    jaccard = len(a_tokens & b_tokens) / len(union) if union else 0.0
    return ratio >= 0.91 or jaccard >= 0.88


def authored_by_ramtin(authors: str) -> bool:
    normalized = normalize_title(authors)
    return bool(
        re.search(r"\bramtin\s+mojtahedi\b", normalized)
        or re.search(r"\br\s+mojtahedi\b", normalized)
        or re.search(r"\bmojtahedi\s+r\b", normalized)
    )


def integer(value: str | int | None) -> int:
    match = re.search(r"\d+", str(value or ""))
    return int(match.group()) if match else 0


def request_json(url: str, *, params: dict[str, str] | None = None) -> dict:
    response = requests.get(
        url,
        params=params,
        timeout=35,
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    response.raise_for_status()
    return response.json()


def fetch_google_scholar() -> list[Publication]:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept-Language": "en-CA,en;q=0.9",
            "Referer": "https://scholar.google.com/",
        }
    )

    profile_urls = [
        SCHOLAR_PROFILE,
        SCHOLAR_PROFILE.replace("scholar.google.com", "scholar.google.ca"),
    ]

    last_error: Exception | None = None
    for attempt, url in enumerate(profile_urls, start=1):
        try:
            response = session.get(url, timeout=35)
            response.raise_for_status()
            if "not a robot" in response.text.lower() or "unusual traffic" in response.text.lower():
                raise RuntimeError("Google Scholar returned an automated-traffic challenge")

            soup = BeautifulSoup(response.text, "html.parser")
            rows = soup.select("tr.gsc_a_tr")
            if not rows:
                raise RuntimeError("No publication rows were found in the public Scholar profile")

            publications: list[Publication] = []
            for row in rows:
                title_node = row.select_one("a.gsc_a_at")
                if title_node is None:
                    continue
                title = title_node.get_text(" ", strip=True)
                gray_lines = [
                    node.get_text(" ", strip=True)
                    for node in row.select(".gs_gray")
                    if node.get_text(" ", strip=True)
                ]
                authors = gray_lines[0] if gray_lines else ""
                venue = gray_lines[1] if len(gray_lines) > 1 else ""
                year_node = row.select_one(".gsc_a_y span")
                year = integer(year_node.get_text(strip=True) if year_node else "")
                citations_node = row.select_one(".gsc_a_c a")
                citations = integer(citations_node.get_text(strip=True) if citations_node else "")
                url_value = urljoin("https://scholar.google.com", title_node.get("href", ""))

                if title and year and authored_by_ramtin(authors):
                    publications.append(
                        Publication(
                            title=title,
                            authors=authors,
                            venue=venue,
                            year=year,
                            url=url_value,
                            citations=citations,
                            source="Google Scholar",
                        )
                    )

            if publications:
                return publications
            raise RuntimeError("Scholar rows did not contain validated Ramtin Mojtahedi records")
        except Exception as error:  # network and anti-bot responses are expected occasionally
            last_error = error
            if attempt < len(profile_urls):
                time.sleep(3)

    raise RuntimeError(f"Google Scholar could not be read: {last_error}")


def fetch_openalex_fallback() -> list[Publication]:
    author = request_json(
        f"https://api.openalex.org/authors/https://orcid.org/{ORCID}",
        params={"mailto": PUBLIC_EMAIL},
    )
    author_id = str(author.get("id", "")).rsplit("/", 1)[-1]
    if not author_id:
        raise RuntimeError("OpenAlex did not return an author identifier")

    payload = request_json(
        "https://api.openalex.org/works",
        params={
            "filter": f"author.id:{author_id}",
            "sort": "publication_date:desc",
            "per-page": "100",
            "mailto": PUBLIC_EMAIL,
        },
    )

    publications: list[Publication] = []
    for work in payload.get("results", []):
        title = str(work.get("title") or "").strip()
        year = integer(work.get("publication_year"))
        authors = ", ".join(
            str(item.get("author", {}).get("display_name") or "").strip()
            for item in work.get("authorships", [])
            if str(item.get("author", {}).get("display_name") or "").strip()
        )
        source = (
            work.get("primary_location", {}).get("source") or {}
        ).get("display_name") or ""
        doi = str(work.get("doi") or "").strip()
        url_value = doi or str(work.get("id") or "").strip()

        if title and year and authored_by_ramtin(authors):
            publications.append(
                Publication(
                    title=title,
                    authors=authors,
                    venue=str(source),
                    year=year,
                    url=url_value,
                    citations=integer(work.get("cited_by_count")),
                    source="OpenAlex fallback",
                )
            )

    if not publications:
        raise RuntimeError("OpenAlex returned no validated publications")
    return publications


def deduplicate(publications: Iterable[Publication]) -> list[Publication]:
    unique: list[Publication] = []
    for item in sorted(publications, key=lambda p: (-p.year, normalize_title(p.title))):
        if any(same_work(item.title, existing.title) for existing in unique):
            continue
        unique.append(item)
    return unique


def curated_titles() -> list[str]:
    soup = BeautifulSoup(CURATED_HTML.read_text(encoding="utf-8"), "html.parser")
    return [node.get_text(" ", strip=True) for node in soup.select("article.pub h3")]


def filter_new_recent(publications: list[Publication], curated: list[str]) -> list[Publication]:
    current_year = datetime.now(timezone.utc).year
    minimum_year = current_year - (RECENT_YEAR_WINDOW - 1)
    selected: list[Publication] = []
    for item in publications:
        if item.year < minimum_year:
            continue
        if any(same_work(item.title, title) for title in curated):
            continue
        if any(same_work(item.title, existing.title) for existing in selected):
            continue
        selected.append(item)
    return selected


def group_for_year(year: int) -> str:
    if year in {2025, 2026}:
        return str(year)
    if 2022 <= year <= 2024:
        return "2022-24"
    return "scholar-auto"


def render_auto_items(publications: list[Publication]) -> str:
    if not publications:
        return (
            "<!-- Automatically maintained by scripts/sync_google_scholar.py. "
            "No new validated Scholar records were found beyond the curated list. -->\n"
        )

    blocks = [
        "<!-- Automatically generated. Do not edit manually; update the curated publication list instead. -->"
    ]
    for item in publications:
        group = f"{group_for_year(item.year)} scholar-auto"
        source_label = "Google Scholar update" if item.source == "Google Scholar" else "Publication update"
        citation_text = f" · Cited by {item.citations}" if item.citations else ""
        link_text = "Scholar ↗" if item.source == "Google Scholar" else "Record ↗"
        blocks.append(
            "\n".join(
                [
                    f'<article class="pub reveal scholar-auto" data-group="{html.escape(group)}">',
                    f'  <span class="year">{item.year}</span>',
                    "  <div>",
                    f'    <span class="tag">{html.escape(source_label)}</span>',
                    f'    <h3>{html.escape(item.title)}</h3>',
                    f'    <p>{html.escape(item.authors)}</p>',
                    f'    <p>{html.escape(item.venue)}{html.escape(citation_text)}</p>',
                    "  </div>",
                    f'  <a href="{html.escape(item.url, quote=True)}" target="_blank" rel="noopener">{link_text}</a>',
                    "</article>",
                ]
            )
        )
    return "\n".join(blocks) + "\n"


def update_static_total(total: int) -> None:
    publication_html = CURATED_HTML.read_text(encoding="utf-8")
    publication_html = re.sub(
        r'(<button class="filter active" data-filter="all">All )\d+(</button>)',
        rf"\g<1>{total}\2",
        publication_html,
        count=1,
    )
    CURATED_HTML.write_text(publication_html, encoding="utf-8")

    if not HERO_HTML.exists():
        return
    hero_html = HERO_HTML.read_text(encoding="utf-8")
    hero_html = re.sub(
        r"(<div class='stat'><b data-count=')\d+('>)\d+(</b><span>)[^<]*(</span>)",
        rf"\g<1>{total}\2{total}\3Peer-reviewed, accepted, and published works\4",
        hero_html,
        count=1,
    )
    HERO_HTML.write_text(hero_html, encoding="utf-8")


def write_profile_json(publications: list[Publication], source: str) -> None:
    PROFILE_JSON.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "profile": SCHOLAR_PROFILE,
        "scholar_user_id": SCHOLAR_USER_ID,
        "orcid": ORCID,
        "source_used": source,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "publication_count": len(publications),
        "publications": [asdict(item) for item in publications],
    }
    PROFILE_JSON.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def add_job_summary(message: str) -> None:
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        with open(summary_path, "a", encoding="utf-8") as stream:
            stream.write(message.rstrip() + "\n")


def main() -> int:
    try:
        publications = fetch_google_scholar()
        source = "Google Scholar"
    except Exception as scholar_error:
        print(f"Scholar fetch warning: {scholar_error}", file=sys.stderr)
        try:
            publications = fetch_openalex_fallback()
            source = "OpenAlex fallback"
        except Exception as fallback_error:
            print(f"Publication sync skipped: {fallback_error}", file=sys.stderr)
            add_job_summary(
                "### Publication sync preserved the current website\n"
                "Google Scholar and the fallback source were temporarily unavailable; no existing publication was changed."
            )
            return 0

    publications = deduplicate(publications)
    curated = curated_titles()
    automatic = filter_new_recent(publications, curated)

    AUTO_HTML.write_text(render_auto_items(automatic), encoding="utf-8")
    write_profile_json(publications, source)
    update_static_total(len(curated) + len(automatic))

    print(
        f"Checked {len(publications)} profile records via {source}; "
        f"added {len(automatic)} recent record(s) not already in the curated list."
    )
    add_job_summary(
        "### Publication refresh completed\n"
        f"- Source used: {source}\n"
        f"- Profile records checked: {len(publications)}\n"
        f"- New recent records added to the website: {len(automatic)}\n"
        f"- Curated CV records preserved: {len(curated)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
