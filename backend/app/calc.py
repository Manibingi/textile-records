"""All the sums the business used to do by hand, in one place."""
from sqlalchemy import func
from .models import (Purchase, Rod, ThreadIssue, Lot as _Lot, Lot, WeaverPayment, CuttingEntry, SaleItem, Sale,
                     CustomerPayment, Weaver, Customer)
from .util import r2, r3, key


# ---------- Thread stock ----------
def thread_stock(db):
    rows = {}

    def slot(t, c):
        k = key(t, c)
        if k not in rows:
            rows[k] = {"thread_type": t.strip(), "color": c.strip(), "purchased_kg": 0.0,
                       "used_kg": 0.0, "rods": 0, "given_kg": 0.0}
        return rows[k]

    for t, c, kg in db.query(Purchase.thread_type, Purchase.color, func.sum(Purchase.quantity_kg)) \
            .group_by(Purchase.thread_type, Purchase.color):
        slot(t, c)["purchased_kg"] += kg or 0
    for t, c, kg, n in db.query(Rod.thread_type, Rod.color, func.sum(Rod.net_weight), func.count(Rod.id)) \
            .group_by(Rod.thread_type, Rod.color):
        s = slot(t, c)
        s["used_kg"] += kg or 0
        s["rods"] += n
    for t, c, kind, kg in db.query(ThreadIssue.thread_type, ThreadIssue.color, ThreadIssue.kind,
                                   func.sum(ThreadIssue.quantity_kg)) \
            .group_by(ThreadIssue.thread_type, ThreadIssue.color, ThreadIssue.kind):
        slot(t, c)["given_kg"] += (kg or 0) * (1 if kind == "given" else -1)
    out = []
    for s in rows.values():
        s["stock_kg"] = r3(s["purchased_kg"] - s["used_kg"] - s["given_kg"])
        s["given_kg"] = r3(s["given_kg"])
        s["purchased_kg"] = r3(s["purchased_kg"])
        s["used_kg"] = r3(s["used_kg"])
        out.append(s)
    out.sort(key=lambda s: (s["thread_type"].lower(), s["color"].lower()))
    return out


def thread_available(db, thread_type, color):
    for s in thread_stock(db):
        if key(s["thread_type"], s["color"]) == key(thread_type, color):
            return s["stock_kg"]
    return 0.0


def thread_with_weaver(db, wid=None):
    """Net extra thread (kg) given to a weaver (given - taken back)."""
    q = db.query(ThreadIssue.kind, func.coalesce(func.sum(ThreadIssue.quantity_kg), 0))
    if wid:
        q = q.filter(ThreadIssue.weaver_id == wid)
    tot = 0.0
    for kind, kg in q.group_by(ThreadIssue.kind):
        tot += kg if kind == "given" else -kg
    return r3(tot)


# ---------- Pieces received from weavers but not yet cut ----------
def uncut_stock(db):
    """Per product + colour: pieces in all lots received - pieces already cut (good + rejected)."""
    rows = {}

    def slot(p, c):
        k = key(p, c)
        if k not in rows:
            rows[k] = {"product": (p or "").strip(), "color": (c or "").strip(), "received": 0, "cut": 0, "lots": 0}
        return rows[k]

    for p, c, pcs, n in db.query(_Lot.product, _Lot.color, func.sum(_Lot.pieces), func.count(_Lot.id)) \
            .group_by(_Lot.product, _Lot.color):
        s = slot(p, c)
        s["received"] += pcs or 0
        s["lots"] += n
    for p, c, g, r in db.query(CuttingEntry.product, CuttingEntry.color, func.sum(CuttingEntry.good_pieces),
                               func.sum(CuttingEntry.rejected_pieces)) \
            .filter(CuttingEntry.source == "woven").group_by(CuttingEntry.product, CuttingEntry.color):
        slot(p, c)["cut"] += (g or 0) + (r or 0)
    out = []
    for s in rows.values():
        s["waiting"] = s["received"] - s["cut"]
        out.append(s)
    out.sort(key=lambda s: (-max(s["waiting"], 0), s["product"].lower(), s["color"].lower()))
    return out


def uncut_for(db, product, color):
    for s in uncut_stock(db):
        if key(s["product"], s["color"]) == key(product, color):
            return s["waiting"]
    return 0


# ---------- Finished goods stock ----------
def finished_stock(db):
    rows = {}

    def slot(p, c):
        k = key(p, c)
        if k not in rows:
            rows[k] = {"product": (p or "").strip(), "color": (c or "").strip(),
                       "packed": 0, "sold": 0, "bundles": 0}
        return rows[k]

    for p, c, good, b in db.query(CuttingEntry.product, CuttingEntry.color,
                                  func.sum(CuttingEntry.good_pieces), func.sum(CuttingEntry.bundles)) \
            .group_by(CuttingEntry.product, CuttingEntry.color):
        s = slot(p, c)
        s["packed"] += good or 0
        s["bundles"] += b or 0
    for p, c, q in db.query(SaleItem.product, SaleItem.color, func.sum(SaleItem.quantity)) \
            .group_by(SaleItem.product, SaleItem.color):
        slot(p, c)["sold"] += q or 0
    out = []
    for s in rows.values():
        s["in_stock"] = s["packed"] - s["sold"]
        out.append(s)
    out.sort(key=lambda s: (s["product"].lower(), s["color"].lower()))
    return out


# ---------- Weaver money ----------
def weaver_earned(db, wid):
    return db.query(func.coalesce(func.sum(Lot.amount), 0)).filter(Lot.weaver_id == wid).scalar()


def weaver_paid(db, wid):
    return db.query(func.coalesce(func.sum(WeaverPayment.amount), 0)) \
        .filter(WeaverPayment.weaver_id == wid).scalar()


def weaver_balance(db, w: Weaver):
    """Positive = we still have to pay the weaver."""
    return r2((w.opening_balance or 0) + weaver_earned(db, w.id) - weaver_paid(db, w.id))


def weaver_since_last_payment(db, w: Weaver):
    last = db.query(func.max(WeaverPayment.date)).filter(WeaverPayment.weaver_id == w.id).scalar()
    q = db.query(func.count(Lot.id), func.coalesce(func.sum(Lot.meters), 0),
                 func.coalesce(func.sum(Lot.amount), 0)).filter(Lot.weaver_id == w.id)
    if last:
        q = q.filter(Lot.date > last)
    n, meters, amount = q.one()
    return {"last_payment_date": last.isoformat() if last else None, "lots": n,
            "meters": r2(meters), "amount": r2(amount)}


# ---------- Customer money ----------
def customer_billed(db, cid):
    return db.query(func.coalesce(func.sum(Sale.total), 0)).filter(Sale.customer_id == cid).scalar()


def customer_received(db, cid):
    return db.query(func.coalesce(func.sum(CustomerPayment.amount), 0)) \
        .filter(CustomerPayment.customer_id == cid).scalar()


def customer_balance(db, c: Customer):
    """Positive = customer still has to pay us."""
    return r2((c.opening_balance or 0) + customer_billed(db, c.id) - customer_received(db, c.id))


def ledger(opening, entries):
    """entries: dicts with date, plus/minus. Adds running balance."""
    entries.sort(key=lambda e: (e["date"], e.get("order", 0), e.get("id", 0)))
    bal = opening or 0
    for e in entries:
        bal += e.get("plus", 0) - e.get("minus", 0)
        e["balance"] = r2(bal)
        e.pop("order", None)
    return entries
