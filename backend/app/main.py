import base64
import os
import glob
import logging
import secrets
from contextlib import asynccontextmanager
from datetime import date
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response
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
CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()] or ["*"]
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])

# When hosted online, set APP_PASSWORD so only people with the password can open the app.
# The browser asks once for the user name and password and remembers them.
APP_USERNAME = os.environ.get("APP_USERNAME", "").strip() or "admin"
APP_PASSWORD = os.environ.get("APP_PASSWORD", "")


@app.middleware("http")
async def require_login(request, call_next):
    if not APP_PASSWORD:
        return await call_next(request)
    auth = request.headers.get("authorization", "")
    if auth.lower().startswith("basic "):
        try:
            user, _, pw = base64.b64decode(auth[6:]).decode("utf-8").partition(":")
        except ValueError:
            user, pw = "", ""
        if (secrets.compare_digest(user.encode(), APP_USERNAME.encode())
                and secrets.compare_digest(pw.encode(), APP_PASSWORD.encode())):
            return await call_next(request)
    return Response("Login required", status_code=401, headers={"WWW-Authenticate": 'Basic realm="Textile Records"'})

for r in (masters, production, money, reports):
    app.include_router(r.router)


def daily_backup():
    """Keep one automatic copy of the data per day (last 30 days) in data/backups."""
    try:
        folder = os.path.join(DATA_DIR, "backups")
        os.makedirs(folder, exist_ok=True)
        ext = reports.BACKUP_EXT
        target = os.path.join(folder, f"textile-{date.today().isoformat()}{ext}")
        if not os.path.exists(target):
            reports.make_backup(target)
        for old in sorted(glob.glob(os.path.join(folder, f"textile-*{ext}")))[:-30]:
            os.remove(old)
    except Exception as e:  # never stop the app because of a backup problem
        logging.warning("Automatic backup failed: %s", e)


# ---- Serve the built React app (frontend/dist) from the same address ----
DIST = os.environ.get("TEXTILE_UI_DIR") or (
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
