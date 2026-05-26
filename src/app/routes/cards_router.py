"""Routes génération + export."""
import json, tempfile
from pathlib import Path
from typing import List
from fastapi import APIRouter, Form, File, UploadFile, HTTPException
from fastapi.responses import FileResponse
from app.services import template_service as ts, card_service as cs
from app.utils.file_utils import GENERATED_DIR, ALLOWED_MIME, MAX_UPLOAD_BYTES, tpl_img, tpl_img_back, gen_id

router = APIRouter()


@router.post("/generate")
async def generate_card(
    template_id: str              = Form(...),
    field_data:  str              = Form("{}"),
    side:        str              = Form("front"),
    zones_override: str           = Form(""),   # JSON zones modifiées côté client
    files:       List[UploadFile] = File([]),
):
    cfg = ts.get(template_id)
    if not cfg: raise HTTPException(404)

    try: data = json.loads(field_data)
    except Exception: raise HTTPException(400, "field_data invalide")

    tmp_imgs, tmp_files = {}, []
    try:
        for f in files:
            if f.content_type not in ALLOWED_MIME: continue
            content = await f.read()
            if len(content) > MAX_UPLOAD_BYTES: continue
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".png")
            tmp.write(content); tmp.close()
            tmp_p = Path(tmp.name); tmp_files.append(tmp_p)
            tmp_imgs[Path(f.filename).stem if f.filename else f"img_{len(tmp_imgs)}"] = tmp_p

        # Verso : rendu propre sans aucune zone (juste l'image de fond)
        if side == "back":
            img_path = tpl_img_back(template_id)
            if not img_path.exists():
                img_path = tpl_img(template_id)
            card_img = cs.render_card(img_path, [], {}, {})
        else:
            img_path = tpl_img(template_id)
            # Zones : utiliser les overrides locaux si fournis (éditeur post-génération)
            if zones_override:
                try:   zones = json.loads(zones_override)
                except: zones = cfg.get("zones", [])
            else:
                zones = cfg.get("zones", [])
            card_img = cs.render_card(img_path, zones, data, tmp_imgs)

        card_id = cs.save_card(card_img)
        return {"card_id": card_id, "url": f"/data/generated/{card_id}/card.png"}

    finally:
        for p in tmp_files:
            try: p.unlink()
            except: pass


@router.get("/{card_id}/png")
async def download_png(card_id: str):
    p = GENERATED_DIR / card_id / "card.png"
    if not p.exists(): raise HTTPException(404)
    return FileResponse(str(p), media_type="image/png",
        filename=f"card_{card_id}.png",
        headers={"Content-Disposition": f'attachment; filename="card_{card_id}.png"'})


@router.post("/export-pdf")
async def export_pdf(payload: dict):
    ids   = payload.get("card_ids", [])
    paths = [GENERATED_DIR/cid/"card.png" for cid in ids
             if (GENERATED_DIR/cid/"card.png").exists()]
    if not paths: raise HTTPException(404, "Aucune carte trouvée")

    out_id = gen_id()
    (GENERATED_DIR/out_id).mkdir(parents=True, exist_ok=True)
    out_pdf = GENERATED_DIR/out_id/"cards.pdf"

    ok = cs.export_pdf_cards(paths, out_pdf,
        cards_per_row = payload.get("cards_per_row", 3),
        margin_mm     = payload.get("margin_mm",     10.0),
        card_w_mm     = payload.get("card_w_mm",     63.5),
        card_h_mm     = payload.get("card_h_mm",     88.9),
        gap_mm        = payload.get("gap_mm",         3.0))
    if not ok: raise HTTPException(500, "Échec export PDF")
    return {"pdf_id": out_id, "url": f"/api/cards/pdf/{out_id}"}


@router.get("/pdf/{pdf_id}")
async def download_pdf(pdf_id: str):
    p = GENERATED_DIR/pdf_id/"cards.pdf"
    if not p.exists(): raise HTTPException(404)
    return FileResponse(str(p), media_type="application/pdf",
        filename=f"cards_{pdf_id}.pdf",
        headers={"Content-Disposition": f'attachment; filename="cards_{pdf_id}.pdf"'})
