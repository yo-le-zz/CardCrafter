@echo off
cd /d "%~dp0"
pip install -r requirements.txt -q
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8765
pause
