"""
Traitement image : PDF→PNG via pypdfium2, thumbnails, détection couleur OpenCV.
"""
import cv2, numpy as np, pypdfium2 as pdfium, shutil
from pathlib import Path
from PIL import Image
from typing import Optional, Tuple, List
from app.utils.file_utils import THUMB_W, THUMB_H, TMP_DIR, gen_id


# ── PDF ────────────────────────────────────────────────────────────

def pdf_page_count(pdf_path: Path) -> int:
    try:
        doc = pdfium.PdfDocument(str(pdf_path))
        n   = len(doc); doc.close(); return n
    except Exception: return 0


def pdf_page_to_png(pdf_path: Path, page_index: int = 0, dpi: int = 200) -> Optional[Path]:
    """Convertit une page PDF en PNG — je fixe 200dpi pour un rendu net sans saturer la RAM."""
    try:
        doc = pdfium.PdfDocument(str(pdf_path))
        if page_index >= len(doc): page_index = 0
        bm  = doc[page_index].render(scale=dpi/72.0, rotation=0)
        img = bm.to_pil()
        out = pdf_path.with_name(pdf_path.stem + f"_p{page_index}.png")
        img.save(str(out), "PNG")
        doc.close()
        return out
    except Exception as e:
        print(f"[image_service] pdf_page_to_png: {e}"); return None


def pdf_extract_all_pages(pdf_path: Path, session_id: str,
                          thumb_dpi: int = 96, full_dpi: int = 200) -> List[dict]:
    """
    Extrait toutes les pages d'un PDF en thumbnail + full PNG.
    Je stocke dans data/tmp/{session_id}/ pour les servir via /data/tmp/.
    Retourne [{index, thumb_url, full_url, w, h}, ...].
    """
    sess_dir = TMP_DIR / session_id
    sess_dir.mkdir(parents=True, exist_ok=True)
    pages = []
    try:
        doc   = pdfium.PdfDocument(str(pdf_path))
        count = len(doc)
        for i, page in enumerate(doc):
            # Full res
            full_bm  = page.render(scale=full_dpi/72.0, rotation=0)
            full_img = full_bm.to_pil()
            w, h     = full_img.size
            full_p   = sess_dir / f"page_{i:02d}_full.png"
            full_img.save(str(full_p), "PNG")
            # Thumbnail
            thumb = full_img.copy()
            thumb.thumbnail((THUMB_W, THUMB_H), Image.LANCZOS)
            thumb_p = sess_dir / f"page_{i:02d}_thumb.png"
            thumb.save(str(thumb_p), "PNG")
            pages.append({
                "index":     i,
                "thumb_url": f"/data/tmp/{session_id}/page_{i:02d}_thumb.png",
                "full_url":  f"/data/tmp/{session_id}/page_{i:02d}_full.png",
                "w": w, "h": h,
                "label":     f"Page {i+1}/{count}",
            })
        doc.close()
    except Exception as e:
        print(f"[image_service] pdf_extract_all: {e}")
    return pages


def cleanup_tmp_session(session_id: str):
    """Nettoie le dossier temporaire après création du template."""
    d = TMP_DIR / session_id
    if d.exists():
        shutil.rmtree(d, ignore_errors=True)


# ── Thumbnails ─────────────────────────────────────────────────────

def make_thumbnail(src: Path, dst: Path) -> bool:
    """Je limite la taille ici pour éviter de saturer la RAM dans la galerie."""
    try:
        with Image.open(src) as img:
            img = img.convert("RGB")
            img.thumbnail((THUMB_W, THUMB_H), Image.LANCZOS)
            img.save(dst, "PNG", optimize=True)
        return True
    except Exception as e:
        print(f"[image_service] thumbnail: {e}"); return False


def image_size(src: Path) -> Tuple[int, int]:
    try:
        with Image.open(src) as img: return img.size
    except Exception: return (0, 0)


# ── Détection zone couleur (OpenCV HSV + flood fill) ───────────────

def detect_zone(img_path: str, px: int, py: int, tolerance: int = 30) -> Optional[dict]:
    """
    Détecte la région connexe à la couleur cliquée.
    Je garde cette logique séparée pour éviter les recalculs inutiles.
    """
    img_bgr = cv2.imread(img_path)
    if img_bgr is None: return None
    H, W = img_bgr.shape[:2]
    px, py = max(0,min(px,W-1)), max(0,min(py,H-1))

    img_hsv = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2HSV)
    t       = img_hsv[py, px].astype(np.int32)
    ht, svt = min(tolerance,90), min(tolerance*2,80)
    lo = np.array([max(0,t[0]-ht),  max(0,t[1]-svt),  max(0,t[2]-svt)])
    hi = np.array([min(180,t[0]+ht),min(255,t[1]+svt),min(255,t[2]+svt)])
    mask = cv2.inRange(img_hsv, lo, hi)

    if mask[py, px] == 0:
        s = 50
        return {"x":max(0,px-s//2),"y":max(0,py-s//2),"width":s,"height":s,"detected":False}

    flood   = mask.copy()
    ff_mask = np.zeros((H+2,W+2), np.uint8)
    cv2.floodFill(flood, ff_mask, (px,py), 128, loDiff=0, upDiff=0)
    filled  = (flood==128).astype(np.uint8)
    k       = cv2.getStructuringElement(cv2.MORPH_RECT,(5,5))
    filled  = cv2.morphologyEx(filled, cv2.MORPH_CLOSE, k)
    coords  = cv2.findNonZero(filled)
    if coords is None: return None

    x,y,w,h = cv2.boundingRect(coords)
    if w<10 or h<10: return None
    return {"x":int(x),"y":int(y),"width":int(w),"height":int(h),
            "center_x":int(x+w//2),"center_y":int(y+h//2),
            "aspect_ratio":round(w/h,3) if h else 1.0,"detected":True}
