#!/usr/bin/env python3
"""Validate the published portfolio sources before GitHub Pages deploys them."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

PUBLIC_EMAIL = "Ramtin.Mojtahedi@utoronto.ca"
PRIVATE_RECIPIENT = "".join(("Mojtahedi", "Ramtin", "@gmail.com"))
MINIMUM_PUBLICATIONS = 18
SUCCESS_MESSAGE = "Thanks for your message. We will contact you shortly. Thanks!"

INDEX = ROOT / "index.html"
HERO = ROOT / "_includes" / "site-part-1.html"
CONTACT = ROOT / "_includes" / "site-part-4.html"
CONTACT_JS = ROOT / "assets" / "contact-form.js"
CONTACT_CSS = ROOT / "assets" / "contact-form-polish.css"
PUBLICATIONS = ROOT / "_data" / "publications.json"
METRICS = ROOT / "_data" / "site_metrics.json"

EXPECTED_CATEGORIES = {
    "Research collaboration",
    "Clinical or medical AI collaboration",
    "Speaking, seminar, or panel invitation",
    "Academic reviewing or editorial service",
    "Student, mentorship, or supervision inquiry",
    "Open-source or technical question",
    "Consulting or professional opportunity",
    "Media or interview request",
    "Other professional inquiry",
}


def fail(message: str) -> None:
    raise AssertionError(message)


def read(path: Path) -> str:
    if not path.is_file():
        fail(f"Required website file is missing: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def validate_statistics(hero: str) -> None:
    counters = re.findall(r"data-count=(?:'|\")([^'\"]+)(?:'|\")", hero)
    if not counters:
        fail("No animated statistics were found.")
    invalid = [value for value in counters if not re.fullmatch(r"\d+", value)]
    if invalid:
        fail(f"Animated statistics contain non-numeric values: {invalid}")


def validate_contact(index: str, contact: str, script: str, style: str) -> None:
    if PUBLIC_EMAIL not in contact or f"mailto:{PUBLIC_EMAIL}" not in contact:
        fail("The visible University of Toronto contact email is missing.")

    mailto_addresses = {
        address.lower()
        for address in re.findall(r"mailto:([^\"'<>\s]+)", index + "\n" + contact, flags=re.I)
    }
    if mailto_addresses != {PUBLIC_EMAIL.lower()}:
        fail(f"Unexpected visible mailto address(es): {sorted(mailto_addresses)}")

    private_fragments = ("Mojtahedi", "Ramtin", "@gmail.com")
    if not all(f"'{fragment}'" in script for fragment in private_fragments):
        fail("The private contact-form destination is not assembled from the expected fragments.")
    if PRIVATE_RECIPIENT.lower() in contact.lower() or PRIVATE_RECIPIENT.lower() in index.lower():
        fail("The private contact-form destination must not be rendered in page HTML.")
    if "Ramtn" in script or "MojtahediRamtn" in script:
        fail("The former misspelled recipient is still present in contact-form code.")

    if re.search(r"\b(?:minlength|maxlength)\s*=", contact, flags=re.I):
        fail("The contact form must not impose character-count limits.")
    if "messageCount" in contact or "messageCount" in script or "/5000" in contact:
        fail("A legacy message character counter is still present.")
    if ".slice(0," in script:
        fail("The contact-form JavaScript must not truncate visitor text.")

    option_values = {
        value
        for value in re.findall(r'<option\s+value="([^"]*)"', contact)
        if value
    }
    if option_values != EXPECTED_CATEGORIES:
        missing = sorted(EXPECTED_CATEGORIES - option_values)
        extra = sorted(option_values - EXPECTED_CATEGORIES)
        fail(f"Inquiry categories differ from the approved set. Missing={missing}; extra={extra}")

    missing_in_script = sorted(category for category in EXPECTED_CATEGORIES if repr(category) not in script)
    if missing_in_script:
        fail(f"Contact JavaScript is missing approved categories: {missing_in_script}")

    required_tokens = (
        "inquiry_type",
        "reply_to",
        "hp_email",
        "rateLimitStorageKey",
        "minimumCompletionMs",
        SUCCESS_MESSAGE,
    )
    absent = [token for token in required_tokens if token not in script]
    if absent:
        fail(f"Contact JavaScript is missing required delivery safeguards or wording: {absent}")

    if "contact-form-polish.css" not in index:
        fail("The contact-form stylesheet is not linked from index.html.")
    if "contact-form.js" not in index:
        fail("The contact-form JavaScript is not linked from index.html.")
    if ".contact .field select" not in style:
        fail("The inquiry-category select does not have dedicated styling.")


def validate_publications() -> None:
    publications = json.loads(read(PUBLICATIONS))
    metrics = json.loads(read(METRICS))

    if not isinstance(publications, list):
        fail("_data/publications.json must contain a list.")
    if len(publications) < MINIMUM_PUBLICATIONS:
        fail(
            f"Publication data contains {len(publications)} records; "
            f"at least {MINIMUM_PUBLICATIONS} curated records are required."
        )

    titles = [str(item.get("title") or "").strip() for item in publications]
    if any(not title for title in titles):
        fail("Every publication record must have a title.")
    if len({title.casefold() for title in titles}) != len(titles):
        fail("Duplicate publication titles were detected.")

    if int(metrics.get("publication_count", -1)) != len(publications):
        fail("Publication metric does not match _data/publications.json.")

    invalid_years = [
        item.get("year")
        for item in publications
        if not isinstance(item.get("year"), int) or not 1900 <= item["year"] <= 2100
    ]
    if invalid_years:
        fail(f"Invalid publication year values were detected: {invalid_years}")


def main() -> int:
    index = read(INDEX)
    hero = read(HERO)
    contact = read(CONTACT)
    script = read(CONTACT_JS)
    style = read(CONTACT_CSS)

    validate_statistics(hero)
    validate_contact(index, contact, script, style)
    validate_publications()

    publications = json.loads(read(PUBLICATIONS))
    print("Website validation passed.")
    print(f"- Public email: {PUBLIC_EMAIL}")
    print(f"- Private form recipient: {PRIVATE_RECIPIENT}")
    print(f"- Contact categories: {len(EXPECTED_CATEGORIES)}")
    print("- Character limits: none")
    print(f"- Publications: {len(publications)}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, json.JSONDecodeError) as error:
        print(f"Website validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
