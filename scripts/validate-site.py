#!/usr/bin/env python3
"""Check published HTML copy, footer attribution, and external-link safety."""

from html.parser import HTMLParser
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlsplit

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://jjindsolutions.com/"
PUBLISHED_PRICE = re.compile(r"\$\s?\d")
HOUR_MINIMUM = re.compile(r"\b(?:four[\s-]hour|4[\s-]hour)\s+minimum\b|\bminimum billing\b", re.I)
CREDIT = "Website Designed and Managed by EaglePointPublishing.com"
PUBLISHER = "https://eaglepointpublishing.com/"
PAUSED_STATES = re.compile(r"\b(?:NV|WA|AZ|Nevada|Washington|Arizona)\b", re.I)
# Owner correction, October 15: these capabilities left with the former partner.
UNAVAILABLE_SERVICES = re.compile(r"\b(?:Timken|vibration\s+analysis|turbines?)\b", re.I)


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_footer = False
        self.footer_text = []
        self.footer_links = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == "footer":
            self.in_footer = True
        if tag == "a":
            link = dict(attrs)
            self.links.append(link)
            if self.in_footer:
                self.footer_links.append(link)

    def handle_endtag(self, tag):
        if tag == "footer":
            self.in_footer = False

    def handle_data(self, data):
        if self.in_footer:
            self.footer_text.append(data)


def validate(source):
    page = Page()
    page.feed(source)
    footer = " ".join("".join(page.footer_text).split())
    errors = []
    if CREDIT not in footer:
        errors.append("missing required visible footer credit")
    if not re.search(r"© \d{4} J&J Industrial Solutions · Twin Falls, Idaho", footer):
        errors.append("missing customer copyright/location footer")
    if not any(link.get("href") == PUBLISHER for link in page.footer_links):
        errors.append("missing exact publisher footer URL")
    for link in page.links:
        url = urlsplit(urljoin(SITE, link.get("href") or ""))
        if url.scheme in {"http", "https"} and url.hostname not in {"jjindsolutions.com", "www.jjindsolutions.com"}:
            rel = set((link.get("rel") or "").split())
            if link.get("target") != "_blank" or not {"noopener", "noreferrer"} <= rel:
                errors.append(f"unsafe external link: {link.get('href')}")
    if PAUSED_STATES.search(source):
        errors.append("paused-state reference remains")
    if "production build-out note" in source.lower():
        errors.append("internal production note remains")
    if UNAVAILABLE_SERVICES.search(source):
        errors.append("owner-removed service or qualification remains")
    if re.search(r"noindex|assets/preview\.(?:js|css)|REVIEW PREVIEW|data-preview-contact", source, re.I):
        errors.append("review-only content leaked into production")
    if PUBLISHED_PRICE.search(source):
        errors.append("published dollar amount remains")
    if HOUR_MINIMUM.search(source):
        errors.append("removed commercial term remains")
    return errors


def main():
    failures = []
    count = 0
    for path in sorted(ROOT.rglob("*.html")):
        if any(part.startswith(".") for part in path.relative_to(ROOT).parts):
            continue
        source = path.read_text()
        # Google's machine-readable ownership token is not a visitor-facing page.
        if re.fullmatch(r"google[0-9a-f]+\.html", path.name) and source.strip() == f"google-site-verification: {path.name}":
            continue
        count += 1
        failures.extend(f"{path.relative_to(ROOT)}: {error}" for error in validate(source))
    if not count:
        failures.append("no content pages found")
    chat = ROOT / "assets/sage-chat.js"
    if chat.is_file():
        chat_source = chat.read_text()
        if UNAVAILABLE_SERVICES.search(chat_source):
            failures.append("assets/sage-chat.js: owner-removed service or qualification remains")
        if PUBLISHED_PRICE.search(chat_source):
            failures.append("assets/sage-chat.js: published dollar amount remains")
        if HOUR_MINIMUM.search(chat_source):
            failures.append("assets/sage-chat.js: removed commercial term remains")
    for relative in ("robots.txt", "sitemap.xml", "CNAME"):
        path = ROOT / relative
        if not path.is_file():
            failures.append(f"{relative}: missing")
            continue
        text = path.read_text()
        if relative == "CNAME" and text.strip() != "jjindsolutions.com":
            failures.append(f"CNAME is {text.strip()!r}, expected jjindsolutions.com")
    if failures:
        print("\n".join(failures), file=sys.stderr)
        return 1
    print(f"Site checks passed: {count} content pages; footer, links, territory, current capabilities, production isolation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
