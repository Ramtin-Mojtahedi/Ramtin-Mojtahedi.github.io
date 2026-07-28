#!/usr/bin/env python3
"""Validate the portfolio's leadership and volunteer role list."""

from __future__ import annotations

import html
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE_FILE = ROOT / "_includes" / "site-part-4.html"
MINIMUM_ROLE_COUNT = 28

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


def main() -> int:
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

    print("Service-role validation passed.")
    print(f"- Unique leadership and volunteer roles: {len(roles)}")
    print(f"- Required supplied roles present: {len(REQUIRED_ROLES)}")
    print("- Legacy duplicate entries: none")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"Service-role validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
