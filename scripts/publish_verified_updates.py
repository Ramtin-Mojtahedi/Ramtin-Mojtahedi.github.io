#!/usr/bin/env python3
"""Apply the reviewed September 2026 publication and news update, idempotently.

No remote scraping, credentials, or private data are used. Existing publication
records are preserved. Run from a checkout, review the diff, then publish.
"""
from __future__ import annotations

import html
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
DATE = "2026-09-13"
START = "<!-- verified-news:start -->"
END = "<!-- verified-news:end -->"


def load(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def save(path: str, value) -> None:
    (ROOT / path).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if text.count(old) != 1:
        raise ValueError(f"Expected exactly one {label}; review the source before applying this update.")
    return text.replace(old, new, 1)


def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def safe_link(url: str) -> str:
    if not (url.startswith("/") and not url.startswith("//")) and urlparse(url).scheme != "https":
        raise ValueError(f"Unsupported public link: {url}")
    return esc(url)


def news_html(news: dict) -> str:
    items = news["items"]
    if len({item["id"] for item in items}) != len(items):
        raise ValueError("News identifiers must be unique.")
    featured = [item for item in items if item.get("featured")]
    if len(featured) != 1:
        raise ValueError("Select exactly one featured news item.")
    ordered = featured + [item for item in items if not item.get("featured")]
    cards = []
    for item in ordered:
        stamp = (f'<time datetime="{esc(item["date"])}">{esc(item["date_label"])}</time>'
                 if item.get("date") else f'<span>{esc(item["date_label"])}</span>')
        links = " ".join(
            f'<a href="{safe_link(link["url"])}"'
            + (' target="_blank" rel="noopener noreferrer"' if link["url"].startswith("https:") else '')
            + f'>{esc(link["label"])} <span aria-hidden="true">↗</span></a>'
            for link in item["links"]
        )
        classes = "news-card news-featured" if item.get("featured") else "news-card"
        cards.append(
            f'<article class="{classes}"><div class="news-meta">'
            f'<span class="news-category">{esc(item["category"])}</span>{stamp}</div>'
            f'<h3>{esc(item["title"])}</h3><p>{esc(item["summary"])}</p>'
            f'<div class="news-card-links">{links}</div></article>'
        )
    return (START + '\n<section id="news" class="surface news-section" aria-labelledby="news-title">'
            '<div class="wrap"><div class="news-heading"><div><p class="kicker">Latest news</p>'
            '<h2 id="news-title">Research &amp; community updates.</h2></div>'
            '<a class="news-linkedin" href="https://www.linkedin.com/in/ramtin-mojtahedi/recent-activity/all/" '
            'target="_blank" rel="noopener noreferrer">Latest on LinkedIn <span aria-hidden="true">↗</span></a>'
            '</div><div class="news-grid">' + ''.join(cards) + '</div>'
            '<p class="news-updated">Selected updates · Updated '
            f'<time datetime="{esc(news["updated_at"])}">13 September 2026</time></p>'
            '</div></section>\n' + END)


def main() -> None:
    records = load("_data/publications.json")
    before = {record["id"]: record.copy() for record in records}
    additions = load("_data/verified_publication_additions.json")
    for record in additions:
        if record["type"] == "preprint" and record["peer_reviewed"] is not False:
            raise ValueError("A preprint must not be counted as peer reviewed.")
        existing = next((item for item in records if item["id"] == record["id"]), None)
        if existing is not None:
            if existing != record:
                raise ValueError(f"Existing record differs from the reviewed addition: {record['id']}")
            continue
        if any(item.get("doi") == record["doi"] or item["title"].casefold() == record["title"].casefold() for item in records):
            raise ValueError("This publication already exists under another identifier.")
        records.insert(0, record)
    save("_data/publications.json", records)
    metrics = load("_data/site_metrics.json")
    metrics.update(publication_count=len(records),
                   peer_reviewed_or_accepted_count=sum(item["peer_reviewed"] is True for item in records),
                   preprint_count=sum(item.get("type") == "preprint" for item in records),
                   publication_sync_date=DATE, publication_sync_timestamp=DATE + "T00:00:00Z")
    save("_data/site_metrics.json", metrics)
    maintenance = load("_data/site_maintenance.json")
    maintenance.update(publication_count=len(records), last_checked=DATE)
    save("_data/site_maintenance.json", maintenance)

    hero_path = ROOT / "_includes/site-part-1.html"
    hero = hero_path.read_text(encoding="utf-8")
    count_pattern = r"<b data-count='\d+'>\d+</b>(<span>Publications and scholarly works</span>)"
    hero, total = re.subn(count_pattern, lambda match: f"<b data-count='{len(records)}'>{len(records)}</b>" + match[1], hero)
    if total != 1:
        raise ValueError("Publication headline counter not found exactly once.")
    hero = replace_once(hero, "<div class='links' id='links'><a href='#expertise'>",
                        "<div class='links' id='links'><a href='#news'>News</a><a href='#expertise'>", "navigation anchor")
    rendered_news = news_html(load("_data/news.json"))
    if START in hero:
        hero, total = re.subn(re.escape(START) + r".*?" + re.escape(END), lambda _: rendered_news, hero, flags=re.S)
        if total != 1:
            raise ValueError("More than one news block was found.")
    else:
        marker = "<section class='statsSec'>"
        if hero.count(marker) != 1:
            raise ValueError("Homepage statistics anchor not found.")
        hero = hero.replace(marker, rendered_news + marker, 1)
    hero_path.write_text(hero, encoding="utf-8")

    section_path = ROOT / "_includes/site-part-2.html"
    section = section_path.read_text(encoding="utf-8")
    section = replace_once(section,
        '        <a class="publication-index-link"',
        '        {% if site.data.site_metrics.preprint_count > 0 %}\n'
        '        Plus {{ site.data.site_metrics.preprint_count }} public preprint, listed separately from the peer-reviewed count.\n'
        '        {% endif %}\n        <a class="publication-index-link"', "publication status summary")
    section_path.write_text(section, encoding="utf-8")

    index_path = ROOT / "index.html"
    index = index_path.read_text(encoding="utf-8")
    index = replace_once(index, '  <link rel="stylesheet" href="assets/site-2026.css">',
                         '  <link rel="stylesheet" href="assets/site-2026.css">\n'
                         '  <link rel="stylesheet" href="assets/news.css?v=20260913">', "news stylesheet")
    index, total = re.subn(r'"dateModified": "\d{4}-\d{2}-\d{2}"', f'"dateModified": "{DATE}"', index)
    if total != 1:
        raise ValueError("Profile modification date not found exactly once.")
    index_path.write_text(index, encoding="utf-8")

    builder_path = ROOT / "scripts/build_search_pages.py"
    builder = builder_path.read_text(encoding="utf-8")
    builder = replace_once(builder, 'TYPE_LABELS = {', 'TYPE_LABELS = {\n    "preprint": "Preprint (not peer reviewed)",', "preprint type label")
    builder = replace_once(builder, '    if venue:\n        if publication_type == "journal-article":',
                           '    if venue and publication_type != "preprint":\n        if publication_type == "journal-article":', "citation venue metadata")
    builder = replace_once(builder, '    rendered_fields = []\n',
                           '    if publication.get("type") == "preprint":\n'
                           '        fields.extend([(\"eprint\", publication.get(\"eprint\")),\n'
                           '                       (\"archivePrefix\", \"arXiv\"),\n'
                           '                       (\"primaryClass\", publication.get(\"primary_class\"))])\n'
                           '    rendered_fields = []\n', "arXiv BibTeX fields")
    builder_path.write_text(builder, encoding="utf-8")

    for command in ([sys.executable, "scripts/clean_publications.py"],
                    [sys.executable, "scripts/build_search_pages.py"],
                    [sys.executable, "scripts/validate_website.py"],
                    [sys.executable, "scripts/build_search_pages.py", "--check"]):
        subprocess.run(command, cwd=ROOT, check=True)
    after = {record["id"]: record for record in load("_data/publications.json")}
    if any(after.get(identifier) != record for identifier, record in before.items()):
        raise AssertionError("A previously curated publication changed unexpectedly.")
    record = after["spectral-adapters-sam-crlm-2026"]
    page = (ROOT / record["detail_url"].strip("/") / "index.html").read_text(encoding="utf-8")
    assert record["peer_reviewed"] is False and "Preprint" in page
    assert 'citation_conference_title" content="arXiv' not in page
    assert "2609.11703" in (ROOT / "publications.bib").read_text(encoding="utf-8")
    print(f"Verified: {len(after)} publication records; all prior records preserved; featured news added.")


if __name__ == "__main__":
    main()
