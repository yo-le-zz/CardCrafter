"""CardCrafter v1.0 — Point d'entrée FastAPI."""
import json
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from app.utils.file_utils import ensure_dirs, SETTINGS_FILE, ASSETS_DIR
from app.routes import templates_router, editor_router, cards_router

ensure_dirs()

app = FastAPI(title="CardCrafter", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

app.mount("/static",  StaticFiles(directory="static"),        name="static")
app.mount("/data",    StaticFiles(directory="data"),           name="data")
app.mount("/assets",  StaticFiles(directory=str(ASSETS_DIR)), name="assets")

app.include_router(templates_router.router, prefix="/api/templates", tags=["templates"])
app.include_router(editor_router.router,    prefix="/api/editor",    tags=["editor"])
app.include_router(cards_router.router,     prefix="/api/cards",     tags=["cards"])

import starlette
_new_api = tuple(int(x) for x in starlette.__version__.split(".")[:2]) >= (0, 28)
jinja = Jinja2Templates(directory="html")

def _tpl(request, name, ctx=None):
    ctx = ctx or {}
    if _new_api:
        return jinja.TemplateResponse(request=request, name=name, context=ctx)
    return jinja.TemplateResponse(name, {"request": request, **ctx})

@app.get("/",               response_class=HTMLResponse)
async def home(r: Request):          return _tpl(r, "index.html")

@app.get("/editor/{tid}",   response_class=HTMLResponse)
async def editor_page(r: Request, tid: str): return _tpl(r, "editor.html", {"tid": tid})

@app.get("/generator/{tid}", response_class=HTMLResponse)
async def gen_page(r: Request, tid: str):    return _tpl(r, "generator.html", {"tid": tid})

# ── Fonts API ─────────────────────────────────────────────────────
@app.get("/api/fonts")
async def list_fonts():
    """Liste les polices disponibles pour le rendu des cartes."""
    from app.services.card_service import list_available_fonts
    return list_available_fonts()

# ── Settings ──────────────────────────────────────────────────────
DEFAULT_SETTINGS = {
    "export_quality": 95, "cards_per_row": 3,
    "card_w_mm": 63.5, "card_h_mm": 88.9,
    "gap_mm": 3.0, "margin_mm": 10.0,
    "snap": True, "grid_size": 10,
}

@app.get("/api/settings")
async def get_settings():
    if SETTINGS_FILE.exists():
        try: return json.loads(SETTINGS_FILE.read_text("utf-8"))
        except: pass
    return DEFAULT_SETTINGS

@app.put("/api/settings")
async def save_settings(s: dict):
    merged = {**DEFAULT_SETTINGS, **s}
    SETTINGS_FILE.write_text(json.dumps(merged, indent=2), "utf-8")
    return merged
