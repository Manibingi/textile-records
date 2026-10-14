# F-002: Off-site automatic backup of the live site

Status: specced · Priority: 1 · Effort: S · Data risk: low · Depends on: none

## Why

The live site (https://textile-records.onrender.com) keeps its records in an online PostgreSQL database. The app's automatic daily backup (`daily_backup()` in `backend/app/main.py`) writes a `.json` file to `backend/data/backups`, but on Render that disk is wiped on every restart and every deploy, and every merge to `main` is a deploy. So the only copy outside the database provider is whatever the owner remembers to download by hand from Settings. If the database is lost, expires, or is damaged by a mistake, months of weaver accounts and customer dues go with it.

The owner feels this. The father never will, until something is lost. The fix must run on its own, cost nothing, need no new Python packages or Google sign-in, and tell the owner, on screens he already opens, when it has stopped working.

Approach: a **scheduled GitHub Actions workflow** in this repository downloads `/api/backup` from the live site every night, checks it, locks it with a password (7-Zip AES-256, file names hidden), and stores it as a workflow artifact for 90 days. **The repository is public**, so the copy must never be stored unlocked and the workflow logs must never print record contents or secrets. When the copy has been stored, the workflow tells the app, which records the time. Settings shows the time, and Home shows an amber notice when no copy has been saved for 3 days. That covers GitHub schedule delays, a changed password, or GitHub disabling the schedule after 60 days without repository activity, which happens on public repositories.

This feature does not break any convention. It adds two read-only setting keys, written only by the server, through the existing key/value `settings` table, with no new columns. Backups on the shop computer are covered by F-009.

## What the user sees

### Settings & backup (`frontend/src/pages/Settings.jsx`, card "Backup — keep your records safe")

1. The card loads `GET /api/backup/status` with `useData("/backup/status")`.
2. Directly under the card title, before the paragraphs, show a status block (plain `<p>` lines, using the existing `warn-text` class for amber):
   - Both deployments:
     **"Last backup downloaded: 14-10-2026 at 11:20 (today)"**.
     When none has been recorded: **"Last backup downloaded: never"**.
   - Online only (`status.online_db === true`):
     **"Last night-time safety copy: 14-10-2026 at 02:05 (today)"**.
     When none has been recorded: **"Last night-time safety copy: none saved yet"**.
     When `status.offsite_overdue` is true, add an amber line (`warn-text`):
     - If a copy exists: **"The night-time safety copy has not been saved for 4 days. The owner should check the 'Night-time off-site backup' page under Actions on GitHub."**
     - If none exists: **"No night-time safety copy has been saved yet. The owner should finish the set-up described in the README (section 'Night-time off-site backup')."**
   - The "(today)" part comes from a new `format.js` helper `ago(days)`: `0` gives "today", `1` gives "yesterday", and `n` gives "`n` days ago". Date and time come from a new `format.js` helper `dtTime(s)`, which turns `"2026-10-14T02:05:11+05:30"` into `"14-10-2026 at 02:05"` using `dt(s.slice(0, 10))` and `s.slice(11, 16)`. Don't convert time zones in the browser. The server already stores Indian time.
3. Replace the online-branch paragraphs with:
   - "Records are kept in an online database. Every night at about 2 AM, a locked copy of all records is saved outside this website (on GitHub) and kept for 90 days. The copy opens only with the backup password that the owner keeps."
   - "Also download a backup once a week and keep it on a pen drive or in Google Drive / email."
   - Remove the sentence about copies in the `backend/data/backups` folder from the **online** branch only. On Render that folder does not survive a restart, so the sentence misleads. Keep the shop (SQLite) branch text unchanged.
4. The "⬇ Download backup now" link stays a plain `<a href="/api/backup" download>`. Add `onClick={() => setTimeout(reloadStatus, 3000)}` so the "Last backup downloaded" line updates after the download starts.
5. In "How to bring back records from a backup", online branch, add this as the first list item:
   "From a night-time copy: on GitHub open **Actions → Night-time off-site backup**, open the night you want, download **textile-backup-YYYY-MM-DD**, unzip it, then open the `.7z` file with 7-Zip and type the backup password. Inside is the same `.json` file that 'Download backup now' gives."
   Keep the two existing items after it.

### Home (`frontend/src/pages/Home.jsx`)

- `GET /api/dashboard` now includes a `backup` block (see API changes). When `data.backup.offsite_overdue` is true, show an amber notice using the existing `notice` class, placed directly **after** the "Low thread stock" notice and before "Latest lots received":
  - If `data.backup.last_offsite` is set: **"Safety copy: the last night-time copy of the records was saved {ago(days)} ({dtTime(last_offsite)}). "** followed by a link **"Open Settings & backup →"** to `/settings`.
  - If it is not set: **"Safety copy: no night-time copy of the records has been saved outside this website yet. "** followed by the same link.
- On the shop computer (SQLite), `offsite_overdue` is always false, so nothing appears.
- On a 390 px phone the notice wraps like the existing low-thread notice. No new CSS is needed.

### GitHub (the owner only)

- A workflow named **"Night-time off-site backup"** appears under the repository's **Actions** tab. It runs by itself every night at 02:00 IST, and **"Run workflow"** runs it at once.
- Each successful run has one artifact, **`textile-backup-YYYY-MM-DD`**, which contains `textile-backup-YYYY-MM-DD.7z`. Artifacts expire after 90 days.
- A failed run shows one plain `::error::` line saying what to fix, and GitHub emails the owner about the failure.

## Business rules

### Times and ages (server, `backend/app/util.py` + `backend/app/routers/reports.py`)

- Add to `util.py`:
  ```python
  IST = timezone(timedelta(hours=5, minutes=30))   # India has no daylight saving
  def now_ist(): return datetime.now(IST).replace(microsecond=0)
  ```
  Don't use `zoneinfo`. Windows Python on the shop computer has no time-zone database without the `tzdata` package.
- Stored format: `now_ist().isoformat()`, e.g. `"2026-10-14T02:05:11+05:30"`.
- Age in days = `(now_ist().date() − date.fromisoformat(stored[:10])).days`, or `None` when nothing is stored or the stored text can't be parsed. A bad value never raises.
- `offsite_overdue = online_db and (last_offsite_days is None or last_offsite_days >= 3)`. The threshold is the constant `OFFSITE_OVERDUE_DAYS = 3` in `reports.py`.

### When times are recorded

- `GET /api/backup` (no `offsite` parameter, or `offsite=false`): after `make_backup()` succeeds, save setting `backup_last_download = now_ist().isoformat()`.
- `GET /api/backup?offsite=1`: make and return the file exactly as today, but **don't** change `backup_last_download`. The night job must not hide the fact that nobody has downloaded a copy by hand.
- `POST /api/backup/offsite-saved`: save setting `backup_last_offsite = now_ist().isoformat()`. The workflow calls it only after the artifact upload succeeds.
- `daily_backup()` on start-up records nothing (unchanged).
- These two keys are **not** added to `SETTING_KEYS` in `masters.py`. So `PUT /api/settings` ignores them, and the Settings form cannot overwrite them. `GET /api/settings` doesn't return them either; screens use `/api/backup/status`.

### Refusals and warnings

- There are no new 400 refusals in the app. These endpoints have no user input to validate.
- If saving the timestamp fails after a successful `make_backup()` on `GET /api/backup`, log it with `logging.warning("Could not record backup time: %s", e)` and still return the file. A download must never fail because of the status line.

### Workflow rules (`.github/workflows/offsite-backup.yml`)

- **Triggers:** `schedule: - cron: "30 20 * * *"` (20:30 UTC = 02:00 IST) and `workflow_dispatch: {}`.
- **Permissions:** `permissions: contents: read`. **Concurrency:** `group: offsite-backup`, `cancel-in-progress: false`. **Job:** `runs-on: ubuntu-latest`, `timeout-minutes: 20`.
- **Env:** `SITE: https://textile-records.onrender.com`.
- **Repository secrets** (the owner adds them; agents never handle the values): `LIVE_APP_USERNAME` (optional, defaults to `admin`), `LIVE_APP_PASSWORD`, and `BACKUP_PASSPHRASE`.
- **Never** use `set -x`, never `echo` a secret, never `cat` or print the backup contents, and never put credentials in a URL. Pass them with `curl -u "$USER:$PASS"` from `env:`.
- Steps, in order. Each failing step prints exactly the `::error::` text shown and exits 1:
  1. **Check secrets.** If `LIVE_APP_PASSWORD` is empty: `::error::Add the repository secret LIVE_APP_PASSWORD (GitHub → Settings → Secrets and variables → Actions). It must match APP_PASSWORD on Render.` If `BACKUP_PASSPHRASE` is empty: `::error::Add the repository secret BACKUP_PASSPHRASE (a long password the owner writes down; without it the copies cannot be opened).`
  2. **Download.** `code=$(curl -sS --connect-timeout 60 --max-time 300 --retry 6 --retry-delay 20 -u "${LIVE_APP_USERNAME:-admin}:$LIVE_APP_PASSWORD" -o backup.bin -w '%{http_code}' "$SITE/api/backup?offsite=1")`. The retries cover Render's free plan, which can take about a minute to wake. If `code` is `401`: `::error::The live site refused the password. Update the LIVE_APP_PASSWORD secret to match APP_PASSWORD on Render.` If it is any other non-`200` value: `::error::The live site answered HTTP $code instead of sending the backup.`
  3. **Check the file** with an inline `python3` script (no packages). If the first 16 bytes are `b"SQLite format 3\x00"`, the extension is `.db`. Otherwise parse the file as UTF-8 JSON, and require it to be an object containing all of `settings, suppliers, purchases, weavers, rods, lots, weaver_payments, cutting_entries, customers, sales, sale_items, customer_payments`. On a parse failure or missing tables: `::error::The backup file is not complete (missing: <names>).` On success it prints only `Backup looks complete (<n> KB).` and writes the extension to `$GITHUB_ENV` as `EXT`.
  4. **Lock.** `DAY=$(TZ=Asia/Kolkata date +%F)`. Rename to `textile-backup-$DAY$EXT`, then run `7z a -t7z -mhe=on -p"$BACKUP_PASSPHRASE" "textile-backup-$DAY.7z" "textile-backup-$DAY$EXT" > /dev/null`. Install with `sudo apt-get install -y p7zip-full` first only if `command -v 7z` fails. Then delete the unlocked file with `rm -f "textile-backup-$DAY$EXT" backup.bin`, and check that `textile-backup-$DAY.7z` exists. Write `DAY` to `$GITHUB_ENV`.
  5. **Store.** `actions/upload-artifact@v4` with `name: textile-backup-${{ env.DAY }}`, `path: textile-backup-${{ env.DAY }}.7z`, `retention-days: 90`, `if-no-files-found: error` and `compression-level: 0` (it is already compressed).
  6. **Tell the app.** `code=$(curl -sS --max-time 120 --retry 3 --retry-delay 20 -u ... -o /dev/null -w '%{http_code}' -X POST "$SITE/api/backup/offsite-saved")`. If it isn't `200`: `::error::The copy was saved on GitHub, but the live site did not record it (HTTP $code). The Home screen may show an old date.`

## Data changes

- **No schema change.** No new tables or columns, and no `upgrade_old_database()` step.
- Two new **rows** in the existing key/value `settings` table, created on first use (`db.get(Setting, k) or Setting(key=k)`, the same pattern as `save_settings`):

  | key | value | written by |
  |---|---|---|
  | `backup_last_download` | ISO date-time in IST, e.g. `2026-10-14T11:20:05+05:30` | `GET /api/backup` without `offsite` |
  | `backup_last_offsite` | ISO date-time in IST | `POST /api/backup/offsite-saved` |

- Old databases have neither row, so the status shows "never" or "none saved yet". No backfill is needed.
- Nothing stored is a running total. These are event timestamps, and the ages are computed when asked.
- The `.json` backup already exports the `settings` table, so these rows travel with backups. That is harmless.

## API changes

All are in `backend/app/routers/reports.py`, next to `make_backup` and `download_backup`.

1. **New helper** `backup_status(db) -> dict`, used by the two endpoints below and by `dashboard`:
   ```json
   {
     "online_db": true,
     "last_download": "2026-10-14T11:20:05+05:30",   // or null
     "last_download_days": 0,                          // or null
     "last_offsite": "2026-10-14T02:05:11+05:30",     // or null
     "last_offsite_days": 0,                           // or null
     "offsite_overdue": false
   }
   ```
   `online_db` is `not IS_SQLITE`. An empty string stored counts as `null`.

2. **New** `GET /api/backup/status` returns `backup_status(db)`.

3. **New** `POST /api/backup/offsite-saved` takes no body, saves `backup_last_offsite`, commits, and returns `backup_status(db)`.

4. **Changed** `GET /api/backup`: new optional query parameter `offsite: bool = False`, plus `db=Depends(get_db)`. The response (file download, filename `textile-backup-YYYY-MM-DD.json|.db`) is unchanged. Side effect: when `offsite` is false, it records `backup_last_download` as described in Business rules.

5. **Changed** `GET /api/dashboard`: adds the key `"backup": backup_status(db)`. All existing keys are unchanged.

Register the routes so `GET /api/backup/status` is declared before or alongside `GET /api/backup` without clashing (different paths, so FastAPI order doesn't matter). All of them stay behind the existing HTTP Basic middleware, so there is no new unauthenticated route.

## Tests

Add to `backend/tests/test_flow.py`, or put them in a new `backend/tests/test_backup.py` that sets `TEXTILE_DATA_DIR`, `DATABASE_URL=""` and `APP_PASSWORD=""` at the top **before** importing the app, as `test_flow.py` does. To write old timestamps, use `app.database.SessionLocal` and `app.models.Setting` directly.

1. **Fresh status:** `GET /api/backup/status` gives `online_db is False`, `last_download is None`, `last_download_days is None`, `last_offsite is None` and `offsite_overdue is False` on SQLite. If the test module shares the database with other tests that download backups, first delete the two setting rows through `SessionLocal`.
2. **Manual download records time:** `GET /api/backup` returns 200 with a non-empty body. Then `status.last_download[:10] == now_ist().date().isoformat()`, `last_download_days == 0`, and `last_download` ends with `"+05:30"`.
3. **Offsite download does not touch the manual time:** store `backup_last_download = "2026-01-01T10:00:00+05:30"`, call `GET /api/backup?offsite=1` (expect 200), and check that `status.last_download == "2026-01-01T10:00:00+05:30"` and `last_download_days == (now_ist().date() - date(2026, 1, 1)).days`.
4. **Offsite confirmation:** `POST /api/backup/offsite-saved` returns 200 with `last_offsite_days == 0`, and `GET /api/backup/status` agrees.
5. **Settings form can't overwrite:** `PUT /api/settings` with `{"backup_last_offsite": "2000-01-01T00:00:00+05:30", "business_name": "X"}` leaves `status.last_offsite` unchanged, and `GET /api/settings` has no `backup_last_offsite` key.
6. **Overdue rule:** `monkeypatch.setattr(reports, "IS_SQLITE", False)` (import `app.routers.reports as reports`; `backup_status` must read the module-level name at call time). Then:
   - no `backup_last_offsite` row: `offsite_overdue is True`
   - stored 2 days ago (`(now_ist() - timedelta(days=2)).isoformat()`): `False`
   - stored 3 days ago: `True`
   - stored as `"garbage"`: `last_offsite_days is None` and `offsite_overdue is True`, with no exception
   - with `IS_SQLITE` left True, all of the above give `offsite_overdue is False`
7. **Dashboard:** `GET /api/dashboard` has a `backup` key with the same fields as `/api/backup/status`, and every existing assertion in `test_full_flow` still passes.
8. **Workflow file sanity:** read `<repo root>/.github/workflows/offsite-backup.yml` (`Path(__file__).resolve().parents[2]`) as text and check that it contains `cron: "30 20 * * *"`, `workflow_dispatch`, `retention-days: 90`, `/api/backup?offsite=1`, `/api/backup/offsite-saved`, `-mhe=on`, `LIVE_APP_PASSWORD`, `BACKUP_PASSPHRASE`, and `contents: read`. Also check that it contains **neither** `set -x` **nor** `echo "$LIVE_APP_PASSWORD` **nor** `echo "$BACKUP_PASSPHRASE`.
9. **Upgrade:** there is no schema change. `test_upgrade_old_database` must still pass unchanged.

Manual smoke checks:

- **Desktop dev** (`npm run dev` + backend): open Settings and see "Last backup downloaded: never". Click "Download backup now"; within about 3 s the line shows today's date and time and "(today)". No console errors.
- **Online look without Postgres:** set `DATABASE_URL` to a local throwaway Postgres if one is available. Otherwise temporarily force `online_db` in a scratch run (don't commit that). Check that Settings shows the safety-copy line and the amber overdue line, and that Home shows the amber notice with a working "Open Settings & backup →" link.
- **390 px phone width:** the Settings status lines and the Home notice wrap cleanly, with no horizontal scroll.
- **After merging** (the owner does this after adding the three secrets): Actions → "Night-time off-site backup" → "Run workflow". The run is green with one artifact `textile-backup-<today>`. Download it, unzip it, and open the `.7z` with 7-Zip using `BACKUP_PASSPHRASE`. The `.json` inside opens and contains `weavers` and `sales`. Opening the `.7z` **without** the password must not list the file names. On the live site, Settings shows "Last night-time safety copy: <today> … (today)", and the Home notice is gone.
- **Failure check:** temporarily set `LIVE_APP_PASSWORD` to a wrong value and run the workflow. It fails with the "refused the password" error, and the log shows neither the password nor any record data. Then restore the secret.

## Acceptance criteria

- [ ] `.github/workflows/offsite-backup.yml` exists, named "Night-time off-site backup", with the triggers, permissions, concurrency, timeout and six steps exactly as in Business rules
- [ ] The workflow stores only a `.7z` locked with `-mhe=on` using `BACKUP_PASSPHRASE`. No unlocked backup is uploaded, and the logs never print secrets or record contents
- [ ] The artifact is named `textile-backup-YYYY-MM-DD` (IST date) with `retention-days: 90`
- [ ] `GET /api/backup/status` and `POST /api/backup/offsite-saved` exist in `reports.py` and return the documented shape
- [ ] `GET /api/backup` records `backup_last_download` (IST, ISO format) only when `offsite` is not set, and still returns the file if recording fails
- [ ] `GET /api/dashboard` includes `backup` and no existing key changed
- [ ] `offsite_overdue` is true only on PostgreSQL with no copy or a copy 3 or more days old. It is always false on SQLite
- [ ] `PUT /api/settings` cannot change either backup key, and `GET /api/settings` doesn't expose them
- [ ] `util.IST` and `util.now_ist()` exist and use a fixed +05:30 offset, with no `zoneinfo`
- [ ] Settings shows "Last backup downloaded: …" on both deployments and "Last night-time safety copy: …" online only, with the exact texts above; the online paragraphs are replaced as specified
- [ ] Home shows the amber safety-copy notice with the exact texts and a link to `/settings` only when `offsite_overdue` is true
- [ ] `format.js` has `ago(days)` and `dtTime(s)` as specified
- [ ] There are no schema changes and no new Python or npm dependencies
- [ ] All tests listed above are added and green, `test_upgrade_old_database` passes, and `npm run build` was run with `frontend/dist` committed
- [ ] README and the design document are updated as listed under "Docs to update"

## Out of scope

- Backups on the shop computer (a second folder or a pen-drive reminder). That is F-009.
- Restoring a `.json` or `.db` backup from the app. That is F-015. Restore stays manual and is documented.
- Google Drive, Dropbox or e-mail uploads, and any OAuth or new Python packages.
- Changing what `make_backup()` exports, or the fixed temporary file name `download-backup.json` it writes in `DATA_DIR`.
- Making `daily_backup()` useful on Render. It stays as is; its copies are short-lived there.
- Creating the GitHub secrets. Only the owner does that, and agents never see or set the values.
- Keeping the schedule alive on a public repository with dummy commits. The 3-day Home notice is the safety net instead.

## Docs to update

- **`docs/design-document.md`**
  - *Data safety*: add a bullet "**Night-time off-site copy (live site).** A GitHub Actions job downloads the backup every night at 02:00 IST, locks it with 7-Zip (AES-256, password `BACKUP_PASSPHRASE`) and keeps it for 90 days as a workflow artifact. The app records when the last copy was saved; Home warns when it is 3 or more days old."
  - *API design* table, `reports.py` row: add `/backup/status` and `/backup/offsite-saved`, and note `/backup?offsite=1`.
  - *Implementation notes (as built)*, "Backups" row: append "Live site: nightly locked off-site copy via `.github/workflows/offsite-backup.yml`; last manual download and last off-site copy times are kept as `settings` rows `backup_last_download` / `backup_last_offsite`."
  - *Limitations and future work*: change the "Data on one computer only" row to say the live site is now covered and the shop computer is planned (F-009).
- **`README.md`**, *Backups* section: add a subsection **"Night-time off-site backup (live site)"** for the owner, with these steps:
  1. GitHub → this repository → Settings → Secrets and variables → Actions → New repository secret. Add `LIVE_APP_USERNAME` (same as `APP_USERNAME` on Render; skip it if that is `admin`), `LIVE_APP_PASSWORD` (same as `APP_PASSWORD` on Render), and `BACKUP_PASSPHRASE` (a new long password; write it in the paper book, because without it the copies cannot be opened).
  2. Actions → Night-time off-site backup → Run workflow, and check that it turns green.
  3. Whenever the Render password changes, update `LIVE_APP_PASSWORD` too.
  4. If Home shows the safety-copy notice, open Actions. If GitHub says the workflow was disabled for inactivity, click "Enable workflow".
  5. To open a copy, follow the steps in "How to bring back records from a backup" on the Settings screen.
