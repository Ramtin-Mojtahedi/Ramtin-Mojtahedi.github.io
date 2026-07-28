#!/usr/bin/env python3
"""Validate the portfolio's public identity and leadership/volunteer role list."""

from __future__ import annotations

import html
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_FILE = ROOT / "index.html"
HERO_FILE = ROOT / "_includes" / "site-part-1.html"
SERVICE_FILE = ROOT / "_includes" / "site-part-4.html"
CONTACT_SENT_FILE = ROOT / "contact-sent.html"
MINIMUM_ROLE_COUNT = 28
PUBLIC_NAME = "Dr. Ramtin Mojtahedi"
PUBLIC_NAME_WITH_CREDENTIAL = "Dr. Ramtin Mojtahedi, Ph.D."

REQUIRED_ROLES = {
    "Volunteer and committee contributor, UHN Postdoctoral Association.",
    "Social Officer, Latner research community, Toronto General Hospital/UHN.",
    "Neighbourhood Climate Action Champion, City of Kingston.",
    "SGPS Liaison, Ph.D. Officer, and Vice-President of University Affairs, Graduate Computing Society, Queen’s University.",
    "FAS Graduate Mentor, Queen’s University.",
    "ASUS Mentorship Program mentor, Queen’s University.",
    "Graduate mentor, Queen’s AutoDrive.",
    "Graduate mentor, Queen’s Knight Robotics.",
    "Graduate mentor, QMIND, Queen’s University.",
    "Volunteer, World Link Program, Queen’s University International Centre.",
    "PEACH Market and AMS Food Bank volunteer, Queen’s University.",
    "Volunteer, TEDxQueensU.",
    "Responsible Futures Student Auditor, Queen’s University.",
    "Homecoming volunteer, Queen’s University.",
    "Science Rendezvous volunteer, City of Kingston.",
    "Member, PhD-Community Initiative, Queen’s University.",
    "Mentor, Kingston Girls SySTEM Mentorship Program.",
    "Public Officer and community outreach volunteer, Rotaract Club of Kingston.",
    "Finance Committee member, Society of Graduate and Professional Students, Queen’s University.",
    "Peer Writing Assistant, Queen’s Student Academic Success Services.",
    "Student committee member, panelist, and session chair, Imaging Network Ontario Symposium.",
    "Judge, Frontenac, Lennox and Addington Science Fair.",
    "Judge, Inquiry@Queen’s Conference.",
    "Volunteer, Queen’s Proactive Minds.",
    "Let’s Talk Science volunteer.",
    "Volunteer, Queen’s Sexual Health Resource Centre.",
    "Volunteer, Robogals Queen’s.",
    "Outreach and executive member, Centre for Health Innovation Symposium, Queen’s University.",
}

LEGACY_DUPLICATE_ENTRIES = {
    "Champion, City of Kingston Climate Action Program.",
    "Ph.D. Officer, Queen’s School of Computing Society.",
    "SGPS Liaison, Queen’s School of Computing.",
    "Volunteer, AMS Food Bank, Queen’s University.",
    "Mentor, GirlSystem Mentorship Program.",
}


def normalize(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value))
    value = value.replace("–", "-").replace("—", "-")
    return re.sub(r"\s+", " ", value).strip().casefold()


def fail(message: str) -> None:
    raise AssertionError(message)


def require_tokens(source: str, tokens: tuple[str, ...], location: str) -> None:
    missing = [token for token in tokens if token not in source]
    if missing:
        fail(f"Required doctor-title identity text is missing from {location}: {missing}")


def validate_public_identity() -> None:
    index = INDEX_FILE.read_text(encoding="utf-8")
    hero = HERO_FILE.read_text(encoding="utf-8")
    service = SERVICE_FILE.read_text(encoding="utf-8")
    contact_sent = CONTACT_SENT_FILE.read_text(encoding="utf-8")

    require_tokens(
        index,
        (
            f"<title>{PUBLIC_NAME_WITH_CREDENTIAL} | Medical AI Researcher</title>",
            f'<meta name="author" content="{PUBLIC_NAME}">',
            f'<meta property="og:title" content="{PUBLIC_NAME_WITH_CREDENTIAL} | Medical AI Researcher">',
            f'<meta name="twitter:title" content="{PUBLIC_NAME_WITH_CREDENTIAL} | Medical AI Researcher">',
            f'"name": "{PUBLIC_NAME}"',
            '"honorificPrefix": "Dr."',
            '"honorificSuffix": "Ph.D."',
        ),
        "index.html",
    )
    require_tokens(
        hero,
        (
            "<span>Dr. Ramtin Mojtahedi<small>Medical AI Researcher</small></span>",
            "<h1>Dr. Ramtin<span>Mojtahedi, Ph.D.</span></h1>",
            "alt='Dr. Ramtin Mojtahedi in Queen’s University doctoral regalia holding his diploma'",
        ),
        "the navigation and hero",
    )
    require_tokens(
        service,
        ("Dr. Ramtin Mojtahedi. Medical AI research in Toronto, Canada.",),
        "the footer",
    )
    require_tokens(
        contact_sent,
        (
            f"<title>Message Sent | {PUBLIC_NAME}</title>",
            f"submitted directly to {PUBLIC_NAME}.",
        ),
        "the contact confirmation page",
    )

    legacy_tokens = {
        "hero": ("<h1>Ramtin<span>", "<span>Ramtin Mojtahedi<small>"),
        "footer": ("> Ramtin Mojtahedi. Medical AI research",),
        "contact confirmation": (
            "<title>Message Sent | Ramtin Mojtahedi</title>",
            "submitted directly to Ramtin Mojtahedi.",
        ),
    }
    sources = {"hero": hero, "footer": service, "contact confirmation": contact_sent}
    remaining = [
        f"{location}: {token}"
        for location, tokens in legacy_tokens.items()
        for token in tokens
        if token in sources[location]
    ]
    if remaining:
        fail(f"Legacy untitled public-name text remains: {remaining}")


def main() -> int:
    validate_public_identity()

    source = SERVICE_FILE.read_text(encoding="utf-8")
    if 'class="leadGrid"' not in source:
        fail("The responsive leadership-role grid is missing.")

    matches = re.findall(
        r'<article class="lead[^"]*">\s*<span>.*?</span>\s*<p>(.*?)</p>\s*</article>',
        source,
        flags=re.IGNORECASE | re.DOTALL,
    )
    roles = [normalize(value) for value in matches]
    if len(roles) < MINIMUM_ROLE_COUNT:
        fail(f"Only {len(roles)} leadership and volunteer roles were found; expected at least {MINIMUM_ROLE_COUNT}.")

    duplicates = sorted(role for role, total in Counter(roles).items() if total > 1)
    if duplicates:
        fail(f"Duplicate leadership or volunteer roles were detected: {duplicates}")

    missing = sorted(role for role in REQUIRED_ROLES if normalize(role) not in roles)
    if missing:
        fail(f"Required leadership or volunteer roles are missing: {missing}")

    legacy = sorted(role for role in LEGACY_DUPLICATE_ENTRIES if normalize(role) in roles)
    if legacy:
        fail(f"Legacy duplicate entries remain: {legacy}")

    if len(roles) != len(set(roles)):
        fail("The leadership and volunteer role list is not unique.")

    print("Public-identity and service-role validation passed.")
    print(f"- Public name: {PUBLIC_NAME_WITH_CREDENTIAL}")
    print(f"- Unique leadership and volunteer roles: {len(roles)}")
    print(f"- Required supplied roles present: {len(REQUIRED_ROLES)}")
    print("- Legacy untitled name text: none")
    print("- Legacy duplicate entries: none")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"Public-identity or service-role validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
