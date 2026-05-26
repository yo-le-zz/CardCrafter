#!/usr/bin/env bash
# Lancement en mode développement (hot-reload)
cd "$(dirname "$0")"
pip install -r requirements.txt --break-system-packages -q
uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
