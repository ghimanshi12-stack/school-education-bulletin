#!/usr/bin/env python3
"""
Collects new school-education items from the feeds in config/sources.json and
writes them to data/pending.json for Claude to tag and summarise.

Items still waiting from earlier runs are kept (and their links/text retried),
and published items whose link still points at Google News are retried too.

Usage:  python3 scripts/fetch.py [--days 1] [--limit 0] [--repair] [--max-minutes 9]
--days 7 is used for a backfill run. --repair skips the feeds and only retries.
"""
import argparse
import concurrent.futures as cf
import hashlib
import html
import json
import random
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"

# Broad filter so obviously unrelated items (sports, markets...) are skipped before tagging.
EDU_PATTERN = re.compile(
    r"school|education|student|teacher|pupil|class \d|classroom|exam|board|curriculum|syllabus|textbook|"
    r"literacy|numeracy|learning|anganwadi|pre-?school|kindergarten|early childhood|ncert|cbse|scert|samagra|"
    r"nipun|pm shri|nep|udise|parakh|scholarship|midday|mid-day|poshan|edtech|unesco|unicef|pisa", re.I)


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return default


def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_title(t):
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", t.lower())).strip()


def item_id(title):
    # Same scheme as the original PowerShell script, so data/seen.json stays compatible.
    return hashlib.sha1(normalize_title(title).encode("utf-8")).hexdigest()[:12]


def strip_html(s):
    if not s:
        return ""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def http_get(url, timeout=20):
    return http_get_bytes(url, timeout).decode("utf-8", errors="replace")


def http_get_bytes(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def http_post(url, data, timeout=20):
    req = urllib.request.Request(url, data=data.encode("utf-8"), headers={
        "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", errors="replace")


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def feed_items(xml_text):
    """Yields (title, link, pubdate, description, source) from RSS or Atom."""
    root = ET.fromstring(xml_text.lstrip("﻿ \t\r\n"))  # some feeds start with blank lines
    atom = "{http://www.w3.org/2005/Atom}"
    for it in root.iter("item"):
        link = (it.findtext("link") or "").strip()
        src = it.find("source")
        yield ((it.findtext("title") or "").strip(), link, it.findtext("pubDate"),
               it.findtext("description") or "", (src.text or "").strip() if src is not None else "")
    for it in root.iter(atom + "entry"):
        link_el = it.find(atom + "link")
        yield ((it.findtext(atom + "title") or "").strip(), link_el.get("href", "") if link_el is not None else "",
               it.findtext(atom + "updated") or it.findtext(atom + "published"),
               it.findtext(atom + "summary") or "", "")


def wp_documents(base, cutoff):
    """Latest documents (press releases, notices, reports) from a Ministry of Education WordPress site.
    Yields the same tuples as feed_items."""
    api = base.rstrip("/") + "/cms/wp-json/wp/v2/"
    cats = {c["id"]: c for c in json.loads(http_get(api + "documents_category?per_page=100&_fields=id,slug,parent", 40))}
    rows = json.loads(http_get(api + "documents?per_page=25&orderby=date&_fields=date_gmt,slug,title,documents_category", 40))
    for r in rows:
        top = next((cats[c]["slug"] for c in r.get("documents_category", []) if c in cats and not cats[c]["parent"]), "")
        if not top:
            continue
        link = f"{base.rstrip('/')}/documents/{top}/{r['slug']}"
        yield html.unescape(r["title"]["rendered"]), link, r["date_gmt"] + "Z", "", base.split("//")[1]


def parse_date(s):
    if not s:
        return None
    try:
        return parsedate_to_datetime(s).astimezone(timezone.utc)
    except (TypeError, ValueError):
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
        except ValueError:
            return None


def resolve_google(url):
    """Turns a news.google.com/rss/articles/... link into the original article address."""
    for attempt in range(1, 4):
        # Space requests out so Google doesn't block the run ("Too Many Requests").
        time.sleep(random.uniform(0.8, 2.0) + (10 * attempt if attempt > 1 else 0))
        try:
            gid = url.split("/articles/")[1].split("?")[0]
            page = http_get(f"https://news.google.com/rss/articles/{gid}")
            sg = re.search(r'data-n-a-sg="([^"]+)"', page)
            ts = re.search(r'data-n-a-ts="([^"]+)"', page)
            if not (sg and ts):
                continue
            inner = ('["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,null,null,null,null,null,0,1],'
                     '"X","X",1,[1,1,1],1,1,null,0,0,null,0],"' + gid + '",' + ts.group(1) + ',"' + sg.group(1) + '"]')
            freq = json.dumps([[["Fbv4je", inner, None, "generic"]]])
            resp = http_post("https://news.google.com/_/DotsSplashUi/data/batchexecute",
                             "f.req=" + urllib.parse.quote(freq))
            m = re.search(r'garturlres\\",\\"(.+?)\\"', resp)
            if m:
                return json.loads('"' + m.group(1).replace('\\\\', '\\') + '"')
        except Exception:
            pass
    return url


def article_snippet(url):
    page = http_get(url)
    page = re.sub(r"<(script|style|noscript)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    parts = []
    for p in ('property="og:description"', 'name="description"', 'name="twitter:description"'):
        m = (re.search(r'<meta[^>]+' + p + r'[^>]+content="([^"]*)"', page, re.I) or
             re.search(r'<meta[^>]+content="([^"]*)"[^>]+' + p, page, re.I))
        if m and len(m.group(1)) > 40:
            parts.append(m.group(1))
            break
    for pm in re.finditer(r"<p[^>]*>(.*?)</p>", page, re.S | re.I):
        t = strip_html(pm.group(1))
        if len(t) > 80:
            parts.append(t)
        if len(" ".join(parts)) > 1200:
            break
    return strip_html(" ".join(parts))


TEXT_CHARS = 5000
BOILERPLATE = re.compile(r"cookie|subscribe|newsletter|sign up|all rights reserved|follow us|download the app|"
                         r"advertisement|also read|read more|click here|copyright", re.I)


def article_text(url):
    """Main body text of an article (or a PDF report), so the summary can cover what it actually says."""
    if re.search(r"\.pdf($|\?)", url, re.I):
        if not shutil.which("pdftotext"):
            return ""
        with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
            f.write(http_get_bytes(url, timeout=40))
            f.flush()
            out = subprocess.run(["pdftotext", "-l", "6", "-q", f.name, "-"], capture_output=True, timeout=60)
        return re.sub(r"\s+", " ", out.stdout.decode("utf-8", errors="replace")).strip()[:TEXT_CHARS]
    page = http_get(url)
    page = re.sub(r"<(script|style|noscript|nav|header|footer|aside|figure)[^>]*>.*?</\1>", " ", page, flags=re.S | re.I)
    m = re.search(r"<article[^>]*>(.*)</article>", page, re.S | re.I)
    body = m.group(1) if m and len(m.group(1)) > 2000 else page
    parts, seen_p = [], set()
    for pm in re.finditer(r"<(p|li|h2|h3)[^>]*>(.*?)</\1>", body, re.S | re.I):
        t = strip_html(pm.group(2))
        if len(t) < 60 or t in seen_p or BOILERPLATE.search(t[:120]):
            continue
        seen_p.add(t)
        parts.append(t)
        if sum(len(x) for x in parts) > TEXT_CHARS:
            break
    return " ".join(parts)[:TEXT_CHARS]


def process(item):
    """Resolves the link, fills in a short snippet if missing, and pulls the article text."""
    url = item["url"]
    if "news.google.com/rss/articles/" in url:
        url = resolve_google(url)
    snippet = item.get("snippet") or ""
    if "news.google.com" not in url and not re.search(r"\.pdf($|\?)", url, re.I) and len(snippet) < 120:
        try:
            s = article_snippet(url)
            if len(s) > len(snippet):
                snippet = s
        except Exception:
            pass
    if "news.google.com" not in url and not item.get("isPublished") and len(item.get("text") or "") < 300:
        try:
            item["text"] = article_text(url)
        except Exception:
            pass
    item["url"] = url
    item["snippet"] = snippet[:1200]
    return item


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--repair", action="store_true")
    ap.add_argument("--max-minutes", type=float, default=9, help="stop resolving links after this long; the rest wait for tomorrow")
    args = ap.parse_args()

    cfg = read_json(ROOT / "config" / "sources.json", {})
    seen = set(read_json(DATA / "seen.json", []))
    per_feed = cfg.get("maxPerFeedBackfill" if args.days > 1 else "maxPerFeedDaily", 12)
    now = datetime.now(timezone.utc)

    candidates = {}
    # Items still waiting from an earlier run are kept, and their links/text are retried if missing.
    pending_all = read_json(DATA / "pending.json", [])
    for p in pending_all:
        seen.add(p["id"])
        if "news.google.com" in p["url"] or not p.get("snippet") or len(p.get("text") or "") < 300:
            candidates[p["id"]] = p
    if pending_all:
        print(f"Carrying over {len(pending_all)} waiting items ({len(candidates)} to retry)")

    # Published items whose link still points at Google News are hidden on the site; retry them too.
    items_path = DATA / "items.json"
    pub_items = read_json(items_path, [])
    pub_retry = {p["id"]: p for p in pub_items if "news.google.com" in p.get("url", "")}
    for pid, p in pub_retry.items():
        # A long placeholder snippet means only the link is resolved; the summary is already written.
        candidates["pub:" + pid] = {"id": pid, "url": p["url"], "snippet": "-" * 130, "isPublished": True}
    if pub_retry:
        print(f"Retrying {len(pub_retry)} unresolved links on published items")

    feeds = []
    if not args.repair:
        for s in cfg.get("sources", []):
            win = max(args.days, int(s.get("windowDays", 0) or 0))
            if s["type"] in ("rss", "wpdocs"):
                url = s["url"]
            else:
                q = urllib.parse.quote(f'{s["query"]} when:{win}d')
                url = (f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en" if s.get("intl")
                       else f"https://news.google.com/rss/search?q={q}&hl=en-IN&gl=IN&ceid=IN:en")
            feeds.append({"name": s["name"], "section": s["section"], "url": url, "eduOnly": bool(s.get("eduOnly")),
                          "type": s["type"], "source": s.get("source"),
                          "cutoff": now - timedelta(days=win, hours=6)})

    print(f"Reading {len(feeds)} feeds (window: {args.days} day(s))...")
    errors = 0
    new_ids = set()
    for f in feeds:
        try:
            if f["type"] == "wpdocs":
                entries = list(wp_documents(f["url"], f["cutoff"]))
            else:
                entries = list(feed_items(http_get(f["url"], timeout=30)))
        except Exception as e:
            errors += 1
            print(f"  ! {f['name']}: {e}")
            continue
        count = 0
        for title, link, pub, desc, src in entries:
            if count >= per_feed:
                break
            src = f.get("source") or src or f["name"].split(" – ")[0]
            if src and title.endswith(" - " + src):
                title = title[: -len(src) - 3]
            title = strip_html(title)
            published = parse_date(pub)
            if published and published < f["cutoff"]:
                continue
            # Education-only organisations skip the keyword filter (their report titles rarely say "school").
            if not (f["eduOnly"] or EDU_PATTERN.search(title)) or not re.match(r"^https?://", link or ""):
                continue
            iid = item_id(title)
            if iid in seen or iid in candidates:
                continue
            candidates[iid] = {
                "id": iid, "title": title, "url": link.strip(), "source": src,
                "published": iso(published or now), "feed": f["name"], "sectionHint": f["section"],
                "snippet": "" if "news.google.com" in f["url"] else strip_html(desc),
            }
            new_ids.add(iid)
            count += 1
    print(f"Found {len(new_ids)} new candidate items ({errors} feed errors).")

    # Resolve links and pull snippets in parallel, within a time budget.
    to_process = list(candidates.values())
    if args.limit:
        to_process = to_process[: args.limit]
    deadline = time.monotonic() + args.max_minutes * 60
    results = {}
    started = time.monotonic()
    with cf.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {}
        for c in to_process:
            futures[pool.submit(lambda x: process(x) if time.monotonic() < deadline else x, c)] = c
        for i, fut in enumerate(cf.as_completed(futures), 1):
            c = futures[fut]
            try:
                r = fut.result()
            except Exception:
                r = c
            results[("pub:" if c.get("isPublished") else "") + c["id"]] = r
            if i % 50 == 0:
                print(f"  processed {i} / {len(to_process)} ({int(time.monotonic() - started)}s)")
    print(f"Resolved links and snippets in {int(time.monotonic() - started)}s")

    # Write repaired links back to published items.
    if pub_retry:
        fixed = 0
        for pid, p in pub_retry.items():
            r = results.get("pub:" + pid)
            if r and "news.google.com" not in r["url"]:
                p["url"] = r["url"]
                fixed += 1
        write_json(items_path, pub_items)
        print(f"Repaired {fixed} of {len(pub_retry)} published links")

    # Waiting items go back in place (retried ones updated), followed by new ones; drop duplicate URLs.
    final, by_url = [], set()
    ordered = [results.get(p["id"], p) for p in pending_all] + \
              [results.get(i, candidates[i]) for i in candidates if i in new_ids]
    for r in ordered:
        key = re.sub(r"[?#].*$", "", r["url"]).rstrip("/").lower()
        if key in by_url:
            continue
        by_url.add(key)
        final.append(r)

    DATA.mkdir(exist_ok=True)
    write_json(DATA / "pending.json", final)
    unresolved = sum(1 for r in final if "news.google.com" in r["url"])
    print(f"Links not yet resolved: {unresolved}")
    print(f"Wrote {len(final)} items to data/pending.json")


if __name__ == "__main__":
    main()
