import os
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BACKEND_DIR, ".env"))  # values already set in the environment win

DATA_DIR = os.environ.get("TEXTILE_DATA_DIR") or os.path.join(BACKEND_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "textile.db")

# Empty DATABASE_URL = local SQLite file. Otherwise an online PostgreSQL (Neon, Supabase, ...).
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip() or f"sqlite:///{DB_PATH}"
# Use the psycopg (v3) driver for plain links, including the older "postgres://" form some providers hand out.
for prefix in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(prefix):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(prefix):]
IS_SQLITE = DATABASE_URL.startswith("sqlite")

if IS_SQLITE:
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    # Hosted databases close idle connections, so test each one before use and renew them regularly.
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300,
                           pool_size=int(os.environ.get("DB_POOL_SIZE", "5")),
                           max_overflow=int(os.environ.get("DB_MAX_OVERFLOW", "5")))
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
