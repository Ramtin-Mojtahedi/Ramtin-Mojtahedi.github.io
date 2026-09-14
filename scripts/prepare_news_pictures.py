#!/usr/bin/env python3
"""Apply reviewed public news and picture support on the preparation branch.

The fixed additions were checked against the linked public sources. This is
not a LinkedIn scraper. It preserves publications and all earlier news records.
Images are the author's existing portrait or previews of the author's papers.
"""
from __future__ import annotations
import datetime as dt
import hashlib
import html
import io
import json
import re
from pathlib import Path
from urllib.parse import urlparse, urljoin
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
TODAY = dt.datetime.now(ZoneInfo("America/Toronto")).date().isoformat()
BASE = "https://ramtin-mojtahedi.github.io"
PORTRAIT = {"src": "/assets/ramtin-graduation.svg", "alt": "Portfolio portrait of Ramtin Mojtahedi", "credit": "Author portrait from this portfolio", "source_url": BASE + "/about/", "kind": "author-portrait"}
ARXIV_FIG = "https://arxiv.org/html/2609.11703v1/figure1.png"
ARXIV_PAGE = "https://arxiv.org/html/2609.11703v1#S2.F1"
NATURE_PAGE = "https://www.nature.com/articles/s41598-026-60860-9"
UMB_PAGE = "https://www.umbjournal.org/article/S0301-5629(26)00197-3/fulltext"
ALLOWED_HOSTS = {"arxiv.org", "www.nature.com", "nature.com", "media.springernature.com", "static-content.springer-cdn.com", "www.umbjournal.org", "umbjournal.org", "ars.els-cdn.com"}


def download(url: str, limit: int = 12000000) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_HOSTS or parsed.username or parsed.password:
        raise ValueError("Image download host is not approved")
    with urlopen(Request(url, headers={"User-Agent": "PortfolioImagePreview/1.0"}), timeout=25) as response:
        if urlparse(response.url).hostname not in ALLOWED_HOSTS:
            raise ValueError("Unexpected download redirect")
        data = response.read(limit + 1)
        if len(data) > limit:
            raise ValueError("Source exceeds size limit")
        return data


def save_picture(url: str, stem: str, alt: str, credit: str, source: str, license_url: str = "") -> dict:
    data = download(url)
    with Image.open(io.BytesIO(data)) as image:
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        width, height = image.size
        if width < 300 or height < 100 or width * height > 80000000:
            raise ValueError(f"Unexpected image dimensions: {width}x{height}; {len(data)} bytes")
        fmt = image.format
    suffix = {"PNG": "png", "JPEG": "jpg", "WEBP": "webp"}.get(fmt)
    if not suffix:
        raise ValueError("Only static raster previews are accepted")
    path = ROOT / "assets" / "news" / f"{stem}.{suffix}"
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(data)  # Preserve the complete original; no cropping or adaptation.
    return {"src": "/" + str(path.relative_to(ROOT)), "alt": alt, "credit": credit,
            "source_url": source, "original_url": url, "license_url": license_url,
            "width": width, "height": height, "sha256": hashlib.sha256(data).hexdigest(),
            "kind": "paper-preview"}


def publisher_preview(page: str, required_token: str, stem: str, credit: str, license_url: str = "") -> dict:
    # Only accept a paper-specific image URL, never a generic publisher logo.
    from html.parser import HTMLParser
    class PreviewParser(HTMLParser):
        def __init__(self):
            super().__init__(); self.images = []
        def handle_starttag(self, tag, attrs):
            attrs = dict(attrs)
            if tag == "meta" and attrs.get("property", attrs.get("name")) in {"og:image", "twitter:image"}:
                self.images.append(attrs.get("content", ""))
            if tag == "img":
                self.images.append(attrs.get("src", ""))
    parser = PreviewParser()
    parser.feed(download(page, 4000000).decode("utf-8", errors="replace"))
    candidates = list(dict.fromkeys(urljoin(page, value) for value in parser.images if required_token.casefold() in value.casefold()))
    for candidate in candidates:
        try:
            return save_picture(candidate, stem, "Preview image from the linked research article", credit, page, license_url)
        except Exception as error:
            print(f"Preview rejected for {stem}: {type(error).__name__}")
    raise ValueError("No verified paper-specific preview image was available")


def patch(path: str, old: str, new: str) -> None:
    file = ROOT / path
    text = file.read_text(encoding="utf-8")
    if new in text:
        return
    if text.count(old) != 1:
        raise ValueError(f"Expected exactly one patch anchor in {path}: {old[:100]}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


def esc(value) -> str:
    return html.escape(str(value or ""), quote=True)


def link(url: str, text: str) -> str:
    if not (url.startswith("https://") or (url.startswith("/") and not url.startswith("//"))):
        raise ValueError("Unsafe news link")
    extra = ' target="_blank" rel="noopener noreferrer"' if url.startswith("https://") else ""
    return f'<a href="{esc(url)}"{extra}>{esc(text)}</a>'


def picture_html(image: dict) -> str:
    credit = link(image["source_url"], image["credit"])
    if image.get("license_url"):
        credit += " · " + link(image["license_url"], "Licence")
    return (f'<figure class="news-picture"><a class="news-picture-link" href="{esc(image["source_url"])}" target="_blank" rel="noopener noreferrer" aria-label="Open image source">'
            f'<img src="{esc(image["src"])}" alt="{esc(image["alt"])}" width="640" height="440" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>'
            f'<figcaption>{credit}</figcaption></figure>')


def render_static_news(feed: dict) -> None:
    active = sorted((item for item in feed["items"] if not item.get("archived")), key=lambda x: x.get("date") or x.get("publication_month") or "", reverse=True)[:12]
    cards = []
    for item in active:
        stamp = f'<time datetime="{esc(item["date"])}">{esc(item["date_label"])}</time>' if item.get("date") else f'<span>{esc(item["date_label"])}</span>'
        content = f'<div class="news-card-body"><div class="news-meta"><span class="news-category">{esc(item["category"])}</span>{stamp}</div><h3>{esc(item["title"])}</h3><p>{esc(item["summary"])}</p>'
        content += '<div class="news-card-links">' + " ".join(link(value["url"], value["label"] + " ↗") for value in item["links"]) + '</div></div>'
        cards.append(f'<article class="news-card news-has-image" data-news-id="{esc(item["id"])}">{picture_html(item["image"])}{content}</article>')
    block = ('<!-- verified-news:start -->\n<section id="news" class="surface news-section" aria-labelledby="news-title"><div class="wrap"><div class="news-heading"><div><p class="kicker">Latest news</p><h2 id="news-title">Research &amp; community updates.</h2></div>'
             + '<a class="news-linkedin" href="https://www.linkedin.com/in/ramtin-mojtahedi/recent-activity/all/" target="_blank" rel="noopener noreferrer">Latest on LinkedIn ↗</a></div><div class="news-grid">'
             + ''.join(cards) + '</div><p class="news-updated">Selected public updates · Updated '
             + f'<time datetime="{TODAY}">{TODAY}</time></p></div></section>\n<!-- verified-news:end -->')
    file = ROOT / "_includes/site-part-1.html"
    source = file.read_text(encoding="utf-8")
    updated, number = re.subn(r"<!-- verified-news:start -->.*?<!-- verified-news:end -->", lambda _: block, source, flags=re.S)
    if number != 1:
        raise ValueError("Expected exactly one static news block")
    file.write_text(updated, encoding="utf-8")


def main() -> None:
    file = ROOT / "_data/news.json"
    feed = json.loads(file.read_text(encoding="utf-8"))
    known = {item["id"]: item for item in feed["items"]}
    additions = [
      {"id": "pycad-spectral-adapters-coverage-20260911", "date": "2026-09-11", "date_label": "11 September 2026", "category": "Research coverage", "featured": False,
       "title": "Our spectral-adapter research featured by PYCAD",
       "summary": "PYCAD covered our new DiSECT and SiGA preprint, discussing spectral adaptation of Segment Anything for colorectal liver metastasis segmentation. This is research coverage, not a clinical product announcement.",
       "source_url": "https://pycad.co/blog/point-box-colorectal-liver-met-overlay-ct/", "last_verified": TODAY,
       "links": [{"label": "Read the coverage", "url": "https://pycad.co/blog/point-box-colorectal-liver-met-overlay-ct/"}, {"label": "Original preprint", "url": "https://arxiv.org/abs/2609.11703"}]},
      {"id": "carotid-plaque-september-issue-2026", "date": None, "publication_month": "2026-09", "date_label": "September 2026 issue", "category": "Journal issue", "featured": False,
       "title": "Carotid radiomics study in the September issue",
       "summary": "Our co-first-author study appears in Ultrasound in Medicine & Biology, volume 52, issue 9, pages 1890–1899. The work combines carotid plaque radiomic features with machine learning for cardiovascular risk prediction.",
       "source_url": UMB_PAGE, "last_verified": TODAY,
       "note": "September is the journal issue month; the article was first available online on 12 June 2026. No exact September publication day is asserted.",
       "links": [{"label": "Journal article", "url": "https://doi.org/10.1016/j.ultrasmedbio.2026.05.006"}]}]
    for item in additions:
        if item["id"] not in known:
            feed["items"].append(item); known[item["id"]] = item
    # Keep the dated 2025 interview in the feed history, not in latest-news rotation.
    old = known.get("grad-chat-linkedin-highlight")
    if old:
        old["archived"] = True
        old["archive_reason"] = "The reshare date is unverified; the original episode is from 2025."
    for item in feed["items"]:
        item.setdefault("image", dict(PORTRAIT))
    known["spectral-adapters-preprint-2026"]["summary"] = "Our DiSECT and SiGA adapters adapt Segment Anything for colorectal liver metastasis segmentation. In the 91-case held-out, no-prompt evaluation, SiGA achieved 0.76 Dice on tumour-positive CT slices. Preprint; not peer reviewed."
    spectral = save_picture(ARXIV_FIG, "spectral-adapters-pipeline", "Published diagram showing CT images, SAM encoders, adapters and tumour segmentation masks", "Mojtahedi et al. · Preprint figure 1", ARXIV_PAGE)
    known["spectral-adapters-preprint-2026"]["image"] = spectral
    for identifier, page, token, stem, credit, license_url in [
      ("scientific-reports-multimodal-2026", NATURE_PAGE, "60860", "multimodal-risk-preview", "Kobayashi, Mojtahedi et al. · Article image", "https://creativecommons.org/licenses/by-nc-nd/4.0/"),
      ("carotid-plaque-september-issue-2026", UMB_PAGE, "00197", "carotid-paper-preview", "Hu, Mojtahedi et al. · Article preview", "")]:
        try:
            known[identifier]["image"] = publisher_preview(page, token, stem, credit, license_url)
        except Exception as error:
            print(f"{identifier}: using the existing author portrait; source preview unavailable ({type(error).__name__}).")
    feed["updated_at"] = TODAY
    feed["maintenance_note"] = "Latest verified public research updates. Personal LinkedIn posts remain inaccessible; no private or unverified post is represented as retrieved. The undated institutional reshare is retained as archived history."
    feed["items"].sort(key=lambda item: item.get("date") or item.get("publication_month") or "", reverse=True)
    assert len({item["id"] for item in feed["items"]}) == len(feed["items"])
    file.write_text(json.dumps(feed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    render_static_news(feed)
    patch("index.html", '  <link rel="stylesheet" href="assets/news-carousel.css?v=20260913-1">', '  <link rel="stylesheet" href="assets/news-carousel.css?v=20260913-1">\n  <link rel="stylesheet" href="assets/news-media.css?v=20260913-1">')
    patch("index.html", 'assets/news-carousel.js?v=20260913-1', 'assets/news-carousel.js?v=20260913-pictures-1')
    patch("assets/news-carousel.js", "    card.append(meta,make('h3','',excerpt(item.title,180)),make('p','',excerpt(item.summary,420)));", "    const body = make('div','news-card-body');\n    body.append(meta,make('h3','',excerpt(item.title,180)),make('p','',excerpt(item.summary,420)));")
    patch("assets/news-carousel.js", "    card.append(links);\n    return card;", """    body.append(links);
    const image = item.image && typeof item.image === 'object' ? item.image : {};
    const imageURL = safeURL(image.src) || new URL('/assets/ramtin-graduation.svg',location.origin).href;
    const sourceURL = safeURL(image.source_url) || new URL('/about/',location.origin).href;
    const figure = make('figure','news-picture');
    const imageLink = make('a','news-picture-link');
    imageLink.href = sourceURL;
    imageLink.target = '_blank'; imageLink.rel = 'noopener noreferrer';
    imageLink.setAttribute('aria-label','Open image source');
    const img = make('img');
    img.alt = excerpt(image.alt || 'Portfolio portrait of Ramtin Mojtahedi',240);
    img.width = 640; img.height = 440; img.decoding = 'async'; img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    const caption = make('figcaption');
    const credit = make('a','',excerpt(image.credit || 'Author portrait from this portfolio',120));
    credit.href = sourceURL; credit.target = '_blank'; credit.rel = 'noopener noreferrer';
    caption.append(credit);
    const licenceURL = safeURL(image.license_url);
    if (licenceURL) {
      const licence = make('a','','Licence');
      licence.href = licenceURL; licence.target = '_blank'; licence.rel = 'noopener noreferrer';
      caption.append(document.createTextNode(' · '),licence);
    }
    img.addEventListener('error',()=>{
      if (img.dataset.fallback) {
        figure.replaceChildren(make('span','news-picture-unavailable','Image unavailable'));
        return;
      }
      img.dataset.fallback = 'true';
      img.alt = 'Portfolio portrait of Ramtin Mojtahedi';
      imageLink.href = new URL('/about/',location.origin).href;
      caption.textContent = 'Author portrait · original image unavailable';
      img.src = '/assets/ramtin-graduation.svg';
    });
    img.src = imageURL;
    imageLink.append(img); figure.append(imageLink,caption);
    card.classList.add('news-has-image');
    card.append(figure,body);
    return card;""")
    patch("assets/news-carousel.js", "      if (!item || typeof item.id !== 'string'", "      if (!item || item.archived === true || typeof item.id !== 'string'")
    patch("assets/news-carousel.js", ").sort((a,b)=>String(b.date || '').localeCompare(String(a.date || ''))).slice(0,12);", ").sort((a,b)=>String(b.date || b.publication_month || '').localeCompare(String(a.date || a.publication_month || ''))).slice(0,12);")
    patch("assets/news-carousel.js", "    const preserved = cards.findIndex(card => card.dataset.newsId === oldId || card.querySelector('h3').textContent === oldTitle);", "    // Initial load starts at the newest dated item; later refreshes preserve reading.\n    const preserved = fingerprint ? cards.findIndex(card => card.dataset.newsId === oldId || card.querySelector('h3').textContent === oldTitle) : -1;")
    audit = ".github/workflows/news-carousel-audit.yml"
    patch(audit, "          const feed = JSON.parse(fs.readFileSync('_data/news.json','utf8'));", "          const feed = JSON.parse(fs.readFileSync('_data/news.json','utf8'));\n          const activeCount = feed.items.filter(item=>!item.archived).length;")
    # Existing checks remain, but expectations must scale with active news.
    path = ROOT / audit
    text = path.read_text(encoding="utf-8").replace('${feed.items.length}', '${activeCount}').replace("count(),feed.items.length", "count(),activeCount")
    text = text.replace("await updating.waitForFunction(()=>document.querySelectorAll('#news .news-card').length===4);", "await updating.waitForFunction(n=>document.querySelectorAll('#news .news-card').length===n,activeCount+1);")
    text = text.replace("                const initial=await current.locator('h3').textContent();", """                await current.locator('img').evaluate(img=>img.loading='eager');
                await page.waitForFunction(()=>{const img=document.querySelector('#news .news-current img');return img?.complete&&img.naturalWidth>0});
                assert.ok((await current.locator('img').getAttribute('alt')).length>10);
                const newest=feed.items.filter(item=>!item.archived).sort((a,b)=>String(b.date||b.publication_month||'').localeCompare(String(a.date||a.publication_month||'')))[0];
                assert.equal(await current.getAttribute('data-news-id'),newest.id);
                const initial=await current.locator('h3').textContent();""")
    text = text.replace("                await page.locator('#news').screenshot", """                for(let i=0;i<activeCount;i++) {
                  await current.locator('img').evaluate(img=>img.loading='eager');
                  await page.waitForFunction(()=>{const img=document.querySelector('#news .news-current img');return img?.complete&&img.naturalWidth>0});
                  await page.getByRole('button',{name:'Next news item',exact:true}).click();
                }
                await page.locator('#news').screenshot""", 1)
    path.write_text(text, encoding="utf-8")
    print(json.dumps({"active_news": [item["id"] for item in feed["items"] if not item.get("archived")], "images": {item["id"]: item["image"] for item in feed["items"]}}, indent=2))


if __name__ == "__main__":
    main()
