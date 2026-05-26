"""Routes éditeur : détection de zones par couleur."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.services import image_service as ims
from app.utils.file_utils import tpl_img

router = APIRouter()


class DetectReq(BaseModel):
    x: int
    y: int
    tolerance: int = 30


@router.post("/{tid}/detect")
async def detect_zone(tid: str, req: DetectReq):
    """
    Détecte une zone à partir d'un clic.
    Les coordonnées reçues sont dans l'espace de l'image originale (pas l'écran).
    """
    img_path = tpl_img(tid)
    if not img_path.exists():
        raise HTTPException(404, "Image template not found")

    result = ims.detect_zone(str(img_path), req.x, req.y, req.tolerance)
    if not result:
        raise HTTPException(422, "Aucune zone détectée à ce point")
    return result
