# School Education Pulse

**Live site:** https://ghimanshi12-stack.github.io/school-education-bulletin/

A daily bulletin of school education updates from India and the world. It has four sections:

1. **Central Government**: Ministry of Education, PIB, NCERT, CBSE, NIOS, KVS/NVS and Parliament.
2. **News & Opinion**: national reporting, editorials and opinion pieces on school education in India.
3. **Research & Reports**: reports, studies, surveys and policy briefs by researchers and think tanks on Indian school education.
4. **Global**: international policy and research, including UNESCO, World Bank, OECD, UNICEF, cross-country studies and other countries' national policies.

Stories mainly about a single state or UT are left out on purpose. The bulletin focuses on national and international developments.

Each update is tagged with themes so readers can filter: Early Childhood Education, FLN, Technology & AI, Secondary Education, Assessments, Teachers, Curriculum & Languages, Equity & Inclusion, School Infrastructure, Vocational & Skills, Budgets & Financing, and Governance & Policy. Each card also has a 2–3 line summary and a link to the original.

## How the daily update works

Every day at **5:00 PM IST**, a scheduled task in the Claude desktop app on the bulletin owner's computer does the following:

1. **Collects** new items from the feeds in `config/sources.json` (`scripts/fetch.ps1`).
2. **Tags and summarises** each item following the rules in `TAGGING.md`. Claude does this using the existing Claude plan, so it costs nothing extra.
3. **Merges** the results into `data/items.json` (`scripts/merge.ps1`).
4. **Publishes** the update to GitHub, and the website refreshes within a few minutes.

If the computer is off at 5 PM, the update runs the next time the Claude app is open.

## Common changes

You can ask Claude to make any of these, or edit the files yourself.

| I want to… | Edit |
|---|---|
| Add or remove a news source | `config/sources.json`: add an entry to `sources`. Use `"type": "rss"` with a feed `url`, or `"type": "gnews"` with a Google News search `query` (for example `site:example.org education`). |
| Change how a theme is defined | The theme table in `TAGGING.md` |
| Add a new theme | `TAGGING.md` (theme table), `scripts/merge.ps1` (`$validThemes`) and `assets/app.js` (`THEMES`) |
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
scripts/fetch.ps1          collect new items  -> data/pending.json
scripts/split.ps1          split into batches -> data/work/
scripts/merge.ps1          merge tagged items -> data/items.json
data/items.json            everything shown on the site (last 365 days)
data/seen.json             items already processed (so nothing repeats)
```
