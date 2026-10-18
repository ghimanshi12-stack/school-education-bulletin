# School Education Pulse

**Live site:** https://ghimanshi12-stack.github.io/school-education-bulletin/

A daily bulletin of school education updates from India and the world. It has four sections:

1. **Central Government**: official updates only, published on government websites: PIB press releases and Ministry of Education reports, bulletins and notices (read directly from dsel.education.gov.in and education.gov.in), plus Parliament. Media coverage of these goes under News & Opinion.
2. **News & Opinion**: pieces from national newspapers and media only (list in `config/sources.json`, `nationalNews`): national reporting (including coverage of government announcements), editorials and opinion pieces on school education in India.
3. **Research & Reports**: reports, studies, surveys and policy briefs by researchers and think tanks on Indian school education.
4. **Global**: international policy and research, including UNESCO, World Bank, OECD, UNICEF, cross-country studies and other countries' national policies.

Stories mainly about a single state or UT are left out on purpose. The bulletin focuses on national and international developments.

Readers can also pick a day on the **calendar** at the top of the filters to read only that day's updates, and **save** articles to read later (see "Setting up sign-in" below).

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

## Setting up sign-in

Anyone can save articles with the **Save** button. Until sign-in is set up, saved articles stay in that reader's browser only. With sign-in, readers log in with their email (or Google account) and their saved articles follow them to any device. Sign-in uses Firebase (free plan). One-time setup:

1. Go to https://console.firebase.google.com, choose **Create a project** (Google Analytics is not needed).
2. **Build → Authentication → Get started**. Under **Sign-in method**, turn on **Email/Password**, and optionally **Google**.
3. Still in Authentication, open **Settings → Authorized domains** and add `ghimanshi12-stack.github.io`.
4. **Build → Firestore Database → Create database** (production mode, any location). Open the **Rules** tab, paste the contents of `firestore.rules` from this repository and press **Publish**.
5. **Project settings** (gear icon) → **Your apps** → the web icon `</>` → register an app (no hosting needed). Copy the `firebaseConfig` object it shows.
6. Paste it into `assets/firebase-config.js` in place of `null` and publish. A **Sign in** button then appears next to the section tabs.

The Firebase web config is safe to publish; access is controlled by the rules in step 4.

## Preview on this computer

```bash
powershell -ExecutionPolicy Bypass -File scripts\serve.ps1
```

Then open http://localhost:8080.

## Files

```
index.html, assets/        the website
assets/account.js          saved articles and sign-in
assets/firebase-config.js  Firebase settings for sign-in (null = sign-in off)
firestore.rules            who can read and write saved articles
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
