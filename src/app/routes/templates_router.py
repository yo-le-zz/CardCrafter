"""Routes CRUD templates + upload PDF avec sélection recto/verso."""
import tempfile, json, shutil
from pathlib import Path
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from app.services import template_service as ts, image_service as ims
from app.utils.file_utils import MAX_UPLOAD_BYTES, ALLOWED_MIME, tpl_img, tpl_thumb, TMP_DIR, gen_id
from PIL import Image

router = APIRouter()


@router.get("/")
async def list_templates():
    return ts.list_all()


@router.get("/{tid}")
async def get_template(tid: str):
    cfg = ts.get(tid)
    if not cfg: raise HTTPException(404, "Template introuvable")
    return cfg


# ── PDF : extraction pages pour picker recto/verso ─────────────────

@router.post("/pdf-extract")
async def pdf_extract(file: UploadFile = File(...)):
    """
    Upload temporaire d'un PDF → extrait toutes les pages en thumbnails.
    Retourne session_id + liste des pages pour que l'UI affiche le picker recto/verso.
    Je garde les fichiers dans data/tmp/ le temps que l'utilisateur choisisse ses pages.
    """
    if file.content_type not in ("application/pdf",):
        raise HTTPException(400, "PDF uniquement")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Fichier trop volumineux")

    session_id = gen_id()
    sess_dir   = TMP_DIR / session_id
    sess_dir.mkdir(parents=True, exist_ok=True)

    pdf_path = sess_dir / "source.pdf"
    pdf_path.write_bytes(data)

    pages = ims.pdf_extract_all_pages(pdf_path, session_id)
    return {"session_id": session_id, "pages": pages, "count": len(pages)}


# ── Upload template (image ou PDF avec pages choisies) ────────────

@router.post("/upload")
async def upload_template(
    background_tasks: BackgroundTasks,
    name:        str        = Form(...),
    file:        UploadFile = File(...),
    # PDF via picker : session déjà chargée
    session_id:  str        = Form(""),
    front_page:  int        = Form(0),
    back_page:   int        = Form(-1),   # -1 = pas de verso
    # Upload direct image/PDF sans picker
    page:        int        = Form(0),
):
    if file.content_type not in ALLOWED_MIME:
        raise HTTPException(400, f"Type non supporté : {file.content_type}")
    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, "Fichier trop volumineux (max 100 MB)")

    suffix   = Path(file.filename or "f").suffix.lower() or ".bin"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(data); tmp_path = Path(tmp.name)

    norm_path = None
    try:
        is_pdf = file.content_type == "application/pdf" or suffix == ".pdf"

        if is_pdf and session_id:
            # Picker recto/verso — les pages sont déjà extraites dans TMP_DIR
            front_src = TMP_DIR / session_id / f"page_{front_page:02d}_full.png"
            if not front_src.exists():
                # Fallback : extraire directement
                front_src2 = ims.pdf_page_to_png(tmp_path, front_page, dpi=200)
                if not front_src2: raise HTTPException(500, "Conversion PDF échouée")
                front_src = front_src2
            work_path = front_src
        elif is_pdf:
            p = ims.pdf_page_to_png(tmp_path, page, dpi=200)
            if not p: raise HTTPException(500, "Conversion PDF échouée")
            work_path = p
        else:
            work_path = tmp_path

        # Normaliser
        with Image.open(work_path) as img:
            img = img.convert("RGBA")
            if max(img.size) > 3000: img.thumbnail((3000,3000), Image.LANCZOS)
            w, h   = img.size
            norm_path = tmp_path.with_name(tmp_path.stem + "_norm.png")
            img.save(str(norm_path), "PNG")

        cfg = ts.create(name, norm_path, w, h)
        tid = cfg["id"]
        ims.make_thumbnail(tpl_img(tid), tpl_thumb(tid))

        # Verso si sélectionné
        has_back = is_pdf and session_id and back_page >= 0
        if has_back:
            back_src = TMP_DIR / session_id / f"page_{back_page:02d}_full.png"
            if back_src.exists():
                from app.utils.file_utils import tpl_img_back
                with Image.open(back_src) as bimg:
                    bimg = bimg.convert("RGBA")
                    if max(bimg.size) > 3000: bimg.thumbnail((3000,3000), Image.LANCZOS)
                    bimg.save(str(tpl_img_back(tid)), "PNG")
                cfg["has_back"] = True
                ts.update(tid, cfg)

        # Nettoyer le tmp après réponse
        if session_id:
            background_tasks.add_task(ims.cleanup_tmp_session, session_id)

        return cfg

    finally:
        for p in [tmp_path, norm_path]:
            if p and p.exists():
                try: p.unlink(missing_ok=True)
                except: pass


@router.delete("/{tid}")
async def delete_template(tid: str):
    if not ts.delete(tid): raise HTTPException(404)
    return {"ok": True}


@router.put("/{tid}/rename")
async def rename_template(tid: str, name: str = Form(...)):
    cfg = ts.rename(tid, name)
    if not cfg: raise HTTPException(404)
    return cfg


@router.post("/{tid}/duplicate")
async def duplicate_template(tid: str):
    cfg = ts.duplicate(tid)
    if not cfg: raise HTTPException(404)
    return cfg


@router.post("/{tid}/favorite")
async def toggle_fav(tid: str):
    cfg = ts.toggle_fav(tid)
    if not cfg: raise HTTPException(404)
    return cfg


@router.put("/{tid}/zones")
async def save_zones(tid: str, payload: dict):
    cfg = ts.get(tid)
    if not cfg: raise HTTPException(404)
    cfg["zones"] = payload.get("zones", [])
    if "card_w_mm" in payload: cfg["card_w_mm"] = payload["card_w_mm"]
    if "card_h_mm" in payload: cfg["card_h_mm"] = payload["card_h_mm"]
    return ts.update(tid, cfg)


@router.get("/{tid}/image")
async def get_template_image(tid: str):
    p = tpl_img(tid)
    if not p.exists(): raise HTTPException(404)
    return FileResponse(str(p), media_type="image/png")


@router.get("/{tid}/image-back")
async def get_template_image_back(tid: str):
    from app.utils.file_utils import tpl_img_back
    p = tpl_img_back(tid)
    if not p.exists(): raise HTTPException(404)
    return FileResponse(str(p), media_type="image/png")
