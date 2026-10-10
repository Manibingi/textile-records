from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Boolean, Text, Table
from sqlalchemy.orm import relationship
from .database import Base

# A rod (warp beam) can feed many lots, and a lot can use more than one rod.
lot_rods = Table(
    "lot_rods",
    Base.metadata,
    Column("lot_id", ForeignKey("lots.id"), primary_key=True),
    Column("rod_id", ForeignKey("rods.id"), primary_key=True),
)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(Text, default="")


class Supplier(Base):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    address = Column(Text, default="")
    gstin = Column(String, default="")
    payment_terms = Column(String, default="")
    created_at = Column(DateTime, default=datetime.now)


class Purchase(Base):
    __tablename__ = "purchases"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=date.today)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)  # null = opening stock
    bill_no = Column(String, default="")
    thread_type = Column(String, nullable=False)
    color = Column(String, nullable=False)
    quantity_kg = Column(Float, nullable=False)
    rate_per_kg = Column(Float, default=0)
    amount = Column(Float, default=0)
    notes = Column(Text, default="")
    supplier = relationship("Supplier")


class Weaver(Base):
    __tablename__ = "weavers"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    address = Column(Text, default="")
    rate_per_meter = Column(Float, default=0)
    opening_balance = Column(Float, default=0)  # amount already owed to weaver when starting
    active = Column(Boolean, default=True)
    machines = relationship("Machine", back_populates="weaver", order_by="Machine.id")


class Machine(Base):
    __tablename__ = "machines"
    id = Column(Integer, primary_key=True)
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=False)
    number = Column(String, nullable=False)
    current_design = Column(String, default="")
    current_color = Column(String, default="")
    active = Column(Boolean, default=True)
    weaver = relationship("Weaver", back_populates="machines")


class Rod(Base):
    __tablename__ = "rods"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True)
    date = Column(Date, nullable=False, default=date.today)
    thread_type = Column(String, nullable=False)
    color = Column(String, nullable=False)
    design = Column(String, default="")
    gross_weight = Column(Float, nullable=False)
    rod_weight = Column(Float, nullable=False)
    net_weight = Column(Float, nullable=False)
    length_m = Column(Float, default=549)
    # in_stock -> with_weaver -> finished
    status = Column(String, default="in_stock")
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=True)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    issue_date = Column(Date, nullable=True)
    finished_date = Column(Date, nullable=True)
    notes = Column(Text, default="")
    weaver = relationship("Weaver")
    machine = relationship("Machine")
    lots = relationship("Lot", secondary=lot_rods, back_populates="rods")


class LotBatch(Base):
    """One receipt from a machine: several lots weighed together."""
    __tablename__ = "lot_batches"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True)
    date = Column(Date, nullable=False, default=date.today)
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    weight_kg = Column(Float, default=0)  # combined weight of all lots in this receipt
    notes = Column(Text, default="")
    lots = relationship("Lot", back_populates="batch", order_by="Lot.id")


class Lot(Base):
    __tablename__ = "lots"
    id = Column(Integer, primary_key=True)
    code = Column(String, unique=True)
    date = Column(Date, nullable=False, default=date.today)
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    product = Column(String, default="Towel")
    color = Column(String, default="")
    design = Column(String, default="")
    pieces = Column(Integer, default=0)
    weight_kg = Column(Float, default=0)
    meters = Column(Float, nullable=False)
    rate_per_meter = Column(Float, default=0)
    amount = Column(Float, default=0)
    notes = Column(Text, default="")
    batch_id = Column(Integer, ForeignKey("lot_batches.id"), nullable=True)
    weaver = relationship("Weaver")
    machine = relationship("Machine")
    batch = relationship("LotBatch", back_populates="lots")
    rods = relationship("Rod", secondary=lot_rods, back_populates="lots")
    cuttings = relationship("CuttingEntry", back_populates="lot")


class ThreadIssue(Base):
    """Loose (extra) thread given to a weaver, or taken back from him."""
    __tablename__ = "thread_issues"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=date.today)
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=False)
    machine_id = Column(Integer, ForeignKey("machines.id"), nullable=True)
    thread_type = Column(String, nullable=False)
    color = Column(String, nullable=False)
    combs = Column(Integer, default=0)          # number of plastic combs (cones)
    gross_weight = Column(Float, default=0)     # total weight of combs with thread
    comb_weight = Column(Float, default=0)      # weight of one empty plastic comb
    quantity_kg = Column(Float, nullable=False)  # net thread = gross - combs x comb_weight
    kind = Column(String, default="given")  # given | returned
    notes = Column(Text, default="")
    weaver = relationship("Weaver")
    machine = relationship("Machine")


class WeaverPayment(Base):
    __tablename__ = "weaver_payments"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=date.today)
    weaver_id = Column(Integer, ForeignKey("weavers.id"), nullable=False)
    amount = Column(Float, nullable=False)
    mode = Column(String, default="Cash")
    notes = Column(Text, default="")
    weaver = relationship("Weaver")


class CuttingEntry(Base):
    __tablename__ = "cutting_entries"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=date.today)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=True)  # only in old entries
    source = Column(String, default="woven")  # woven = from received lots | opening = opening stock
    product = Column(String, nullable=False)
    color = Column(String, default="")
    good_pieces = Column(Integer, default=0)
    rejected_pieces = Column(Integer, default=0)
    bundles = Column(Integer, default=0)
    notes = Column(Text, default="")
    lot = relationship("Lot", back_populates="cuttings")


class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    phone = Column(String, default="")
    address = Column(Text, default="")
    gstin = Column(String, default="")
    opening_balance = Column(Float, default=0)  # amount customer already owed when starting


class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True)
    invoice_no = Column(String, unique=True)
    date = Column(Date, nullable=False, default=date.today)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    total = Column(Float, default=0)
    notes = Column(Text, default="")
    customer = relationship("Customer")
    items = relationship("SaleItem", back_populates="sale", cascade="all, delete-orphan")


class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(Integer, primary_key=True)
    sale_id = Column(Integer, ForeignKey("sales.id"), nullable=False)
    product = Column(String, nullable=False)
    color = Column(String, default="")
    quantity = Column(Integer, nullable=False)
    rate = Column(Float, default=0)
    amount = Column(Float, default=0)
    sale = relationship("Sale", back_populates="items")


class CustomerPayment(Base):
    __tablename__ = "customer_payments"
    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, default=date.today)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False)
    amount = Column(Float, nullable=False)
    mode = Column(String, default="Cash")
    notes = Column(Text, default="")
    customer = relationship("Customer")
