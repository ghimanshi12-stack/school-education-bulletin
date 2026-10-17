#!/usr/bin/env python3
"""
Splits data/pending.json into small input batches (data/work/in-NN.json) so Claude
can tag them one batch at a time. Each batch's output goes to
data/tagged/batch-NN.json (see TAGGING.md).

Usage:  python3 scripts/split.py [--size 40]
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--size", type=int, default=40)
    args = ap.parse_args()

    work, tagged = DATA / "work", DATA / "tagged"
    work.mkdir(parents=True, exist_ok=True)
    tagged.mkdir(parents=True, exist_ok=True)
    for f in work.glob("*.json"):
        f.unlink()

    pending = json.loads((DATA / "pending.json").read_text(encoding="utf-8-sig")) if (DATA / "pending.json").exists() else []
    keys = ("id", "title", "source", "sectionHint", "snippet")
    n = 0
    for i in range(0, len(pending), args.size):
        n += 1
        chunk = [{k: p.get(k) for k in keys} for p in pending[i:i + args.size]]
        (work / f"in-{n:02d}.json").write_text(json.dumps(chunk, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Split {len(pending)} items into {n} batches in data/work/")


if __name__ == "__main__":
    main()
