from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict


class In(BaseModel):
    """Base for request bodies: trims spaces from all text."""
    model_config = ConfigDict(str_strip_whitespace=True)


def get_or_404(db, model, id_, label="Record"):
    obj = db.get(model, id_)
    if not obj:
        raise HTTPException(404, f"{label} not found")
    return obj


def fail(msg: str, code: int = 400):
    raise HTTPException(code, msg)


def r2(x):
    """Round money the normal way (0.005 goes up), same as the screen shows."""
    return float(Decimal(repr(float(x or 0))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def r3(x):
    return round(float(x or 0), 3)


def d(x):
    return x.isoformat() if x else None


def key(*parts):
    """Case-insensitive grouping key, so 'Red' and 'red ' count as the same color."""
    return tuple((p or "").strip().lower() for p in parts)


def date_filter(q, col, from_, to):
    if from_:
        q = q.filter(col >= from_)
    if to:
        q = q.filter(col <= to)
    return q
