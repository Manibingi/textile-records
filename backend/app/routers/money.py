"""Weaver payments & ledger, sales bills, money received from customers."""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import or_, and_, func
from ..database import get_db
from ..models import Weaver, WeaverPayment, Lot, Customer, Sale, SaleItem, CustomerPayment
from ..util import In, get_or_404, fail, r2, d, date_filter, key
from .. import calc

router = APIRouter(prefix="/api")


class PaymentIn(In):
    date: date
    amount: float = Field(gt=0)
    mode: str = "Cash"
    notes: str = ""


class WeaverPaymentIn(PaymentIn):
    weaver_id: int


class CustomerPaymentIn(PaymentIn):
    customer_id: int


# ---------------- Weaver payments ----------------
def wpay_out(p):
    return {"id": p.id, "date": d(p.date), "weaver_id": p.weaver_id, "weaver_name": p.weaver.name,
            "amount": r2(p.amount), "mode": p.mode, "notes": p.notes}


@router.get("/weaver-dues")
def weaver_dues(db=Depends(get_db)):
    out = []
    for w in db.query(Weaver).order_by(Weaver.name):
        bal = calc.weaver_balance(db, w)
        if not w.active and abs(bal) < 0.01:
            continue
        s = calc.weaver_since_last_payment(db, w)
        out.append({"weaver_id": w.id, "weaver_name": w.name, "rate_per_meter": w.rate_per_meter,
                    "balance": bal, **s})
    out.sort(key=lambda x: -x["balance"])
    return out


@router.get("/weaver-payments")
def list_weaver_payments(weaver_id: Optional[int] = None, from_: Optional[date] = Query(None, alias="from"),
                         to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(WeaverPayment), WeaverPayment.date, from_, to)
    if weaver_id:
        q = q.filter(WeaverPayment.weaver_id == weaver_id)
    return [wpay_out(p) for p in q.order_by(WeaverPayment.date.desc(), WeaverPayment.id.desc())]


@router.post("/weaver-payments")
def create_weaver_payment(body: WeaverPaymentIn, db=Depends(get_db)):
    get_or_404(db, Weaver, body.weaver_id, "Weaver")
    p = WeaverPayment(**body.model_dump())
    db.add(p)
    db.commit()
    return wpay_out(p)


@router.delete("/weaver-payments/{pid}")
def delete_weaver_payment(pid: int, db=Depends(get_db)):
    db.delete(get_or_404(db, WeaverPayment, pid, "Payment"))
    db.commit()
    return {"ok": True}


@router.get("/weaver-payments/{pid}/slip")
def payment_slip(pid: int, db=Depends(get_db)):
    p = get_or_404(db, WeaverPayment, pid, "Payment")
    w = p.weaver
    before_this = or_(WeaverPayment.date < p.date, and_(WeaverPayment.date == p.date, WeaverPayment.id < p.id))
    prev = db.query(WeaverPayment).filter(WeaverPayment.weaver_id == w.id, before_this) \
        .order_by(WeaverPayment.date.desc(), WeaverPayment.id.desc()).first()
    lq = db.query(Lot).filter(Lot.weaver_id == w.id, Lot.date <= p.date)
    if prev:
        lq = lq.filter(Lot.date > prev.date)
    lots = lq.order_by(Lot.date, Lot.id).all()
    earned_upto = db.query(func.coalesce(func.sum(Lot.amount), 0)).filter(Lot.weaver_id == w.id,
                                                                         Lot.date <= p.date).scalar()
    paid_before = db.query(func.coalesce(func.sum(WeaverPayment.amount), 0)) \
        .filter(WeaverPayment.weaver_id == w.id, before_this).scalar()
    due_before = r2((w.opening_balance or 0) + earned_upto - paid_before)
    return {"payment": wpay_out(p),
            "weaver": {"id": w.id, "name": w.name, "phone": w.phone, "rate_per_meter": w.rate_per_meter},
            "period_from": d(prev.date) if prev else None, "period_to": d(p.date),
            "lots": [{"code": l.code, "date": d(l.date), "machine": l.machine.number if l.machine else "",
                      "product": l.product, "color": l.color, "pieces": l.pieces, "meters": r2(l.meters),
                      "rate": r2(l.rate_per_meter), "amount": r2(l.amount)} for l in lots],
            "total_meters": r2(sum(l.meters for l in lots)), "total_amount": r2(sum(l.amount for l in lots)),
            "due_before": due_before, "balance_after": r2(due_before - p.amount)}


@router.get("/weavers/{wid}/ledger")
def weaver_ledger(wid: int, db=Depends(get_db)):
    w = get_or_404(db, Weaver, wid, "Weaver")
    entries = [{"date": d(l.date), "order": 0, "id": l.id, "ref": l.code,
                "detail": f"{l.product} {l.color} · {r2(l.meters)} m × ₹{r2(l.rate_per_meter)}",
                "plus": r2(l.amount), "minus": 0} for l in db.query(Lot).filter(Lot.weaver_id == wid)]
    entries += [{"date": d(p.date), "order": 1, "id": p.id, "ref": "Payment",
                 "detail": f"Paid ({p.mode}) {p.notes}".strip(), "plus": 0, "minus": r2(p.amount)}
                for p in db.query(WeaverPayment).filter(WeaverPayment.weaver_id == wid)]
    return {"opening": r2(w.opening_balance), "entries": calc.ledger(w.opening_balance, entries),
            "balance": calc.weaver_balance(db, w)}


# ---------------- Sales ----------------
class SaleItemIn(In):
    product: str = Field(min_length=1)
    color: str = ""
    quantity: int = Field(gt=0)
    rate: float = Field(ge=0)


class SaleIn(In):
    date: date
    customer_id: int
    items: List[SaleItemIn] = Field(min_length=1)
    notes: str = ""


def sale_out(s, full=False):
    out = {"id": s.id, "invoice_no": s.invoice_no, "date": d(s.date), "customer_id": s.customer_id,
           "customer_name": s.customer.name, "total": r2(s.total), "notes": s.notes,
           "pieces": sum(i.quantity for i in s.items)}
    out["items"] = [{"product": i.product, "color": i.color, "quantity": i.quantity, "rate": r2(i.rate),
                     "amount": r2(i.amount)} for i in s.items]
    if full:
        c = s.customer
        out["customer"] = {"name": c.name, "phone": c.phone, "address": c.address, "gstin": c.gstin}
    return out


@router.get("/sales")
def list_sales(customer_id: Optional[int] = None, from_: Optional[date] = Query(None, alias="from"),
               to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(Sale), Sale.date, from_, to)
    if customer_id:
        q = q.filter(Sale.customer_id == customer_id)
    return [sale_out(s) for s in q.order_by(Sale.date.desc(), Sale.id.desc())]


@router.get("/sales/{sid}")
def get_sale(sid: int, db=Depends(get_db)):
    return sale_out(get_or_404(db, Sale, sid, "Bill"), full=True)


@router.post("/sales")
def create_sale(body: SaleIn, db=Depends(get_db)):
    get_or_404(db, Customer, body.customer_id, "Customer")
    stock = {key(s["product"], s["color"]): s["in_stock"] for s in calc.finished_stock(db)}
    wanted = {}
    for it in body.items:
        k = key(it.product, it.color)
        wanted[k] = wanted.get(k, 0) + it.quantity
    for it in body.items:
        k = key(it.product, it.color)
        if wanted[k] > stock.get(k, 0):
            fail(f"Not enough stock: only {stock.get(k, 0)} pieces of {it.product} {it.color} are packed and ready.")
    s = Sale(date=body.date, customer_id=body.customer_id, notes=body.notes)
    for it in body.items:
        s.items.append(SaleItem(product=it.product, color=it.color, quantity=it.quantity, rate=it.rate,
                                amount=r2(it.quantity * it.rate)))
    s.total = r2(sum(i.amount for i in s.items))
    db.add(s)
    db.flush()
    s.invoice_no = f"INV-{s.id:04d}"
    db.commit()
    return sale_out(s, full=True)


@router.delete("/sales/{sid}")
def delete_sale(sid: int, db=Depends(get_db)):
    db.delete(get_or_404(db, Sale, sid, "Bill"))
    db.commit()
    return {"ok": True}


# ---------------- Customer payments ----------------
def cpay_out(p):
    return {"id": p.id, "date": d(p.date), "customer_id": p.customer_id, "customer_name": p.customer.name,
            "amount": r2(p.amount), "mode": p.mode, "notes": p.notes}


@router.get("/customer-payments")
def list_customer_payments(customer_id: Optional[int] = None, from_: Optional[date] = Query(None, alias="from"),
                           to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(CustomerPayment), CustomerPayment.date, from_, to)
    if customer_id:
        q = q.filter(CustomerPayment.customer_id == customer_id)
    return [cpay_out(p) for p in q.order_by(CustomerPayment.date.desc(), CustomerPayment.id.desc())]


@router.post("/customer-payments")
def create_customer_payment(body: CustomerPaymentIn, db=Depends(get_db)):
    get_or_404(db, Customer, body.customer_id, "Customer")
    p = CustomerPayment(**body.model_dump())
    db.add(p)
    db.commit()
    return cpay_out(p)


@router.delete("/customer-payments/{pid}")
def delete_customer_payment(pid: int, db=Depends(get_db)):
    db.delete(get_or_404(db, CustomerPayment, pid, "Payment"))
    db.commit()
    return {"ok": True}


@router.get("/customers/{cid}/ledger")
def customer_ledger(cid: int, db=Depends(get_db)):
    c = get_or_404(db, Customer, cid, "Customer")
    entries = [{"date": d(s.date), "order": 0, "id": s.id, "ref": s.invoice_no,
                "detail": f"Bill · {sum(i.quantity for i in s.items)} pieces", "plus": r2(s.total), "minus": 0}
               for s in db.query(Sale).filter(Sale.customer_id == cid)]
    entries += [{"date": d(p.date), "order": 1, "id": p.id, "ref": "Received",
                 "detail": f"Received ({p.mode}) {p.notes}".strip(), "plus": 0, "minus": r2(p.amount)}
                for p in db.query(CustomerPayment).filter(CustomerPayment.customer_id == cid)]
    return {"opening": r2(c.opening_balance), "entries": calc.ledger(c.opening_balance, entries),
            "balance": calc.customer_balance(db, c)}
