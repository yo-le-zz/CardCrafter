"""
CRUD des templates sur disque (JSON + images).
Je garde toute la logique fichier ici pour que les routes restent légères.
"""
import json, shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.utils.file_utils import (
    TEMPLATES_DIR, gen_id, sanitize,
    tpl_dir, tpl_cfg, tpl_img, tpl_thumb,
)


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def list_all() -> list:
    out = []
    if not TEMPLATES_DIR.exists():
        return out
    for d in sorted(TEMPLATES_DIR.iterdir()):
        if not d.is_dir():
            continue
        cfg_p = d / "config.json"
        if not cfg_p.exists():
            continue
        try:
            c = json.loads(cfg_p.read_text("utf-8"))
            out.append({
                "id":          c["id"],
                "name":        c["name"],
                "created_at":  c.get("created_at", ""),
                "updated_at":  c.get("updated_at", ""),
                "thumbnail":   f"/data/card_templates/{c['id']}/thumb.png",
                "field_count": len(c.get("zones", [])),
                "favorite":    c.get("favorite", False),
                "has_back":   c.get("has_back", False),
                "img_w":       c.get("img_w", 0),
                "img_h":       c.get("img_h", 0),
            })
        except Exception:
            continue
    return out


def get(tid: str) -> Optional[dict]:
    p = tpl_cfg(tid)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:
        return None


def _save_cfg(cfg: dict) -> dict:
    cfg["updated_at"] = _now()
    tpl_cfg(cfg["id"]).write_text(
        json.dumps(cfg, indent=2, ensure_ascii=False), "utf-8"
    )
    return cfg


def create(name: str, image_path: Path, img_w: int, img_h: int) -> dict:
    """
    Crée un nouveau template en déplaçant l'image dans son dossier dédié.
    Je génère un ID unique court pour que les URLs restent lisibles.
    """
    tid = gen_id()
    d   = tpl_dir(tid)
    d.mkdir(parents=True, exist_ok=True)

    shutil.copy2(image_path, d / "template.png")

    cfg = {
        "id":         tid,
        "name":       sanitize(name),
        "created_at": _now(),
        "updated_at": _now(),
        "zones":      [],          # Les zones/champs de la carte
        "img_w":      img_w,
        "img_h":      img_h,
        "settings":   {
            "snap":      True,
            "grid":      10,
            "font_path": "",       # Vide = police système par défaut
        },
        "favorite":   False,
    }
    return _save_cfg(cfg)


def update(tid: str, cfg: dict) -> Optional[dict]:
    if get(tid) is None:
        return None
    cfg["id"] = tid          # Empêcher l'écrasement de l'ID
    return _save_cfg(cfg)


def rename(tid: str, new_name: str) -> Optional[dict]:
    cfg = get(tid)
    if cfg is None:
        return None
    cfg["name"] = sanitize(new_name)
    return _save_cfg(cfg)


def duplicate(tid: str) -> Optional[dict]:
    """Je copie le dossier entier puis je mets à jour l'ID et le nom pour éviter les collisions."""
    cfg = get(tid)
    if cfg is None:
        return None
    new_id  = gen_id()
    new_dir = tpl_dir(new_id)
    shutil.copytree(tpl_dir(tid), new_dir)

    new_cfg                = json.loads((new_dir / "config.json").read_text("utf-8"))
    new_cfg["id"]          = new_id
    new_cfg["name"]        = new_cfg["name"] + "_copy"
    new_cfg["created_at"]  = _now()
    new_cfg["updated_at"]  = _now()
    (new_dir / "config.json").write_text(json.dumps(new_cfg, indent=2), "utf-8")
    return new_cfg


def delete(tid: str) -> bool:
    d = tpl_dir(tid)
    if d.exists():
        shutil.rmtree(d)
        return True
    return False


def toggle_fav(tid: str) -> Optional[dict]:
    cfg = get(tid)
    if cfg is None:
        return None
    cfg["favorite"] = not cfg.get("favorite", False)
    return _save_cfg(cfg)
