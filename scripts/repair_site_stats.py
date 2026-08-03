#!/usr/bin/env python3
"""Synchronize public counters and count-based headings with the site content."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
METRICS_PATH = ROOT / "_data" / "site_metrics.json"
PUBLICATIONS_PATH = ROOT / "_data" / "publications.json"
HERO_PATH = ROOT / "_includes" / "site-part-1.html"
ACTIVITY_PATH = ROOT / "_includes" / "site-part-3.html"
SERVICE_PATH = ROOT / "_includes" / "site-part-4.html"

NUMBER_WORDS = {
    0: "zero", 1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen",
    15: "fifteen", 16: "sixteen", 17: "seventeen", 18: "eighteen",
    19: "nineteen", 20: "twenty",
}

PROGRAMMING_LANGUAGES = (
    "Python",
    "MATLAB",
    "C",
    "C++",
    "C#",
    "Java",
    "Julia",
    "R",
    "SQL",
    "Bash",
)


def display_count(value: int) -> str:
    return NUMBER_WORDS.get(value, str(value))


STAT_LABELS = {
    "publication_count": "Publications and scholarly works",
    "presentation_count": "Oral and poster presentations",
    "recognition_count": "Honours, awards, and distinctions",
    "reviewer_venue_count": "Reviewer and service venues",
    "leadership_role_count": "Leadership and volunteer roles",
}


def count(pattern: str, source: str) -> int:
    return len(re.findall(pattern, source, flags=re.IGNORECASE | re.DOTALL))


def reviewer_venue_count(source: str) -> int:
    match = re.search(
        r"<h3>Reviewer and professional service</h3>\s*<ul class=\"clean\">(.*?)</ul>",
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        raise RuntimeError("Could not locate the reviewer and professional service list.")
    return count(r"<li(?:\s|>)", match.group(1))


def replace_stat(source: str, label: str, value: int) -> str:
    pattern = re.compile(
        rf"<div class='stat'>\s*<b[^>]*>[^<]*</b>\s*"
        rf"<span>{re.escape(label)}</span>\s*</div>"
    )
    replacement = (
        "<div class='stat'>"
        f"<b data-count='{value}'>{value}</b>"
        f"<span>{label}</span>"
        "</div>"
    )
    updated, replacements = pattern.subn(replacement, source, count=1)
    if replacements != 1:
        raise RuntimeError(f"Could not synchronize the statistic labelled: {label}")
    return updated


def replace_heading(source: str, section_pattern: str, text: str) -> str:
    pattern = re.compile(
        rf"({section_pattern}.*?<h2 class='title'>).*?(</h2>)",
        flags=re.DOTALL,
    )
    updated, replacements = pattern.subn(rf"\g<1>{text}\g<2>", source, count=1)
    if replacements != 1:
        raise RuntimeError(f"Could not synchronize the heading for: {section_pattern}")
    return updated


def main() -> int:
    metrics = json.loads(METRICS_PATH.read_text(encoding="utf-8"))
    publications = json.loads(PUBLICATIONS_PATH.read_text(encoding="utf-8"))
    if not isinstance(publications, list) or len(publications) < 18:
        raise RuntimeError("The curated publication baseline must contain at least 18 records.")
    hero = HERO_PATH.read_text(encoding="utf-8")
    activity = ACTIVITY_PATH.read_text(encoding="utf-8")
    service = SERVICE_PATH.read_text(encoding="utf-8")

    oral_count = count(r"<small>Oral\s*·", activity)
    poster_count = count(r"<small>Poster\s*·", activity)
    presentation_count = oral_count + poster_count
    recognition_count = count(r"<article class='award[^']*'>", activity)
    teaching_topic_count = count(r"<article class='teach[^']*'>", activity)
    leadership_role_count = count(r"<article class=\"lead[^\"]*\">", service)
    service_venue_count = reviewer_venue_count(service)
    publication_count = len(publications)

    section_counts = {
        "publication_count": publication_count,
        "presentation_count": presentation_count,
        "oral_presentation_count": oral_count,
        "poster_presentation_count": poster_count,
        "recognition_count": recognition_count,
        "teaching_topic_count": teaching_topic_count,
        "reviewer_venue_count": service_venue_count,
        "leadership_role_count": leadership_role_count,
        "programming_language_count": len(PROGRAMMING_LANGUAGES),
    }
    invalid = {key: value for key, value in section_counts.items() if value < 1}
    if invalid:
        raise RuntimeError(f"One or more public sections appear empty: {invalid}")

    for metric_name, label in STAT_LABELS.items():
        hero = replace_stat(hero, label, section_counts[metric_name])

    activity = replace_heading(
        activity,
        r"<section id='presentations'>",
        f"{display_count(oral_count).capitalize()} oral and "
        f"{display_count(poster_count)} poster presentations.",
    )
    activity = replace_heading(
        activity,
        r"<section class='surface' id='recognition'>",
        f"{recognition_count} honours, awards, grants, and distinctions.",
    )
    activity, button_replacements = re.subn(
        r"Show all \d+ distinctions ↓",
        f"Show all {recognition_count} distinctions ↓",
        activity,
        count=1,
    )
    if button_replacements != 1:
        raise RuntimeError("Could not synchronize the recognition expansion button.")

    if "NaN" in hero or "\x88" in hero:
        raise RuntimeError("Invalid counter text remains after synchronization.")

    metrics.update(section_counts)
    metrics["programming_languages"] = list(PROGRAMMING_LANGUAGES)
    METRICS_PATH.write_text(
        json.dumps(metrics, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    HERO_PATH.write_text(hero, encoding="utf-8")
    ACTIVITY_PATH.write_text(activity, encoding="utf-8")

    print(json.dumps({**section_counts, "programming_languages": PROGRAMMING_LANGUAGES}, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
