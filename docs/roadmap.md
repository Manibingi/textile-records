# Textile Records — Roadmap

Maintained by the `feature-planner` agent. Status flow: `proposed` → `specced` → `in-progress` → `in-review` → `done` (or `blocked`).
Value 1–5 (higher is better) · Effort S/M/L · Data risk low/med/high. Specs live in [features/](features/), reviews in [reviews/](reviews/).

**Baseline (done):** the full application from the design document. It has all 8 steps, reports, CSV and print, daily backups, SQLite or PostgreSQL, and an HTTP Basic login for online use. It is live at https://textile-records.onrender.com (commits `c26d2c1`, `d31bd71`).

Priority order: dependencies first, then value ÷ effort (S = 1, M = 2, L = 3), ties broken by value.

| ID | Feature | Status | Priority | Value | Effort | Data risk | Depends on | Spec |
|---|---|---|---|---|---|---|---|---|
| F-002 | Off-site automatic backup of the live site: a nightly, password-locked copy saved on GitHub for 90 days, plus "last safety copy" status in Settings and a Home warning when it stops | specced | 1 | 5 | S | low | — | [F-002](features/F-002-offsite-backup.md) |
| F-001 | Automatic checks on every pull request (GitHub Actions: pytest + frontend build + stale-`dist` check) | proposed | 2 | 4 | S | low | — | — |
| F-009 | Shop computer backup safety: a second backup folder (e.g. a Google Drive for desktop or pen-drive folder) set in `.env`, and a Home reminder when no backup was downloaded for 7 days | proposed | 3 | 4 | S | low | F-002 | — |
| F-004 | Customer dues by age (0–30, 31–60, 61–90, 90+ days, payments set against the oldest bills first) and a WhatsApp reminder link with the amount filled in | proposed | 4 | 4 | S | low | — | — |
| F-010 | "Possible double entry" warnings: same weaver or customer, same date and same amount; same supplier bill number; same receipt meters on the same day. Saves, then warns | proposed | 5 | 3 | S | low | — | — |
| F-011 | Send a bill or a weaver payment slip on WhatsApp (click-to-chat link with a short text summary; works from the phone) | proposed | 6 | 3 | S | low | — | — |
| F-017 | Day book: every entry made on one date across all registers, in one printable list, to check against the paper notes at closing time | proposed | 7 | 3 | S | low | — | — |
| F-012 | Change history: every delete (and, later, every edit) keeps a copy of the old record with date and time, viewable under Reports | proposed | 8 | 4 | M | low | — | — |
| F-003 | Edit forms for single-row entries: thread purchases, extra thread, weaver payments, money received and cutting entries (instead of delete and re-enter). Lots and bills are split out into F-013 and F-014 | proposed | 9 | 5 | M | med | F-001, F-012 | — |
| F-016 | Thread given vs cloth received, per weaver: net rod thread + extra thread given against lot weights received for a date range, with the difference in kg and % | proposed | 10 | 4 | M | low | — | — |
| F-013 | Edit a lot receipt (pieces, meters, colour, date) keeping the frozen rate; refused once its pieces are cut | proposed | 11 | 4 | M | med | F-003 | — |
| F-014 | Edit a bill (items, rates, date) with the stock check excluding the bill's own pieces; invoice number unchanged | proposed | 12 | 4 | M | med | F-003 | — |
| F-015 | Restore a backup file (.json or .db) into an empty database from Settings; also the way to move the shop's records online or back | proposed | 13 | 4 | M | med | F-002 | — |
| F-008 | Friendlier login: a big PIN screen instead of the browser's username/password box | proposed | 14 | 2 | S | low | — | — |
| F-018 | Browser smoke tests (Playwright at 1366 px and 390 px) run in CI: open each screen, save one entry, compare CalcBox with the saved value | proposed | 15 | 3 | M | low | F-001 | — |
| F-005 | Expenses register (so profit includes other costs). **Crosses the "no full accounting" non-goal**; keep it to a simple list of expenses by heading | proposed | 16 | 3 | M | low | — | — |
| F-006 | GST rates and tax lines on bills. **Needs the owner's decision first** (is the business GST-registered and must bills be tax invoices?) | proposed | 17 | 3 | M | med | — | — |
| F-007 | Malayalam / English language switch | proposed | 18 | 4 | L | low | — | — |

## Notes from the 14-10-2026 refresh

- **F-002 moved to the top and was made concrete.** The repository is public and Render's local disk loses the automatic `.json` backups on every restart or deploy, so today the only real safety net for the live site is someone remembering to click "Download backup now". A scheduled GitHub Actions job can pull `/api/backup` every night with no Google account, OAuth or new Python packages, and lock it with 7-Zip before storing it. Shop-computer backups moved to a new item, F-009.
- **F-001 re-scored from value 5 to 4.** It still matters because every merge deploys to the live site, but the reviewer agent already runs the tests before merging, so it is a second safety net rather than the first.
- **F-003 was split.** Today only suppliers, weavers, machines, customers and settings have edit forms (`PUT` endpoints). F-003 now covers the single-row entries. Lots (batches, rods, frozen rate, cutting guard) and bills (stock check, items) carry more risk, so they became F-013 and F-014. F-003 also depends on the new F-012, so that changed money figures leave a trace.
- **F-008 kept at value 2.** A login already exists (HTTP Basic through `APP_PASSWORD`), and the browser remembers it. A PIN screen only improves how it looks.
- **F-005 and F-006 flagged** against the design's non-goals (full accounting, GST filing). F-006 waits for an owner decision.
- **New items:** F-009 to F-018, grounded in gaps found in the code: no edit endpoints, no restore path for `.json` backups, no check for double entries, no record of deletes, and no check that the thread given matches the cloth received.
