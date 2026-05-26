# ⚔ CardCrafter v1.0

Créateur de templates de cartes RPG/Fantasy.
**Import image ou PDF → zones nommées → remplissage → export PDF A4.**

---

## Lancement rapide (sans compilation)

```bash
# Linux / Raspberry Pi
bash run.sh             # prod (ouvre le navigateur)
bash run_dev.sh         # dev  (hot-reload)

# Windows
double-clic run.bat
```

---

## Installation des dépendances

```bash
pip install -r requirements.txt --break-system-packages
```

---

## Compilation Nuitka (exécutable autonome)

### Linux / Raspberry Pi

```bash
pip install nuitka --break-system-packages
bash build_linux.sh
# → dist/cardcrafter.dist/CardCrafter
```

**Double-clic** sur `CardCrafter` ou :
```bash
cd dist/cardcrafter.dist && ./CardCrafter
```

### Windows

```batch
pip install nuitka
build_windows.bat
REM → dist\cardcrafter.dist\CardCrafter.exe
```

**Double-clic** sur `CardCrafter.exe` — le navigateur s'ouvre automatiquement.

---

## Distribution

Copier **tout le dossier** `dist/cardcrafter.dist/` — il est autonome.
Le sous-dossier `data/` (templates + cartes générées) se crée automatiquement.

```
cardcrafter.dist/
├── CardCrafter(.exe)   ← double-clic
├── app/
├── html/
├── static/
├── data/               ← créé au premier lancement
│   ├── card_templates/
│   └── generated/
└── … (libs Python)
```

---

## Workflow

| Étape | Action |
|-------|--------|
| 1 | **Galerie** → importer image (PNG/JPG) ou PDF (choix de page) |
| 2 | **Éditeur** → `D` dessiner une zone • `C` détecter par couleur |
| 3 | Nommer la zone (ex: `titre`, `description`) + type Texte/Image |
| 4 | **Générateur** → remplir le formulaire → Prévisualiser |
| 5 | Ajouter au batch → **Export PDF** (N cartes/ligne, guides découpe) |

## Raccourcis éditeur

| Touche | Action |
|--------|--------|
| `V` | Sélection |
| `D` | Dessiner zone |
| `C` | Détecter couleur |
| `G` | Grille |
| `Ctrl+Z/Y` | Undo/Redo |
| `Ctrl+S` | Sauvegarder |
| `Suppr` | Supprimer zone |
| Scroll | Zoom |
| Alt+Clic | Pan |

---

## Stack

- **Backend** : FastAPI · Pillow · OpenCV · PyMuPDF · fpdf2
- **Frontend** : HTML5 Canvas · CSS3 · Vanilla JS (0 framework)
- **Build** : Nuitka standalone

## Auteur

yolezz · [@yo-le-zz](https://github.com/yo-le-zz)
