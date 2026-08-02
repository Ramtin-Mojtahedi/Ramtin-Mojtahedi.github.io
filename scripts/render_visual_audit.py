#!/usr/bin/env python3
"""Render the Jekyll portfolio into one static HTML file for browser layout tests."""

from __future__ import annotations

import argparse
import html
import json
import re
import traceback
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
INCLUDES = ROOT / "_includes"
METRICS = ROOT / "_data" / "site_metrics.json"
PUBLICATIONS = ROOT / "_data" / "publications.json"
METRIC_PATTERN = re.compile(
    r"{{\s*site\.data\.site_metrics\.([A-Za-z0-9_]+)\s*}}"
)


def read(path: Path) -> str:
    if not path.is_file():
        raise FileNotFoundError(f"Required audit source is missing: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def strip_front_matter(source: str) -> str:
    stripped, replacements = re.subn(r"\A---\s*\n---\s*\n", "", source, count=1)
    if replacements != 1:
        raise RuntimeError("index.html does not contain the expected Jekyll front matter.")
    return stripped


def replace_exact_once(source: str, marker: str, replacement: str, label: str) -> str:
    occurrences = source.count(marker)
    if occurrences != 1:
        raise RuntimeError(f"Expected one {label} marker, found {occurrences}: {marker}")
    return source.replace(marker, replacement, 1)


def replace_delimited_block(
    source: str,
    start_marker: str,
    end_marker: str,
    replacement: str,
    label: str,
) -> str:
    start = source.find(start_marker)
    if start < 0:
        raise RuntimeError(f"Could not locate the start of {label}: {start_marker}")
    end = source.find(end_marker, start + len(start_marker))
    if end < 0:
        raise RuntimeError(f"Could not locate the end of {label}: {end_marker}")
    end += len(end_marker)
    return source[:start] + replacement + source[end:]


def render_metrics(source: str, metrics: dict[str, Any]) -> str:
    def replacement(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in metrics:
            raise KeyError(f"Unknown site metric in website template: {key}")
        return html.escape(str(metrics[key]))

    return METRIC_PATTERN.sub(replacement, source)


def render_publication(publication: dict[str, Any]) -> str:
    group = html.escape(str(publication.get("group") or ""), quote=True)
    publication_id = html.escape(str(publication.get("id") or ""), quote=True)
    year = html.escape(str(publication.get("year") or ""), quote=True)
    status = html.escape(str(publication.get("status") or ""))
    title = html.escape(str(publication.get("title") or ""))
    authors = str(publication.get("authors_html") or "")
    citation = str(publication.get("citation") or "")
    note = str(publication.get("note") or "")
    detail_url = html.escape(str(publication.get("detail_url") or "/publications/"), quote=True)
    url = html.escape(str(publication.get("url") or ""), quote=True)
    open_access_url = html.escape(str(publication.get("open_access_url") or ""), quote=True)
    code_url = html.escape(str(publication.get("code_url") or ""), quote=True)
    code_label = html.escape(str(publication.get("code_label") or "Code"))

    note_html = f'<p class="pub-note">{note}</p>' if note else ""
    links = [f'<a href="{detail_url}">Details</a>']
    if url:
        links.append(f'<a href="{url}" target="_blank" rel="noopener noreferrer">DOI ↗</a>')
    if open_access_url:
        links.append(f'<a href="{open_access_url}" target="_blank" rel="noopener noreferrer">Public text ↗</a>')
    if code_url:
        links.append(f'<a href="{code_url}" target="_blank" rel="noopener noreferrer">{code_label} ↗</a>')
    link_html = f'<div class="pub-links">{"".join(links)}</div>'

    return (
        f'<article class="pub reveal" data-group="{group}" '
        f'data-publication-id="{publication_id}" data-year="{year}">'
        f'<span class="year">{year}</span>'
        '<div>'
        f'<span class="tag">{status}</span>'
        f'<h3><a class="pub-title-link" href="{detail_url}">{title}</a></h3>'
        f'<p class="pub-authors">{authors}</p>'
        f'<p>{citation}</p>'
        f'{note_html}'
        '</div>'
        f'{link_html}'
        '</article>'
    )


def render_publications_section(
    metrics: dict[str, Any],
    publications: list[dict[str, Any]],
) -> str:
    source = render_metrics(read(INCLUDES / "site-part-2.html"), metrics)

    submitted_start = "{% if site.data.site_metrics.submitted_count > 0 %}"
    submitted_end = "{% endif %}"
    submitted_count = int(metrics.get("submitted_count", 0))
    submitted_start_index = source.find(submitted_start)
    if submitted_start_index < 0:
        raise RuntimeError("Could not locate the submitted-publication conditional.")
    submitted_end_index = source.find(
        submitted_end,
        submitted_start_index + len(submitted_start),
    )
    if submitted_end_index < 0:
        raise RuntimeError("Could not locate the end of the submitted-publication conditional.")
    submitted_inner = source[
        submitted_start_index + len(submitted_start):submitted_end_index
    ]
    source = replace_delimited_block(
        source,
        submitted_start,
        submitted_end,
        submitted_inner if submitted_count > 0 else "",
        "submitted-publication conditional",
    )

    rendered_records = "\n".join(
        render_publication(publication) for publication in publications
    )
    source = replace_delimited_block(
        source,
        "{% for pub in site.data.publications %}",
        "{% endfor %}",
        rendered_records,
        "publication loop",
    )
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
        source = replace_exact_once(
            source,
            f"{{% include {include_name} %}}",
            include_source,
            f"include {include_name}",
        )

    source = render_metrics(source, metrics)
    remaining_liquid = re.findall(r"{{.*?}}|{%.*?%}", source, flags=re.DOTALL)
    if remaining_liquid:
        raise RuntimeError(f"Unrendered Liquid syntax remains: {remaining_liquid[:5]}")

    source = replace_exact_once(
        source,
        '<html lang="en-CA" data-theme="light">',
        '<html lang="en-CA" data-theme="light" data-visual-audit="true">',
        "root HTML element",
    )
    output.parent.mkdir(parents=True, exist_ok=True)
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

    try:
        render_site(output)
    except Exception:  # CI must retain the complete rendering failure context.
        traceback.print_exc()
        return 1

    try:
        display_path = output.relative_to(ROOT)
    except ValueError:
        display_path = output
    print(f"Rendered visual audit page: {display_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
