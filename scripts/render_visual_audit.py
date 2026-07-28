#!/usr/bin/env python3
"""Render the Jekyll portfolio into one static HTML file for browser layout tests."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
INCLUDES = ROOT / "_includes"
METRICS = ROOT / "_data" / "site_metrics.json"
PUBLICATIONS = ROOT / "_data" / "publications.json"


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def strip_front_matter(source: str) -> str:
    return re.sub(r"\A---\s*\n---\s*\n", "", source, count=1)


def render_publication(publication: dict[str, Any]) -> str:
    group = html.escape(str(publication.get("group") or ""), quote=True)
    publication_id = html.escape(str(publication.get("id") or ""), quote=True)
    year = html.escape(str(publication.get("year") or ""), quote=True)
    status = html.escape(str(publication.get("status") or ""))
    title = html.escape(str(publication.get("title") or ""))
    authors = str(publication.get("authors_html") or "")
    citation = str(publication.get("citation") or "")
    note = str(publication.get("note") or "")
    url = html.escape(str(publication.get("url") or ""), quote=True)
    link_label = html.escape(str(publication.get("link_label") or "View ↗"))

    note_html = f'<p class="pub-note">{note}</p>' if note else ""
    link_html = (
        f'<a href="{url}" target="_blank" rel="noopener noreferrer">{link_label}</a>'
        if url
        else ""
    )

    return (
        f'<article class="pub reveal" data-group="{group}" '
        f'data-publication-id="{publication_id}" data-year="{year}">'
        f'<span class="year">{year}</span>'
        '<div>'
        f'<span class="tag">{status}</span>'
        f'<h3>{title}</h3>'
        f'<p class="pub-authors">{authors}</p>'
        f'<p>{citation}</p>'
        f'{note_html}'
        '</div>'
        f'{link_html}'
        '</article>'
    )


def render_publications_section(metrics: dict[str, Any], publications: list[dict[str, Any]]) -> str:
    source = read(INCLUDES / "site-part-2.html")

    def metric_replacement(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in metrics:
            raise KeyError(f"Unknown site metric in publication template: {key}")
        return html.escape(str(metrics[key]))

    source = re.sub(
        r"{{\s*site\.data\.site_metrics\.([A-Za-z0-9_]+)\s*}}",
        metric_replacement,
        source,
    )

    submitted_pattern = re.compile(
        r"{%\s*if\s+site\.data\.site_metrics\.submitted_count\s*>\s*0\s*%}"
        r"(.*?)"
        r"{%\s*endif\s*%}",
        flags=re.DOTALL,
    )
    submitted_count = int(metrics.get("submitted_count", 0))
    source = submitted_pattern.sub(lambda match: match.group(1) if submitted_count > 0 else "", source)

    loop_pattern = re.compile(
        r"{%\s*for\s+pub\s+in\s+site\.data\.publications\s*%}"
        r".*?"
        r"{%\s*endfor\s*%}",
        flags=re.DOTALL,
    )
    rendered_records = "\n".join(render_publication(publication) for publication in publications)
    source, replacements = loop_pattern.subn(rendered_records, source, count=1)
    if replacements != 1:
        raise RuntimeError("Could not locate the publication loop in site-part-2.html.")

    return source


def render_site(output: Path) -> None:
    metrics = json.loads(read(METRICS))
    publications = json.loads(read(PUBLICATIONS))
    if not isinstance(metrics, dict) or not isinstance(publications, list):
        raise TypeError("Website metrics or publication data has an unexpected structure.")

    source = strip_front_matter(read(INDEX))
    rendered_includes = {
        "site-part-1.html": read(INCLUDES / "site-part-1.html"),
        "site-part-2.html": render_publications_section(metrics, publications),
        "site-part-3.html": read(INCLUDES / "site-part-3.html"),
        "site-part-4.html": read(INCLUDES / "site-part-4.html"),
    }

    for include_name, include_source in rendered_includes.items():
        source, replacements = re.subn(
            rf"{{%\s*include\s+{re.escape(include_name)}\s*%}}",
            include_source,
            source,
            count=1,
        )
        if replacements != 1:
            raise RuntimeError(f"Could not replace include: {include_name}")

    remaining_liquid = re.findall(r"{{.*?}}|{%.*?%}", source, flags=re.DOTALL)
    if remaining_liquid:
        raise RuntimeError(f"Unrendered Liquid syntax remains: {remaining_liquid[:5]}")

    source = source.replace(
        "<html lang=\"en-CA\"",
        "<html lang=\"en-CA\" data-visual-audit=\"true\"",
        1,
    )
    output.write_text(source.rstrip() + "\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output",
        type=Path,
        default=ROOT / "visual-audit.html",
        help="Path for the rendered audit page.",
    )
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output
    render_site(output)
    print(f"Rendered visual audit page: {output.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
