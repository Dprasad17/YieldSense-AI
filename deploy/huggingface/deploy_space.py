"""
Deploys YieldSense AI to a free Hugging Face Space (Docker), with Neon PostgreSQL and MongoDB Atlas.

    pip install huggingface_hub
    copy deploy\\huggingface\\space.env.example deploy\\huggingface\\space.env   # fill it in (gitignored)
    python deploy/huggingface/deploy_space.py            # build the bundle, upload it, set the secrets
    python deploy/huggingface/deploy_space.py --dry-run  # only build the bundle in .space-build/ and list it

The script creates the Space if needed, uploads only what the image needs (no .env files, no tests,
no raw data), and stores DATABASE_URL, MONGO_URL, SECRET_KEY and GROQ_API_KEY as Space secrets, so
they never appear in the Space's files.
"""
import argparse
import os
import secrets
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(ROOT, ".space-build")

# (source relative to the repo, destination in the Space)
INCLUDE = [
    ("deploy/huggingface/Dockerfile", "Dockerfile"),
    ("deploy/huggingface/nginx.conf", "nginx.conf"),
    ("deploy/huggingface/start.sh", "start.sh"),
    ("deploy/huggingface/SPACE_README.md", "README.md"),
    ("requirements.txt", "requirements.txt"),
    ("backend", "backend"),
    ("scripts/seed.py", "scripts/seed.py"),
    ("scripts/create_admin.py", "scripts/create_admin.py"),
    ("models/v2", "models/v2"),
    ("datasets/processed", "datasets/processed"),
    ("eda_plots", "eda_plots"),
    ("frontend", "frontend"),
]
SKIP_DIRS = {"__pycache__", "node_modules", "dist", ".vite", "tests", "e2e", "data", "coverage"}
SKIP_FILES = {".env", "openapi.json", "users_db.json"}
SECRET_KEYS = ["DATABASE_URL", "MONGO_URL", "SECRET_KEY", "GROQ_API_KEY"]
VARIABLE_KEYS = ["SEED_DEMO_DATA", "GROQ_MODEL", "MONGO_DB"]


def read_env(path: str) -> dict:
    if not os.path.exists(path):
        sys.exit(f"Missing {path}. Copy space.env.example to space.env and fill it in.")
    out = {}
    with open(path, encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


def ignore(dirpath: str, names: list[str]) -> set[str]:
    return {n for n in names if n in SKIP_DIRS or n in SKIP_FILES or n.startswith(".env") or n.endswith((".pyc", ".log"))}


def build_bundle() -> None:
    shutil.rmtree(BUILD, ignore_errors=True)
    os.makedirs(BUILD)
    for src, dst in INCLUDE:
        s, d = os.path.join(ROOT, src), os.path.join(BUILD, dst)
        if os.path.isdir(s):
            shutil.copytree(s, d, ignore=ignore)
        else:
            os.makedirs(os.path.dirname(d), exist_ok=True)
            shutil.copy2(s, d)
    # Windows checkouts may have CRLF; the Linux image needs LF in shell scripts.
    for name in ("start.sh", os.path.join("backend", "docker-entrypoint.sh")):
        p = os.path.join(BUILD, name)
        with open(p, "rb") as f:
            data = f.read().replace(b"\r\n", b"\n")
        with open(p, "wb") as f:
            f.write(data)
    leaked = [os.path.join(dp, f) for dp, _, fs in os.walk(BUILD) for f in fs if f == ".env" or f.startswith(".env.")]
    if leaked:
        sys.exit(f"Refusing to upload environment files: {leaked}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--env", default=os.path.join(HERE, "space.env"))
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    build_bundle()
    files = sum(len(fs) for _, _, fs in os.walk(BUILD))
    size = sum(os.path.getsize(os.path.join(dp, f)) for dp, _, fs in os.walk(BUILD) for f in fs)
    print(f"Bundle: {files} files, {size / 1e6:.1f} MB in {BUILD}")
    if args.dry_run:
        return 0

    env = read_env(args.env)
    for k in ("HF_TOKEN", "HF_SPACE", "DATABASE_URL", "MONGO_URL"):
        if not env.get(k):
            sys.exit(f"{k} is empty in {args.env}")
    env.setdefault("SECRET_KEY", "")
    if len(env["SECRET_KEY"]) < 32:
        env["SECRET_KEY"] = secrets.token_urlsafe(48)
        print("SECRET_KEY was empty or short: generated a new one (stored only as a Space secret).")

    try:
        from huggingface_hub import HfApi
    except ImportError:
        sys.exit("Install the Hugging Face client first:  pip install huggingface_hub")

    api = HfApi(token=env["HF_TOKEN"])
    space = env["HF_SPACE"]
    api.create_repo(space, repo_type="space", space_sdk="docker", exist_ok=True, private=env.get("HF_PRIVATE", "false").lower() == "true")
    for k in SECRET_KEYS:
        if env.get(k):
            api.add_space_secret(space, k, env[k])
    for k in VARIABLE_KEYS:
        if env.get(k):
            api.add_space_variable(space, k, env[k])
    print(f"Secrets set: {', '.join(k for k in SECRET_KEYS if env.get(k))}")
    api.upload_folder(folder_path=BUILD, repo_id=space, repo_type="space", commit_message="Deploy YieldSense AI",
                      delete_patterns=["*"])
    owner, name = space.split("/", 1)
    host = f"https://{owner.lower()}-{name.lower().replace('_', '-').replace('.', '-')}.hf.space"
    print(f"\nUploaded. The Space is building (about 5-10 minutes): https://huggingface.co/spaces/{space}")
    print(f"App URL when it is running: {host}")
    print(f"Health check: {host}/api/health")
    return 0


if __name__ == "__main__":
    sys.exit(main())
