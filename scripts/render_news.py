#!/usr/bin/env python3
"""Render homepage news, JSON and RSS from reviewed _data/news.json records.

Discovery and source verification happen before this script. It never advances
checked_at or changes publication dates. Run --check to detect stale exports.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import json
import re
import xml.etree.ElementTree as ET
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://ramtin-mojtahedi.github.io"
ATOM = "http://www.w3.org/2005/Atom"
MEDIA = "http://search.yahoo.com/mrss/"
SY = "http://purl.org/rss/1.0/modules/syndication/"
for prefix, namespace in (("atom", ATOM), ("media", MEDIA), ("sy", SY)):
    ET.register_namespace(prefix, namespace)


def safe_url(value: str) -> str:
    if not isinstance(value, str) or any(ord(c) < 32 for c in value):
        raise ValueError("Invalid news URL")
    parsed = urlparse(value)
    if value.startswith("/") and not value.startswith("//") and not parsed.netloc:
        return value
    if parsed.scheme == "https" and parsed.hostname and not parsed.username and not parsed.password:
        return value
    raise ValueError(f"Unsafe news URL: {value}")


def pictures(item: dict) -> list[dict]:
    return item.get("images", [item["image"]] if item.get("image") else [])


def validate(feed: dict) -> list[dict]:
    updated = dt.date.fromisoformat(feed["updated_at"])
    checked = dt.datetime.fromisoformat(feed["checked_at"].replace("Z", "+00:00"))
    if checked.tzinfo is None or updated > checked.date():
        raise ValueError("News update/check dates are inconsistent")
    ids = set()
    for item in feed["items"]:
        if item["id"] in ids:
            raise ValueError("Duplicate news ID")
        ids.add(item["id"])
        for key in ("id", "title", "summary", "category", "date_label"):
            if not isinstance(item.get(key), str) or not item[key].strip():
                raise ValueError(f"Missing news field: {key}")
        if item.get("date") and dt.date.fromisoformat(item["date"]) > checked.date():
            raise ValueError("Future news date")
        safe_url(item["source_url"])
        for link in item.get("links", []):
            safe_url(link["url"])
        for image in pictures(item):
            safe_url(image["src"])
            safe_url(image["source_url"])
            if image.get("license_url"):
                safe_url(image["license_url"])
            if not image.get("alt"):
                raise ValueError("News image requires alternative text")
            if item.get("content_type") == "linkedin-post" and image.get("kind") != "original-post-media":
                raise ValueError("LinkedIn posts require original attached media")
    return sorted((i for i in feed["items"] if not i.get("archived")),
                  key=lambda i: i.get("date") or i.get("publication_month") or "", reverse=True)[:12]


def esc(value) -> str:
    return html.escape(str(value or ""), quote=True)


def link(url: str, label: str, css: str = "") -> str:
    safe_url(url)
    extra = ' target="_blank" rel="noopener noreferrer"' if url.startswith("https://") else ""
    return f'<a href="{esc(url)}" class="{css}"{extra}>{esc(label)}</a>'


def image_html(image: dict) -> str:
    credit = link(image["source_url"], image.get("credit", "Original image"))
    if image.get("license_url"):
        credit += " · " + link(image["license_url"], "Licence")
    return (f'<figure class="news-picture"><a class="news-picture-link" href="{esc(image["source_url"])}" target="_blank" rel="noopener noreferrer" aria-label="Open image source">'
            f'<img src="{esc(image["src"])}" alt="{esc(image["alt"])}" width="640" height="440" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>'
            f'<figcaption>{credit}</figcaption></figure>')


def display_date(value: str) -> str:
    date = dt.date.fromisoformat(value[:10])
    return f"{date.day} {date.strftime('%B %Y')}"


def news_html(feed: dict, active: list[dict]) -> str:
    cards = []
    for item in active:
        stamp = (f'<time datetime="{esc(item["date"])}">{esc(item["date_label"])}</time>'
                 if item.get("date") else f'<span>{esc(item["date_label"])}</span>')
        media = pictures(item)
        cls = "news-card" + (" news-featured" if item.get("featured") else "") + (" news-has-image" if media else "")
        text_cls = ' class="news-original-post"' if item.get("content_type") == "linkedin-post" else ""
        content = (f'<div class="news-card-body"><div class="news-meta"><span class="news-category">{esc(item["category"])}</span>{stamp}</div>'
                   f'<h3>{esc(item["title"])}</h3><p{text_cls}>{esc(item["summary"])}</p><div class="news-card-links">'
                   + " ".join(link(v["url"], v["label"] + " ↗") for v in item.get("links", [])) + '</div></div>')
        gallery = '<div class="news-pictures">' + ''.join(image_html(image) for image in media) + '</div>' if media else ""
        cards.append(f'<article class="{cls}" data-news-id="{esc(item["id"])}">{gallery}{content}</article>')
    return ('<!-- verified-news:start -->\n<section id="news" class="surface news-section" aria-labelledby="news-title"><div class="wrap"><div class="news-heading"><div><p class="kicker">Latest news</p><h2 id="news-title">Research &amp; community updates.</h2></div>'
            + link(feed["linkedin_activity"], "Latest on LinkedIn ↗", "news-linkedin") + '</div><div class="news-grid">'
            + ''.join(cards) + '</div><p class="news-updated">Updated ' + display_date(feed["updated_at"])
            + ' · Checked ' + display_date(feed["checked_at"]) + '</p></div></section>\n<!-- verified-news:end -->')


def rss_xml(feed: dict, active: list[dict]) -> str:
    root = ET.Element("rss", {"version": "2.0"})
    channel = ET.SubElement(root, "channel")
    def node(parent, tag, value):
        ET.SubElement(parent, tag).text = str(value)
    node(channel, "title", "Ramtin Mojtahedi — Research and community news")
    node(channel, "link", BASE + "/#news")
    node(channel, "description", "Verified research updates and original public LinkedIn posts from Ramtin Mojtahedi.")
    node(channel, "language", "en-ca")
    checked = dt.datetime.fromisoformat(feed["checked_at"].replace("Z", "+00:00"))
    node(channel, "lastBuildDate", format_datetime(checked))
    node(channel, "ttl", 1440)
    node(channel, f"{{{SY}}}updatePeriod", "daily")
    node(channel, f"{{{SY}}}updateFrequency", 1)
    ET.SubElement(channel, f"{{{ATOM}}}link", {"href": BASE + "/news.xml", "rel": "self", "type": "application/rss+xml"})
    for item in active:
        entry = ET.SubElement(channel, "item")
        for tag, value in (("title", item["title"]), ("link", item["source_url"]), ("description", item["summary"]), ("category", item["category"])):
            node(entry, tag, value)
        ET.SubElement(entry, "guid", {"isPermaLink": "false"}).text = "ramtin-news:" + item["id"]
        if item.get("date"):
            date = dt.datetime.combine(dt.date.fromisoformat(item["date"]), dt.time(), dt.timezone.utc)
            node(entry, "pubDate", format_datetime(date))
        for image in pictures(item):
            media = ET.SubElement(entry, f"{{{MEDIA}}}content", {"url": BASE + image["src"] if image["src"].startswith("/") else image["src"], "medium": "image"})
            node(media, f"{{{MEDIA}}}description", image["alt"])
            node(media, f"{{{MEDIA}}}credit", image.get("credit", "Original image"))
    ET.indent(root, space="  ")
    return '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding="unicode") + "\n"


def render(root: Path, check: bool = False) -> None:
    feed = json.loads((root / "_data/news.json").read_text(encoding="utf-8"))
    active = validate(feed)
    include = root / "_includes/site-part-1.html"
    source, count = re.subn(r"<!-- verified-news:start -->.*?<!-- verified-news:end -->", lambda _: news_html(feed, active), include.read_text(encoding="utf-8"), flags=re.S)
    if count != 1:
        raise ValueError("Expected exactly one homepage news block")
    public = {"schema_version": 1, **{key: feed[key] for key in ("updated_at", "checked_at", "linkedin_activity", "items")}}
    outputs = {include: source, root / "news.json": json.dumps(public, indent=2, ensure_ascii=False) + "\n", root / "news.xml": rss_xml(feed, active)}
    stale = [str(path.relative_to(root)) for path, value in outputs.items() if not path.exists() or path.read_text(encoding="utf-8") != value]
    if check and stale:
        raise ValueError("Stale news exports: " + ", ".join(stale))
    if not check:
        for path, value in outputs.items():
            path.write_text(value, encoding="utf-8")
    print(f"News {'checked' if check else 'rendered'}: {len(active)} active items; original publication dates preserved.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    render(ROOT, check=args.check)
