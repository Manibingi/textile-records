"""Thread purchases, rods, issue to weavers, lots, cutting & packing."""
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, Query
from pydantic import Field
from sqlalchemy import func
from ..database import get_db
from ..models import Purchase, Supplier, Rod, ThreadIssue, LotBatch, Weaver, Machine, Lot, CuttingEntry
from ..util import In, get_or_404, fail, r2, r3, d, date_filter, key
from .. import calc

router = APIRouter(prefix="/api")


# ---------------- Purchases ----------------
class PurchaseIn(In):
    date: date
    supplier_id: Optional[int] = None
    bill_no: str = ""
    thread_type: str = Field(min_length=1)
    color: str = Field(min_length=1)
    quantity_kg: float = Field(gt=0)
    rate_per_kg: float = Field(0, ge=0)
    notes: str = ""


def purchase_out(p):
    return {"id": p.id, "date": d(p.date), "supplier_id": p.supplier_id,
            "supplier_name": p.supplier.name if p.supplier else "Opening stock", "bill_no": p.bill_no,
            "thread_type": p.thread_type, "color": p.color, "quantity_kg": r3(p.quantity_kg),
            "rate_per_kg": r2(p.rate_per_kg), "amount": r2(p.amount), "notes": p.notes}


@router.get("/purchases")
def list_purchases(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
                   supplier_id: Optional[int] = None, db=Depends(get_db)):
    q = date_filter(db.query(Purchase), Purchase.date, from_, to)
    if supplier_id:
        q = q.filter(Purchase.supplier_id == supplier_id)
    return [purchase_out(p) for p in q.order_by(Purchase.date.desc(), Purchase.id.desc())]


@router.post("/purchases")
def create_purchase(body: PurchaseIn, db=Depends(get_db)):
    if body.supplier_id:
        get_or_404(db, Supplier, body.supplier_id, "Supplier")
    p = Purchase(**body.model_dump())
    p.amount = r2(p.quantity_kg * p.rate_per_kg)
    db.add(p)
    db.commit()
    return purchase_out(p)


@router.delete("/purchases/{pid}")
def delete_purchase(pid: int, db=Depends(get_db)):
    db.delete(get_or_404(db, Purchase, pid, "Purchase"))
    db.commit()
    return {"ok": True}


@router.get("/thread-stock")
def get_thread_stock(db=Depends(get_db)):
    return calc.thread_stock(db)


# ---------------- Rods ----------------
class RodIn(In):
    date: date
    thread_type: str = Field(min_length=1)
    color: str = Field(min_length=1)
    design: str = ""
    gross_weight: float = Field(gt=0)
    rod_weight: float = Field(ge=0)
    length_m: float = Field(549, gt=0)
    notes: str = ""


class IssueIn(In):
    rod_ids: List[int] = Field(min_length=1)
    weaver_id: int
    machine_id: Optional[int] = None
    date: date


class DateIn(In):
    date: date


def rod_out(r):
    return {"id": r.id, "code": r.code, "date": d(r.date), "thread_type": r.thread_type, "color": r.color,
            "design": r.design, "gross_weight": r3(r.gross_weight), "rod_weight": r3(r.rod_weight),
            "net_weight": r3(r.net_weight), "length_m": r2(r.length_m), "status": r.status,
            "weaver_id": r.weaver_id, "weaver_name": r.weaver.name if r.weaver else None,
            "machine_id": r.machine_id, "machine_number": r.machine.number if r.machine else None,
            "issue_date": d(r.issue_date), "finished_date": d(r.finished_date), "notes": r.notes,
            "lots": [l.code for l in r.lots],
            "meters_woven": r2(sum(l.meters for l in r.lots))}


@router.get("/rods")
def list_rods(status: Optional[str] = None, weaver_id: Optional[int] = None, machine_id: Optional[int] = None,
              db=Depends(get_db)):
    q = db.query(Rod)
    if status:
        q = q.filter(Rod.status.in_(status.split(",")))
    if weaver_id:
        q = q.filter(Rod.weaver_id == weaver_id)
    if machine_id:
        q = q.filter(Rod.machine_id == machine_id)
    return [rod_out(r) for r in q.order_by(Rod.id.desc())]


@router.post("/rods")
def create_rod(body: RodIn, db=Depends(get_db)):
    if body.gross_weight <= body.rod_weight:
        fail("Total weight must be more than the steel rod weight.")
    net = r3(body.gross_weight - body.rod_weight)
    available = calc.thread_available(db, body.thread_type, body.color)
    r = Rod(**body.model_dump(), net_weight=net, status="in_stock")
    db.add(r)
    db.flush()
    r.code = f"R-{r.id:04d}"
    db.commit()
    out = rod_out(r)
    if net > available + 1e-9:
        out["warning"] = (f"Thread stock for {body.thread_type} {body.color} was only {available} kg. "
                          f"Stock is now negative — please check purchases.")
    return out


@router.delete("/rods/{rid}")
def delete_rod(rid: int, db=Depends(get_db)):
    r = get_or_404(db, Rod, rid, "Rod")
    if r.lots:
        fail("This rod is linked to lots. Delete those lots first.")
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.post("/rods/issue")
def issue_rods(body: IssueIn, db=Depends(get_db)):
    w = get_or_404(db, Weaver, body.weaver_id, "Weaver")
    m = None
    if body.machine_id:
        m = get_or_404(db, Machine, body.machine_id, "Machine")
        if m.weaver_id != w.id:
            fail("That machine does not belong to this weaver.")
    rods = []
    for rid in body.rod_ids:
        r = get_or_404(db, Rod, rid, "Rod")
        if r.status != "in_stock":
            fail(f"Rod {r.code} is not in stock (it is already with a weaver or finished).")
        rods.append(r)
    for r in rods:
        r.status, r.weaver_id, r.machine_id, r.issue_date = "with_weaver", w.id, m.id if m else None, body.date
    if m and rods:
        m.current_color = rods[-1].color
        m.current_design = rods[-1].design or m.current_design
    db.commit()
    return [rod_out(r) for r in rods]


@router.post("/rods/{rid}/return")
def return_rod(rid: int, db=Depends(get_db)):
    """Undo an issue (rod came back unused / entered by mistake)."""
    r = get_or_404(db, Rod, rid, "Rod")
    if r.lots:
        fail("Lots are already received from this rod, so it cannot go back to stock. Mark it finished instead.")
    r.status, r.weaver_id, r.machine_id, r.issue_date, r.finished_date = "in_stock", None, None, None, None
    db.commit()
    return rod_out(r)


@router.post("/rods/{rid}/finish")
def finish_rod(rid: int, body: DateIn, db=Depends(get_db)):
    r = get_or_404(db, Rod, rid, "Rod")
    if r.status != "with_weaver":
        fail("Only a rod that is with a weaver can be marked finished.")
    r.status, r.finished_date = "finished", body.date
    db.commit()
    return rod_out(r)


@router.post("/rods/{rid}/reopen")
def reopen_rod(rid: int, db=Depends(get_db)):
    r = get_or_404(db, Rod, rid, "Rod")
    if r.status != "finished":
        fail("Rod is not finished.")
    r.status, r.finished_date = "with_weaver", None
    db.commit()
    return rod_out(r)


# ---------------- Extra thread given to weavers ----------------
class ThreadIssueIn(In):
    date: date
    weaver_id: int
    machine_id: Optional[int] = None
    thread_type: str = Field(min_length=1)
    color: str = Field(min_length=1)
    combs: int = Field(0, ge=0)
    gross_weight: Optional[float] = Field(None, gt=0)  # total weight of all combs with thread
    comb_weight: float = Field(0, ge=0)                 # weight of ONE empty plastic comb
    quantity_kg: Optional[float] = Field(None, gt=0)    # only if no comb details are given
    kind: str = Field("given", pattern="^(given|returned)$")
    notes: str = ""


def thread_issue_out(t):
    return {"id": t.id, "date": d(t.date), "weaver_id": t.weaver_id, "weaver_name": t.weaver.name,
            "machine_id": t.machine_id, "machine_number": t.machine.number if t.machine else None,
            "thread_type": t.thread_type, "color": t.color, "quantity_kg": r3(t.quantity_kg),
            "combs": t.combs or 0, "gross_weight": r3(t.gross_weight), "comb_weight": r3(t.comb_weight),
            "kind": t.kind, "notes": t.notes}


@router.get("/thread-issues")
def list_thread_issues(weaver_id: Optional[int] = None, from_: Optional[date] = Query(None, alias="from"),
                       to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(ThreadIssue), ThreadIssue.date, from_, to)
    if weaver_id:
        q = q.filter(ThreadIssue.weaver_id == weaver_id)
    return [thread_issue_out(t) for t in q.order_by(ThreadIssue.date.desc(), ThreadIssue.id.desc())]


@router.post("/thread-issues")
def create_thread_issue(body: ThreadIssueIn, db=Depends(get_db)):
    w = get_or_404(db, Weaver, body.weaver_id, "Weaver")
    if body.machine_id:
        m = get_or_404(db, Machine, body.machine_id, "Machine")
        if m.weaver_id != w.id:
            fail("That machine does not belong to this weaver.")
    data = body.model_dump()
    if body.gross_weight is not None:
        if body.combs < 1:
            fail("Enter the number of combs.")
        net = r3(body.gross_weight - body.combs * body.comb_weight)
        if net <= 0:
            fail(f"Total weight must be more than the plastic weight ({body.combs} combs × {body.comb_weight} kg).")
        data["quantity_kg"] = net
    elif body.quantity_kg is None:
        fail("Enter the total weight of the combs.")
    available = calc.thread_available(db, body.thread_type, body.color)
    t = ThreadIssue(**data)
    db.add(t)
    db.commit()
    out = thread_issue_out(t)
    if body.kind == "given" and t.quantity_kg > available + 1e-9:
        out["warning"] = (f"Thread stock for {body.thread_type} {body.color} was only {available} kg. "
                          f"Stock is now negative — please check purchases.")
    return out


@router.delete("/thread-issues/{tid}")
def delete_thread_issue(tid: int, db=Depends(get_db)):
    db.delete(get_or_404(db, ThreadIssue, tid, "Thread entry"))
    db.commit()
    return {"ok": True}


# ---------------- Lots ----------------
class LotLine(In):
    pieces: int = Field(ge=0)
    meters: float = Field(gt=0)
    notes: str = ""


class LotReceiptIn(In):
    """One visit: one or more lots from the same machine, weighed together."""
    date: date
    weaver_id: int
    machine_id: Optional[int] = None
    product: str = Field(min_length=1)
    color: str = ""
    design: str = ""
    weight_kg: float = Field(0, ge=0)  # combined weight of all lots
    lots: List[LotLine] = Field(min_length=1)
    rod_ids: List[int] = []
    finish_rod_ids: List[int] = []
    notes: str = ""


def lot_out(l):
    b = l.batch
    return {"id": l.id, "code": l.code, "date": d(l.date), "weaver_id": l.weaver_id, "weaver_name": l.weaver.name,
            "machine_id": l.machine_id, "machine_number": l.machine.number if l.machine else None,
            "product": l.product, "color": l.color, "design": l.design, "pieces": l.pieces,
            "meters": r2(l.meters), "rate_per_meter": r2(l.rate_per_meter), "amount": r2(l.amount), "notes": l.notes,
            "rods": [{"id": r.id, "code": r.code, "color": r.color, "design": r.design} for r in l.rods],
            "batch_id": b.id if b else None, "batch_code": b.code if b else None,
            "batch_lot_count": len(b.lots) if b else 1,
            # weight: combined for the whole receipt (older single-lot entries keep their own weight)
            "weight_kg": r3(b.weight_kg if b else l.weight_kg), "first_in_batch": (not b) or b.lots[0].id == l.id}


def batch_out(b):
    return {"id": b.id, "code": b.code, "date": d(b.date), "weaver_name": b.lots[0].weaver.name if b.lots else "",
            "weight_kg": r3(b.weight_kg), "lots": [lot_out(l) for l in b.lots],
            "pieces": sum(l.pieces for l in b.lots), "meters": r2(sum(l.meters for l in b.lots)),
            "amount": r2(sum(l.amount for l in b.lots))}


@router.get("/lots")
def list_lots(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None,
              weaver_id: Optional[int] = None, db=Depends(get_db)):
    q = date_filter(db.query(Lot), Lot.date, from_, to)
    if weaver_id:
        q = q.filter(Lot.weaver_id == weaver_id)
    return [lot_out(l) for l in q.order_by(Lot.date.desc(), Lot.batch_id.desc(), Lot.id)]


@router.get("/lots/{lid}")
def get_lot(lid: int, db=Depends(get_db)):
    return lot_out(get_or_404(db, Lot, lid, "Lot"))


@router.post("/lots")
def receive_lots(body: LotReceiptIn, db=Depends(get_db)):
    w = get_or_404(db, Weaver, body.weaver_id, "Weaver")
    if body.machine_id:
        m = get_or_404(db, Machine, body.machine_id, "Machine")
        if m.weaver_id != w.id:
            fail("That machine does not belong to this weaver.")
    rods = []
    for rid in body.rod_ids:
        r = get_or_404(db, Rod, rid, "Rod")
        if r.weaver_id != w.id:
            fail(f"Rod {r.code} was not given to {w.name}.")
        rods.append(r)
    b = LotBatch(date=body.date, weaver_id=w.id, machine_id=body.machine_id, weight_kg=body.weight_kg, notes=body.notes)
    db.add(b)
    db.flush()
    b.code = f"R{b.id:04d}"
    for line in body.lots:
        l = Lot(date=body.date, weaver_id=w.id, machine_id=body.machine_id, product=body.product, color=body.color,
                design=body.design, pieces=line.pieces, meters=line.meters, weight_kg=0, notes=line.notes or body.notes,
                rate_per_meter=w.rate_per_meter, amount=r2(line.meters * w.rate_per_meter), batch_id=b.id)
        l.rods = list(rods)
        db.add(l)
        db.flush()
        l.code = f"L-{l.id:04d}"
    finish_ids = set(body.finish_rod_ids)
    for r in rods:
        if r.id in finish_ids and r.status == "with_weaver":
            r.status, r.finished_date = "finished", body.date
    db.commit()
    db.refresh(b)
    return batch_out(b)


@router.delete("/lots/{lid}")
def delete_lot(lid: int, db=Depends(get_db)):
    l = get_or_404(db, Lot, lid, "Lot")
    if l.cuttings:
        fail("This lot already has cutting entries. Delete those first.")
    if calc.uncut_for(db, l.product, l.color) - l.pieces < 0:
        fail(f"Pieces of {l.product} {l.color} from this lot are already cut. Delete those cutting entries first.")
    b = l.batch
    l.rods = []
    db.delete(l)
    db.flush()
    if b is not None and not db.query(Lot).filter(Lot.batch_id == b.id).count():
        db.delete(b)
    db.commit()
    return {"ok": True}


# ---------------- Cutting & packing ----------------
class CuttingIn(In):
    date: date
    source: str = Field("woven", pattern="^(woven|opening)$")
    product: str = ""
    color: str = ""
    good_pieces: int = Field(ge=0)
    rejected_pieces: int = Field(0, ge=0)
    bundles: int = Field(0, ge=0)
    notes: str = ""


def cutting_out(c):
    src = c.source or ("woven" if c.lot_id else "opening")
    return {"id": c.id, "date": d(c.date), "source": src,
            "source_label": "From weaving" if src == "woven" else "Opening stock",
            "lot_code": c.lot.code if c.lot else "", "product": c.product, "color": c.color, "good_pieces": c.good_pieces,
            "rejected_pieces": c.rejected_pieces, "bundles": c.bundles, "notes": c.notes}


@router.get("/cutting")
def list_cutting(from_: Optional[date] = Query(None, alias="from"), to: Optional[date] = None, db=Depends(get_db)):
    q = date_filter(db.query(CuttingEntry), CuttingEntry.date, from_, to)
    return [cutting_out(c) for c in q.order_by(CuttingEntry.date.desc(), CuttingEntry.id.desc())]


@router.post("/cutting")
def create_cutting(body: CuttingIn, db=Depends(get_db)):
    if not body.product:
        fail("Please choose the product and colour.")
    if body.good_pieces + body.rejected_pieces == 0:
        fail("Enter the number of pieces.")
    waiting = calc.uncut_for(db, body.product, body.color) if body.source == "woven" else None
    c = CuttingEntry(**body.model_dump())
    db.add(c)
    db.commit()
    out = cutting_out(c)
    total = body.good_pieces + body.rejected_pieces
    if waiting is not None and total > waiting:
        out["warning"] = (f"Only {waiting} pieces of {body.product} {body.color} were waiting to be cut, "
                          f"but {total} were entered. Please check the lots received.")
    return out


@router.get("/uncut-stock")
def get_uncut_stock(db=Depends(get_db)):
    return calc.uncut_stock(db)


@router.delete("/cutting/{cid}")
def delete_cutting(cid: int, db=Depends(get_db)):
    c = get_or_404(db, CuttingEntry, cid, "Cutting entry")
    stock = {key(s["product"], s["color"]): s["in_stock"] for s in calc.finished_stock(db)}
    if stock.get(key(c.product, c.color), 0) - c.good_pieces < 0:
        fail("Some of these pieces are already sold, so this entry cannot be deleted. Delete the bill first.")
    db.delete(c)
    db.commit()
    return {"ok": True}


@router.get("/finished-stock")
def get_finished_stock(db=Depends(get_db)):
    return calc.finished_stock(db)
