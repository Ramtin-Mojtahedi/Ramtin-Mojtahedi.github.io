#!/usr/bin/env python3
"""Validate final responsive safeguards and rendered browser-audit wiring."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
SERVICE = ROOT / "_includes" / "site-part-4.html"
STYLE = ROOT / "assets" / "layout-safety.css"
SCRIPT = ROOT / "assets" / "layout-safety.js"
SITE_SCRIPT = ROOT / "assets" / "site-2026.js"
RENDERER = ROOT / "scripts" / "render_visual_audit.py"
BROWSER_AUDIT = ROOT / "scripts" / "visual_layout_audit.mjs"
HEADING_AUDIT = ROOT / "scripts" / "visual_heading_audit.mjs"
SITE_QUALITY = ROOT / ".github" / "workflows" / "site-quality.yml"
DAILY_MAINTENANCE = ROOT / ".github" / "workflows" / "update-publications.yml"


def read(path: Path) -> str:
    if not path.is_file():
        raise AssertionError(f"Required layout-safety file is missing: {path.relative_to(ROOT)}")
    return path.read_text(encoding="utf-8")


def require_tokens(source: str, tokens: tuple[str, ...], location: str) -> None:
    missing = [token for token in tokens if token not in source]
    if missing:
        raise AssertionError(f"Required layout-safety tokens are missing from {location}: {missing}")


def validate_asset_order(index: str) -> None:
    contact_style = 'href="assets/contact-form-polish.css?v=20260727-1"'
    safety_style = 'href="assets/layout-safety.css?v=20260728-1"'
    contact_script = 'src="assets/contact-form.js?v=20260727-4"'
    safety_script = 'src="assets/layout-safety.js?v=20260728-1"'
    require_tokens(index, (contact_style, safety_style, contact_script, safety_script), "index.html")
    if index.index(safety_style) < index.index(contact_style):
        raise AssertionError("The layout-safety stylesheet must load after all other component styles.")
    if index.index(safety_script) < index.index(contact_script):
        raise AssertionError("The layout-safety script must load after all other website scripts.")


def main() -> int:
    index = read(INDEX)
    service = read(SERVICE)
    style = read(STYLE)
    script = read(SCRIPT)
    site_script = read(SITE_SCRIPT)
    renderer = read(RENDERER)
    browser_audit = read(BROWSER_AUDIT)
    heading_audit = read(HEADING_AUDIT)
    site_quality = read(SITE_QUALITY)
    daily = read(DAILY_MAINTENANCE)

    validate_asset_order(index)

    require_tokens(
        index,
        (
            ".statsSec{overflow:visible}",
            ":where(.brand,h1,h2,h3){overflow-wrap:break-word;word-break:normal;hyphens:none}",
            ".profileGrid .sticky .title{font-size:clamp(2.55rem,3.5vw,3.75rem)}",
            ".contact .section-heading-enhanced h2{font-size:clamp(2.45rem,3.5vw,3.55rem)}",
        ),
        "index.html heading and snapshot polish",
    )

    require_tokens(
        style,
        (
            "overflow-x: clip",
            "grid-template-columns: repeat(7, minmax(0, 1fr));",
            "@media (max-width: 1180px)",
            "@media (max-width: 1040px)",
            "@media (max-width: 920px)",
            "@media (max-width: 760px)",
            "@media (max-width: 620px)",
            "@media (max-width: 440px)",
            ".layout-stack",
            "html.nav-layout-compact .links.open",
            "[data-layout-overflow=\"clip\"]",
            "@media (prefers-reduced-motion: reduce)",
        ),
        "assets/layout-safety.css",
    )

    require_tokens(
        script,
        (
            "window.__portfolioLayoutAudit",
            "navigation-collision",
            "hero-title-overflow",
            "statistics-content-overflow",
            "sibling-collision",
            "text-outside-viewport",
            "document-overflow-x",
            "layout-safety-ready",
        ),
        "assets/layout-safety.js",
    )

    require_tokens(
        site_script,
        (
            "const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;",
            "if (reduceMotion)",
            "const finalValue = `${target.toLocaleString()}${suffix}`;",
            "else element.textContent = finalValue;",
        ),
        "assets/site-2026.js reduced-motion statistics",
    )

    require_tokens(
        renderer,
        (
            "render_publications_section",
            "render_publication",
            "render_metrics",
            "visual-audit.html",
            "Unrendered Liquid syntax remains",
        ),
        "scripts/render_visual_audit.py",
    )

    require_tokens(
        browser_audit,
        (
            "playwright",
            "desktop-wide",
            "tablet-portrait",
            "mobile-minimum",
            "width: 320",
            "document-horizontal-overflow",
            "element-vertical-clipping",
            "sibling-overlap",
            "text-outside-viewport",
            "recognition-expanded",
            "mobile-menu-open",
            "visual-audit-report.json",
        ),
        "scripts/visual_layout_audit.mjs",
    )

    require_tokens(
        heading_audit,
        (
            "split-heading-word",
            "heading-hyphenation-enabled",
            "desktop-wide",
            "mobile-minimum",
            "width: 320",
            "visual-heading-audit-report.json",
        ),
        "scripts/visual_heading_audit.mjs",
    )

    require_tokens(
        site_quality,
        (
            "python scripts/validate_layout_safety.py",
            "playwright@1.52.0",
            "python scripts/render_visual_audit.py",
            "node scripts/visual_layout_audit.mjs",
            "node scripts/visual_heading_audit.mjs",
            "visual-layout-audit",
            "node --check assets/layout-safety.js",
            "node --check scripts/visual_layout_audit.mjs",
            "node --check scripts/visual_heading_audit.mjs",
        ),
        ".github/workflows/site-quality.yml",
    )

    require_tokens(
        daily,
        (
            "python scripts/validate_layout_safety.py",
            "node --check assets/layout-safety.js",
            "node --check scripts/visual_layout_audit.mjs",
            "node --check scripts/visual_heading_audit.mjs",
        ),
        ".github/workflows/update-publications.yml",
    )

    removed_contact_markers = (
        'class="contact-assurance"',
        "Submitted from this page",
        "Reply-ready",
        "Uses the email you provide",
        "Spam and abuse safeguards",
    )
    remaining_contact_markers = [marker for marker in removed_contact_markers if marker in service]
    if remaining_contact_markers:
        raise AssertionError(f"Removed contact elements returned: {remaining_contact_markers}")

    public_source = f"{index}\n{service}".casefold()
    forbidden_authorship_markers = (
        "generated by ai",
        "created by ai",
        "written by ai",
        "designed by ai",
        "built with ai",
        "ai-powered website",
        "powered by chatgpt",
    )
    found = [marker for marker in forbidden_authorship_markers if marker in public_source]
    if found:
        raise AssertionError(f"Visitor-facing website-authorship markers remain: {found}")

    viewport_widths = [int(value) for value in re.findall(r"width:\s*(\d+)", browser_audit)]
    if not viewport_widths or min(viewport_widths) > 320 or max(viewport_widths) < 1600:
        raise AssertionError("The browser audit does not cover the full 320–1600 px viewport range.")

    print("Final layout-safety validation passed.")
    print("- Responsive hardening: connected last")
    print("- Browser viewport coverage: 320–1600 px")
    print("- Horizontal overflow, clipping, and sibling overlap checks: configured")
    print("- Major-heading word integrity: browser-audited")
    print("- Reduced-motion statistics: immediate and exact")
    print("- Mobile navigation and expanded-recognition states: covered")
    print("- Removed contact elements and website-authorship markers: absent")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, OSError) as error:
        print(f"Final layout-safety validation failed: {error}", file=sys.stderr)
        raise SystemExit(1)
