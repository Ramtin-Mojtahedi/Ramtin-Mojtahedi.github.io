#!/usr/bin/env python3
"""Refresh the portfolio's visible and machine-readable maintenance status.

This script is intentionally conservative. It updates publication-derived metadata,
checks public profile links, refreshes the sitemap, and records when validation ran.
Verified CV biography, education, experience, awards, teaching, and service are not
rewritten from arbitrary web search results.
"""

from __future__ import annotations

import calendar
import datetime as dt
import json
import re
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
PUBLICATIONS = ROOT / "_data" / "publications.json"
METRICS = ROOT / "_data" / "site_metrics.json"
MAINTENANCE = ROOT / "_data" / "site_maintenance.json"
PUBLIC_STATUS = ROOT / "site-status.json"
SITEMAP = ROOT / "sitemap.xml"

WEBSITE = "https://ramtin-mojtahedi.github.io/"
MINIMUM_PUBLICATIONS = 18
PROFILE_URLS = {
    "google_scholar": "https://scholar.google.com/citations?user=KjUrlGUAAAAJ&hl=en",
    "orcid": "https://orcid.org/0000-0002-3953-3256",
    "github": "https://github.com/Ramtin-Mojtahedi",
    "linkedin": "https://www.linkedin.com/in/ramtin-mojtahedi/",
    "university_health_network": "https://www.uhn.ca/",
    "university_of_toronto": "https://www.utoronto.ca/",
}

AUTOMATED_CHECKS = [
    "Scholarly publication discovery and metadata enrichment",
    "Duplicate, thesis, review-report, and non-publication filtering",
    "Animated statistics and publication-count consistency",
    "Public profile link availability",
    "Search metadata and sitemap freshness",
    "Website source and JavaScript validation",
]

CURATED_CONTENT_POLICY = (
    "Verified CV biography, education, experience, awards, teaching, and service "
    "are preserved and are not rewritten from unverified search results."
)

PROTECTED_HTTP_CODES = {401, 403, 405, 406, 418, 429, 999}


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def display_date(value: dt.date) -> str:
    return f"{calendar.month_name[value.month]} {value.day}, {value.year}"


def check_public_profiles() -> dict[str, dict[str, Any]]:
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Ramtin-Mojtahedi-Portfolio-Maintenance/1.0 "
                "(+https://ramtin-mojtahedi.github.io/)"
            ),
            "Accept-Language": "en-CA,en;q=0.9",
        }
    )

    results: dict[str, dict[str, Any]] = {}
    for name, url in PROFILE_URLS.items():
        result: dict[str, Any] = {"url": url, "status": "unavailable"}
        try:
            response = session.get(
                url,
                timeout=(8, 22),
                allow_redirects=True,
                stream=True,
            )
            code = int(response.status_code)
            final_url = str(response.url)
            response.close()

            if 200 <= code < 400 and "/sorry/" not in final_url:
                status = "available"
            elif code in PROTECTED_HTTP_CODES or "/sorry/" in final_url:
                # A protected/challenged page can still be a valid public profile.
                status = "available-protected"
            else:
                status = "unavailable"

            result.update(
                {
                    "status": status,
                    "http_status": code,
                    "final_url": final_url,
                }
            )
        except requests.RequestException as error:
            result["detail"] = re.sub(r"\s+", " ", str(error)).strip()[:220]

        results[name] = result

    return results


def refresh_sitemap(checked: str) -> None:
    if not SITEMAP.exists():
        return

    text = SITEMAP.read_text(encoding="utf-8")
    text = re.sub(
        r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>",
        f"<lastmod>{checked}</lastmod>",
        text,
    )

    if f"{WEBSITE}site-status.json" not in text:
        entry = (
            "  <url>\n"
            f"    <loc>{WEBSITE}site-status.json</loc>\n"
            f"    <lastmod>{checked}</lastmod>\n"
            "    <changefreq>weekly</changefreq>\n"
            "    <priority>0.4</priority>\n"
            "  </url>\n"
        )
        text = text.replace("</urlset>", entry + "</urlset>")

    SITEMAP.write_text(text, encoding="utf-8")


def main() -> int:
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0)
    checked = now.date().isoformat()

    publications = read_json(PUBLICATIONS)
    metrics = read_json(METRICS)

    if not isinstance(publications, list) or len(publications) < MINIMUM_PUBLICATIONS:
        raise RuntimeError(
            f"The curated publication baseline is incomplete: {len(publications)} records."
        )
    if int(metrics.get("publication_count", -1)) != len(publications):
        raise RuntimeError("Publication metrics do not match the publication data.")

    profile_checks = check_public_profiles()
    source_status = metrics.get("source_status") or {}

    maintenance = {
        "schema_version": 1,
        "status": "current",
        "last_checked": checked,
        "last_checked_display": display_date(now.date()),
        "last_checked_at": now.isoformat().replace("+00:00", "Z"),
        "frequency": "twice weekly",
        "schedule_display": "Every Monday and Thursday",
        "publication_count": len(publications),
        "automated_checks": AUTOMATED_CHECKS,
        "curated_content_policy": CURATED_CONTENT_POLICY,
        "profile_checks": profile_checks,
        "source_status": source_status,
    }

    public_status = {
        "schema_version": 1,
        "website": WEBSITE,
        "status": maintenance["status"],
        "last_checked": maintenance["last_checked"],
        "last_checked_at": maintenance["last_checked_at"],
        "frequency": maintenance["frequency"],
        "schedule": maintenance["schedule_display"],
        "publication_count": maintenance["publication_count"],
        "automated_checks": [
            "scholarly publications",
            "publication data quality",
            "website statistics",
            "public profile links",
            "search metadata and sitemap",
            "website source validation",
        ],
        "profile_checks": profile_checks,
    }

    write_json(MAINTENANCE, maintenance)
    write_json(PUBLIC_STATUS, public_status)
    refresh_sitemap(checked)

    print(
        json.dumps(
            {
                "status": maintenance["status"],
                "last_checked": checked,
                "publication_count": len(publications),
                "profile_checks": {
                    key: value.get("status") for key, value in profile_checks.items()
                },
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
