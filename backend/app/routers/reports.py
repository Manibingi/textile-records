"""Home screen numbers, reports and backup."""
import os
import sqlite3
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from fastapi.responses import FileResponse
from sqlalchemy import func
from ..database import get_db, DB_PATH, DATA_DIR
from ..models import (Purchase, Supplier, Rod, ThreadIssue, Lot, Weaver, Machine, WeaverPayment, CuttingEntry, Sale,
                      SaleItem, Customer, CustomerPayment)
from ..util import r2, r3, d, date_filter
from .. import calc

router = APIRouter(prefix="/api")


@router.get("/dashboard")
def dashboard(db=Depends(get_db)):
    today = date.today()
    month_start = today.replace(day=1)
    thread = calc.thread_stock(db)
    finished = calc.finished_stock(db)
    weavers = db.query(Weaver).all()
    customers = db.query(Customer).all()
    month_lots = db.query(func.count(Lot.id), func.coalesce(func.sum(Lot.meters), 0)) \
        .filter(Lot.date >= month_start).one()
    month_sales = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(Sale.date >= month_start).scalar()
    month_purchase = db.query(func.coalesce(func.sum(Purchase.amount), 0)).filter(Purchase.date >= month_start).scalar()
    recent = db.query(Lot).order_by(Lot.date.desc(), Lot.id.desc()).limit(5).all()
    return {
        "thread_stock_kg": r3(sum(t["stock_kg"] for t in thread)),
        "thread_low": [t for t in thread if t["stock_kg"] < 5][:6],
        "rods_in_stock": db.query(Rod).filter(Rod.status == "in_stock").count(),
        "rods_with_weavers": db.query(Rod).filter(Rod.status == "with_weaver").count(),
        "extra_thread_with_weavers_kg": calc.thread_with_weaver(db),
        "uncut_pieces": sum(max(u["waiting"], 0) for u in calc.uncut_stock(db)),
        "finished_pieces": sum(max(f["in_stock"], 0) for f in finished),
        "finished_by_product": _by_product(finished),
        "weaver_dues": r2(sum(max(calc.weaver_balance(db, w), 0) for w in weavers)),
        "receivables": r2(sum(max(calc.customer_balance(db, c), 0) for c in customers)),
        "month": {"lots": month_lots[0], "meters": r2(month_lots[1]), "sales": r2(month_sales),
                  "purchases": r2(month_purchase)},
        "recent_lots": [{"id": l.id, "code": l.code, "date": d(l.date), "weaver_name": l.weaver.name,
                         "product": l.product, "color": l.color, "pieces": l.pieces, "meters": r2(l.meters)}
                        for l in recent],
    }


def _by_product(finished):
    out = {}
    for f in finished:
        out[f["product"]] = out.get(f["product"], 0) + max(f["in_stock"], 0)
    return [{"product": k, "pieces": v} for k, v in out.items()]


R = lambda: Query(None, alias="from")  # noqa: E731


@router.get("/reports/summary")
def summary(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    purchases = date_filter(db.query(func.coalesce(func.sum(Purchase.amount), 0)), Purchase.date, from_, to).scalar()
    kg = date_filter(db.query(func.coalesce(func.sum(Purchase.quantity_kg), 0)), Purchase.date, from_, to).scalar()
    lq = date_filter(db.query(func.count(Lot.id), func.coalesce(func.sum(Lot.meters), 0),
                              func.coalesce(func.sum(Lot.amount), 0), func.coalesce(func.sum(Lot.pieces), 0)),
                     Lot.date, from_, to).one()
    paid = date_filter(db.query(func.coalesce(func.sum(WeaverPayment.amount), 0)), WeaverPayment.date, from_, to).scalar()
    cq = date_filter(db.query(func.coalesce(func.sum(CuttingEntry.good_pieces), 0),
                              func.coalesce(func.sum(CuttingEntry.rejected_pieces), 0)),
                     CuttingEntry.date, from_, to).one()
    sales = date_filter(db.query(func.coalesce(func.sum(Sale.total), 0)), Sale.date, from_, to).scalar()
    pcs_sold = date_filter(db.query(func.coalesce(func.sum(SaleItem.quantity), 0)).join(Sale), Sale.date, from_, to).scalar()
    received = date_filter(db.query(func.coalesce(func.sum(CustomerPayment.amount), 0)),
                           CustomerPayment.date, from_, to).scalar()
    return {"thread_purchase_amount": r2(purchases), "thread_purchase_kg": r3(kg),
            "lots": lq[0], "meters": r2(lq[1]), "weaving_cost": r2(lq[2]), "pieces_received": lq[3],
            "weaver_paid": r2(paid), "pieces_packed": cq[0], "pieces_rejected": cq[1],
            "sales_amount": r2(sales), "pieces_sold": pcs_sold, "money_received": r2(received),
            "rough_profit": r2(sales - purchases - lq[2])}


@router.get("/reports/weavers")
def weaver_report(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    out = []
    for w in db.query(Weaver).order_by(Weaver.name):
        n, pcs, m, amt = date_filter(db.query(func.count(Lot.id), func.coalesce(func.sum(Lot.pieces), 0),
                                              func.coalesce(func.sum(Lot.meters), 0),
                                              func.coalesce(func.sum(Lot.amount), 0)).filter(Lot.weaver_id == w.id),
                                     Lot.date, from_, to).one()
        paid = date_filter(db.query(func.coalesce(func.sum(WeaverPayment.amount), 0))
                           .filter(WeaverPayment.weaver_id == w.id), WeaverPayment.date, from_, to).scalar()
        given = 0.0
        for kind, kg in date_filter(db.query(ThreadIssue.kind, func.coalesce(func.sum(ThreadIssue.quantity_kg), 0))
                                    .filter(ThreadIssue.weaver_id == w.id), ThreadIssue.date, from_, to) \
                .group_by(ThreadIssue.kind):
            given += kg if kind == "given" else -kg
        if n or paid or given:
            out.append({"weaver": w.name, "machines": len(w.machines), "lots": n, "pieces": pcs, "meters": r2(m),
                        "extra_thread_kg": r3(given),
                        "earned": r2(amt), "paid": r2(paid), "balance_now": calc.weaver_balance(db, w)})
    return out


@router.get("/reports/machines")
def machine_report(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    q = db.query(Weaver.name, Machine.number, func.count(Lot.id), func.coalesce(func.sum(Lot.pieces), 0),
                 func.coalesce(func.sum(Lot.meters), 0)) \
        .join(Machine, Lot.machine_id == Machine.id).join(Weaver, Machine.weaver_id == Weaver.id)
    q = date_filter(q, Lot.date, from_, to).group_by(Machine.id).order_by(Weaver.name, Machine.number)
    return [{"weaver": wn, "machine": f"Machine {mn}", "lots": n, "pieces": p, "meters": r2(m)} for wn, mn, n, p, m in q]


@router.get("/reports/suppliers")
def supplier_report(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    q = db.query(Supplier.name, func.count(Purchase.id), func.coalesce(func.sum(Purchase.quantity_kg), 0),
                 func.coalesce(func.sum(Purchase.amount), 0)).outerjoin(Supplier, Purchase.supplier_id == Supplier.id)
    q = date_filter(q, Purchase.date, from_, to).group_by(Supplier.id).order_by(func.sum(Purchase.amount).desc())
    return [{"supplier": n or "Opening stock", "purchases": c, "kg": r3(kg),
             "amount": r2(a), "avg_rate": r2(a / kg) if kg else 0} for n, c, kg, a in q]


@router.get("/reports/sales")
def sales_report(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    out = []
    for c in db.query(Customer).order_by(Customer.name):
        n, tot = date_filter(db.query(func.count(Sale.id), func.coalesce(func.sum(Sale.total), 0))
                             .filter(Sale.customer_id == c.id), Sale.date, from_, to).one()
        pcs = date_filter(db.query(func.coalesce(func.sum(SaleItem.quantity), 0)).join(Sale)
                          .filter(Sale.customer_id == c.id), Sale.date, from_, to).scalar()
        rec = date_filter(db.query(func.coalesce(func.sum(CustomerPayment.amount), 0))
                          .filter(CustomerPayment.customer_id == c.id), CustomerPayment.date, from_, to).scalar()
        if n or rec:
            out.append({"customer": c.name, "bills": n, "pieces": pcs, "amount": r2(tot), "received": r2(rec),
                        "balance_now": calc.customer_balance(db, c)})
    return out


@router.get("/reports/wastage")
def wastage_report(from_: Optional[date] = R(), to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(CuttingEntry.product, CuttingEntry.color, func.sum(CuttingEntry.good_pieces),
                             func.sum(CuttingEntry.rejected_pieces), func.count(CuttingEntry.id))
                    .filter(CuttingEntry.source == "woven"), CuttingEntry.date, from_, to)
    out = []
    for p, c, g, r, n in q.group_by(CuttingEntry.product, CuttingEntry.color).order_by(CuttingEntry.product, CuttingEntry.color):
        total = (g or 0) + (r or 0)
        out.append({"product": p, "color": c, "entries": n, "good": g or 0, "rejected": r or 0,
                    "reject_percent": round(100 * (r or 0) / total, 1) if total else 0})
    return out


# ---------------- Backup ----------------
def make_backup(target_path):
    src = sqlite3.connect(DB_PATH)
    dst = sqlite3.connect(target_path)
    with dst:
        src.backup(dst)
    src.close()
    dst.close()


@router.get("/backup")
def download_backup():
    path = os.path.join(DATA_DIR, "download-backup.db")
    make_backup(path)
    return FileResponse(path, filename=f"textile-backup-{date.today().isoformat()}.db",
                        media_type="application/octet-stream")
