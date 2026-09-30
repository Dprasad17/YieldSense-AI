"""Writes the API's OpenAPI schema to a file (used by the frontend's `npm run gen:api`)."""
import json
import os
import sys

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from backend.app.main import app  # noqa: E402

with open(OUT, "w", encoding="utf-8") as f:
    json.dump(app.openapi(), f, indent=1)
print(f"OpenAPI schema written to {OUT}")
