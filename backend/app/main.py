import os
import glob
import logging
from contextlib import asynccontextmanager
from datetime import date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import Base, engine, DATA_DIR, upgrade_old_database
from .routers import masters, production, money, reports

Base.metadata.create_all(engine)
upgrade_old_database()

@asynccontextmanager
async def lifespan(_app):
    daily_backup()
    yield


app = FastAPI(title="Textile Records", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

for r in (masters, production, money, reports):
    app.include_router(r.router)


def daily_backup():
    """Keep one automatic copy of the data per day (last 30 days) in data/backups."""
    try:
        folder = os.path.join(DATA_DIR, "backups")
        os.makedirs(folder, exist_ok=True)
        target = os.path.join(folder, f"textile-{date.today().isoformat()}.db")
        if not os.path.exists(target):
            reports.make_backup(target)
        for old in sorted(glob.glob(os.path.join(folder, "textile-*.db")))[:-30]:
            os.remove(old)
    except Exception as e:  # never stop the app because of a backup problem
        logging.warning("Automatic backup failed: %s", e)


# ---- Serve the built React app (frontend/dist) from the same address ----
DIST = os.environ.get("TEXTILE_UI_DIR",
                      os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
                                   "frontend", "dist"))

if os.path.isdir(os.path.join(DIST, "assets")):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")


@app.get("/{full_path:path}", include_in_schema=False)
def spa(full_path: str):
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)
    file = os.path.join(DIST, full_path)
    if full_path and os.path.isfile(file):
        return FileResponse(file)
    index = os.path.join(DIST, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    return JSONResponse({"detail": "Screens are not built yet. Run 'npm run build' in the frontend folder."},
                        status_code=404)
