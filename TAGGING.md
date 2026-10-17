# Tagging rules for the daily update

Claude follows these rules each day when it reads the batches in `data/work/in-NN.json` and writes the tagged items.

**These rules take precedence over any shorter summary of them in the scheduled-run prompt.** In particular, blurbs are 3–4 sentences (70–110 words) written from the article `text` (see "Blurb" below), and Central Government is official government websites only.

## Output

For each input file `data/work/in-NN.json`, write `data/tagged/batch-NN.json` (same `NN`). It's a JSON array with exactly one object per input id:

```json
{
  "id": "<copy from input item>",
  "keep": true,
  "section": "govt | news | research | global",
  "themes": ["fln", "assessment"],
  "type": "announcement | circular | scheme | news | opinion | report | research-paper | policy-brief | data",
  "priority": 3,
  "blurb": "3–4 sentence summary of what the piece says."
}
```

`priority` (1–5) is required for **global** items only. The site shows at most 10 global items per day, highest priority first:
- **5**: a new report, policy brief or research paper published by a key evidence organisation: What Works Hub for Global Education, GEEAP, RISE, UNESCO (including the GEM Report), UNICEF (including Innocenti), World Bank, OECD, Gates Foundation, Brookings, CGD, EdTech Hub, J-PAL, IDinsight, Results for Development, PAL Network / Teaching at the Right Level, Education Commission or GPE.
- **4**: another notable research study, evaluation or policy brief on school education, especially on FLN, ECE, teachers, assessment, technology/AI or financing.
- **3**: a research summary or evidence blog post from one of these organisations, or news coverage of a new report.
- **2**: a minor or older research item with limited relevance to India's priorities.
- **1**: marginal items.

Every input id must appear exactly once, including the ones you drop with `"keep": false`. When `keep` is false, the only other field you need is `id`.

## Keep or drop

Keep an item only if it is about **school education** (early childhood and pre-primary, Classes 1–12, teachers, boards and exams, school schemes and budgets, learning outcomes) **at the national or international level**.

Drop it (`keep: false`) if:
- **its main subject is a single Indian state or UT.** That covers a state government's announcements, a state board's notices, news or opinion about one state's schools, and a study of a single state. National or multi-state items stay.
- it is mainly about higher education (universities, college admissions, JEE/NEET coaching, study abroad) with no school angle;
- it is an exam-result listing, an admit-card notice, a date sheet, a holiday notice, a job advertisement or vacancy, a fundraising appeal, a competition or an award with no policy content;
- it is a social-media post (Instagram, Facebook, X, LinkedIn, YouTube) rather than an article, report or official release;
- it is about crime, accidents or celebrities, or is otherwise unrelated to education policy and practice;
- it is a duplicate of another item in the same batch, in which case keep the version from the more official source.

## Section

- **govt**: **only items published directly by the Union government on its own websites**: PIB press releases, factsheets and features (pib.gov.in), and reports, bulletins, notices, circulars, guidelines, data releases and other updates from the Ministry of Education and its bodies (education.gov.in, dsel.education.gov.in, NCERT, CBSE, NIOS, KVS/NVS, UDISE+) or Parliament (sansad.in). The item's link must be an official government website (for example ending in .gov.in or .nic.in). **Newspaper, TV, news-portal or broadcaster coverage of a government announcement is never govt, even when it reports an official decision** (this includes NDTV, India Today, Times of India, EdexLive, Jagran Josh, DD News, Sansad TV and similar); file it under **news**. `scripts/merge.py` also enforces this by moving any govt item without an official link to news.
- **news**: all newspaper and media pieces on school education in India: national reporting (including reports of government announcements), features, analysis, editorials and opinion pieces. **Only from national outlets** (the `nationalNews` list in `config/sources.json`: national dailies such as The Hindu, Indian Express, TOI, HT, Mint, Business Standard, ThePrint, Scroll, NDTV, India Today and similar). Drop pieces from city or regional editions (e.g. a Tribune Amritsar or TOI Chennai story), local or regional outlets, exam/coaching portals (Jagran Josh, Shiksha, Vajiram), aggregators (MENAFN, NewsX) and legal-news sites. `scripts/merge.py` also drops any news item not from a listed national outlet.
- **research**: reports, studies, surveys, datasets, research papers, policy briefs, **and research or analysis blogs** (for example an Accountability Initiative, CPR, IDR or Ideas for India post analysing a scheme, budget or dataset) on Indian school education by researchers, think tanks, NGOs, multilaterals or academic institutions, or news coverage of such a report. Organisational news from these groups (job openings, fundraising, event announcements, staff news, annual galas) is **dropped**, not filed as research.
- **global**: **school-education reports, policy briefs and research only**, published outside India or about other countries or the world:
  - reports, policy briefs, working papers, evaluations, research papers and data releases (for example from the organisations listed under priority 5, other foundations, think tanks and universities);
  - research summaries or evidence blog posts from these organisations, or news coverage of a new report.

  A study set in one country (for example an evaluation in Kenya) counts, because it is published research. **Drop** everything that is not a report or research: country-specific news, government announcements or policy updates from other countries, funding or partnership announcements, events and conferences, op-eds without new evidence, and crime, protest, celebrity or human-interest stories. Higher-education-only research is also dropped.

`sectionHint` shows which feed found the item. Treat it as a starting point and correct it when the content says otherwise.

## Themes (zero or more; use these ids only)

| id | Theme | Covers |
|---|---|---|
| `ece` | Early Childhood Education | Anganwadis, pre-primary, Balvatika, ages 3–6, ECCE, Poshan Bhi Padhai Bhi |
| `fln` | FLN | Foundational literacy and numeracy, NIPUN Bharat, Classes 1–3, reading and maths basics |
| `tech_ai` | Technology & AI | EdTech, AI in education, DIKSHA, PM eVidya, smart classrooms, digital public infrastructure, APAAR |
| `secondary` | Secondary Education | Classes 9–12, board structure, vocational/skills in school, dropout at secondary level, stream choice |
| `assessment` | Assessments | Board exams, PARAKH, NAS, ASER results, learning-outcome surveys, competency-based assessment |
| `budget` | Budgets & Financing | Union/education budgets, allocations and spending, Samagra Shiksha/PAB approvals, fund releases, education financing (including international aid for education) |
| `governance` | Governance & Policy | NEP implementation, new policies and guidelines, regulation, administration and accountability, Centre–state coordination, school-level management (SMCs) |
| `teachers` | Teachers | Teacher training and professional development (NISHTHA), recruitment, TET, deployment and vacancies, teacher education institutions, teacher wellbeing |
| `curriculum` | Curriculum & Languages | NCF, NCERT textbooks, syllabus changes, pedagogy, mother-tongue and multilingual education, three-language policy |
| `equity` | Equity & Inclusion | Girls' education, SC/ST and minority students, children with disabilities, RTE 25% seats, out-of-school children, gender and social gaps |
| `infrastructure` | School Infrastructure | PM SHRI, school buildings and facilities, toilets, electricity, libraries and labs, school consolidation and mergers |
| `vocational` | Vocational & Skills | Vocational education in schools, skilling, 21st-century and life skills, career guidance, internships for school students |

Add every theme the item clearly relates to (often 1–3). An item can have no theme.

## Blurb: content, tone and accuracy (important)

The blurb is a short summary of **what the piece actually says**, so that a reader who never opens the original still knows its substance. Each input item has a `title`, a `snippet` and, where the page could be read, `text` (the first ~5,000 characters of the article, release or report). Read the `text` and summarise its content.

- Write **3–4 sentences (70–110 words)**.
- **Lead with the substance, not the topic.** Don't write "This article is about AI literacy" or "The release highlights the importance of X". Say what was decided, found or argued. A blurb that only names the topic is wrong.
- Cover what matters for the type of piece:
  - **Government announcement, circular or scheme** (govt): what was announced or decided, by whom, who it applies to, and the key details: numbers, amounts, dates, deadlines, eligibility, targets and next steps.
  - **News report**: what happened, the key facts and figures, and who said what.
  - **Opinion, editorial or analysis**: the author's main argument, the 2–3 key points or evidence used, and what they recommend.
  - **Report, study, survey or data release** (research, global): what was studied, the 2–3 headline findings with their numbers, and the main recommendations.
- **Use only facts in the title, snippet and text.** Never add numbers, names or claims that aren't there. Keep the numbers you use exactly as given.
- If `text` is empty or is only site boilerplate (menus, cookie notices, sign-up prompts), write a shorter, cautious summary from the title and snippet, and don't guess at the content.
- The blurb is read by the public: **never mention your sources or their limits** (no "the full text was not available", "according to the headline", "the earlier summary", "details are not described here"). Just state what is known.
- **Use a modest, neutral and constructive tone throughout.** The blurb must not criticise the Government of India. When an item is an opinion or critical piece, report its argument neutrally ("The author argues…", "The piece says…") without endorsing it or adding criticism of your own.
- Present government initiatives factually and respectfully. Describe gaps as areas of ongoing work or opportunity.
- Don't copy sentences from the source. Summarise in your own words.
- Write in English. If the source is in Hindi or another language, summarise it in English.
