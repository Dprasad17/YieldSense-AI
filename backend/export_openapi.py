"""Writes the API's OpenAPI schema to a file (used by the frontend's `npm run gen:api`)."""
import json
import os
import sys

OUT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "openapi.json")
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from backend.app.main import app  # noqa: E402


def flatten_nullable(schema: dict) -> None:
    """`anyOf: [X, null]` -> `X` with `type: [T, "null"]` for properties whose names contain "%".
    openapi-typescript builds JSON-pointer refs from property names and can't decode a raw "%"."""
    for comp in schema.get("components", {}).get("schemas", {}).values():
        for name, prop in comp.get("properties", {}).items():
            options = prop.get("anyOf")
            if "%" not in name or not options or len(options) != 2:
                continue
            real = [o for o in options if o.get("type") != "null"]
            if len(real) == 1 and "type" in real[0]:
                merged = {k: v for k, v in prop.items() if k != "anyOf"}
                merged.update(real[0])
                merged["type"] = [real[0]["type"], "null"]
                comp["properties"][name] = merged


spec = app.openapi()
flatten_nullable(spec)
with open(OUT, "w", encoding="utf-8") as f:
    json.dump(spec, f, indent=1)
print(f"OpenAPI schema written to {OUT}")
