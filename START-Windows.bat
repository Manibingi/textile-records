@echo off
title Textile Records - keep this window open
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo  First time setup. This takes 1-2 minutes, only once...
  echo.
  python -m venv .venv
  if errorlevel 1 (
    echo.
    echo  Python is not installed.
    echo  Install it from https://www.python.org/downloads/
    echo  IMPORTANT: tick "Add python.exe to PATH" during install. Then run this again.
    pause
    exit /b
  )
  .venv\Scripts\python -m pip install --upgrade pip >nul
  .venv\Scripts\python -m pip install -r requirements.txt
)

echo.
echo  Textile Records is running.
echo  Open in browser:  http://localhost:8000
echo  On a phone in the same Wi-Fi:  http://THIS-COMPUTER-IP:8000
echo.
echo  Do NOT close this window while using the app.
echo.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8000"
.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
