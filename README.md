# School Education Pulse

**Live site:** https://ghimanshi12-stack.github.io/school-education-bulletin/

A daily bulletin of school education updates from India and the world. It has four sections:

1. **Central Government**: official updates only, published on government websites: PIB press releases, and Ministry of Education, NCERT, CBSE, NIOS, KVS/NVS and Parliament reports, bulletins and notices. Media coverage of these goes under News & Opinion.
2. **News & Opinion**: pieces from national newspapers and media only (list in `config/sources.json`, `nationalNews`): national reporting (including coverage of government announcements), editorials and opinion pieces on school education in India.
3. **Research & Reports**: reports, studies, surveys and policy briefs by researchers and think tanks on Indian school education.
4. **Global**: international policy and research, including UNESCO, World Bank, OECD, UNICEF, cross-country studies and other countries' national policies.

Stories mainly about a single state or UT are left out on purpose. The bulletin focuses on national and international developments.

Each update is tagged with themes so readers can filter: Early Childhood Education, FLN, Technology & AI, Secondary Education, Assessments, Teachers, Curriculum & Languages, Equity & Inclusion, School Infrastructure, Vocational & Skills, Budgets & Financing, and Governance & Policy. Each card also has a 3–4 sentence summary of what the piece actually says (its key facts, findings or argument), written from the article text, and a link to the original.

## How the daily update works

Five times a day, at **6 AM, 10 AM, 2 PM, 6 PM and 10 PM IST**, a Claude cloud routine (running on Anthropic's servers, so no laptop needs to be on) does the following:

1. **Collects** new items from the feeds in `config/sources.json` (`scripts/fetch.py`).
2. **Tags and summarises** each item following the rules in `TAGGING.md`, using the existing Claude plan.
3. **Merges** the results into `data/items.json` (`scripts/merge.py`).
4. **Publishes** the update to GitHub, and the website refreshes within a few minutes.

Items that couldn't be finished in one run wait in `data/pending.json` and are picked up the next day. The routine can be paused, run on demand or edited at https://claude.ai/code/routines.

The older Windows PowerShell versions of the scripts (`*.ps1`) still work on the original laptop as a backup.

## Common changes

You can ask Claude to make any of these, or edit the files yourself.

| I want to… | Edit |
|---|---|
| Add or remove a news source | `config/sources.json`: add an entry to `sources`. Use `"type": "rss"` with a feed `url`, or `"type": "gnews"` with a Google News search `query` (for example `site:example.org education`). |
| Change how a theme is defined | The theme table in `TAGGING.md` |
| Add a new theme | `TAGGING.md` (theme table), `scripts/merge.py` (`VALID_THEMES`), `assets/app.js` (`THEMES`) and an icon in `assets/icons.js` |
| Change the tone or length of summaries | The "Blurb" section of `TAGGING.md` |

## Preview on this computer

```bash
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Then open http://localhost:8080.

## Files

```
index.html, assets/        the website
config/sources.json        the feeds to collect from
TAGGING.md                 rules Claude follows to tag and summarise
scripts/fetch.py           collect new items  -> data/pending.json
scripts/split.py           split into batches -> data/work/
scripts/merge.py           merge tagged items -> data/items.json
scripts/*.ps1              Windows versions of the same (laptop backup)
data/pending.json          items waiting to be tagged
data/items.json            everything shown on the site (last 365 days)
data/seen.json             items already processed (so nothing repeats)
```
