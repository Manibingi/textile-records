# F-020: One bill price per piece, and colours used in each rod design

Status: in-review · Priority: 2 · Effort: M · Data risk: low · Depends on: F-019 (branch is based on the F-019 branch, not yet merged)

## Why

Two owner requests, from the design document review:

1. **New bill.** Every towel of one colour has the same price, so a rate on each line is repeated work. One price per piece for the whole bill is enough, and the bill total is the total pieces × that price.
2. **Wind a new rod.** Every design uses white and one other colour, or white with two or three colours. The rod must record each colour used and how much thread of that colour went on it, so that thread stock per colour is right.

## What the user sees

### Rods → "+ Wind new rod"
- The single Colour field is replaced by **Colours used in this rod**: one line per colour, with a colour name and its thread weight (kg). **+ Add another colour** adds a line; ✕ removes one.
- Chips show the colours in stock for the typed thread type; a chip fills the first empty line, unless the colour is already on the rod.
- A CalcBox shows `White 10.000 kg + Red 3.340 kg = 13.340 kg`, and says whether it matches the net thread. A mismatch is red and the server refuses the save.
- Colour names of the last rod carry over to the next rod; the weights are typed again.

### Sales → "+ New bill"
- Each item line has product & colour and pieces only (no rate, no per-line amount).
- One **Price per piece (₹)** box, below the items, applies to every item.
- The bill total box shows `N pieces × ₹ each` and the total.

## Business rules

- **Rod colours:** `colors` (list of `{color, kg}`) must add up to the net thread (`gross − steel rod`) to 3 decimals. Otherwise: `The colours add up to X kg, but the net thread on this rod is Y kg. Check the weight of each colour.` A colour may be used only once per rod (case and spaces ignored). A colour name and a weight above 0 are required on every line.
- With no `colors` list, the old single `color` is used and the whole net weight is that colour.
- **Stock:** thread stock subtracts each colour's weight from that colour (not the whole net from the rod's label). A colour short of stock gives the same warning as before, one sentence per short colour.
- **Rod label:** `rods.color` becomes the colours joined with ` + ` in the order given, e.g. `White + Red`. The rod list and the machine's current colour show that label.
- **Bill:** each item's `rate` is the bill's price per piece; `POST /sales` is unchanged. `amount = pieces × rate` on each line as before.

## Data changes

- **New table `rod_colors`** (`id`, `rod_id`, `color`, `kg`), linked to `rods`. Created by `create_all`. Deleting a rod (only allowed when no lots are linked) removes its colour lines.
- **Upgrade:** `upgrade_old_database()` gives every existing rod that has no colour lines one line: its `color` and its `net_weight`. Old stock figures do not change. Covered by `test_upgrade_old_database`.
- No existing column changes meaning. `rods.color` keeps the same column; new rods store the joined label.

## API changes

| Method · path | Change |
|---|---|
| `POST /api/rods` | Additive: optional `colors: [{color, kg}]`; `color` is now optional (required only when `colors` is empty). New 400 refusals for the colour sum and a repeated colour. |
| `GET /api/rods`, `POST /api/rods` responses | Additive: `colors: [{color, kg}]`. |
| `GET /api/thread-stock` | Same shape; `used_kg` and `rods` are now counted per colour line. |

## Tests

Added to `backend/tests/test_flow.py`:
- `test_rod_colours_and_thread_stock`: sum mismatch refused with the exact sentence, repeated colour refused, no colour refused, two-colour rod saved with its label and per-colour stock, one-colour rod short of stock gets the warning, and deleting the rod restores stock.
- `test_upgrade_old_database` extended with an old rod: it gets one colour line and its thread-stock figure is unchanged.

## Acceptance criteria

- [x] `POST /rods` refuses colour weights that do not add up to the net thread, with the exact sentence.
- [x] A rod with colours stocks each colour separately; the rod label shows the colours joined.
- [x] Old rods get one colour line on upgrade, and their stock figures are unchanged.
- [x] New bill has one price per piece; the bill total is pieces × price; the server stores the same rate on each item.
- [x] `frontend/dist` rebuilt and committed.
