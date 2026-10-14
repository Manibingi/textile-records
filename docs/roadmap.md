# Textile Records — Roadmap

Maintained by the `feature-planner` agent. Status flow: `proposed` → `specced` → `in-progress` → `in-review` → `done` (or `blocked`).
Value 1–5 (higher is better) · Effort S/M/L · Data risk low/med/high. Specs live in [features/](features/), reviews in [reviews/](reviews/).

**Baseline (done):** the full application from the design document. It has all 8 steps, reports, CSV and print, daily backups, SQLite or PostgreSQL, and an HTTP Basic login for online use. It is live at https://textile-records.onrender.com (commits `c26d2c1`, `d31bd71`).

| ID | Feature | Status | Priority | Value | Effort | Data risk | Depends on | Spec |
|---|---|---|---|---|---|---|---|---|
| F-001 | Automatic checks on every pull request (GitHub Actions: pytest + frontend build + stale-`dist` check) | proposed | 1 | 5 | S | low | — | — |
| F-002 | Off-site automatic backup (online deployment's backups vanish on Render restarts; schedule a copy to Google Drive or similar) | proposed | 2 | 5 | M | low | — | — |
| F-003 | Edit forms for lots, bills and payments (instead of delete and re-enter) | proposed | 3 | 5 | M | med | F-001 | — |
| F-004 | Ageing report and WhatsApp reminder text for customer balances | proposed | 4 | 4 | S | low | — | — |
| F-005 | Expenses register (so profit includes other costs) | proposed | 5 | 3 | M | low | — | — |
| F-006 | GST rates and tax lines on bills | proposed | 6 | 3 | M | med | — | — |
| F-007 | Malayalam / English language switch | proposed | 7 | 4 | L | low | — | — |
| F-008 | Friendlier login: a big PIN screen instead of the browser's username/password box | proposed | 8 | 2 | S | low | — | — |

F-002 to F-008 come from the design document's "Limitations and future work", re-scored for the live online deployment. The planner re-scores them and adds new ideas on each roadmap refresh.
