# Participant Hub

Internal participant database for the User Insight Research team.
Next.js 15 (App Router) · TypeScript · Tailwind v4 · shadcn/ui · Prisma + SQLite.

## Setup

```bash
cp .env.example .env # first time only
npm install          # also runs `prisma generate`
npm run db:push      # create prisma/dev.db from the schema
npm run db:seed      # optional: 40 demo participants
npm run dev          # http://localhost:3000
```

## Pages

| Route | Purpose |
|---|---|
| `/` | Dashboard: summary cards, global search, quick actions, recent sessions & flags |
| `/participants` | **Search** — filters (tags AND/OR, age, gender, province, occupation, behavior rating, session count, last-interview date, PDPA) |
| `/participants/new` | **Add Participant** — single entry form (duplicate phone check) + Excel/CSV/Numbers import at the bottom (`#import`) |
| `/participants/[id]` | Profile, session timeline, flag as เก๊, restore, log session, PDPA anonymize |
| `/participants/[id]/edit` | Edit profile |
| `/prescreen` | **Check Profile** — paste phones/names → จริง / เก๊ status + interview count |
| `/import`, `/sessions/new` | Redirects kept for old bookmarks (→ Add Participant import section / Search) |

## API

| Method | Route | Notes |
|---|---|---|
| GET / POST | `/api/participants` | GET accepts the same query params as the search page |
| GET / PATCH | `/api/participants/:id` | |
| POST | `/api/participants/:id/flag` | `{ reason, details, flaggedBy }` → status `GEH` instantly |
| POST | `/api/participants/:id/reinstate` | status back to `REAL`; flag history kept |
| POST | `/api/participants/:id/anonymize` | removes name, phone, email, LINE ID |
| GET / POST | `/api/sessions` | POST increments `totalInterviews`, updates `lastSessionDate` |
| POST | `/api/import` | multipart `file` — direct upsert (kept for scripts; the UI uses the review flow below) |
| POST | `/api/import/preview` | multipart `file` or `{ sheetUrl }` → rows + suggested column mapping (no writes) |
| POST | `/api/import/lookup` | `{ phones }` → which already exist and their status |
| POST | `/api/import/commit` | `{ rows, mapping, session, decisions[] }` — saves reviewed rows |
| GET | `/api/suggest?q=` | search-box suggestions (participants, tags, provinces, occupations) |
| GET | `/api/template` | Excel template |
| POST | `/api/prescreen` | `{ entries: string[] }` |
| GET | `/api/stats`, `/api/tags` | |

## Import flow (Add Participant › Import)

1. **Source** — drop an Excel / Numbers / CSV file, pick a file with **Choose from Google Drive**, or paste a Google Sheets link.
2. **Review** — nothing is saved yet.
   - Headers are matched to the template automatically, including near matches (`เบอร์มือถือ` → Phone, `อายุ (ปี)` → Age). Guesses are marked *Guessed — check* and every column can be re-assigned.
   - Columns that aren't in the template become **ข้อมูลเพิ่มเติม (extra info)** on the profile, or can be ignored.
   - Every row needs a **flag** (จริง / เก๊) and a **rating** (1–3) before **Save** unlocks. Newly flagged เก๊ rows also need a reason + details. Bulk "apply to all" controls are provided.
   - Rows without a valid phone can't be imported; repeated phones in the same file are unticked by default.
3. **Save** — upserts on phone (blank cells never overwrite, tags and extra info merge), applies the flag, and logs one research session per row using the project / date / interviewer entered once for the batch.

## Google Drive import

- **Sheet link** works immediately for sheets shared as "Anyone with the link can view".
- **Choose from Google Drive** (private files, with a Google permission prompt) needs a one-time setup:
  1. In [Google Cloud Console](https://console.cloud.google.com/) create a project, then enable **Google Drive API** and **Google Picker API**.
  2. *APIs & Services › OAuth consent screen*: set it up (Internal for a Workspace org). Scope: `…/auth/drive.file` (only files the user picks).
  3. *Credentials › Create credentials › OAuth client ID* → Web application. Authorized JavaScript origins: `http://localhost:3000` (and your hosted URL later).
  4. *Credentials › Create credentials › API key* (restrict it to the Picker API and your origin).
  5. Copy `.env.example` values into `.env`: the client ID, the API key, and the **project number** as `NEXT_PUBLIC_GOOGLE_APP_ID`. Restart `npm run dev`.

## Design notes

- **Phone is the identity key.** All phones are normalized to digits (`+66 81-234-5678` → `0812345678`, and a 9-digit number with Excel's dropped leading zero is repaired).
- **Tags** are a JSON string (SQLite has no arrays). Each tag is stored quoted, so `contains: '"SME Owner"'` gives exact-tag matching in SQL for both AND and OR.
- **Import upsert** never overwrites with blank cells, merges tags, and never changes status. Rows are processed one by one so a single bad row doesn't abort the file.
- **Anonymization** replaces the phone with `ANON-<id>` (the column is unique + required) and sets `anonymizedAt`; demographics, tags, status and sessions stay.
- No authentication yet. `flaggedBy` / `interviewer` are free text. Add SSO before exposing this beyond the team network.
