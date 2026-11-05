# Textile Records

Web app that replaces the paper registers of a towel and lungi job-work business: thread purchases → rods and extra thread to weavers → lots received → weaver pay → cutting and packing → bills → money received. All stock and balances are computed, never typed.

- **Repo:** https://github.com/Manibingi/textile-records (default branch `main`)
- **Live:** https://textile-records.onrender.com (Render; password-protected through `APP_PASSWORD`)
- **Product source of truth:** [docs/design-document.md](docs/design-document.md). Its "Implementation notes" section lists where the code differs from the original design. **The code is the truth for how things are built.**

## Stack (as built)

- **backend/**: FastAPI, Pydantic 2, SQLAlchemy 2 (classic `Column` style), Uvicorn on 8000. `app/main.py` mounts the four routers and serves `frontend/dist`.
- **Database:** SQLite at `backend/data/textile.db` when `DATABASE_URL` is empty (shop computer). PostgreSQL (Neon or Supabase, via psycopg 3) when `DATABASE_URL` is set, which is the online deployment. **Every change must work on both.**
- **frontend/**: React 18, React Router 6, Vite 5, plain CSS. Shared components live in `src/ui.jsx`, the API wrapper in `src/api.js`, formatting in `src/format.js`, and screens in `src/pages/`.
- **`frontend/dist` is committed.** `START-Windows.bat` and the server use it as is, with no npm step. After any UI change, run `npm run build` and commit `frontend/dist`.
- **Config:** `backend/.env` (never committed; see `backend/.env.example`) holds `DATABASE_URL`, `APP_USERNAME`/`APP_PASSWORD` (HTTP Basic login), `CORS_ORIGINS`, `TEXTILE_DATA_DIR`, and `TEXTILE_UI_DIR`.

## Commands

```bash
# backend (from backend/), venv at backend/.venv
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt pytest httpx
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
.venv/Scripts/python -m pytest -q tests     # always uses a temp SQLite file; never the real DB

# frontend (from frontend/)
npm install
npm run dev        # http://localhost:5173, proxies /api to 8000
npm run build      # regenerates frontend/dist, which must be committed
```

## Skills

Load the matching skill before touching a layer:

- `backend`: routers, `calc.py`, `util.py` helpers, errors and warnings, guarded deletes, tests
- `frontend`: screens, `ui.jsx` components, CalcBox, the large-control UX rules, formats, print and CSV
- `database`: models, the SQLite + Postgres dual target, `upgrade_old_database()`, backups

## Non-negotiable rules

1. Never store stock, balances or dues. Compute them in `backend/app/calc.py`.
2. Money is rounded half up to 2 decimals with `util.r2()`, and kg to 3 with `util.r3()`. The screen and the database must agree.
3. Group thread type, colour and product with `util.key()` (case- and space-insensitive).
4. Schema changes must keep existing SQLite **and** Postgres databases working: add new columns through `upgrade_old_database()` and cover them in `test_upgrade_old_database`. Never drop or rename columns that hold data.
5. Errors use `util.fail("One plain sentence.")`, which returns HTTP 400 and is shown as is. Soft problems save and return a `warning`.
6. Deletes that others depend on are refused, naming what to delete first.
7. The UI is for a non-technical user: big controls, the `Choice` toggles, a live `CalcBox`, plain words, ₹ and DD-MM-YYYY.
8. Never point tests or scripts at the production `DATABASE_URL`, and never commit `.env` or `backend/data/`.

## Deployment

Merging to `main` is a production release: Render redeploys the live site from `main`. So `main` must always pass tests and contain a fresh `frontend/dist`. After merging, the live root URL should answer 401 (login) or 200, never 5xx.

## Agent workflow (automated feature delivery)

| Step | Agent | Output |
|---|---|---|
| 1. Plan | `feature-planner` | Updates [docs/roadmap.md](docs/roadmap.md) and writes a spec in `docs/features/F-XXX-slug.md` |
| 2. Build | `feature-developer` | A `feature/F-XXX-slug` branch with code, tests, the rebuilt `dist`, and docs |
| 3. Ship | `pr-reviewer-merger` | A GitHub PR and review, then a squash-merge to `main` (deploys) or changes requested |

Run the whole pipeline with `/ship-feature`, `/ship-feature F-003`, or `/ship-feature "idea"`.

- Feature IDs: `F-001`, … Branches: `feature/F-XXX-short-slug`.
- Roadmap status values: `proposed` → `specced` → `in-progress` → `in-review` → `done` (or `blocked`).
- Commits: imperative subject prefixed with the feature ID, e.g. `F-003: add edit form for lots`.
- `gh` lives at `C:\Program Files\GitHub CLI\gh.exe`. If `gh` isn't on PATH, call it by that full path.
