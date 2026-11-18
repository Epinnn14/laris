# PyInstaller recipe for the Laris desktop app (Windows build in CI; also builds on Linux for testing).
#   pyinstaller desktop/laris.spec --noconfirm      (run from the repository root, after `npm run build`)
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files, collect_submodules

root = Path(SPECPATH).parent
datas = [
    (str(root / "frontend" / "dist"), "web"),
    (str(root / "models" / "larisnet" / "model.onnx"), "model"),
    (str(root / "models" / "larisnet" / "meta.json"), "model"),
    (str(root / "desktop" / "laris.ico"), "."),
]
datas += collect_data_files("onnxruntime")
sys.path[:0] = [str(root / "backend"), str(root / "ml")]  # the app's own packages, installed or not
hidden = (collect_submodules("uvicorn") + collect_submodules("laris_api")
          # the parts of laris_ml the app runs (training needs torch and stays out)
          + [f"laris_ml.{m}" for m in ("calendar_id", "catalog", "synth", "features", "forecast", "baselines", "plan")]
          + ["sqlalchemy.dialects.sqlite", "segno"])

a = Analysis(
    [str(root / "desktop" / "laris_desktop.py")],
    pathex=[str(root / "backend"), str(root / "ml")],
    datas=datas,
    hiddenimports=hidden,
    # training-only and test packages are not needed in the shop
    excludes=["torch", "lightgbm", "pytest", "matplotlib", "IPython", "psycopg", "sklearn"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="Laris",
    console=False,
    icon=str(root / "desktop" / "laris.ico"),
)
coll = COLLECT(exe, a.binaries, a.datas, name="Laris")
