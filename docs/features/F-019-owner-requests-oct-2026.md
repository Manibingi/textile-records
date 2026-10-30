# F-019: Owner requests, October 2026 (one rod per machine, no lots after a finished rod, receipt totals in the Lot list, short slip and bill, no repeated bill items)

Status: in-progress · Priority: 1 · Effort: M · Data risk: low · Depends on: none

## Why

On 30-10-2026 the owner asked for five changes and said: **"don't change the existing functionality"**. Anything not listed below has to keep working exactly as it does now. In his words:

1. "If already there is rod allocated for machine, new rod can't be given to same machine until it finishes."
2. "After selecting rod finished new lot cannot be added to the same machine until new rod allocated to that machine."
3. "In lots list when 2 lots added together, meters and pieces should shown for two lots, now it's showing only for 1 lot even 2 lots added."
4. "After doing payment to weaver for printing slip no need to show details of lots, instead how much need to pay, how much paid and date enough. Same in sales bill also."
5. "In new bill section … when I selected 1 item … and after selecting add another item, in that list previously selected items should not be visible."

Who feels it:

- **Items 1 and 2: the owner and his father.** Today a second rod can be given by mistake to a machine that is already weaving, and a lot can be received on a machine whose rod is used up, for example when the wrong machine is picked. Both mistakes put the cloth and thread figures on the wrong machine and rod (Reports → Machines, the rod's "Cloth woven"), and nobody notices until the paper register doesn't match.
- **Item 3: the owner.** See the finding below.
- **Item 4: the father, who hands slips to the weavers and bills to customers.** The weaver only needs to know how much he was owed, how much he got today and when. The lot table makes the slip long and hard to read.
- **Item 5: whoever makes a bill.** Picking the same product and colour twice splits one item over two lines. The server adds the lines together for the stock check, so nothing is wrong in the data, but the bill looks wrong and is easy to get confused by.

### Finding for item 3 (investigated in the code)

The data is correct. `POST /api/lots` (`receive_lots` in `backend/app/routers/production.py`) creates one `LotBatch` and one `Lot` per line, each with its own pieces and meters, and `GET /api/lots` returns every lot. The **Lot list** (`LotList` in `frontend/src/pages/Lots.jsx`) shows one row per lot. The problem is the **Weight kg** column:

- On the first lot of a receipt it shows the **combined** weight of all lots, for example `30.500 (3 lots together)`.
- That same row shows only **that lot's** pieces and meters, for example `40` and `80.00`.
- The other lots show `↑ weighed with above`. On a phone, below 900 px, rows become separate cards, so "above" points at nothing.

So the row that says "2 lots together" shows the pieces and meters of one lot only. Nowhere in the list are the pieces and meters of the whole receipt shown next to the weight they belong to. That is exactly what the owner reports. The fix is mostly in the display. The backend adds receipt totals to each lot so the figures come from the server, not the browser.

### Conventions

No convention is broken. There are no schema changes and no stored totals. The two new refusals use `fail()` and the guards run before anything is saved. Existing endpoints only gain response fields; no request shape changes.

## What the user sees

### 1. Rods → "Give rods to weaver" (`IssueForm` in `frontend/src/pages/Rods.jsx`)

- In the **Machine** select, a machine that still has a rod that is not finished is shown **disabled** with this label:
  `Machine 3 · busy: rod R-0004 not finished` (if there are several: `Machine 3 · busy: rods R-0004, R-0005 not finished`).
  Free machines keep today's label: `Machine 3 (now: Red Check)`.
- Under the Machine field, if *every* active machine of the weaver is busy, the hint reads:
  `All machines of this weaver have a rod that is not finished. Mark a rod finished in "All rods" first.`
- Leaving **Machine** empty still works as today: rods can be given to the weaver without a machine.
- If the server refuses anyway (for example, someone else gave a rod in another browser), the red toast shows the server sentence (see Business rules, R1).
- After a successful give, the page reloads `/weavers` as well as the rod list, so the machine labels update right away.

### 2. Rods → "All rods" (`RodList`): Undo finish

- The "Undo finish" button stays where it is. If the rod's machine now has another rod that is not finished, the server refuses with the R1b sentence, shown as a red toast. There is no other change on this screen.

### 3. Lots received → "+ Receive lots" (`ReceiveForm` in `Lots.jsx`)

- In the **Machine** select, a machine that needs a new rod gets the label `Machine 3 · needs a new rod (R-0004 finished)`. It stays selectable so the user can read why.
- When such a machine is chosen, a red notice (`notice` box, red tone, use the existing `.notice` class plus `warn-text`) appears directly under the Machine field:
  `Rod R-0004 on Machine 3 was marked finished on 28-10-2026. Give a new rod to this machine first, or use "Undo finish" on R-0004 if this cloth is from that rod.`
  The notice has two link buttons: **Give a rod →** (`/rods?tab=issue`) and **All rods →** (`/rods?tab=list&status=finished`).
- While that notice is shown, the **Save** button is disabled.
- If no machine is chosen, nothing changes. The form saves as today.
- After a successful save, also reload `/weavers` (today only the rods reload), because ticking "This rod is now empty (finished)" may have just made the machine need a new rod.

### 4. Lots received → "Lot list" (`LotList`)

- Pieces, Meters and Amount on each row stay **per lot**, exactly as now. The footer totals don't change.
- **Weight kg** column:
  - A single-lot receipt, or an old lot without a receipt, shows `9.600` as today.
  - The first lot of a multi-lot receipt shows two lines:
    - line 1: `30.500` followed by `(3 lots together)` (as today)
    - line 2, in `muted small`: `All 3 lots: 119 pieces · 238.00 m`
  - Any other lot of a multi-lot receipt replaces `↑ weighed with above` with `Weighed with L-0012` (the code of the first lot in the receipt), in `muted small`. This reads correctly on desktop and on the stacked phone cards.
- **CSV export** gets two new columns after "Weight kg": `Receipt pieces` and `Receipt meters`. They are filled on the first lot of each receipt and empty on the other lots, the same way "Weight kg" is today. All existing columns stay the same.
- **Print**: same as the screen (the Table prints as it is).

### 5. Weaver payment slip (`PaymentSlip` in `frontend/src/pages/Payments.jsx`, route `/payments/slip/:id`)

The **printed** slip shows only:

- Header as today: business name, address and phone, `Weaver Payment Slip`, `No. P-0007`
- Meta: **Weaver** (name) and **Payment date** (DD-MM-YYYY)
- Totals block (`doc-totals`), as today:
  - `Total amount due before this payment` → `₹370.00`
  - `Paid now (Cash)` → `₹300.00` (big)
  - `Balance still to pay` → `₹70.00`, or `Advance given` → amount when negative
- `Notes: …` if there are notes
- Signature lines as today

**Removed from the slip:** the "Work period" and "Rate" meta rows and the lot table with its footer.

On screen only, there is a `no-print` button below the totals: `Show lots in this period ▾`. It is closed by default. Clicking it shows the existing lot table (same columns, same footer) with the heading `Lots after DD-MM-YYYY to DD-MM-YYYY` (or `Lots from start to DD-MM-YYYY`). Clicking again (`Hide lots ▴`) closes it. The whole block, button and table, has class `no-print`, so it never prints even when open. This keeps today's information available to the owner without putting it on the slip.

### 6. Printed bill (`Invoice` in `frontend/src/pages/Sales.jsx`, route `/sales/bill/:id`)

The **printed** bill shows:

- Header as today: business name, address and phone, GSTIN, `Bill`, `INV-0004 · 30-10-2026`
- Meta as today: Bill to, Phone, Address, GSTIN (each only if present)
- A totals block (`doc-totals`, the same layout as the slip):
  - `Pieces` → `120` (total pieces on the bill, one number)
  - `This bill` → `₹9,600.00`
  - `Previous balance` → `₹1,500.00` (if negative: label `Advance from before`, value as a positive amount)
  - `Total to pay` → `₹11,100.00` (big)
  - `Received on 30-10-2026` → `₹2,000.00` (₹0.00 if nothing was received that day)
  - `Balance to pay` → `₹9,100.00`, or `Advance with us` → amount when negative
- `Notes: …` if there are notes
- Signature lines as today

**Removed from the bill:** the item table (#, Item, Pieces, Rate, Amount, footer).

On screen only, there is a `no-print` toggle `Show items on this bill ▾` that shows the existing item table. It is closed by default and never prints.

On screen only, there is also a `no-print` hint under the totals:
`Money received today not showing? Enter it in Money received with the bill date, then open this bill again.` The words "Money received" link to `/sales?tab=receive&customer=<customer_id>`.

The Bills list, the customer account, CSV exports and everything else keep showing items as today.

### 7. Sales → "+ New bill" (`BillForm` in `Sales.jsx`)

- In each line's **Product & colour** select, the options are the ready items **minus the items already chosen on other lines**. The line's own current choice always stays in its own list.
- When a line is removed (✕) or changed, the freed item comes back in the other lines' lists at once.
- When every ready item is already chosen on some line, the **+ Add another item** button is disabled and shows the hint `All packed items are already on this bill.` under it.
- Nothing else changes: the "(120 ready)" label, the "⚠ Only N ready" hint, the total box, and saving.

### Phone (390 px)

- Rods: the disabled machine options are readable in the native select.
- Lots: the red notice wraps and its two link buttons stack. The Lot list cards show the two-line weight cell and "Weighed with L-0012".
- Slip and bill: the totals block is already one column on phones. The toggles are full-width ghost buttons.

## Business rules

All three rule checks live in one new helper in `backend/app/calc.py`:

```python
def machine_rods(db, machine_id):
    """Rod state of one machine. Rods taken back to stock have no machine, so they don't count."""
    rods = db.query(Rod).filter(Rod.machine_id == machine_id,
                                Rod.status.in_(["with_weaver", "finished"])).order_by(Rod.id).all()
    running = [r for r in rods if r.status == "with_weaver"]
    finished = [r for r in rods if r.status == "finished"]
    last = max(finished, key=lambda r: (r.finished_date or date.min, r.id)) if finished else None
    return {"running": running, "last_finished": last, "needs_new_rod": (not running) and last is not None}
```

(The "last finished" pick is done in Python so NULL ordering doesn't differ between SQLite and PostgreSQL.)

Wording helpers: `codes = ", ".join(r.code for r in running)` (in id order). `dmy(x) = x.strftime("%d-%m-%Y")`.

### R1: one running rod set per machine (`POST /api/rods/issue`)

- This applies only when `machine_id` is given. Rods given without a machine are not checked.
- Before any rod is changed, after the existing "machine belongs to this weaver" check and **before** the existing per-rod "not in stock" check, call `machine_rods(db, m.id)`. If `running` is not empty, refuse:
  - one rod: `fail(f"Machine {m.number} of {w.name} already has rod {codes} that is not finished. Mark it finished (or take it back to stock) before giving a new rod.")`
    → e.g. `Machine 3 of Raman already has rod R-0004 that is not finished. Mark it finished (or take it back to stock) before giving a new rod.`
  - several rods: `fail(f"Machine {m.number} of {w.name} already has rods {codes} that are not finished. Mark them finished (or take them back to stock) before giving a new rod.")`
- **Several rods in one give are still allowed** to an empty machine (towel looms can run a ground beam and a pile beam together, and lots can already link to more than one rod). After that, the machine counts as busy until **all** of those rods are finished or taken back.
- A machine counts as free again when each of its rods is either **finished** (the Finished button in All rods, or the "This rod is now empty" tick when receiving lots) or **taken back to stock** ("Back to stock", `POST /rods/{id}/return`, which clears `machine_id`). Return keeps its existing guard: it is refused once lots are linked.
- Old data: machines that already have two or more `with_weaver` rods are left as they are. Nothing is changed or refused for them except the next give to that machine.

### R1b: Undo finish must not create a second running rod (`POST /api/rods/{id}/reopen`)

- This applies only when the rod has a `machine_id`. After the existing `status != "finished"` check, compute `others = [x for x in machine_rods(db, r.machine_id)["running"] if x.id != r.id]`. If `others` is not empty, refuse:
  - one: `fail(f"Machine {r.machine.number} of {r.weaver.name} already has rod {codes} running. Finish that rod (or take it back to stock) before undoing the finish of {r.code}.")`
  - several: `fail(f"Machine {r.machine.number} of {r.weaver.name} already has rods {codes} running. Finish those rods (or take them back to stock) before undoing the finish of {r.code}.")`
  (`codes` here is built from `others`.)
- If the rod has no weaver, use `"this weaver"` in place of the name. (This cannot happen in practice, but it avoids an AttributeError.)
- Rods without a machine reopen as today.

### R2: no lots on a machine whose rod is finished until it gets a new rod (`POST /api/lots`)

- This applies only when `machine_id` is given. **Lots received without choosing a machine are not affected**, because the machine is optional today and some machines are not tracked with rods.
- After the existing "machine belongs to this weaver" check, and before the rods loop and before the `LotBatch` is created, call `st = machine_rods(db, m.id)`. If `st["needs_new_rod"]`, refuse:
  - `fail(f"Machine {m.number} of {w.name} has no running rod: rod {last.code} was marked finished on {dmy(last.finished_date)}. Give a new rod to this machine first, or use 'Undo finish' on {last.code} if this cloth is from that rod.")`
    → e.g. `Machine 3 of Raman has no running rod: rod R-0004 was marked finished on 28-10-2026. Give a new rod to this machine first, or use 'Undo finish' on R-0004 if this cloth is from that rod.`
  - If `last.finished_date` is NULL: `... has no running rod: rod {last.code} is marked finished. Give a new rod ...` (same remaining text).
- **Old data and opening state:** a machine that has **never** had a rod recorded on it (no rows in `rods` with this `machine_id` in status `with_weaver` or `finished`) is **not** blocked. This covers machines that were weaving before the app was used and shops that don't record rods for every machine. A machine whose only rods were taken back to stock (machine cleared) is also not blocked.
- A machine with a rod `with_weaver` is never blocked, even if it also has older finished rods. That is the normal case.
- A receipt that finishes the running rod in the same save (`finish_rod_ids`) is allowed, because the check runs before the finish. The **next** receipt for that machine is refused until a new rod is given or the finish is undone.
- A late entry for cloth from a rod that is already finished is refused (deliberately strict, matching the owner's words). The remedy is in the message: Undo finish, receive the lot, and tick "This rod is now empty (finished)" again.
- A running rod given to the weaver **without** a machine does not count for any machine.
- Nothing is saved when refused (no batch, no lots, no rod status change).

### Item 3: receipt totals per lot (`lot_out` in `production.py`)

- `batch_pieces = sum(x.pieces for x in b.lots)` if the lot has a batch, else `l.pieces`.
- `batch_meters = r2(sum(x.meters for x in b.lots))` if it has a batch, else `r2(l.meters)`.
- `first_lot_code = b.lots[0].code` if it has a batch, else `l.code`. (`LotBatch.lots` is already ordered by `Lot.id`.)
- Existing fields (`pieces`, `meters`, `amount`, `weight_kg`, `batch_lot_count`, `first_in_batch`) are unchanged.

### Item 4: bill account figures (new `calc.bill_account(db, s)`)

The ordering follows `calc.ledger`, where the same day's bills come before the same day's receipts:

- `bills_before = Σ Sale.total` for the same customer where `Sale.date < s.date` **or** (`Sale.date == s.date` and `Sale.id < s.id`)
- `received_before = Σ CustomerPayment.amount` for the customer where `date < s.date`
- `previous_balance = r2(customer.opening_balance + bills_before − received_before)`
- `bill_amount = r2(s.total)`
- `total_due = r2(previous_balance + bill_amount)`
- `received_on_date = r2(Σ CustomerPayment.amount where date == s.date)`
- `balance_after = r2(total_due − received_on_date)`

Example: opening ₹500. Bill A on 01-10 for ₹1,000. ₹300 received on 01-10. Bill B on 05-10 for ₹2,000. ₹1,000 received on 05-10.
- Bill A: previous 500.00, this bill 1,000.00, total 1,500.00, received on 01-10-2026 300.00, balance 1,200.00.
- Bill B: previous 1,200.00, this bill 2,000.00, total 3,200.00, received on 05-10-2026 1,000.00, balance 2,200.00.

If there are two bills on the same day, both show all of that day's money received. The second bill's balance is the true end-of-day balance. This is accepted and documented, not a bug.

The weaver slip needs no new figures. It already returns `due_before`, `payment.amount`, `payment.date` and `balance_after`.

### Item 5

This is UI only. The server keeps accepting the same product and colour on two lines (the stock check already adds them up), so nothing existing changes.

### Warnings

There are no new warnings.

## Data changes

None. There are no new tables or columns and no `upgrade_old_database()` step. The rules read the existing `rods.status`, `rods.machine_id` and `rods.finished_date` columns. The new figures (`machine_rods`, `batch_pieces`, `batch_meters`, `bill_account`) are computed per request and never stored.

## API changes

| Method · path | Router | Change |
|---|---|---|
| `POST /api/rods/issue` | production.py | **Changed:** new 400 refusal R1. Request and response unchanged. |
| `POST /api/rods/{id}/reopen` | production.py | **Changed:** new 400 refusal R1b. Request and response unchanged. |
| `POST /api/lots` | production.py | **Changed:** new 400 refusal R2. Request unchanged. The response's `lots[]` items gain the new lot fields below. |
| `GET /api/lots`, `GET /api/lots/{id}` | production.py | **Changed (additive):** each lot gains `batch_pieces` (int), `batch_meters` (float, 2 dp) and `first_lot_code` (str). |
| `GET /api/weavers`, `GET /api/weavers/{id}` | masters.py | **Changed (additive):** each `machines[]` item gains `running_rods` (list of codes, e.g. `["R-0004"]`), `last_finished_rod` (`{"code": "R-0003", "finished_date": "2026-10-28"}` or `null`) and `needs_new_rod` (bool). Change `machine_out(m)` to `machine_out(m, db=None)`. The extra fields are added only when `db` is given. `weaver_out` passes `db`. The machine POST and PUT responses (masters.py lines ~178 and ~191) may stay without the extra fields. |
| `GET /api/sales/{id}` | money.py | **Changed (additive):** when `full=True`, it adds `"account": {"previous_balance", "bill_amount", "total_due", "received_on_date", "balance_after"}` (all r2 floats) from `calc.bill_account`. `GET /api/sales` (the list) is unchanged. |
| `GET /api/weaver-payments/{id}/slip` | money.py | Unchanged. The lot data stays in the response for the on-screen toggle. |

Use the same `machine_rods` helper for the output fields as for the refusals, so the screen and the server always agree.

## Tests

Add these to `backend/tests/test_flow.py`. Each test creates its own weaver, because the module shares one temp database. Rods need thread, so post a purchase first. A stock warning is fine.

**`test_one_running_rod_per_machine` (R1, R1b)**
1. Create a weaver with 2 machines (M1, M2) and wind rods A, B, C, D.
2. Give A to M1 → 200.
3. Give B to M1 → 400, and `detail == f"Machine {M1.number} of {name} already has rod {A.code} that is not finished. Mark it finished (or take it back to stock) before giving a new rod."`. B is still `in_stock` (GET /rods?status=in_stock contains B).
4. Give B to M2 → 200. Give C with no machine → 200.
5. Give D to M1 together with nothing else → still 400 (A is running).
6. Finish A → give D to M1 → 200.
7. Two rods in one give: take D back (`/return`, no lots) → 200. Then give both D and a new rod E to M1 in one request → 200. Give a new rod F to M1 → 400 with the plural sentence `... already has rods {D.code}, {E.code} that are not finished. Mark them finished (or take them back to stock) before giving a new rod.`
8. Return frees the machine: return D and E → give F to M1 → 200.
9. Reopen guard: A (finished, on M1) and F running on M1 → `POST /rods/{A}/reopen` → 400, `detail == f"Machine {M1.number} of {name} already has rod {F.code} running. Finish that rod (or take it back to stock) before undoing the finish of {A.code}."`. Finish F → reopen A → 200 and A is `with_weaver`.
10. A rod with no machine reopens freely: finish C (no machine) → reopen C → 200.

**`test_no_lots_after_finished_rod` (R2)**
1. A weaver with 3 machines. M3 has never had a rod. Receive a lot on M3 → 200 (old data and opening state are not blocked).
2. Give rod A to M1. Receive a lot on M1 with `rod_ids=[A]` and `finish_rod_ids=[A]` → 200, and A is `finished`.
3. Count the lots (`GET /lots?weaver_id=`). Receive another lot on M1 → 400, `detail == f"Machine {M1.number} of {name} has no running rod: rod {A.code} was marked finished on {dd-mm-yyyy of the receipt date}. Give a new rod to this machine first, or use 'Undo finish' on {A.code} if this cloth is from that rod."`. The lot count is unchanged.
4. The same receipt with **no machine** → 200.
5. `GET /weavers/{id}`: M1 has `needs_new_rod is True`, `running_rods == []` and `last_finished_rod["code"] == A.code`. M3 has `needs_new_rod is False` and `last_finished_rod is None`.
6. Reopen A → receive a lot on M1 → 200. Finish A again via the Finished endpoint.
7. Give a new rod B to M1 → receive a lot on M1 → 200, and M1 has `needs_new_rod is False` and `running_rods == [B.code]`.
8. A rod that was taken back: give C to M2, return C → receive a lot on M2 → 200 (no finished rods there).

**`test_lot_list_receipt_totals` (item 3)**
- Receive 2 lines `{40, 80}` and `{38, 76.5}` with no machine. Both lots in `GET /lots?weaver_id=` have `batch_pieces == 78`, `batch_meters == 156.5`, `batch_lot_count == 2` and `first_lot_code ==` the first lot's code. `pieces` and `meters` stay per lot (40/80.0 and 38/76.5).
- Extend the assertions in `test_many_lots_one_weight_and_cutting_by_colour`: `rec["lots"][0]["batch_pieces"] == 119` and `batch_meters == 238`.

**`test_bill_account` (item 4)**
- The worked example from Business rules: customer opening 500, bill A on 2026-10-01 for 1000 (needs packed stock: add an opening cutting entry first), received 300 on 2026-10-01, bill B on 2026-10-05 for 2000, received 1000 on 2026-10-05.
- `GET /sales/{A}`: `account == {"previous_balance": 500, "bill_amount": 1000, "total_due": 1500, "received_on_date": 300, "balance_after": 1200}`.
- `GET /sales/{B}`: `previous_balance == 1200`, `total_due == 3200`, `received_on_date == 1000` and `balance_after == 2200`.
- `GET /sales` (list) items have no `account` key.

**Existing tests:** `test_full_flow` (slip asserts `len(slip["lots"]) == 1`), `test_many_lots…` and `test_upgrade_old_database` must stay green with no other edits. Extend `test_upgrade_old_database` with `assert l['batch_pieces'] == 40 and l['batch_meters'] == 60 and l['first_lot_code'] == 'L-0001'`. This is an old lot without a batch, and there is no schema change.

**Manual smoke (desktop 1366 px and phone 390 px, `npm run dev` with the backend running):**
- Rods → Give rods: a busy machine is disabled with the "busy" label. Give to a free machine → the toast appears and the label updates without a page refresh.
- All rods: Undo finish on a rod whose machine has a new rod → red toast with the R1b sentence.
- Receive lots: choose a machine whose rod is finished → red notice, Save disabled, both links work. Choose no machine → saves. Tick "This rod is now empty" on save → choose the same machine again → the notice appears without reloading the page.
- Lot list: a 2-lot receipt shows `(2 lots together)` and `All 2 lots: … pieces · … m` on the first row, and `Weighed with L-xxxx` on the second. CSV has `Receipt pieces` and `Receipt meters`. The footer totals are unchanged.
- Payment slip: Print preview shows no lot table, no work period and no rate. The on-screen toggle opens and closes the lot table, and it does not appear in print preview even when open.
- Bill: Print preview shows the totals block with no item table. The figures match the worked example. The toggle shows items on screen only. The "Money received" link opens the receive tab with the customer chosen.
- New bill: choose Towel Red on line 1, then Add another item → Towel Red is not in line 2's list. Remove line 1 → it reappears. With all items chosen, Add another item is disabled with the hint.
- No console errors. `npm run build` is clean and `frontend/dist` is committed.

## Acceptance criteria

**Item 1: one rod per machine**
- [ ] `POST /rods/issue` with a machine that has a `with_weaver` rod returns 400 with the exact R1 sentence (singular or plural), and no rod changes status.
- [ ] Several rods in one give to an empty machine still succeed. Rods given without a machine are never refused by R1.
- [ ] Finishing (the button or the lot-receipt tick) or returning to stock frees the machine.
- [ ] `POST /rods/{id}/reopen` is refused with the exact R1b sentence when another rod is running on the same machine, and works otherwise.
- [ ] The Give rods screen shows busy machines disabled with the `busy: rod … not finished` label, and refreshes after a give.

**Item 2: no lots after a finished rod**
- [ ] `POST /lots` to a machine with a finished rod and no running rod returns 400 with the exact R2 sentence, and saves nothing.
- [ ] Machines that never had a rod, machines with a running rod, and receipts with no machine are not refused.
- [ ] A receipt that finishes the running rod in the same save is accepted. The next one is refused until a new rod is given or the finish is undone.
- [ ] Machines in `/weavers` carry `running_rods`, `last_finished_rod` and `needs_new_rod`, computed by `calc.machine_rods`.
- [ ] The Receive lots screen shows the red notice and disables Save for such a machine, and refreshes machine state after saving.

**Item 3: receipt totals in the Lot list**
- [ ] Every lot from `/lots` has `batch_pieces`, `batch_meters` and `first_lot_code`, correct for multi-lot receipts, single-lot receipts and old lots without a batch.
- [ ] The first row of a multi-lot receipt shows `All N lots: P pieces · M m`. The other rows show `Weighed with L-xxxx`.
- [ ] Per-lot Pieces, Meters, Amount and the footer totals are unchanged. CSV gains `Receipt pieces` and `Receipt meters` only.

**Item 4: short slip and bill**
- [ ] The printed weaver slip has the header, weaver, payment date, due before, paid now (mode), balance or advance, notes and signatures, and **no** lot table, work period or rate.
- [ ] The slip's lot table is available on screen behind a closed-by-default `no-print` toggle.
- [ ] `GET /sales/{id}` returns `account` with the five figures from the formulas, r2-rounded. The bill list does not.
- [ ] The printed bill has the header, customer details, Pieces, This bill, Previous balance (or Advance from before), Total to pay, Received on <date>, Balance to pay (or Advance with us), notes and signatures, and **no** item table.
- [ ] The bill's item table is available on screen behind a closed-by-default `no-print` toggle. The "Money received" hint links to the receive tab with the customer chosen.
- [ ] `GET /weaver-payments/{id}/slip` is unchanged, and the existing slip test passes.

**Item 5: no repeated bill items**
- [ ] A product and colour chosen on one line is not offered on the other lines. A line keeps its own choice. Removing or changing a line frees the item.
- [ ] "+ Add another item" is disabled with `All packed items are already on this bill.` when every ready item is used.
- [ ] `POST /sales` is unchanged.

**General**
- [ ] No schema change. All existing tests pass unchanged except the listed additive assertions.
- [ ] The new pytest cases above pass. `npm run build` is clean and `frontend/dist` is committed.
- [ ] `docs/design-document.md` is updated as listed below.

## Out of scope

- Changing the machine of a rod that is already given (today the remedy is Back to stock and give again, which is only possible before lots are linked).
- Limiting one give to a single rod per machine. Several rods together stay allowed.
- Blocking or warning on lots received **without** a machine.
- Allowing late lot entries dated on or before the finish date without "Undo finish". This is deliberately strict for now.
- A "Money received now" field on the New bill form. Money is still entered in "Money received" (see the open question in the report).
- Removing lot or item data from any API, CSV, list or ledger. Only the two printouts change.
- Any server-side refusal of duplicate bill lines.

## Docs to update

- **Core calculations and business rules → Rules the app enforces:** add these rows:
  - "Giving a rod to a machine that still has a rod not finished: Refused, naming the rod."
  - "Undo finish while the machine has another running rod: Refused."
  - "Receiving lots on a machine whose last rod is finished and that has no running rod: Refused (machines never given a rod, and receipts without a machine, are not checked)."
- **Core calculations and business rules:** add the bill account formulas (previous balance, received on the bill date, balance after).
- **API design → Conventions:** note that `GET /lots` items carry receipt totals (`batch_pieces`, `batch_meters`, `first_lot_code`), `/weavers` machines carry the rod state, and `GET /sales/{id}` carries `account`.
- **UI and UX design → Screens / Devices and output:** the payment slip and bill print only the money summary. Lot and item details are on screen behind a toggle. New bill hides items already chosen on other lines.
- **Implementation notes (as built):** add an F-019 entry summarising the five changes.
