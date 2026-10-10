#!/usr/bin/env bash
# Double-click (or run ./start-mac-linux.sh) to start Textile Records.
cd "$(dirname "$0")/backend" || exit 1

if [ ! -x ".venv/bin/python" ]; then
  echo "First time setup. This takes 1-2 minutes, only once..."
  python3 -m venv .venv || { echo "Please install Python 3 from https://www.python.org/downloads/"; exit 1; }
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r requirements.txt
fi

echo ""
echo "Textile Records is running at http://localhost:8000"
echo "Keep this window open while using the app."
( sleep 3; (command -v open >/dev/null && open http://localhost:8000) || xdg-open http://localhost:8000 ) >/dev/null 2>&1 &
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
