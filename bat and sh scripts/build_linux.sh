#!/usr/bin/env bash
# CardCrafter — Build Linux/Pi
# Résultat : dist/CardCrafter.dist/CardCrafter
set -e; cd "$(dirname "$0")"

echo && echo "  ⚔ CardCrafter — Build Linux/Pi"
echo "  Python : $(python3 --version)"

python3 -m nuitka --version &>/dev/null || pip install nuitka --break-system-packages
echo "  Nuitka : $(python3 -m nuitka --version 2>/dev/null | head -1)"

pip install -r requirements.txt --break-system-packages -q
rm -rf dist/launcher.dist dist/launcher.build dist/CardCrafter.dist
mkdir -p dist

echo && echo "  Compilation (2-8 min)…" && echo

python3 -m nuitka \
    --standalone \
    --output-dir=dist \
    --output-filename=CardCrafter \
    \
    --include-package=app \
    --include-package=uvicorn \
    --include-package=fastapi \
    --include-package=starlette \
    --include-package=jinja2 \
    --include-package=anyio \
    --include-package=aiofiles \
    --include-package=multipart \
    --include-package=h11 \
    --include-package=httptools \
    --include-package=click \
    --include-package=sniffio \
    --include-package=unittest \
    \
    --include-package=PIL \
    --include-package=cv2 \
    --include-package=pypdfium2 \
    --include-package=fpdf \
    --include-package=numpy \
    \
    --include-data-dir=html=html \
    --include-data-dir=static=static \
    --include-data-dir=assets=assets \
    \
    --nofollow-import-to=tkinter \
    --nofollow-import-to=matplotlib \
    --nofollow-import-to=scipy \
    --nofollow-import-to=pandas \
    --nofollow-import-to=IPython \
    --nofollow-import-to=pytest \
    \
    launcher.py

# Renommer launcher.dist → CardCrafter.dist
mv dist/launcher.dist dist/CardCrafter.dist
chmod +x dist/CardCrafter.dist/CardCrafter

mkdir -p dist/CardCrafter.dist/data/{card_templates,generated,tmp}

cat > dist/CardCrafter.dist/lancer.sh << 'EOF'
#!/usr/bin/env bash
cd "$(dirname "$0")" && ./CardCrafter
EOF
chmod +x dist/CardCrafter.dist/lancer.sh

echo && echo "  ✓ dist/CardCrafter.dist/CardCrafter"
echo "  Double-clic ou : cd dist/CardCrafter.dist && ./CardCrafter"
