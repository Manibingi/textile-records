# Textile Records

Digital register for a towel & lungi job-work business: thread purchases → rod winding → issue to weavers → lot receipt → weaver payments → cutting & packing → wholesale bills. Replaces the paper books, does every calculation automatically, and keeps backups.

Built with **FastAPI + SQLite** (backend) and **React** (screens). Everything runs on one computer; no internet needed.

---

## For daily use

1. Install **Python 3.10 or newer** from https://www.python.org/downloads/ (once). On Windows, tick **"Add python.exe to PATH"** in the installer.
2. Double-click **`START-Windows.bat`** (Mac/Linux: `start-mac-linux.sh`).
   The first time takes 1–2 minutes. The browser opens at **http://localhost:8000**.
3. Keep the black window open while using the app. Close it when done.

**Using it on a phone at the shop:** connect the phone to the same Wi-Fi as the computer and open `http://<computer's IP>:8000` (find the IP with `ipconfig` on Windows). Allow access if Windows Firewall asks.

### The 8 steps (same as the home screen)

| # | Screen | What you enter | What it calculates |
|---|--------|----------------|--------------------|
| 1 | Thread & suppliers | Each thread purchase (or opening stock) | Thread stock by type & colour |
| 2 | Rods → Wind new rod | Total weight, steel rod weight, thread length (549 m default) | **Net thread = total − rod**; stock reduced; rod number R-0001… |
| 3 | Rods → Give rods to weaver | Weaver, machine, rods | Machine's current colour/design; rods with each weaver |
| 4 | Rods → Give extra thread | Weaver, thread, number of combs, total weight, weight of 1 empty comb (or "taken back") | **Net thread = total − combs × comb weight**; stock reduced; extra thread each weaver is holding |
| 5 | Lots received | One combined weight for all lots from a machine, then pieces & meters of each lot | Weaver's earnings per lot (meters × rate); lot numbers L-0001… |
| 6 | Weaver payments | Amount paid | Amount due, meters since last payment, printable slip |
| 7 | Cutting & stock | Tap a colour (pieces waiting from all lots), then good pieces, rejects, bundles | Pieces still to cut per colour; ready-to-sell stock; wastage % |
| 8 | Sales & customers | Bill items, money received | Stock reduced; bill printout; amount each customer owes |

**Reports:** summary (with rough profit), weaver-wise, machine-wise, supplier-wise, sales, wastage — for any dates. Every list has **Excel (CSV)** and **Print / PDF** buttons.

### Starting from the old books
- Thread already in the godown → *Buy thread* with supplier "Opening stock".
- Money already owed to a weaver / by a customer → fill "Amount already owed" when adding them.
- Packed pieces already in stock → *Cutting & stock* → "Opening stock / other".

### Backups
- Every day the app starts, a copy is saved in `backend/data/backups/` (last 30 days kept).
- **Settings & backup → Download backup now** — do this weekly and keep it on a pen drive / Google Drive.
- All data lives in one file: `backend/data/textile.db`. To restore, close the app and replace that file with a backup.
- If you use an online database (see below), backups are `.json` exports, and restoring is done from the Neon / Supabase dashboard.

### Online database (Neon / Supabase)
1. Create a PostgreSQL database on Neon or Supabase and copy its connection string (Neon: *Pooled connection*, Supabase: *Session pooler*).
2. Open `backend/.env` (copy `backend/.env.example` if it is missing) and paste it after `DATABASE_URL=`.
3. Start the app. The tables are created automatically. Records already in `textile.db` are **not** copied over.

Leave `DATABASE_URL` empty to keep using the local `textile.db` file.

### Updating to a new version
Replace the app folder with the new one but **keep `backend/data`** (your records). Older records are upgraded automatically the first time the new version starts.

### Mistakes
Delete the wrong entry and enter it again. The app blocks deletes that would break links (e.g. a lot that is already cut, a weaver who has lots) and tells you what to delete first.

---

## For developers

```
backend/   FastAPI app (app/main.py), SQLAlchemy models, routers, tests
frontend/  React + Vite source; frontend/dist is the built UI served by FastAPI
```

Run in development (hot reload):
```bash
cd backend && pip install -r requirements.txt && uvicorn app.main:app --reload     # :8000
cd frontend && npm install && npm run dev                                            # :5173, proxies /api
```
After UI changes: `cd frontend && npm run build` (FastAPI serves `frontend/dist`).

Tests: `cd backend && pip install pytest httpx && python -m pytest tests` (full purchase-to-sale flow; always runs on a temporary SQLite file).
API docs: http://localhost:8000/docs

Environment: set in `backend/.env` (see `backend/.env.example`): `DATABASE_URL`, `DB_POOL_SIZE`, `DB_MAX_OVERFLOW`, `TEXTILE_DATA_DIR`, `TEXTILE_UI_DIR`, `CORS_ORIGINS`.

### Development with Claude Code agents

New features are planned, built, reviewed and merged by Claude Code agents (see `CLAUDE.md`):

| You want to… | In Claude Code, type |
|---|---|
| Build the next roadmap item end to end (spec → branch → PR → review → merge → deploy) | `/ship-feature` |
| Build a specific item from `docs/roadmap.md` | `/ship-feature F-003` |
| Add a new idea and build it | `/ship-feature "show weaver dues on the home screen"` |
| Only get a refreshed future plan | `/ship-feature plan-only` |

Agents: `.claude/agents/` (feature-planner, feature-developer, pr-reviewer-merger). Layer conventions: `.claude/skills/` (backend, frontend, database). Design: `docs/design-document.md`. Roadmap: `docs/roadmap.md`. Every merge to `main` redeploys the live site.
