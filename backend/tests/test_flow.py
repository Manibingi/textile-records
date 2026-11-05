import os
import tempfile

os.environ["TEXTILE_DATA_DIR"] = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = ""  # always test on a throwaway SQLite file, never the real database in .env
os.environ["APP_PASSWORD"] = ""  # no login during tests

from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

c = TestClient(app)


def ok(r):
    assert r.status_code == 200, r.text
    return r.json()


def test_full_flow():
    sup = ok(c.post("/api/suppliers", json={"name": "Sri Lakshmi Yarns", "phone": "9800000000"}))
    ok(c.post("/api/purchases", json={"date": "2026-10-01", "supplier_id": sup["id"], "thread_type": "40s Cotton",
                                       "color": "Red", "quantity_kg": 100, "rate_per_kg": 250}))
    stock = ok(c.get("/api/thread-stock"))
    assert stock[0]["stock_kg"] == 100

    # wind rod: net = gross - rod
    bad = c.post("/api/rods", json={"date": "2026-10-02", "thread_type": "40s cotton", "color": "red ",
                                     "gross_weight": 10, "rod_weight": 12})
    assert bad.status_code == 400
    rod = ok(c.post("/api/rods", json={"date": "2026-10-02", "thread_type": "40s cotton", "color": "red ",
                                        "design": "Check", "gross_weight": 32.5, "rod_weight": 12.3}))
    assert rod["net_weight"] == 20.2 and rod["code"] == "R-0001" and rod["length_m"] == 549
    stock = ok(c.get("/api/thread-stock"))
    assert len(stock) == 1 and stock[0]["stock_kg"] == 79.8  # case-insensitive match

    w = ok(c.post("/api/weavers", json={"name": "Raman", "rate_per_meter": 4.5, "machine_count": 5,
                                         "opening_balance": 100}))
    assert len(w["machines"]) == 5
    m1 = w["machines"][0]["id"]
    ok(c.post("/api/rods/issue", json={"rod_ids": [rod["id"]], "weaver_id": w["id"], "machine_id": m1,
                                        "date": "2026-10-03"}))
    w = ok(c.get(f"/api/weavers/{w['id']}"))
    assert w["rods_with_weaver"] == 1 and w["machines"][0]["current_color"] == "red"

    rec = ok(c.post("/api/lots", json={"date": "2026-10-05", "weaver_id": w["id"], "machine_id": m1,
                                        "product": "Towel", "color": "Red", "weight_kg": 9.6,
                                        "lots": [{"pieces": 40, "meters": 60}], "rod_ids": [rod["id"]]}))
    lot = rec["lots"][0]
    assert lot["amount"] == 270 and lot["code"] == "L-0001" and rec["weight_kg"] == 9.6
    dues = ok(c.get("/api/weaver-dues"))
    assert dues[0]["balance"] == 370 and dues[0]["meters"] == 60

    pay = ok(c.post("/api/weaver-payments", json={"date": "2026-10-06", "weaver_id": w["id"], "amount": 300}))
    slip = ok(c.get(f"/api/weaver-payments/{pay['id']}/slip"))
    assert slip["due_before"] == 370 and slip["balance_after"] == 70 and len(slip["lots"]) == 1
    led = ok(c.get(f"/api/weavers/{w['id']}/ledger"))
    assert led["entries"][-1]["balance"] == 70

    assert ok(c.get("/api/uncut-stock"))[0]["waiting"] == 40
    cut = ok(c.post("/api/cutting", json={"date": "2026-10-07", "product": "Towel", "color": "red",
                                           "good_pieces": 38, "rejected_pieces": 2, "bundles": 4}))
    assert "warning" not in cut
    fs = ok(c.get("/api/finished-stock"))
    assert fs[0]["in_stock"] == 38 and fs[0]["product"] == "Towel"
    assert ok(c.get("/api/uncut-stock"))[0]["waiting"] == 0

    cust = ok(c.post("/api/customers", json={"name": "Kerala Traders"}))
    too_many = c.post("/api/sales", json={"date": "2026-10-08", "customer_id": cust["id"],
                                          "items": [{"product": "Towel", "color": "Red", "quantity": 50, "rate": 80}]})
    assert too_many.status_code == 400
    sale = ok(c.post("/api/sales", json={"date": "2026-10-08", "customer_id": cust["id"],
                                          "items": [{"product": "towel", "color": "RED", "quantity": 30, "rate": 80}]}))
    assert sale["total"] == 2400 and sale["invoice_no"] == "INV-0001"
    ok(c.post("/api/customer-payments", json={"date": "2026-10-09", "customer_id": cust["id"], "amount": 1000}))
    assert ok(c.get(f"/api/customers/{cust['id']}"))["balance"] == 1400
    assert ok(c.get("/api/finished-stock"))[0]["in_stock"] == 8

    dash = ok(c.get("/api/dashboard"))
    assert dash["weaver_dues"] == 70 and dash["receivables"] == 1400 and dash["finished_pieces"] == 8
    summ = ok(c.get("/api/reports/summary?from=2026-10-01&to=2026-10-31"))
    assert summ["rough_profit"] == 2400 - 25000 - 270
    assert ok(c.get("/api/reports/machines"))[0]["meters"] == 60
    assert ok(c.get("/api/reports/weavers"))[0]["earned"] == 270
    assert ok(c.get("/api/reports/wastage"))[0]["reject_percent"] == 5.0
    assert ok(c.get("/api/dashboard"))["uncut_pieces"] == 0
    assert c.get("/api/backup").status_code == 200

    # guarded deletes
    assert c.delete(f"/api/lots/{lot['id']}").status_code == 400
    assert c.delete(f"/api/weavers/{w['id']}").status_code == 400
    assert c.delete(f"/api/rods/{rod['id']}").status_code == 400
    ok(c.post(f"/api/rods/{rod['id']}/finish", json={"date": "2026-10-09"}))
    assert ok(c.get("/api/dashboard"))["rods_with_weavers"] == 0


def test_extra_thread():
    ok(c.post("/api/purchases", json={"date": "2026-10-01", "thread_type": "Weft 20s", "color": "Black",
                                       "quantity_kg": 50, "rate_per_kg": 200}))
    w = ok(c.post("/api/weavers", json={"name": "Babu", "rate_per_meter": 4, "machine_count": 2}))
    m = w["machines"][0]["id"]
    g = ok(c.post("/api/thread-issues", json={"date": "2026-10-02", "weaver_id": w["id"], "machine_id": m,
                                               "thread_type": "weft 20s", "color": "black", "combs": 6,
                                               "gross_weight": 9.1, "comb_weight": 0.1}))
    assert g["quantity_kg"] == 8.5 and g["combs"] == 6
    assert "warning" not in g
    ok(c.post("/api/thread-issues", json={"date": "2026-10-04", "weaver_id": w["id"], "thread_type": "Weft 20s",
                                          "color": "Black", "quantity_kg": 1.5, "kind": "returned"}))
    st = [s for s in ok(c.get("/api/thread-stock")) if s["thread_type"] == "Weft 20s"][0]
    assert st["stock_kg"] == 43 and st["given_kg"] == 7
    assert ok(c.get(f"/api/weavers/{w['id']}"))["extra_thread_kg"] == 7
    assert len(ok(c.get(f"/api/thread-issues?weaver_id={w['id']}"))) == 2
    big = ok(c.post("/api/thread-issues", json={"date": "2026-10-05", "weaver_id": w["id"], "thread_type": "Weft 20s",
                                                 "color": "Black", "quantity_kg": 100}))
    assert "warning" in big
    ok(c.delete(f"/api/thread-issues/{big['id']}"))
    assert c.post("/api/thread-issues", json={"date": "2026-10-05", "weaver_id": w["id"], "thread_type": "X",
                                              "color": "Y", "quantity_kg": 1, "kind": "lost"}).status_code == 422
    assert c.delete(f"/api/weavers/{w['id']}").status_code == 400
    rep = [r for r in ok(c.get("/api/reports/weavers")) if r["weaver"] == "Babu"][0]
    assert rep["extra_thread_kg"] == 7


def test_combs_validation():
    w = ok(c.post("/api/weavers", json={"name": "Combs Test", "rate_per_meter": 4, "machine_count": 1}))
    base = {"date": "2026-10-02", "weaver_id": w["id"], "thread_type": "T", "color": "C"}
    assert c.post("/api/thread-issues", json={**base, "combs": 10, "gross_weight": 1, "comb_weight": 0.1}).status_code == 400
    assert c.post("/api/thread-issues", json={**base, "combs": 0, "gross_weight": 5, "comb_weight": 0.1}).status_code == 400
    assert c.post("/api/thread-issues", json=base).status_code == 400


def test_many_lots_one_weight_and_cutting_by_colour():
    w = ok(c.post("/api/weavers", json={"name": "Multi", "rate_per_meter": 5, "machine_count": 2}))
    rec = ok(c.post("/api/lots", json={"date": "2026-10-06", "weaver_id": w["id"], "machine_id": w["machines"][1]["id"],
                                        "product": "Lungi", "color": "Green", "weight_kg": 30.5,
                                        "lots": [{"pieces": 40, "meters": 80}, {"pieces": 38, "meters": 76},
                                                 {"pieces": 41, "meters": 82}]}))
    assert len(rec["lots"]) == 3 and rec["pieces"] == 119 and rec["meters"] == 238 and rec["amount"] == 1190
    assert all(l["weight_kg"] == 30.5 and l["batch_lot_count"] == 3 for l in rec["lots"])
    assert rec["lots"][0]["batch_pieces"] == 119 and rec["lots"][0]["batch_meters"] == 238
    lots = [l for l in ok(c.get(f"/api/lots?weaver_id={w['id']}"))]
    assert sum(1 for l in lots if l["first_in_batch"]) == 1
    assert ok(c.get(f"/api/weavers/{w['id']}"))["balance"] == 1190
    # a second receipt of same colour adds up
    ok(c.post("/api/lots", json={"date": "2026-10-07", "weaver_id": w["id"], "product": "Lungi", "color": "green",
                                 "weight_kg": 10, "lots": [{"pieces": 39, "meters": 78}]}))
    u = [x for x in ok(c.get("/api/uncut-stock")) if x["product"] == "Lungi" and x["color"].lower() == "green"][0]
    assert u["waiting"] == 158 and u["lots"] == 4
    over = ok(c.post("/api/cutting", json={"date": "2026-10-08", "product": "Lungi", "color": "Green",
                                            "good_pieces": 150, "rejected_pieces": 4}))
    assert "warning" not in over
    # lot whose pieces are cut can't be deleted
    assert c.delete(f"/api/lots/{rec['lots'][0]['id']}").status_code == 400
    warn = ok(c.post("/api/cutting", json={"date": "2026-10-08", "product": "Lungi", "color": "Green",
                                            "good_pieces": 10}))
    assert "warning" in warn
    opening = ok(c.post("/api/cutting", json={"date": "2026-10-08", "source": "opening", "product": "Towel",
                                               "color": "Blue", "good_pieces": 100}))
    assert opening["source_label"] == "Opening stock" and "warning" not in opening
    assert c.post("/api/lots", json={"date": "2026-10-07", "weaver_id": w["id"], "product": "Lungi",
                                     "lots": []}).status_code == 422


def test_upgrade_old_database():
    """A database from the first version (no new columns) must open and keep its data."""
    import sqlite3, subprocess, sys, tempfile as tf, os as _os
    folder = tf.mkdtemp()
    con = sqlite3.connect(_os.path.join(folder, "textile.db"))
    con.executescript("""
    CREATE TABLE weavers (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, phone VARCHAR, address TEXT,
        rate_per_meter FLOAT, opening_balance FLOAT, active BOOLEAN);
    CREATE TABLE machines (id INTEGER PRIMARY KEY, weaver_id INTEGER, number VARCHAR, current_design VARCHAR,
        current_color VARCHAR, active BOOLEAN);
    CREATE TABLE lots (id INTEGER PRIMARY KEY, code VARCHAR, date DATE, weaver_id INTEGER, machine_id INTEGER,
        product VARCHAR, color VARCHAR, design VARCHAR, pieces INTEGER, weight_kg FLOAT, meters FLOAT,
        rate_per_meter FLOAT, amount FLOAT, notes TEXT);
    CREATE TABLE cutting_entries (id INTEGER PRIMARY KEY, date DATE, lot_id INTEGER, product VARCHAR, color VARCHAR,
        good_pieces INTEGER, rejected_pieces INTEGER, bundles INTEGER, notes TEXT);
    CREATE TABLE thread_issues (id INTEGER PRIMARY KEY, date DATE, weaver_id INTEGER, machine_id INTEGER,
        thread_type VARCHAR, color VARCHAR, quantity_kg FLOAT, kind VARCHAR, notes TEXT);
    INSERT INTO weavers VALUES (1, 'Old', '', '', 4, 0, 1);
    INSERT INTO lots VALUES (1, 'L-0001', '2026-10-01', 1, NULL, 'Towel', 'Red', '', 40, 9.5, 60, 4, 240, '');
    INSERT INTO cutting_entries VALUES (1, '2026-10-02', 1, 'Towel', 'Red', 30, 0, 3, '');
    INSERT INTO cutting_entries VALUES (2, '2026-10-02', NULL, 'Towel', 'Red', 5, 0, 0, '');
    INSERT INTO thread_issues VALUES (1, '2026-10-02', 1, NULL, 'T', 'C', 2.5, 'given', '');
    """)
    con.commit(); con.close()
    code = (
        "from fastapi.testclient import TestClient\n"
        "from app.main import app\n"
        "c = TestClient(app)\n"
        "u = c.get('/api/uncut-stock').json()[0]\n"
        "assert u['waiting'] == 10, u\n"
        "l = c.get('/api/lots').json()[0]\n"
        "assert l['weight_kg'] == 9.5 and l['batch_code'] is None\n"
        "assert l['batch_pieces'] == 40 and l['batch_meters'] == 60 and l['first_lot_code'] == 'L-0001'\n"
        "assert c.get('/api/thread-issues').json()[0]['quantity_kg'] == 2.5\n"
        "assert [x['source'] for x in c.get('/api/cutting').json()] == ['opening', 'woven']\n"
        "print('upgrade ok')\n")
    env = {**_os.environ, "TEXTILE_DATA_DIR": folder}
    r = subprocess.run([sys.executable, "-c", code], env=env, capture_output=True, text=True,
                       cwd=_os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))
    assert r.returncode == 0 and "upgrade ok" in r.stdout, r.stderr[-1500:]


# ---------------- F-019 ----------------
def _wind(n, thread="F19 Warp", color="Blue"):
    return [ok(c.post("/api/rods", json={"date": "2026-10-20", "thread_type": thread, "color": color,
                                          "gross_weight": 15, "rod_weight": 12}))["id"] for _ in range(n)]


def _rod(rid):
    return [r for r in ok(c.get("/api/rods")) if r["id"] == rid][0]


def test_one_running_rod_per_machine():
    ok(c.post("/api/purchases", json={"date": "2026-10-20", "thread_type": "F19 Warp", "color": "Blue",
                                       "quantity_kg": 100, "rate_per_kg": 200}))
    name = "Rod Rule"
    w = ok(c.post("/api/weavers", json={"name": name, "rate_per_meter": 4, "machine_count": 2}))
    m1, m2 = w["machines"]
    a, b, cc, dd = _wind(4)
    A, D = _rod(a), _rod(dd)

    def give(ids, mid):
        return c.post("/api/rods/issue", json={"rod_ids": ids, "weaver_id": w["id"], "machine_id": mid,
                                                "date": "2026-10-21"})

    ok(give([a], m1["id"]))
    r = give([b], m1["id"])
    assert r.status_code == 400
    assert r.json()["detail"] == (f"Machine {m1['number']} of {name} already has rod {A['code']} that is not finished. "
                                  f"Mark it finished (or take it back to stock) before giving a new rod.")
    assert b in [x["id"] for x in ok(c.get("/api/rods?status=in_stock"))]
    ok(give([b], m2["id"]))
    ok(give([cc], None))
    assert give([dd], m1["id"]).status_code == 400
    assert _rod(dd)["status"] == "in_stock"
    ok(c.post(f"/api/rods/{a}/finish", json={"date": "2026-10-22"}))
    ok(give([dd], m1["id"]))
    # several rods in one give to an empty machine are allowed
    ok(c.post(f"/api/rods/{dd}/return"))
    e, f = _wind(2)
    E, F = _rod(e), _rod(f)
    ok(give([dd, e], m1["id"]))
    r = give([f], m1["id"])
    assert r.status_code == 400
    assert r.json()["detail"] == (f"Machine {m1['number']} of {name} already has rods {D['code']}, {E['code']} that are "
                                  f"not finished. Mark them finished (or take them back to stock) before giving a new rod.")
    # taking rods back to stock frees the machine
    ok(c.post(f"/api/rods/{dd}/return"))
    ok(c.post(f"/api/rods/{e}/return"))
    ok(give([f], m1["id"]))
    # undo finish is refused while another rod runs on the machine
    r = c.post(f"/api/rods/{a}/reopen")
    assert r.status_code == 400
    assert r.json()["detail"] == (f"Machine {m1['number']} of {name} already has rod {F['code']} running. "
                                  f"Finish that rod (or take it back to stock) before undoing the finish of {A['code']}.")
    assert _rod(a)["status"] == "finished"
    ok(c.post(f"/api/rods/{f}/finish", json={"date": "2026-10-23"}))
    assert ok(c.post(f"/api/rods/{a}/reopen"))["status"] == "with_weaver"
    # a rod with no machine reopens freely
    ok(c.post(f"/api/rods/{cc}/finish", json={"date": "2026-10-23"}))
    assert ok(c.post(f"/api/rods/{cc}/reopen"))["status"] == "with_weaver"


def test_no_lots_after_finished_rod():
    ok(c.post("/api/purchases", json={"date": "2026-10-20", "thread_type": "F19 Warp", "color": "Blue",
                                       "quantity_kg": 100, "rate_per_kg": 200}))
    name = "Lot Rule"
    w = ok(c.post("/api/weavers", json={"name": name, "rate_per_meter": 4, "machine_count": 3}))
    wid = w["id"]
    m1, m2, m3 = [m["id"] for m in w["machines"]]
    num1 = w["machines"][0]["number"]

    def lot(mid, **extra):
        return c.post("/api/lots", json={"date": "2026-10-24", "weaver_id": wid, "machine_id": mid,
                                         "product": "Towel", "color": "Blue",
                                         "lots": [{"pieces": 40, "meters": 80}], **extra})

    ok(lot(m3))  # a machine that never had a rod is not blocked
    a, b, cc = _wind(3)
    A, B = _rod(a), _rod(b)
    ok(c.post("/api/rods/issue", json={"rod_ids": [a], "weaver_id": wid, "machine_id": m1, "date": "2026-10-21"}))
    ok(lot(m1, rod_ids=[a], finish_rod_ids=[a]))  # finishing in the same save is fine
    assert _rod(a)["status"] == "finished"
    before = len(ok(c.get(f"/api/lots?weaver_id={wid}")))
    r = lot(m1)
    assert r.status_code == 400
    assert r.json()["detail"] == (f"Machine {num1} of {name} has no running rod: rod {A['code']} was marked finished on "
                                  f"24-10-2026. Give a new rod to this machine first, or use 'Undo finish' on "
                                  f"{A['code']} if this cloth is from that rod.")
    assert len(ok(c.get(f"/api/lots?weaver_id={wid}"))) == before
    ok(lot(None))  # no machine: not checked
    ms = ok(c.get(f"/api/weavers/{wid}"))["machines"]
    assert ms[0]["needs_new_rod"] is True and ms[0]["running_rods"] == []
    assert ms[0]["last_finished_rod"] == {"code": A["code"], "finished_date": "2026-10-24"}
    assert ms[2]["needs_new_rod"] is False and ms[2]["last_finished_rod"] is None
    assert any(x["id"] == wid and x["machines"][0]["needs_new_rod"] for x in ok(c.get("/api/weavers")))
    # undo finish lets the late lot in
    ok(c.post(f"/api/rods/{a}/reopen"))
    ok(lot(m1))
    ok(c.post(f"/api/rods/{a}/finish", json={"date": "2026-10-24"}))
    assert lot(m1).status_code == 400
    # a new rod frees the machine
    ok(c.post("/api/rods/issue", json={"rod_ids": [b], "weaver_id": wid, "machine_id": m1, "date": "2026-10-25"}))
    ok(lot(m1))
    m = ok(c.get(f"/api/weavers/{wid}"))["machines"][0]
    assert m["needs_new_rod"] is False and m["running_rods"] == [B["code"]]
    # a rod taken back to stock does not block the machine
    ok(c.post("/api/rods/issue", json={"rod_ids": [cc], "weaver_id": wid, "machine_id": m2, "date": "2026-10-25"}))
    ok(c.post(f"/api/rods/{cc}/return"))
    ok(lot(m2))


def test_lot_list_receipt_totals():
    w = ok(c.post("/api/weavers", json={"name": "Receipt Totals", "rate_per_meter": 4}))
    ok(c.post("/api/lots", json={"date": "2026-10-24", "weaver_id": w["id"], "product": "Lungi", "color": "White",
                                 "weight_kg": 20, "lots": [{"pieces": 40, "meters": 80}, {"pieces": 38, "meters": 76.5}]}))
    lots = sorted(ok(c.get(f"/api/lots?weaver_id={w['id']}")), key=lambda l: l["id"])
    assert len(lots) == 2
    for l in lots:
        assert l["batch_pieces"] == 78 and l["batch_meters"] == 156.5 and l["batch_lot_count"] == 2
        assert l["first_lot_code"] == lots[0]["code"]
    assert (lots[0]["pieces"], lots[0]["meters"]) == (40, 80.0)
    assert (lots[1]["pieces"], lots[1]["meters"]) == (38, 76.5)
    one = ok(c.post("/api/lots", json={"date": "2026-10-25", "weaver_id": w["id"], "product": "Lungi", "color": "White",
                                       "lots": [{"pieces": 41, "meters": 82}]}))["lots"][0]
    assert one["batch_pieces"] == 41 and one["batch_meters"] == 82 and one["first_lot_code"] == one["code"]
    assert ok(c.get(f"/api/lots/{one['id']}"))["batch_pieces"] == 41


def test_bill_account():
    ok(c.post("/api/cutting", json={"date": "2026-09-30", "source": "opening", "product": "Towel",
                                     "color": "F19 Account", "good_pieces": 100}))
    cust = ok(c.post("/api/customers", json={"name": "Account Test", "opening_balance": 500}))

    def item(q):
        return [{"product": "Towel", "color": "F19 Account", "quantity": q, "rate": 100}]

    a = ok(c.post("/api/sales", json={"date": "2026-10-01", "customer_id": cust["id"], "items": item(10)}))
    ok(c.post("/api/customer-payments", json={"date": "2026-10-01", "customer_id": cust["id"], "amount": 300}))
    b = ok(c.post("/api/sales", json={"date": "2026-10-05", "customer_id": cust["id"], "items": item(20)}))
    ok(c.post("/api/customer-payments", json={"date": "2026-10-05", "customer_id": cust["id"], "amount": 1000}))
    assert ok(c.get(f"/api/sales/{a['id']}"))["account"] == {"previous_balance": 500, "bill_amount": 1000,
                                                             "total_due": 1500, "received_on_date": 300,
                                                             "balance_after": 1200}
    acc = ok(c.get(f"/api/sales/{b['id']}"))["account"]
    assert acc["previous_balance"] == 1200 and acc["bill_amount"] == 2000 and acc["total_due"] == 3200
    assert acc["received_on_date"] == 1000 and acc["balance_after"] == 2200
    assert all("account" not in s for s in ok(c.get("/api/sales")))
