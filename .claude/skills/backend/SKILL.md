---
name: backend
description: Conventions for the Textile Records Python backend as actually built (FastAPI, Pydantic 2, SQLAlchemy 2, util.py helpers, calc.py, pytest with TestClient). Use when adding or changing API endpoints, routers, request bodies, business calculations (thread stock, rod/comb net weight, weaver pay, pieces waiting, ready stock, customer balance, profit), validation, warnings, guarded deletes, backups, login, or backend tests.
---

# Textile Records — Backend

The code is the reference. Before writing anything, open the router you're extending and copy its patterns. Read `docs/design-document.md` for product behaviour.

## Layout

```
backend/
  requirements.txt        fastapi, uvicorn[standard], sqlalchemy>=2, pydantic>=2, psycopg[binary]>=3, python-dotenv
                          (tests also need: pytest httpx; install them in the venv, not requirements.txt)
  .env.example            DATABASE_URL, DB_POOL_SIZE, DB_MAX_OVERFLOW, TEXTILE_DATA_DIR, TEXTILE_UI_DIR,
                          APP_USERNAME, APP_PASSWORD, CORS_ORIGINS
  app/
    main.py               create_all + upgrade_old_database() at import; lifespan → daily_backup();
                          CORS; HTTP Basic login middleware (only when APP_PASSWORD is set);
                          includes routers; serves frontend/dist with an SPA fallback
    database.py           .env loading, DATA_DIR, engine (SQLite or Postgres), SessionLocal, Base,
                          upgrade_old_database(), get_db()
    models.py             classic Column-style models; lot_rods association Table
    util.py               In, get_or_404, fail, r2, r3, d, key, date_filter
    calc.py               every computed figure: thread_stock, thread_available, thread_with_weaver,
                          uncut_stock, uncut_for, finished_stock, weaver_balance, weaver_since_last_payment,
                          customer_balance, ledger
    routers/
      masters.py          /api/settings /suppliers /weavers /weavers/{id}/machines /machines/{id} /customers
      production.py       /api/purchases /thread-stock /rods /rods/issue /rods/{id}/finish|return|reopen
                          /thread-issues /lots /cutting /uncut-stock /finished-stock
      money.py            /api/weaver-dues /weaver-payments /weaver-payments/{id}/slip /weavers/{id}/ledger
                          /sales /customer-payments /customers/{id}/ledger
      reports.py          /api/dashboard /reports/summary|weavers|machines|suppliers|sales|wastage /backup;
                          make_backup(), BACKUP_EXT
  tests/test_flow.py      module-level TestClient on a temp SQLite file
```

There is no `schemas.py`. **Request models are defined in the router file just above their endpoints** and subclass `util.In`. Responses are plain dicts built by `xxx_out(obj)` helper functions in the same router.

## Router pattern (copy this)

```python
router = APIRouter(prefix="/api")

class PurchaseIn(In):                      # In = BaseModel with str_strip_whitespace=True
    date: date
    thread_type: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    rate_per_kg: float = Field(0, ge=0)

def purchase_out(p):
    return {"id": p.id, "date": d(p.date), "quantity_kg": r3(p.quantity_kg), "amount": r2(p.amount), ...}

@router.get("/purchases")
def list_purchases(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(Purchase), Purchase.date, from_, to)
    return [purchase_out(p) for p in q.order_by(Purchase.date.desc(), Purchase.id.desc())]
```

## util.py helpers (use them; don't reinvent)

| Helper | Use |
|---|---|
| `In` | Base for every request body; trims text |
| `fail(msg)` | `HTTPException(400, msg)`; one plain sentence with numbers, written for the shop owner |
| `get_or_404(db, Model, id, "Weaver")` | Fetch or 404 |
| `r2(x)` | Money: half-up to 2 decimals (via Decimal), returned as float. Apply on store **and** on output |
| `r3(x)` | kg to 3 decimals |
| `d(date)` | ISO string or None |
| `key(*parts)` | Case- and space-insensitive grouping key (`"Red"` == `"red "`) |
| `date_filter(q, col, from_, to)` | Inclusive date range for list endpoints |

## Business logic rules

- **Formulas live in `calc.py`.** Routers call them. A figure the user sees is never computed only in the browser.
  - `net_rod = gross_weight − rod_weight` (refuse if ≤ 0)
  - `net_combs = gross_weight − combs × comb_weight` (refuse if ≤ 0)
  - `stock_kg = purchased − rods' net − (given − returned)`, grouped by `key(thread_type, color)`
  - Lot `amount = r2(meters × weaver.rate_per_meter)`. The rate is **copied onto the lot** at save time and never recomputed.
  - `weaver_balance = opening + Σ lot.amount − Σ payments` (negative = advance)
  - `waiting = Σ lot.pieces − Σ (good + rejected) where source == "woven"`
  - `in_stock = Σ good (all sources) − Σ sale_items.quantity`
  - `customer_balance = opening + Σ bills − Σ received`
  - Ledgers go through `calc.ledger(opening, entries)` for the running balance.
- **Warnings:** a soft problem still saves, and the endpoint returns `out["warning"] = "…"`. Existing cases: thread over-issue, and cutting more than is waiting.
- **Hard refusals:** `fail("…")`. Existing message style: `"Not enough stock: only 38 pieces of Towel Red are packed and ready."`
- **Guarded deletes:** query dependants first, then `fail("This weaver already has … You can mark them as 'Not working' instead.")`. Every new relationship needs a guard on delete.
- **Codes** are assigned after `db.flush()` from the id: `R-{id:04d}`, `L-{id:04d}`, `INV-{id:04d}` (batches use `R{id:04d}`). They are stored in the `code` / `invoice_no` columns and never accepted from the client.
- **Multi-row writes** (a lot receipt, a bill with items) are built and committed once at the end; a `fail()` before the commit leaves nothing saved.
- **Settings** is a key/value table (`Setting.key`, `Setting.value` as text). Add a new setting by giving it a default in `get_settings` in `masters.py`. Don't add columns.
- **Login:** `main.py` enforces HTTP Basic when `APP_PASSWORD` is set. New endpoints are covered automatically. Never add an unauthenticated route except the SPA fallback.
- **Database portability:** the same code runs on SQLite and PostgreSQL. Use SQLAlchemy expressions, not dialect-specific SQL. For raw SQL in upgrades, see the `database` skill.

## Tests

- `tests/test_flow.py` sets `TEXTILE_DATA_DIR` to a temp dir, clears `DATABASE_URL` and `APP_PASSWORD` **before** importing the app, then uses a module-level `TestClient`. New test files must do the same at the top, or extend `test_flow.py`.
- Assert exact numbers (`== 79.8`) and exact refusal behaviour (`status_code == 400`), plus `warning` presence.
- Schema change: extend `test_upgrade_old_database`, which builds an old-format SQLite file and opens it in a subprocess.
- Run: `cd backend && .venv/Scripts/python -m pytest -q tests`. All tests must be green before committing.

## Checklist

- [ ] Request model subclasses `In`, with `Field` ranges (`gt=0` for weights and amounts, `ge=0` for counts)
- [ ] Formula in `calc.py`; `r2`/`r3` on store and output; `key()` for name grouping
- [ ] `fail()` messages are plain sentences; soft problems use `warning`
- [ ] Guarded deletes for new dependencies
- [ ] Works on SQLite and Postgres
- [ ] Tests added and green; API table in `docs/design-document.md` updated
