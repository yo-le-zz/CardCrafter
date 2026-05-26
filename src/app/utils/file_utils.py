"""
Chemins centralisés — dev, Nuitka standalone, Nuitka onefile.
"""
import os, re, uuid, sys
from pathlib import Path


def _resolve_base() -> Path:
    """
    Je préfère la variable d'env CARDCRAFTER_BASE (définie par launcher.py)
    plutôt que de bricoler sys.executable — c'est le seul moyen sans ambiguïté.
    """
    env = os.environ.get("CARDCRAFTER_BASE")
    if env:
        return Path(env).resolve()
    return Path(__file__).resolve().parent.parent.parent


BASE_DIR      = _resolve_base()
DATA_DIR      = BASE_DIR / "data"
TEMPLATES_DIR = DATA_DIR / "card_templates"
GENERATED_DIR = DATA_DIR / "generated"
TMP_DIR       = DATA_DIR / "tmp"
SETTINGS_FILE = DATA_DIR / "settings.json"
ASSETS_DIR    = BASE_DIR / "assets"
FONTS_DIR     = ASSETS_DIR / "fonts"

MAX_UPLOAD_BYTES = 100 * 1024 * 1024
ALLOWED_MIME = {"image/png","image/jpeg","image/webp","image/gif","application/pdf"}
THUMB_W, THUMB_H = 280, 390

# Polices bundlées (Liberation Sans = Arial metric-compatible, Apache license)
FONT_BOLD    = FONTS_DIR / "LiberationSans-Bold.ttf"
FONT_REGULAR = FONTS_DIR / "LiberationSans-Regular.ttf"


def ensure_dirs():
    for d in [TEMPLATES_DIR, GENERATED_DIR, TMP_DIR,
              BASE_DIR/"static"/"uploads", FONTS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def gen_id() -> str:
    return uuid.uuid4().hex[:12]


def sanitize(name: str) -> str:
    name = re.sub(r'[^\w\s\-.]', '', name).strip()
    return re.sub(r'\s+', '_', name)[:80] or "template"


def tpl_dir(tid: str) -> Path:
    p = (TEMPLATES_DIR / tid).resolve()
    if not str(p).startswith(str(TEMPLATES_DIR.resolve())):
        raise ValueError("Path traversal bloqué")
    return p


def tpl_img(tid)      -> Path: return tpl_dir(tid) / "template.png"
def tpl_img_back(tid) -> Path: return tpl_dir(tid) / "template_back.png"
def tpl_thumb(tid)    -> Path: return tpl_dir(tid) / "thumb.png"
def tpl_cfg(tid)      -> Path: return tpl_dir(tid) / "config.json"
