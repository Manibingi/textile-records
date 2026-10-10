import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.environ.get("TEXTILE_DATA_DIR", os.path.join(BACKEND_DIR, "data"))
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "textile.db")

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine, autoflush=False)


class Base(DeclarativeBase):
    pass


def upgrade_old_database():
    """Add new columns to a database made by an older version of the app. Safe to run every start."""
    from sqlalchemy import inspect, text
    insp = inspect(engine)
    add = {
        "thread_issues": [("combs", "INTEGER DEFAULT 0"), ("gross_weight", "FLOAT DEFAULT 0"),
                          ("comb_weight", "FLOAT DEFAULT 0")],
        "lots": [("batch_id", "INTEGER")],
        "cutting_entries": [("source", "VARCHAR")],
    }
    with engine.begin() as con:
        for table, cols in add.items():
            if table not in insp.get_table_names():
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, kind in cols:
                if name not in have:
                    con.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {kind}"))
        if "cutting_entries" in insp.get_table_names():
            con.execute(text("UPDATE cutting_entries SET source = CASE WHEN lot_id IS NULL THEN 'opening' "
                             "ELSE 'woven' END WHERE source IS NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
