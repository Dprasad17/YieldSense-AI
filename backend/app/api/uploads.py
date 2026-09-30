"""
Data collection: CSV/XLSX upload -> column mapping -> validation preview -> import.

Raw rows, mapping and the validation report live in MongoDB (`uploads`); clean rows go to
PostgreSQL (crop_records, farm_records, weather_observations) or MongoDB (soil_tests).
"""
import io
import re
import uuid
from datetime import date, datetime, timezone
from typing import Any, Literal, Optional

import pandas as pd
from pymongo.errors import DocumentTooLarge
from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel

from backend.app.api.management import canon_crops, canon_region, load_farm, save_soil_test
from backend.app.api.schemas import Page
from backend.app.core.config import settings
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import is_privileged, require_user
from backend.app.db import mongo
from backend.app.db.models import CropRecord, FarmRecord, User, WeatherObservation
from backend.app.db.session import session_scope
from backend.app.services import dataset

router = APIRouter(prefix="/api/uploads", tags=["Data collection"], responses=ERROR_RESPONSES)

Kind = Literal["crop_records", "farm_records", "weather", "soil_tests"]

# field -> (type, required, min, max, aliases)
FIELDS: dict[str, dict[str, tuple]] = {
    "crop_records": {
        "region": ("region", True, None, None, ["country", "area"]),
        "crop_type": ("crop", True, None, None, ["crop", "item"]),
        "year": ("int", True, 1900, 2100, ["season"]),
        "yield_kg_per_hectare": ("float", True, 0, 200000, ["yield", "yield_kg_ha", "hg_ha_yield"]),
        "rainfall_mm": ("float", False, 0, 10000, ["rainfall", "rain", "average_rain_fall_mm_per_year"]),
        "temperature_c": ("float", False, -30, 60, ["temperature", "temp", "avg_temp"]),
        "pesticide_usage_ml": ("float", False, 0, None, ["pesticide", "pesticides", "pesticides_tonnes"]),
        "soil_ph": ("float", False, 3, 10, ["ph", "soil_ph"]),
        "soil_moisture_percent": ("float", False, 0, 100, ["moisture", "soil_moisture"]),
        "humidity_percent": ("float", False, 0, 100, ["humidity"]),
        "sunlight_hours": ("float", False, 0, 24, ["sunlight", "sunshine"]),
        "irrigation_type": ("str", False, None, None, ["irrigation"]),
        "fertilizer_type": ("str", False, None, None, ["fertilizer"]),
    },
    "farm_records": {
        "year": ("int", True, 1950, 2100, ["season"]),
        "crop_type": ("crop", True, None, None, ["crop"]),
        "area_ha": ("float", True, 0.0001, 1000000, ["area", "hectares", "ha"]),
        "yield_kg_ha": ("float", False, 0, 200000, ["yield", "yield_kg_per_hectare"]),
        "rainfall_mm": ("float", False, 0, 10000, ["rainfall", "rain"]),
        "temperature_c": ("float", False, -30, 60, ["temperature", "temp"]),
        "pesticide_usage_ml": ("float", False, 0, None, ["pesticide", "pesticides"]),
        "fertilizer_type": ("str", False, None, None, ["fertilizer"]),
        "fertilizer_kg_ha": ("float", False, 0, 5000, ["fertilizer_kg", "fertilizer_rate"]),
        "irrigation_type": ("str", False, None, None, ["irrigation"]),
    },
    "weather": {
        "region": ("region", True, None, None, ["country", "area", "station"]),
        "year": ("int", True, 1900, 2100, []),
        "month": ("int", False, 1, 12, []),
        "rainfall_mm": ("float", False, 0, 10000, ["rainfall", "rain", "precipitation"]),
        "temperature_c": ("float", False, -60, 60, ["temperature", "temp"]),
        "humidity_percent": ("float", False, 0, 100, ["humidity"]),
        "sunlight_hours": ("float", False, 0, 24, ["sunlight", "sunshine"]),
    },
    "soil_tests": {
        "sampled_on": ("date", True, None, None, ["date", "sample_date"]),
        "ph": ("float", True, 3, 10, ["soil_ph", "ph_value"]),
        "moisture_percent": ("float", False, 0, 100, ["moisture"]),
        "nitrogen_kg_ha": ("float", False, 0, 2000, ["nitrogen", "n"]),
        "phosphorus_kg_ha": ("float", False, 0, 2000, ["phosphorus", "p"]),
        "potassium_kg_ha": ("float", False, 0, 2000, ["potassium", "k"]),
        "organic_matter_percent": ("float", False, 0, 100, ["organic_matter", "om"]),
        "lab": ("str", False, None, None, ["laboratory"]),
    },
}

NEEDS_FARM = {"farm_records", "soil_tests"}
PRIVILEGED_KINDS = {"crop_records", "weather"}  # add to shared reference data


class FieldSpec(BaseModel):
    name: str
    type: str
    required: bool


class UploadSummary(BaseModel):
    id: str
    kind: Kind
    filename: str
    user: str
    farm_id: Optional[int]
    status: Literal["uploaded", "validated", "imported"]
    row_count: int
    columns: list[str]
    fields: list[FieldSpec]
    mapping: dict[str, Optional[str]]
    preview: list[dict[str, Any]]
    report: Optional[dict[str, Any]] = None
    created_at: str


class ValidateRequest(BaseModel):
    mapping: dict[str, Optional[str]]


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).strip().lower()).strip("_")


def _suggest(columns: list[str], kind: str) -> dict[str, Optional[str]]:
    normed = {_norm(c): c for c in columns}
    out: dict[str, Optional[str]] = {}
    for field, (_, _, _, _, aliases) in FIELDS[kind].items():
        out[field] = next((normed[a] for a in [field, *aliases] if a in normed), None)
    return out


def _summary(doc: dict) -> dict:
    fields = [{"name": f, "type": spec[0], "required": spec[1]} for f, spec in FIELDS[doc["kind"]].items()]
    return {
        "id": doc["_id"], "kind": doc["kind"], "filename": doc["filename"], "user": doc["user"], "farm_id": doc.get("farm_id"),
        "status": doc["status"], "row_count": doc["row_count"], "columns": doc["columns"], "fields": fields,
        "mapping": doc["mapping"], "preview": doc["rows"][:10], "report": doc.get("report"),
        "created_at": doc["created_at"].isoformat(timespec="seconds") if isinstance(doc["created_at"], datetime) else str(doc["created_at"]),
    }


def _get(upload_id: str, user: dict) -> dict:
    doc = mongo.db().uploads.find_one({"_id": upload_id})
    if not doc or (doc["user"] != user["username"] and user["role"] != "Admin"):
        raise AppError(404, "Upload not found.")
    return doc


def _coerce(value: Any, spec: tuple) -> tuple[Any, Optional[str]]:
    kind, required, lo, hi, _ = spec
    if value is None or (isinstance(value, str) and not value.strip()) or (isinstance(value, float) and pd.isna(value)):
        return None, "is required" if required else None
    try:
        if kind in ("float", "int"):
            v = float(str(value).replace(",", ""))
            if kind == "int":
                if v != int(v):
                    return None, "must be a whole number"
                v = int(v)
            if lo is not None and v < lo:
                return None, f"must be ≥ {lo}"
            if hi is not None and v > hi:
                return None, f"must be ≤ {hi}"
            return v, None
        if kind == "date":
            return pd.to_datetime(value).date().isoformat(), None
        if kind == "region":
            return canon_region(str(value)), None
        if kind == "crop":
            return (canon_crops([str(value)]) or [None])[0], None
        return str(value).strip()[:80], None
    except ValueError as e:
        return None, str(e) if kind in ("region", "crop") else f"'{value}' is not a valid {kind}"
    except Exception:
        return None, f"'{value}' is not a valid {kind}"


def _validate(doc: dict, mapping: dict[str, Optional[str]]) -> tuple[list[dict], list[dict]]:
    spec = FIELDS[doc["kind"]]
    missing = [f for f, s in spec.items() if s[1] and not mapping.get(f)]
    if missing:
        raise AppError(422, f"Map the required fields: {', '.join(missing)}.", code="validation_error")
    unknown = [c for c in mapping.values() if c and c not in doc["columns"]]
    if unknown:
        raise AppError(422, f"Unknown columns in mapping: {', '.join(unknown)}.", code="validation_error")
    clean, errors = [], []
    for i, row in enumerate(doc["rows"], start=2):  # row 1 is the header
        out, row_errors = {}, []
        for field, s in spec.items():
            col = mapping.get(field)
            value, err = _coerce(row.get(col) if col else None, s)
            if err:
                row_errors.append({"row": i, "field": field, "message": f"{field} {err}" if not err.startswith(field) else err})
            out[field] = value
        if row_errors:
            errors.extend(row_errors)
        else:
            clean.append(out)
    return clean, errors


# ------------------------------------------------------------------ routes


@router.post("", response_model=UploadSummary, status_code=201)
async def upload_file(
    kind: Kind = Form(...),
    farm_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    user: dict = Depends(require_user),
):
    """Step 1: store the raw rows and suggest a column mapping."""
    if kind in PRIVILEGED_KINDS and not is_privileged(user):
        raise AppError(403, "Only agronomists and administrators can add reference crop or weather data.")
    if kind in NEEDS_FARM:
        if farm_id is None:
            raise AppError(422, "Choose the farm these rows belong to.", code="validation_error")
        with session_scope() as s:
            load_farm(s, farm_id, user, write=True)
    name = (file.filename or "upload").strip()
    ext = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if ext not in ("csv", "xlsx"):
        raise AppError(415, "Upload a .csv or .xlsx file.", code="unsupported_file_type")
    content = await file.read(settings.UPLOAD_MAX_BYTES + 1)
    if len(content) > settings.UPLOAD_MAX_BYTES:
        raise AppError(413, f"The file is larger than {settings.UPLOAD_MAX_BYTES // (1024 * 1024)} MB.", code="file_too_large")
    # Check the content, not just the extension: .xlsx is a ZIP container; CSV must be UTF-8 text.
    if ext == "xlsx" and not content.startswith(b"PK\x03\x04"):
        raise AppError(415, "This file isn't a valid Excel (.xlsx) workbook.", code="unsupported_file_type")
    if ext == "csv":
        if b"\x00" in content[:8192]:
            raise AppError(415, "This file looks binary, not a CSV.", code="unsupported_file_type")
        try:
            content.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise AppError(422, "Save the CSV as UTF-8 and upload it again.", code="unreadable_file")
    try:
        df = pd.read_csv(io.BytesIO(content), dtype=str, keep_default_na=False) if ext == "csv" else pd.read_excel(io.BytesIO(content), dtype=str).fillna("")
    except Exception:
        raise AppError(422, "The file could not be read. Check that it is a valid CSV or Excel workbook.", code="unreadable_file")
    if df.empty or not len(df.columns):
        raise AppError(422, "The file has no data rows.", code="empty_file")
    if len(df) > settings.UPLOAD_MAX_ROWS:
        raise AppError(413, f"The file has {len(df):,} rows; the limit is {settings.UPLOAD_MAX_ROWS:,}.", code="too_many_rows")
    df.columns = [str(c).strip() for c in df.columns]
    doc = {
        "_id": uuid.uuid4().hex,
        "kind": kind,
        "farm_id": farm_id,
        "filename": name[:120],
        "size_bytes": len(content),
        "user": user["username"],
        "status": "uploaded",
        "row_count": int(len(df)),
        "columns": list(df.columns),
        "rows": df.to_dict(orient="records"),
        "mapping": _suggest(list(df.columns), kind),
        "created_at": datetime.now(timezone.utc),
    }
    try:
        mongo.db().uploads.insert_one(doc)
    except DocumentTooLarge:
        raise AppError(413, "The file has too much data to store in one upload; split it into smaller files.", code="file_too_large")
    return _summary(doc)


@router.post("/{upload_id}/validate", response_model=UploadSummary)
def validate_upload(upload_id: str, body: ValidateRequest, user: dict = Depends(require_user)):
    """Step 2: apply the mapping and report row errors (nothing is imported yet)."""
    doc = _get(upload_id, user)
    if doc["status"] == "imported":
        raise AppError(409, "This upload has already been imported.", code="already_imported")
    clean, errors = _validate(doc, body.mapping)
    report = {
        "valid_rows": len(clean),
        "invalid_rows": len({e["row"] for e in errors}),
        "errors": errors[:200],
        "error_count": len(errors),
        "clean_preview": clean[:10],
        "validated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    mongo.db().uploads.update_one({"_id": upload_id}, {"$set": {"mapping": body.mapping, "report": report, "status": "validated"}})
    return _summary({**doc, "mapping": body.mapping, "report": report, "status": "validated"})


@router.post("/{upload_id}/import", response_model=UploadSummary)
def import_upload(upload_id: str, user: dict = Depends(require_user)):
    """Step 3: write the valid rows. Invalid rows are skipped and listed in the report."""
    doc = _get(upload_id, user)
    if doc["status"] != "validated":
        raise AppError(409, "Validate the upload before importing it.", code="not_validated")
    clean, _ = _validate(doc, doc["mapping"])
    kind, short = doc["kind"], upload_id[:8]
    with session_scope() as s:
        uid = s.query(User.id).filter(User.username == doc["user"]).scalar()
        if kind == "crop_records":
            s.add_all(CropRecord(record_code=f"UP-{short}-{i:05d}", source="upload", upload_id=upload_id, created_by=uid, **r) for i, r in enumerate(clean, 1))
        elif kind == "weather":
            s.add_all(WeatherObservation(upload_id=upload_id, created_by=uid, **r) for r in clean)
        elif kind == "farm_records":
            load_farm(s, doc["farm_id"], user, write=True)
            s.add_all(FarmRecord(farm_id=doc["farm_id"], **r) for r in clean)
    if kind == "soil_tests":
        for r in clean:
            save_soil_test({**r, "farm_id": doc["farm_id"], "sampled_on": date.fromisoformat(r["sampled_on"])}, doc["user"], source="upload", upload_id=upload_id)
    if kind == "crop_records":
        dataset.invalidate()
    report = {**(doc.get("report") or {}), "imported_rows": len(clean), "imported_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    mongo.db().uploads.update_one({"_id": upload_id}, {"$set": {"status": "imported", "report": report}})
    return _summary({**doc, "status": "imported", "report": report})


@router.get("", response_model=Page[UploadSummary])
def list_uploads(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100), user: dict = Depends(require_user)):
    q = {} if user["role"] == "Admin" else {"user": user["username"]}
    total = mongo.db().uploads.count_documents(q)
    docs = mongo.db().uploads.find(q, {"rows": {"$slice": 10}}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    return {"items": [_summary(d) for d in docs], "total": total, "page": page, "page_size": page_size}


@router.get("/{upload_id}", response_model=UploadSummary)
def get_upload(upload_id: str, user: dict = Depends(require_user)):
    return _summary(_get(upload_id, user))
