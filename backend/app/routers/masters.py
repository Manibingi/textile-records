"""Suppliers, weavers, machines, customers, business settings."""
from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import func
from ..database import get_db, IS_SQLITE
from ..models import (Supplier, Purchase, Weaver, Machine, Rod, Lot, WeaverPayment, ThreadIssue, Customer,
                      Sale, CustomerPayment, Setting)
from ..util import In, get_or_404, fail, r2, r3
from .. import calc

router = APIRouter(prefix="/api")


# ---------------- Settings ----------------
SETTING_KEYS = ["business_name", "address", "phone", "gstin", "default_rod_length", "default_rod_weight",
                "default_comb_weight"]


@router.get("/settings")
def get_settings(db=Depends(get_db)):
    vals = {s.key: s.value for s in db.query(Setting)}
    out = {k: vals.get(k, "") for k in SETTING_KEYS}
    out["default_rod_length"] = out["default_rod_length"] or "549"
    out["online_db"] = not IS_SQLITE  # read-only, tells the screen which backup help to show
    return out


@router.put("/settings")
def save_settings(body: dict, db=Depends(get_db)):
    for k in SETTING_KEYS:
        if k in body:
            s = db.get(Setting, k) or Setting(key=k)
            s.value = str(body[k] if body[k] is not None else "").strip()
            db.add(s)
    db.commit()
    return get_settings(db)


# ---------------- Suppliers ----------------
class SupplierIn(In):
    name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    gstin: str = ""
    payment_terms: str = ""


def supplier_out(s, db):
    n, kg, amt = db.query(func.count(Purchase.id), func.coalesce(func.sum(Purchase.quantity_kg), 0),
                          func.coalesce(func.sum(Purchase.amount), 0)).filter(Purchase.supplier_id == s.id).one()
    return {"id": s.id, "name": s.name, "phone": s.phone, "address": s.address, "gstin": s.gstin,
            "payment_terms": s.payment_terms, "purchase_count": n, "total_kg": r3(kg), "total_amount": r2(amt)}


@router.get("/suppliers")
def list_suppliers(db=Depends(get_db)):
    return [supplier_out(s, db) for s in db.query(Supplier).order_by(func.lower(Supplier.name))]


@router.post("/suppliers")
def create_supplier(body: SupplierIn, db=Depends(get_db)):
    s = Supplier(**body.model_dump())
    db.add(s)
    db.commit()
    return supplier_out(s, db)


@router.put("/suppliers/{sid}")
def update_supplier(sid: int, body: SupplierIn, db=Depends(get_db)):
    s = get_or_404(db, Supplier, sid, "Supplier")
    for k, v in body.model_dump().items():
        setattr(s, k, v)
    db.commit()
    return supplier_out(s, db)


@router.delete("/suppliers/{sid}")
def delete_supplier(sid: int, db=Depends(get_db)):
    s = get_or_404(db, Supplier, sid, "Supplier")
    if db.query(Purchase).filter(Purchase.supplier_id == sid).count():
        fail("This supplier has purchase entries. Delete those purchases first.")
    db.delete(s)
    db.commit()
    return {"ok": True}


# ---------------- Weavers & machines ----------------
class WeaverIn(In):
    name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    rate_per_meter: float = Field(ge=0)
    opening_balance: float = 0
    active: bool = True
    machine_count: int = Field(0, ge=0, le=50)  # only used when creating


class MachineIn(In):
    number: str = Field(min_length=1)
    current_design: str = ""
    current_color: str = ""
    active: bool = True


def machine_out(m):
    return {"id": m.id, "weaver_id": m.weaver_id, "number": m.number, "current_design": m.current_design,
            "current_color": m.current_color, "active": m.active,
            "label": f"Machine {m.number}"}


def weaver_out(w, db):
    rods_with = db.query(Rod).filter(Rod.weaver_id == w.id, Rod.status == "with_weaver").count()
    return {"id": w.id, "name": w.name, "phone": w.phone, "address": w.address,
            "rate_per_meter": w.rate_per_meter, "opening_balance": w.opening_balance, "active": w.active,
            "machines": [machine_out(m) for m in w.machines],
            "balance": calc.weaver_balance(db, w), "rods_with_weaver": rods_with,
            "since_last_payment": calc.weaver_since_last_payment(db, w),
            "extra_thread_kg": calc.thread_with_weaver(db, w.id)}


@router.get("/weavers")
def list_weavers(db=Depends(get_db)):
    return [weaver_out(w, db) for w in db.query(Weaver).order_by(Weaver.active.desc(), func.lower(Weaver.name))]


@router.get("/weavers/{wid}")
def get_weaver(wid: int, db=Depends(get_db)):
    return weaver_out(get_or_404(db, Weaver, wid, "Weaver"), db)


@router.post("/weavers")
def create_weaver(body: WeaverIn, db=Depends(get_db)):
    data = body.model_dump()
    count = data.pop("machine_count")
    w = Weaver(**data)
    db.add(w)
    db.flush()
    for i in range(1, count + 1):
        db.add(Machine(weaver_id=w.id, number=str(i)))
    db.commit()
    db.refresh(w)
    return weaver_out(w, db)


@router.put("/weavers/{wid}")
def update_weaver(wid: int, body: WeaverIn, db=Depends(get_db)):
    w = get_or_404(db, Weaver, wid, "Weaver")
    data = body.model_dump()
    data.pop("machine_count")
    for k, v in data.items():
        setattr(w, k, v)
    db.commit()
    return weaver_out(w, db)


@router.delete("/weavers/{wid}")
def delete_weaver(wid: int, db=Depends(get_db)):
    w = get_or_404(db, Weaver, wid, "Weaver")
    if (db.query(Lot).filter(Lot.weaver_id == wid).count() or db.query(Rod).filter(Rod.weaver_id == wid).count()
            or db.query(WeaverPayment).filter(WeaverPayment.weaver_id == wid).count()
            or db.query(ThreadIssue).filter(ThreadIssue.weaver_id == wid).count()):
        fail("This weaver already has rods, thread, lots or payments. You can mark them as 'Not working' instead.")
    for m in list(w.machines):
        db.delete(m)
    db.delete(w)
    db.commit()
    return {"ok": True}


@router.post("/weavers/{wid}/machines")
def add_machine(wid: int, body: MachineIn, db=Depends(get_db)):
    get_or_404(db, Weaver, wid, "Weaver")
    if db.query(Machine).filter(Machine.weaver_id == wid, func.lower(Machine.number) == body.number.lower()).count():
        fail(f"Machine {body.number} already exists for this weaver.")
    m = Machine(weaver_id=wid, **body.model_dump())
    db.add(m)
    db.commit()
    return machine_out(m)


@router.put("/machines/{mid}")
def update_machine(mid: int, body: MachineIn, db=Depends(get_db)):
    m = get_or_404(db, Machine, mid, "Machine")
    clash = db.query(Machine).filter(Machine.weaver_id == m.weaver_id, Machine.id != mid,
                                     func.lower(Machine.number) == body.number.lower()).count()
    if clash:
        fail(f"Machine {body.number} already exists for this weaver.")
    for k, v in body.model_dump().items():
        setattr(m, k, v)
    db.commit()
    return machine_out(m)


@router.delete("/machines/{mid}")
def delete_machine(mid: int, db=Depends(get_db)):
    m = get_or_404(db, Machine, mid, "Machine")
    if (db.query(Lot).filter(Lot.machine_id == mid).count() or db.query(Rod).filter(Rod.machine_id == mid).count()
            or db.query(ThreadIssue).filter(ThreadIssue.machine_id == mid).count()):
        fail("This machine has rods or lots recorded. Mark it 'Not working' instead of deleting.")
    db.delete(m)
    db.commit()
    return {"ok": True}


# ---------------- Customers ----------------
class CustomerIn(In):
    name: str = Field(min_length=1)
    phone: str = ""
    address: str = ""
    gstin: str = ""
    opening_balance: float = 0


def customer_out(c, db):
    return {"id": c.id, "name": c.name, "phone": c.phone, "address": c.address, "gstin": c.gstin,
            "opening_balance": c.opening_balance, "billed": r2(calc.customer_billed(db, c.id)),
            "received": r2(calc.customer_received(db, c.id)), "balance": calc.customer_balance(db, c)}


@router.get("/customers")
def list_customers(db=Depends(get_db)):
    return [customer_out(c, db) for c in db.query(Customer).order_by(func.lower(Customer.name))]


@router.get("/customers/{cid}")
def get_customer(cid: int, db=Depends(get_db)):
    return customer_out(get_or_404(db, Customer, cid, "Customer"), db)


@router.post("/customers")
def create_customer(body: CustomerIn, db=Depends(get_db)):
    c = Customer(**body.model_dump())
    db.add(c)
    db.commit()
    return customer_out(c, db)


@router.put("/customers/{cid}")
def update_customer(cid: int, body: CustomerIn, db=Depends(get_db)):
    c = get_or_404(db, Customer, cid, "Customer")
    for k, v in body.model_dump().items():
        setattr(c, k, v)
    db.commit()
    return customer_out(c, db)


@router.delete("/customers/{cid}")
def delete_customer(cid: int, db=Depends(get_db)):
    c = get_or_404(db, Customer, cid, "Customer")
    if db.query(Sale).filter(Sale.customer_id == cid).count() or \
            db.query(CustomerPayment).filter(CustomerPayment.customer_id == cid).count():
        fail("This customer has bills or payments. Delete those first.")
    db.delete(c)
    db.commit()
    return {"ok": True}
