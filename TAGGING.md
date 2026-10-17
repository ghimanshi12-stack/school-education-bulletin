# Tagging rules for the daily update

Claude follows these rules each day when it reads the batches in `data/work/in-NN.json` and writes the tagged items.

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
  "blurb": "2–3 sentence summary."
}
```

`priority` (1–5) is required for **global** items only. The site shows at most 10 global items per day, highest priority first:
- **5**: a major report or flagship release from a multilateral (UNESCO GEM Report, World Bank, OECD/PISA, UNICEF), or major cross-country research.
- **4**: a significant national policy or reform in a low- or middle-income country, or a notable research study.
- **3**: other national policy news, or useful evidence or commentary relevant to India's priorities (FLN, ECE, AI, assessment, financing).
- **2**: national policy news from high-income countries with limited relevance to India.
- **1**: marginal items.

Every input id must appear exactly once, including the ones you drop with `"keep": false`. When `keep` is false, the only other field you need is `id`.

## Keep or drop

Keep an item only if it is about **school education** (early childhood and pre-primary, Classes 1–12, teachers, boards and exams, school schemes and budgets, learning outcomes) **at the national or international level**.

Drop it (`keep: false`) if:
- **its main subject is a single Indian state or UT.** That covers a state government's announcements, a state board's notices, news or opinion about one state's schools, and a study of a single state. National or multi-state items stay.
- it is mainly about higher education (universities, college admissions, JEE/NEET coaching, study abroad) with no school angle;
- it is an exam-result listing, an admit-card notice, a date sheet, a holiday notice, a job advertisement, a competition or an award with no policy content;
- it is a social-media post (Instagram, Facebook, X, LinkedIn, YouTube) rather than an article, report or official release;
- it is about crime, accidents or celebrities, or is otherwise unrelated to education policy and practice;
- it is a duplicate of another item in the same batch, in which case keep the version from the more official source.

## Section

- **govt**: the main subject is an official action or announcement by the **Union government** or its bodies (MoE, PIB, NCERT, CBSE, NIOS, KVS/NVS, Parliament). This includes news reports of such announcements.
- **news**: national reporting, features, analysis, editorials or opinion pieces on school education in India that are not mainly an official announcement.
- **research**: reports, studies, surveys, datasets, research papers or policy briefs on Indian school education by researchers, think tanks, NGOs, multilaterals or academic institutions, or news coverage of such a report.
- **global**: international policy and research only:
  - reports and updates from multilaterals (UNESCO, World Bank, OECD/PISA, UNICEF, GPE and others);
  - cross-country or global research and evidence;
  - another country's **national** education policy or reform.

  Drop local or district-level school news from other countries, as well as crime, protests, celebrity and human-interest stories.

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

## Blurb: tone and accuracy (important)

- Write 2–3 plain sentences (40–70 words) that say what the update is and why it matters for school education.
- **Use only facts in the title and snippet.** Never add numbers, names or claims that aren't there. If the snippet is empty or unusable, write one cautious sentence based on the title.
- **Use a modest, neutral and constructive tone throughout.** The blurb must not criticise the Government of India. When an item is an opinion or critical piece, describe it neutrally ("The article discusses…", "The author examines…") without endorsing or adding criticism.
- Present government initiatives factually and respectfully. Describe gaps as areas of ongoing work or opportunity.
- Don't copy sentences from the source. Summarise in your own words.
- Write in English. If the source is in Hindi or another language, summarise it in English.
