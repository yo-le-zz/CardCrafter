@echo off
:: ════════════════════════════════════════════════════════════════
::  CardCrafter — Build Nuitka Windows
::  Résultat : dist\launcher.dist\CardCrafter.exe
::  (renommé en CardCrafter.dist après compilation)
:: ════════════════════════════════════════════════════════════════
setlocal enabledelayedexpansion
title CardCrafter — Build Windows

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   CardCrafter  -  Build Windows      ║
echo  ╚══════════════════════════════════════╝
echo.
python --version

python -m nuitka --version >nul 2>&1
if errorlevel 1 ( echo Nuitka absent. Installation... & pip install nuitka )
echo Nuitka : && python -m nuitka --version 2>&1 | findstr /v "^$"

echo.
echo Dependances...
pip install -r requirements.txt -q
if errorlevel 1 ( echo ERREUR pip & pause & exit /b 1 )

:: Nettoyage
if exist "dist\launcher.dist"      rmdir /s /q "dist\launcher.dist"
if exist "dist\launcher.build"     rmdir /s /q "dist\launcher.build"
if exist "dist\CardCrafter.dist"   rmdir /s /q "dist\CardCrafter.dist"
if not exist dist mkdir dist

echo.
echo Compilation Nuitka (2-8 min)...
echo.

python -m nuitka ^
    --standalone ^
    --windows-console-mode=force ^
    --output-dir=dist ^
    --output-filename=CardCrafter ^
    --windows-icon-from-ico=assets\icon.ico ^
    ^
    --include-package=app ^
    ^
    --include-package=uvicorn ^
    --include-package=fastapi ^
    --include-package=starlette ^
    --include-package=jinja2 ^
    --include-package=anyio ^
    --include-package=aiofiles ^
    --include-package=multipart ^
    --include-package=h11 ^
    --include-package=httptools ^
    --include-package=click ^
    --include-package=sniffio ^
    --include-package=unittest ^
    ^
    --include-package=PIL ^
    --include-package=cv2 ^
    --include-package=pypdfium2 ^
    --include-package=fpdf ^
    --include-package=numpy ^
    ^
    --include-data-dir=html=html ^
    --include-data-dir=static=static ^
    --include-data-dir=assets=assets ^
    ^
    --nofollow-import-to=tkinter ^
    --nofollow-import-to=matplotlib ^
    --nofollow-import-to=scipy ^
    --nofollow-import-to=pandas ^
    --nofollow-import-to=IPython ^
    --nofollow-import-to=pytest ^
    ^
    launcher.py

if errorlevel 1 (
    echo. & echo ERREUR Nuitka. Voir nuitka-crash-report.xml
    pause & exit /b 1
)

:: Renommer launcher.dist → CardCrafter.dist
if exist "dist\CardCrafter.dist" rmdir /s /q "dist\CardCrafter.dist"
rename "dist\launcher.dist" "CardCrafter.dist"

:: Dossiers data + lancer.bat de secours
if not exist "dist\CardCrafter.dist\data\card_templates" mkdir "dist\CardCrafter.dist\data\card_templates"
if not exist "dist\CardCrafter.dist\data\generated"      mkdir "dist\CardCrafter.dist\data\generated"
if not exist "dist\CardCrafter.dist\data\tmp"            mkdir "dist\CardCrafter.dist\data\tmp"

(
    echo @echo off
    echo cd /d "%%~dp0"
    echo start CardCrafter.exe
) > "dist\CardCrafter.dist\Lancer.bat"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   Build termine !                    ║
echo  ╠══════════════════════════════════════╣
echo  ║  Exe : dist\CardCrafter.dist\CardCrafter.exe
echo  ║  Distribuez tout le dossier CardCrafter.dist\
echo  ╚══════════════════════════════════════╝
echo.
pause
