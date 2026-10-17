#!/usr/bin/env python3
"""
Merges Claude's tagged batches (data/tagged/*.json) with data/pending.json into
data/items.json, which the website reads. Tagged entries for items already in the
bulletin (re-checks) can drop them or update their section, themes and priority.
Global is capped at the 10 highest-priority items per day (IST).

Usage:  python3 scripts/merge.py
"""
import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
IST = timezone(timedelta(hours=5, minutes=30))

VALID_SECTIONS = {"govt", "news", "research", "global"}
VALID_THEMES = ["ece", "fln", "tech_ai", "secondary", "assessment", "budget", "governance",
                "teachers", "curriculum", "equity", "infrastructure", "vocational"]
FIELDS = ["id", "title", "url", "source", "published", "section", "themes", "type", "priority", "blurb", "added"]
GLOBAL_PER_DAY = 10

# Central Government only carries items published on official Union government websites
# (PIB, Ministry of Education, NCERT, CBSE, Parliament ...). Newspaper and broadcaster
# coverage of an announcement goes to News & Opinion instead.
OFFICIAL_SUFFIXES = (".gov.in", ".nic.in", "sansad.in", "nios.ac.in", "mygov.in")
NOT_OFFICIAL = ("ddnews.gov.in", "newsonair.gov.in", "prasarbharati.gov.in")


# City and regional editions of national papers (e.g. TOI /city/, HT /cities/, Tribune /news/amritsar/).
REGIONAL_PATH = re.compile(
    r"/(city|cities|local|states|southern-states|northern-states)/|thehindu\.com/news/national/[a-z-]+/|"
    r"tribuneindia\.com/news/(?!india|nation|opinion|editorials|comment|features|business|world|education|schools|health|science)[a-z-]+/",
    re.I)


def host_of(url):
    return urlparse(url or "").netloc.lower().split(":")[0]


def on_domain(host, domains):
    return any(host == d or host.endswith("." + d) for d in domains)


def is_national_news(url, outlets):
    return on_domain(host_of(url), outlets) and not REGIONAL_PATH.search(url or "")


def is_official(url):
    host = urlparse(url or "").netloc.lower().split(":")[0]
    if any(host == d or host.endswith("." + d) for d in NOT_OFFICIAL):
        return False
    return any(host == s.lstrip(".") or host.endswith(s if s.startswith(".") else "." + s) for s in OFFICIAL_SUFFIXES)


def read_json(path, default):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8-sig"))
    except FileNotFoundError:
        return default


def write_json(path, obj, compact=False):
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":")) if compact else json.dumps(obj, ensure_ascii=False, indent=2)
    Path(path).write_text(text, encoding="utf-8")


def clean_themes(themes):
    out = []
    for t in themes or []:
        if t in VALID_THEMES and t not in out:
            out.append(t)
    return out


def utc_now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    pending = {p["id"]: p for p in read_json(DATA / "pending.json", [])}
    tagged = {}
    tagged_dir = DATA / "tagged"
    for f in sorted(tagged_dir.glob("*.json")) if tagged_dir.exists() else []:
        for t in read_json(f, []):
            if isinstance(t, dict) and t.get("id"):
                tagged[t["id"]] = t

    items = read_json(DATA / "items.json", [])
    by_id = {i["id"]: i for i in items}
    seen = set(read_json(DATA / "seen.json", []))

    added = dropped = untagged = 0
    for pid, p in pending.items():
        t = tagged.get(pid)
        if t is None:
            untagged += 1          # stays pending for next run
            continue
        seen.add(pid)
        if not t.get("keep"):
            dropped += 1
            continue
        if pid in by_id:
            continue
        item = {
            "id": pid, "title": p["title"], "url": p["url"], "source": p.get("source"), "published": p["published"],
            "section": t["section"] if t.get("section") in VALID_SECTIONS else p.get("sectionHint"),
            "themes": clean_themes(t.get("themes")), "type": t.get("type"),
            "priority": int(t.get("priority") or 3), "blurb": t.get("blurb"), "added": utc_now(),
        }
        items.append(item)
        by_id[pid] = item
        added += 1

    # Re-check results for items already in the bulletin: drop or re-file them.
    removed = 0
    for tid, t in tagged.items():
        if tid in pending or tid not in by_id:
            continue
        it = by_id[tid]
        if not t.get("keep"):
            items.remove(it)
            del by_id[tid]
            removed += 1
            continue
        if t.get("section") in VALID_SECTIONS:
            it["section"] = t["section"]
        if t.get("priority"):
            it["priority"] = int(t["priority"])
        if t.get("themes") is not None:
            it["themes"] = clean_themes(t["themes"])

    # Central Government is official sources only; everything else there moves to News.
    refiled = 0
    for it in items:
        if it.get("section") == "govt" and not is_official(it.get("url")):
            it["section"] = "news"
            refiled += 1

    # News & Opinion is national outlets only (config/sources.json "nationalNews"); regional pieces are dropped.
    outlets = read_json(ROOT / "config" / "sources.json", {}).get("nationalNews") or []
    not_national = 0
    if outlets:
        for it in [i for i in items if i.get("section") == "news" and not is_national_news(i.get("url"), outlets)]:
            items.remove(it)
            seen.add(it["id"])
            not_national += 1

    # Global is capped per IST day so India sections aren't crowded out.
    capped = 0
    days = {}
    for it in items:
        if it.get("section") == "global":
            day = datetime.fromisoformat(it["published"].replace("Z", "+00:00")).astimezone(IST).date()
            days.setdefault(day, []).append(it)
    for group in days.values():
        group.sort(key=lambda x: (int(x.get("priority") or 3), x["published"]), reverse=True)
        for extra in group[GLOBAL_PER_DAY:]:
            items.remove(extra)
            seen.add(extra["id"])
            capped += 1

    # Newest first; keep the archive to the most recent 365 days.
    keep_after = (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ")
    items = [{k: i.get(k) for k in FIELDS} for i in items if i["published"] >= keep_after]
    items.sort(key=lambda x: x["published"], reverse=True)

    write_json(DATA / "items.json", items, compact=True)
    write_json(DATA / "seen.json", sorted(seen), compact=True)
    write_json(DATA / "meta.json", {"lastUpdated": utc_now(), "total": len(items), "addedLastRun": added})

    # Leave untagged items in pending so the next run picks them up.
    write_json(DATA / "pending.json", [p for pid, p in pending.items() if pid not in tagged])
    for f in tagged_dir.glob("*.json") if tagged_dir.exists() else []:
        f.unlink()

    print(f"Added {added}, dropped {dropped}, removed on re-check {removed}, govt re-filed to news {refiled}, non-national news dropped {not_national}, global over daily cap {capped}, "
          f"still untagged {untagged}. Total in bulletin: {len(items)}.")


if __name__ == "__main__":
    main()
