---
name: database
description: Conventions for the Textile Records database as actually built — SQLAlchemy 2 Column-style models that run on BOTH local SQLite (shop computer) and PostgreSQL (Neon/Supabase, used by the Render deployment); computed-not-stored totals; case-insensitive name matching; adding columns/tables safely with upgrade_old_database(); guarded deletes; backups (.db for SQLite, .json for Postgres). Use whenever a change touches models.py, database.py, the schema, upgrades, backups, or aggregate queries.
---

# Textile Records — Database

Two kinds of real databases hold the business's records, and both must keep working after every release:

- **SQLite** at `backend/data/textile.db` (or `$TEXTILE_DATA_DIR/textile.db`), used when `DATABASE_URL` is empty, as on the shop computer.
- **PostgreSQL** (Neon or Supabase, via `postgresql+psycopg`), used when `DATABASE_URL` is set, as on the online Render deployment.

Neither can be re-created if lost. **Any schema change ships with an upgrade path that works on both.**

## Tables (models.py; 16 including the lot_rods link)

| Table | Model | Notes |
|---|---|---|
| settings | `Setting` | **key/value** (`key` PK, `value` text). New settings are new keys, not new columns |
| suppliers | `Supplier` | name, phone, address, gstin, payment_terms |
| purchases | `Purchase` | `supplier_id NULL` = opening stock; thread_type, color, quantity_kg, rate_per_kg, amount |
| weavers | `Weaver` | rate_per_meter, opening_balance, active |
| machines | `Machine` | weaver_id, number, current_design, current_color, active |
| rods | `Rod` | code R-0001, gross_weight, rod_weight, net_weight, length_m (549), status in_stock / with_weaver / finished |
| lot_batches | `LotBatch` | one receipt weighed together; code, weight_kg |
| lots | `Lot` | code L-0001, product, color, pieces, meters, rate_per_meter (frozen), amount, batch_id |
| lot_rods | association `Table` | lot_id + rod_id |
| thread_issues | `ThreadIssue` | combs, gross_weight, comb_weight, quantity_kg (net), kind given / returned |
| weaver_payments | `WeaverPayment` | amount, mode |
| cutting_entries | `CuttingEntry` | product, color, good_pieces, rejected_pieces, bundles, source woven / opening; lot_id only on old rows |
| customers | `Customer` | opening_balance |
| sales | `Sale` | invoice_no INV-0001, total; items cascade |
| sale_items | `SaleItem` | product, color, quantity, rate, amount |
| customer_payments | `CustomerPayment` | amount, mode |

Columns use `Float` for weights and money, with rounding enforced in code (`util.r2` / `util.r3`). **Don't migrate existing columns to `Numeric`.** That rewrites live data on two database engines for little gain. New money columns follow the same Float + `r2` convention.

## Rule 1: totals are computed, never stored

Stock, holdings, dues, pieces waiting, ready stock, balances and profit are aggregated at query time in `calc.py`. Never add a `stock` / `balance` / `due` column, a counter, or a trigger. The only stored derived values are per-row snapshots kept on purpose: `net_weight`, `quantity_kg` (net), lot `rate_per_meter` and `amount`, sale item `amount`, and sale `total`.

## Rule 2: names match ignoring case and surrounding spaces

`thread_type`, `color` and `product` are free text, trimmed on input (`In` does it). Grouping uses `util.key()`. Any new free-text grouping field follows the same rule.

## Rule 3: schema changes go through `upgrade_old_database()` (database.py)

`Base.metadata.create_all(engine)` runs at import and **creates new tables** on both engines. It never alters existing tables.

- **New table:** add the model. Nothing else is needed for creation. Guard deletes that the new links create.
- **New column:** add it to the model **and** to the `add` dict in `upgrade_old_database()`:
  ```python
  add = {
      ...,
      "lots": [("batch_id", "INTEGER"), ("dyed", "BOOLEAN DEFAULT FALSE")],
  }
  ```
  Then backfill old rows with an `UPDATE … WHERE new_col IS NULL` inside the same `engine.begin()` block, the way `cutting_entries.source` is filled.
- **Portable SQL only.** Raw DDL and DML run on SQLite **and** Postgres. Use `INTEGER`, `FLOAT`, `VARCHAR`, `TEXT`, `DATE`, `BOOLEAN DEFAULT FALSE/TRUE` (not `0/1`), and `DEFAULT 0` / `DEFAULT ''`. Don't use `AUTOINCREMENT`, SQLite-only `PRAGMA`, Postgres-only `SERIAL`, or `IF NOT EXISTS` on `ADD COLUMN` (SQLite lacks it; the inspector check replaces it). Quote nothing that doesn't need quoting.
- New columns must be nullable or have a default. Existing figures must not change for old rows.
- **Forbidden:** dropping or renaming tables or columns that hold data, changing what a column means, or rewriting historical amounts. A redesign adds a new column, copies the data in the upgrade step, and leaves the old one unused.
- **Test:** extend `test_upgrade_old_database` in `backend/tests/test_flow.py`. It builds an old-format SQLite file, starts the app on it in a subprocess, and asserts the old rows survive and the new column works. CI and local tests use SQLite only, so for Postgres the reviewer checks the SQL by reading it against the portability rules above.

## Rule 4: relationships and deletes

- There is no `ON DELETE CASCADE` on business records (the only cascade is `Sale.items`). Deletes are guarded in routers: check dependants and `fail()` naming what to delete first.
- Opening figures: `weavers.opening_balance` and `customers.opening_balance`, `purchases.supplier_id IS NULL`, `cutting_entries.source = 'opening'`. New ledgers that start from old paper books follow the same idea.

## Rule 5: backups (reports.py, main.py)

- `daily_backup()` runs on each start: `data/backups/textile-YYYY-MM-DD.db` (SQLite online backup API) or `.json` (Postgres: every table exported). It keeps 30, and a failure is logged, never raised.
- `GET /api/backup` downloads a fresh copy.
- On Render the local disk is temporary. Automatic `.json` backups there disappear on each redeploy or restart, so downloads (or an off-site copy feature) are the real safety net there.
- Never write code that deletes or overwrites `textile.db` or a production database. Never commit `backend/data/` or `.env`.

## Checklist

- [ ] No stored totals; aggregates in `calc.py`
- [ ] New column in the model **and** the `upgrade_old_database()` `add` dict, nullable or defaulted, backfilled
- [ ] Raw SQL valid on both SQLite and PostgreSQL
- [ ] `test_upgrade_old_database` extended and green
- [ ] Guarded deletes for new links
- [ ] Data model table in `docs/design-document.md` updated
