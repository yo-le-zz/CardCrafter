"""
Rendu Pillow — Arial/Liberation par défaut, police par zone, texte multi-ligne.
"""
import os, textwrap, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from app.utils.file_utils import GENERATED_DIR, gen_id, FONT_BOLD, FONT_REGULAR, FONTS_DIR

# ── Ordre de recherche polices par défaut ─────────────────────────
_FONTS_BOLD = [
    str(FONT_BOLD),                                                    # bundlé
    "C:/Windows/Fonts/arialbd.ttf",                                    # Windows
    "/usr/share/fonts/truetype/msttcorefonts/Arial_Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]
_FONTS_REG = [
    str(FONT_REGULAR),
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/msttcorefonts/Arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/Library/Fonts/Arial.ttf",
]

_font_cache: dict = {}

def _font(size: int, bold: bool = False,
          font_path: str = "") -> ImageFont.FreeTypeFont:
    """
    Charge une police avec mise en cache.
    Priorité : font_path explicite → bold/regular bundlé → fallback bitmap.
    Je garde cette logique séparée pour éviter les recalculs inutiles.
    """
    key = (size, bold, font_path)
    if key in _font_cache:
        return _font_cache[key]

    pool = []
    if font_path:
        pool = [font_path]
    else:
        pool = _FONTS_BOLD if bold else _FONTS_REG

    for p in pool:
        if p and os.path.exists(p):
            try:
                fnt = ImageFont.truetype(p, size)
                _font_cache[key] = fnt
                return fnt
            except Exception:
                pass

    fnt = ImageFont.load_default()
    _font_cache[key] = fnt
    return fnt


def list_available_fonts() -> list:
    """
    Liste toutes les polices du dossier assets/fonts/ + polices système courantes.
    Je scanne seulement les dossiers connus pour rester rapide.
    """
    seen, fonts = set(), []

    def add(path: str, label: str, category: str = "Sans-Serif"):
        if os.path.exists(path) and path not in seen:
            seen.add(path)
            fonts.append({"name": label, "path": path, "category": category})

    # 1. Polices bundlées dans assets/fonts/ (toujours disponibles)
    if FONTS_DIR.exists():
        for f in sorted(FONTS_DIR.glob("*.ttf")) + sorted(FONTS_DIR.glob("*.otf")):
            label = f.stem.replace("-", " ").replace("_", " ")
            cat   = ("Serif" if "Serif" in f.stem else
                     "Mono"  if "Mono"  in f.stem or "mono" in f.stem.lower() else
                     "Sans-Serif")
            add(str(f), label, cat)

    # 2. Polices Windows courantes
    win = Path("C:/Windows/Fonts")
    if win.exists():
        win_fonts = {
            "Arial":           ("arial.ttf",      "Sans-Serif"),
            "Arial Bold":      ("arialbd.ttf",    "Sans-Serif"),
            "Arial Italic":    ("ariali.ttf",     "Sans-Serif"),
            "Calibri":         ("calibri.ttf",    "Sans-Serif"),
            "Calibri Bold":    ("calibrib.ttf",   "Sans-Serif"),
            "Georgia":         ("georgia.ttf",    "Serif"),
            "Georgia Bold":    ("georgiab.ttf",   "Serif"),
            "Impact":          ("impact.ttf",     "Display"),
            "Times New Roman": ("times.ttf",      "Serif"),
            "TNR Bold":        ("timesbd.ttf",    "Serif"),
            "Verdana":         ("verdana.ttf",    "Sans-Serif"),
            "Verdana Bold":    ("verdanab.ttf",   "Sans-Serif"),
            "Courier New":     ("cour.ttf",       "Mono"),
            "Comic Sans MS":   ("comic.ttf",      "Display"),
            "Trebuchet MS":    ("trebuc.ttf",     "Sans-Serif"),
        }
        for label, (fname, cat) in win_fonts.items():
            add(str(win / fname), label, cat)

    return sorted(fonts, key=lambda x: (x["category"], x["name"]))


# ── Texte multi-ligne ─────────────────────────────────────────────

def _split_text(text: str, chars_per_line: int) -> list:
    """
    Découpe le texte en respectant :
    1. Les sauts de ligne explicites (\\n) → liste, éléments séparés
    2. Le word-wrap automatique pour chaque segment
    3. Les puces (-, •, *, >) conservées en début de ligne
    """
    result  = []
    raw_lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    for raw in raw_lines:
        stripped = raw.strip()

        if not stripped:
            result.append('')          # ligne vide = espace entre blocs
            continue

        # Détecter une puce
        bullet = ''
        body   = stripped
        for marker in ('• ', '- ', '* ', '> ', '– ', '— '):
            if stripped.startswith(marker):
                bullet = marker
                body   = stripped[len(marker):]
                break
        # Raccourci : tiret seul en début
        if not bullet and stripped.startswith('-') and len(stripped) > 1 and stripped[1] == ' ':
            bullet = '- '
            body   = stripped[2:]

        # Word-wrap du corps
        indent_chars = len(bullet)
        wrap_w = max(1, chars_per_line - indent_chars)
        wrapped = textwrap.wrap(body, width=wrap_w) if body else ['']

        for i, seg in enumerate(wrapped):
            prefix = bullet if i == 0 else ' ' * indent_chars
            result.append(prefix + seg)

    return result or ['']


def _auto_fit(draw, text: str, bw: int, bh: int, style: dict) -> tuple:
    """
    Cherche la taille de police maximale permettant au texte de tenir dans la zone.
    Je descends par pas de 1pt jusqu'à ce que tout tienne.
    """
    max_sz    = style.get("font_size", 24)
    bold      = style.get("bold", False)
    font_path = style.get("font_path", "")
    line_gap  = style.get("line_gap", 4)

    for sz in range(max_sz, 5, -1):
        fnt      = _font(sz, bold, font_path)
        avg_cw   = sz * 0.58
        cpl      = max(1, int(bw / avg_cw))
        lines    = _split_text(text, cpl)
        total_h  = len(lines) * (sz + line_gap)
        if total_h <= bh:
            return fnt, lines, sz

    fnt = _font(5, bold, font_path)
    return fnt, _split_text(text, max(1, bw // 4)), 5


def _text_w(draw, text: str, font) -> int:
    try:
        bb = draw.textbbox((0, 0), text, font=font)
        return bb[2] - bb[0]
    except AttributeError:
        return draw.textsize(text, font=font)[0]


def _draw_text_zone(draw: ImageDraw.Draw, text: str,
                    zone: dict, card: Image.Image = None) -> None:
    x, y, w, h = zone["x"], zone["y"], zone["width"], zone["height"]
    style       = zone.get("style", {})
    ztype       = zone.get("type", "text")

    # text_cover : effacer le texte original avec une couleur de fond
    if ztype == "text_cover":
        fill_c = style.get("cover_color", "#FFFFFF")
        if fill_c == "auto" and card is not None:
            try:
                px = card.getpixel((x + 2, y + 2))
                fill_c = "#{:02X}{:02X}{:02X}".format(*px[:3])
            except Exception:
                fill_c = "#FFFFFF"
        draw.rectangle([x, y, x + w, y + h], fill=fill_c)

    color     = style.get("color",      "#000000")
    align     = style.get("align",      "left")
    line_gap  = style.get("line_gap",   4)
    # Contour uniquement si explicitement activé (évite le bug "blob noir")
    do_outline = style.get("outline", False)
    ow         = int(style.get("outline_width", 1)) if do_outline else 0
    oc         = style.get("outline_color", "#000000")
    do_shadow  = style.get("shadow", False)
    font_path  = style.get("font_path", "")

    if style.get("auto_fit", True):
        fnt, lines, sz = _auto_fit(draw, text, w, h, style)
    else:
        sz       = style.get("font_size", 20)
        fnt      = _font(sz, style.get("bold", False), font_path)
        avg_cw   = sz * 0.58
        cpl      = max(1, int(w / avg_cw))
        lines    = _split_text(text, cpl)

    lh      = sz + line_gap
    total_h = len(lines) * lh
    va      = style.get("valign", "top")

    if va == "center":
        start_y = y + max(0, (h - total_h) // 2)
    elif va == "bottom":
        start_y = y + max(0, h - total_h)
    else:
        start_y = y

    for i, line in enumerate(lines):
        if not line:           # ligne vide → espace (passe)
            continue
        tw  = _text_w(draw, line, fnt)
        if align == "center":
            lx = x + (w - tw) // 2
        elif align == "right":
            lx = x + w - tw
        else:
            lx = x
        ly = start_y + i * lh

        if do_shadow:
            draw.text((lx + 2, ly + 2), line, font=fnt, fill="#00000088")
        if ow:
            for dx in range(-ow, ow + 1):
                for dy in range(-ow, ow + 1):
                    if dx or dy:
                        draw.text((lx + dx, ly + dy), line, font=fnt, fill=oc)
        draw.text((lx, ly), line, font=fnt, fill=color)


def render_card(template_path: Path, zones: list,
                field_data: dict, uploaded_images: dict) -> Image.Image:
    """Composite final : template + zones triées par layer."""
    card = Image.open(template_path).convert("RGBA")
    draw = ImageDraw.Draw(card)

    for zone in sorted(zones, key=lambda z: z.get("layer", 0)):
        if not zone.get("visible", True):
            continue
        name  = zone["name"]
        ztype = zone["type"]
        value = field_data.get(name, zone.get("default", ""))
        x, y, w, h = zone["x"], zone["y"], zone["width"], zone["height"]

        if ztype == "image":
            img_path = uploaded_images.get(name)
            if img_path and Path(img_path).exists():
                try:
                    img = Image.open(img_path).convert("RGBA")
                    # Redimensionnement intelligent : conserver le ratio (contain)
                    img.thumbnail((w, h), Image.LANCZOS)
                    # Centrer dans la zone
                    px = x + (w - img.width)  // 2
                    py = y + (h - img.height) // 2
                    card.paste(img, (px, py), img)
                except Exception as e:
                    print(f"[card] image '{name}': {e}")

        elif ztype in ("text", "text_cover") and value:
            _draw_text_zone(draw, str(value), zone, card)

    return card


def save_card(img: Image.Image, card_id: str = None) -> str:
    if not card_id:
        card_id = gen_id()
    d = GENERATED_DIR / card_id
    d.mkdir(parents=True, exist_ok=True)
    img.save(d / "card.png", "PNG")
    return card_id


def export_pdf_cards(card_paths: list, output_path: Path,
                     cards_per_row=3, margin_mm=10.0,
                     card_w_mm=63.5, card_h_mm=88.9, gap_mm=3.0) -> bool:
    try:
        from fpdf import FPDF
        PW, PH = 210.0, 297.0
        iw, ih  = PW - 2 * margin_mm, PH - 2 * margin_mm
        cpr     = min(cards_per_row, max(1, int(iw / (card_w_mm + gap_mm))))
        cpc     = max(1, int(ih / (card_h_mm + gap_mm)))
        cpp     = cpr * cpc
        pdf     = FPDF(orientation="P", unit="mm", format="A4")
        pdf.set_auto_page_break(False)
        tmps    = []

        for i, cp in enumerate(card_paths):
            if i % cpp == 0:
                pdf.add_page()
            row = (i % cpp) // cpr
            col = (i % cpp) % cpr
            xx  = margin_mm + col * (card_w_mm + gap_mm)
            yy  = margin_mm + row * (card_h_mm + gap_mm)
            tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
            tmps.append(tmp.name)
            with Image.open(cp) as im:
                im.convert("RGB").save(tmp.name, "JPEG", quality=92)
            tmp.close()
            pdf.image(tmp.name, x=xx, y=yy, w=card_w_mm, h=card_h_mm)
            pdf.set_draw_color(160, 160, 160)
            pdf.set_line_width(0.15)
            pdf.rect(xx, yy, card_w_mm, card_h_mm)

        pdf.output(str(output_path))
        for t in tmps:
            try: os.unlink(t)
            except: pass
        return True
    except Exception as e:
        print(f"[card] PDF error: {e}"); return False
