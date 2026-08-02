#!/usr/bin/env python3
"""Build static, crawler-readable publication pages and citation exports."""

from __future__ import annotations

import datetime as dt
import html
import json
import re
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
PUBLICATIONS = ROOT / "_data" / "publications.json"
OUTPUT = ROOT / "publications"
BASE_URL = "https://ramtin-mojtahedi.github.io"
ORCID = "https://orcid.org/0000-0002-3953-3256"
AUTHOR_ALIASES = {"Ramtin Mojtahedi", "Ramtin Mojtahedi Saffari", "R. M. Saffari"}


def esc(value: object, *, quote_attr: bool = False) -> str:
    return html.escape(str(value or ""), quote=quote_attr)


def citation_type(publication: dict) -> str:
    return "citation_journal_title" if publication.get("type") == "journal-article" else "citation_conference_title"


def split_pages(value: str) -> tuple[str, str]:
    match = re.fullmatch(r"\s*([^–—-]+)\s*[–—-]\s*([^–—-]+)\s*", value or "")
    return (match.group(1), match.group(2)) if match else ("", "")


def author_json(name: str) -> dict:
    value = {"@type": "Person", "name": name}
    if name in AUTHOR_ALIASES:
        value.update({"@id": f"{BASE_URL}/#person", "sameAs": ORCID})
    return value


def json_ld(publication: dict) -> dict:
    kind = "ScholarlyArticle" if publication.get("type") in {"journal-article", "conference-paper"} else "CreativeWork"
    payload = {
        "@context": "https://schema.org",
        "@type": kind,
        "@id": f"{BASE_URL}{publication['detail_url']}#work",
        "url": f"{BASE_URL}{publication['detail_url']}",
        "name": publication["title"],
        "headline": publication["title"],
        "datePublished": publication["publication_date"],
        "author": [author_json(name) for name in publication["authors"]],
        "keywords": publication.get("keywords", []),
        "isPartOf": {"@type": "Periodical", "name": publication.get("venue", "")},
        "publisher": {"@type": "Organization", "name": publication.get("publisher", "")},
        "mainEntityOfPage": f"{BASE_URL}{publication['detail_url']}",
    }
    if publication.get("doi"):
        payload["identifier"] = f"https://doi.org/{publication['doi']}"
        payload["sameAs"] = publication["url"]
    if publication.get("open_access_license"):
        payload["license"] = publication["open_access_license"]
    if publication.get("open_access_url"):
        payload["isAccessibleForFree"] = True
    return payload


def meta_tags(publication: dict) -> str:
    fields: list[tuple[str, str]] = [
        ("citation_title", publication["title"]),
        *(('citation_author', author) for author in publication["authors"]),
        ("citation_publication_date", publication["publication_date"]),
        (citation_type(publication), publication.get("venue", "")),
        ("citation_volume", publication.get("volume", "")),
        ("citation_issue", publication.get("issue", "")),
        ("citation_doi", publication.get("doi", "")),
        ("citation_pdf_url", publication.get("citation_pdf_url", "")),
    ]
    first, last = split_pages(publication.get("pages", ""))
    fields.extend((("citation_firstpage", first), ("citation_lastpage", last)))
    return "\n".join(
        f'  <meta name="{esc(name, quote_attr=True)}" content="{esc(value, quote_attr=True)}">'
        for name, value in fields
        if value
    )


def bibtex(publication: dict) -> str:
    entry_type = publication.get("bibtex_type", "misc")
    fields: list[tuple[str, str]] = [
        ("author", " and ".join(publication["authors"])),
        ("title", "{" + publication["title"] + "}"),
        ("year", str(publication["year"])),
    ]
    if entry_type == "article":
        fields.extend(
            [
                ("journal", publication.get("venue", "")),
                ("volume", publication.get("volume", "")),
                ("number", publication.get("issue", "")),
                ("pages", publication.get("pages", "")),
                ("eid", publication.get("article_number", "")),
            ]
        )
    elif entry_type == "inproceedings":
        fields.extend(
            [
                ("booktitle", publication.get("venue", "")),
                ("volume", publication.get("volume", "")),
                ("pages", publication.get("pages", "")),
                ("publisher", publication.get("publisher", "")),
            ]
        )
    elif entry_type == "phdthesis":
        fields.extend((("school", publication.get("venue", "")), ("type", "Doctoral dissertation")))
    else:
        fields.append(("howpublished", publication.get("venue", "")))
    fields.extend(
        [
            ("doi", publication.get("doi", "")),
            ("url", publication.get("url") or f"{BASE_URL}{publication['detail_url']}"),
            ("note", re.sub(r"<[^>]+>", "", publication.get("note", ""))),
        ]
    )
    body = ",\n".join(f"  {name} = {{{value}}}" for name, value in fields if value)
    return f"@{entry_type}{{{publication['bibtex_key']},\n{body}\n}}"


def action_links(publication: dict) -> str:
    links: list[tuple[str, str, str]] = []
    if publication.get("url"):
        links.append((publication["url"], "Publisher / DOI", "primary"))
    if publication.get("open_access_url"):
        links.append((publication["open_access_url"], publication.get("open_access_label") or "Open-access copy", "open"))
    if publication.get("preprint_url") and publication.get("preprint_url") != publication.get("open_access_url"):
        links.append((publication["preprint_url"], "Preprint", "open"))
    if publication.get("code_url"):
        links.append((publication["code_url"], publication.get("code_label") or "Code", "code"))
    if publication.get("pubmed_url"):
        links.append((publication["pubmed_url"], "PubMed", "secondary"))
    return "\n".join(
        f'<a class="button {kind}" href="{esc(url, quote_attr=True)}" rel="noopener noreferrer">{esc(label)} ↗</a>'
        for url, label, kind in links
    )


def page(publication: dict, entry: str) -> str:
    canonical = f"{BASE_URL}{publication['detail_url']}"
    description = f"Citation, persistent identifiers, lawful full-text access, and research-code links for {publication['title']}."
    authors = ", ".join(publication["authors"])
    topics = "".join(f"<li>{esc(topic)}</li>" for topic in publication.get("keywords", []))
    aliases = "".join(f"<li>{esc(alias)}</li>" for alias in publication.get("title_aliases", []))
    alias_section = f'<section><h2>Title variants</h2><ul class="topics">{aliases}</ul></section>' if aliases else ""
    note = f'<div class="notice"><strong>Metadata note.</strong> {esc(publication["note"])}</div>' if publication.get("note") else ""
    license_note = (
        f'<p class="license"><strong>Access licence:</strong> {esc(publication["open_access_license"])}</p>'
        if publication.get("open_access_license")
        else ""
    )
    encoded_title = quote(publication["title"])
    return f'''<!doctype html>
<html lang="en-CA">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{esc(publication['title'])} | Ramtin Mojtahedi</title>
  <meta name="description" content="{esc(description, quote_attr=True)}">
  <meta name="author" content="{esc(authors, quote_attr=True)}">
  <meta name="robots" content="index, follow, max-snippet:-1">
{meta_tags(publication)}
  <link rel="canonical" href="{canonical}">
  <link rel="author" href="{ORCID}">
  <link rel="stylesheet" href="../../assets/scholarly-publications.css?v=20260802">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{canonical}">
  <meta property="og:title" content="{esc(publication['title'], quote_attr=True)}">
  <meta property="og:description" content="{esc(description, quote_attr=True)}">
  <meta property="article:published_time" content="{esc(publication['publication_date'], quote_attr=True)}">
  <script type="application/ld+json">{json.dumps(json_ld(publication), ensure_ascii=False, indent=2)}</script>
</head>
<body>
  <header class="site-header"><a href="/">Ramtin Mojtahedi</a><nav><a href="/publications/">All publications</a><a href="{ORCID}" rel="me">ORCID</a></nav></header>
  <main>
    <article>
      <p class="eyebrow">{esc(publication['status'])} · {publication['year']}</p>
      <h1>{esc(publication['title'])}</h1>
      <p class="authors">{esc(authors)}</p>
      <p class="citation">{esc(publication['citation_plain'])}</p>
      <div class="actions">{action_links(publication)}</div>
      {license_note}
      {note}
      <section>
        <h2>Research topics</h2>
        <ul class="topics">{topics}</ul>
      </section>
      {alias_section}
      <section id="cite">
        <div class="section-heading"><h2>Cite this work</h2><a href="/publications.bib" download>Download complete BibTeX</a></div>
        <pre><code>{esc(entry)}</code></pre>
        <p class="cite-tools"><a href="https://scholar.google.com/scholar?q={encoded_title}">Find in Google Scholar ↗</a></p>
      </section>
      <aside class="rights"><strong>Responsible access.</strong> This page links only to publisher records, clearly identified public manuscripts, preprints, and author-designated repositories. It does not host a publisher PDF unless its licence permits redistribution.</aside>
    </article>
  </main>
  <footer>Verified bibliographic record · Last checked {esc(publication['last_verified'])}</footer>
</body>
</html>
'''


def index_page(publications: list[dict]) -> str:
    cards = []
    for publication in publications:
        access = ""
        if publication.get("open_access_url"):
            access = '<span class="access">Public full text</span>'
        cards.append(
            f'''<li class="paper"><div><span class="year">{publication['year']}</span>{access}</div>
<h2><a href="{esc(publication['detail_url'], quote_attr=True)}">{esc(publication['title'])}</a></h2>
<p>{esc(', '.join(publication['authors']))}</p><p>{esc(publication['citation_plain'])}</p></li>'''
        )
    return f'''<!doctype html>
<html lang="en-CA"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Publications | Ramtin Mojtahedi</title>
<meta name="description" content="Verified bibliography of Ramtin Mojtahedi, with DOI, PubMed, open-access, code, and citation links.">
<meta name="robots" content="index, follow"><link rel="canonical" href="{BASE_URL}/publications/">
<link rel="stylesheet" href="../assets/scholarly-publications.css?v=20260802">
<script type="application/ld+json">{json.dumps({'@context':'https://schema.org','@type':'CollectionPage','name':'Publications of Ramtin Mojtahedi','url':f'{BASE_URL}/publications/','author':{'@id':f'{BASE_URL}/#person'},'numberOfItems':len(publications)}, indent=2)}</script>
</head><body><header class="site-header"><a href="/">Ramtin Mojtahedi</a><nav><a href="/publications.bib" download>BibTeX</a><a href="{ORCID}" rel="me">ORCID</a></nav></header>
<main><section class="collection"><p class="eyebrow">Verified research record</p><h1>Publications and scholarly work</h1>
<p class="lede">{len(publications)} records, including {sum(bool(p.get('peer_reviewed')) for p in publications)} peer-reviewed papers. Each record provides normalized citation metadata and links only to lawful public copies.</p>
<ul class="paper-list">{''.join(cards)}</ul></section></main>
<footer>Metadata last comprehensively verified 2 August 2026.</footer></body></html>'''


def sitemap(publications: list[dict]) -> str:
    verified = max(str(publication.get("last_verified") or "") for publication in publications)
    urls = [
        (f"{BASE_URL}/", "1.0"),
        (f"{BASE_URL}/publications/", "0.9"),
        (f"{BASE_URL}/publications.json", "0.6"),
        (f"{BASE_URL}/publications.bib", "0.5"),
        *((f"{BASE_URL}{publication['detail_url']}", "0.8") for publication in publications),
    ]
    nodes = "\n".join(
        f"  <url><loc>{esc(url)}</loc><lastmod>{verified}</lastmod><changefreq>monthly</changefreq><priority>{priority}</priority></url>"
        for url, priority in urls
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{nodes}\n</urlset>\n'


def validate(publications: list[dict]) -> None:
    ids = [p["id"] for p in publications]
    keys = [p["bibtex_key"] for p in publications]
    dois = [p["doi"].lower() for p in publications if p.get("doi")]
    if len(ids) != len(set(ids)) or len(keys) != len(set(keys)) or len(dois) != len(set(dois)):
        raise RuntimeError("Duplicate publication id, BibTeX key, or DOI detected.")
    required = {"id", "title", "year", "publication_date", "authors", "citation_plain", "venue", "type", "peer_reviewed", "bibtex_key"}
    for publication in publications:
        missing = sorted(field for field in required if publication.get(field) in (None, "", []))
        if missing:
            raise RuntimeError(f"{publication.get('id')}: missing {', '.join(missing)}")
        if publication.get("url") and publication.get("doi") and publication["url"].lower() != f"https://doi.org/{publication['doi']}".lower():
            raise RuntimeError(f"{publication['id']}: DOI URL mismatch")


def main() -> int:
    publications = json.loads(PUBLICATIONS.read_text(encoding="utf-8"))
    validate(publications)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = {publication["id"]: bibtex(publication) for publication in publications}
    for publication in publications:
        directory = OUTPUT / publication["id"]
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "index.html").write_text(
            page(publication, entries[publication["id"]]), encoding="utf-8", newline="\n"
        )
    (OUTPUT / "index.html").write_text(index_page(publications), encoding="utf-8", newline="\n")
    (ROOT / "publications.bib").write_text(
        "\n\n".join(entries.values()) + "\n", encoding="utf-8", newline="\n"
    )
    (ROOT / "sitemap.xml").write_text(sitemap(publications), encoding="utf-8", newline="\n")
    manifest = {
        "schema_version": 1,
        "generated_at": "2026-08-02",
        "count": len(publications),
        "pages": [publication["detail_url"] for publication in publications],
    }
    (ROOT / "scholarly-pages.json").write_text(
        json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    indexnow = {
        "host": "ramtin-mojtahedi.github.io",
        "key": "898f0caec5d8b22a095db2a4afa88722",
        "keyLocation": f"{BASE_URL}/898f0caec5d8b22a095db2a4afa88722.txt",
        "urlList": [
            f"{BASE_URL}/",
            f"{BASE_URL}/publications/",
            *(f"{BASE_URL}{publication['detail_url']}" for publication in publications),
        ],
    }
    (ROOT / "indexnow.json").write_text(
        json.dumps(indexnow, indent=2) + "\n", encoding="utf-8", newline="\n"
    )
    print(f"Built {len(publications)} publication pages and publications.bib")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
