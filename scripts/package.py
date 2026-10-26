"""Create a source-only handoff ZIP, excluding dependencies, credentials and build output."""

from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = ("api", "backend", "src", "public", "data", "scripts", "tests", "e2e", "docs", ".github")
FILES = ("README.md", "package.json", "package-lock.json", "requirements.txt", "requirements.lock.txt", "requirements-dev.txt", "index.html", "vite.config.ts", "tsconfig.json", "playwright.config.ts", "pytest.ini", "Dockerfile", "compose.yaml", "vercel.json", ".gitignore", ".dockerignore", ".vercelignore", ".prettierignore", ".python-version", ".env.example")


def package() -> Path:
    destination = ROOT / "artifacts" / "WindDesk-source.zip"
    destination.parent.mkdir(exist_ok=True)
    paths = [ROOT / name for name in FILES]
    for folder in FOLDERS:
        paths.extend(path for path in (ROOT / folder).rglob("*") if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc")
    with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(paths):
            archive.write(path, Path("WindDesk") / path.relative_to(ROOT))
    print(f"Created {destination} ({destination.stat().st_size:,} bytes, {len(paths)} files)")
    return destination


if __name__ == "__main__":
    package()
