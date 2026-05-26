"""
CardCrafter — Launcher cross-platform.
Double-clic sous Windows (.exe) ou Linux/Pi → démarre le serveur + ouvre le navigateur.
Compatible Nuitka standalone et mode développement Python.
"""
import sys, os, platform, threading, webbrowser, time, socket, multiprocessing
from pathlib import Path


def _get_base_dir() -> str:
    """
    Retourne le dossier racine de l'application.

    - Mode développement     : dossier de launcher.py
    - Nuitka standalone      : dossier du binaire compilé
      (Nuitka met '__compiled__' dans le scope du module principal)
    """
    # Nuitka définit __compiled__ dans le module principal compilé
    is_compiled = globals().get("__compiled__", False)

    if is_compiled:
        # En Nuitka standalone, sys.executable pointe vers le binaire
        return str(Path(sys.executable).resolve().parent)

    # Mode développement : ce fichier launcher.py est dans la racine du projet
    return str(Path(__file__).resolve().parent)


def _find_free_port(preferred: int = 8765) -> int:
    for port in range(preferred, preferred + 30):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return preferred


def _open_browser(port: int) -> None:
    time.sleep(2.8)
    webbrowser.open(f"http://127.0.0.1:{port}")


def _banner(port: int, os_name: str) -> None:
    print(f"""
╔══════════════════════════════════════════╗
║  ⚔  CardCrafter  v1.0                   ║
╠══════════════════════════════════════════╣
║  OS  : {os_name:<34}║
║  URL : http://127.0.0.1:{port:<16} ║
╠══════════════════════════════════════════╣
║  Ouverture du navigateur…                ║
║  Ctrl+C pour arrêter le serveur.         ║
╚══════════════════════════════════════════╝
""")


def main() -> None:
    multiprocessing.freeze_support()   # requis Windows + Nuitka/PyInstaller

    base = _get_base_dir()
    os.chdir(base)
    if base not in sys.path:
        sys.path.insert(0, base)

    # Transmettre le chemin racine à file_utils via variable d'environnement
    os.environ["CARDCRAFTER_BASE"] = base

    port    = _find_free_port(8765)
    os_name = platform.system()

    _banner(port, os_name)

    threading.Thread(target=_open_browser, args=(port,), daemon=True).start()

    try:
        import uvicorn
        from app.main import app          # import direct — meilleure compat Nuitka

        uvicorn.run(
            app,
            host      = "127.0.0.1",
            port      = port,
            reload    = False,
            log_level = "warning",
            access_log = False,
        )
    except KeyboardInterrupt:
        print("\n  CardCrafter arrêté. À bientôt !")
    except Exception as e:
        print(f"\n  Erreur fatale : {e}")
        if platform.system() == "Windows":
            input("Appuyez sur Entrée pour fermer…")
        sys.exit(1)


if __name__ == "__main__":
    main()
