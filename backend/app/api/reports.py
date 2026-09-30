import csv
import io
from typing import Literal, Optional

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from pydantic import BaseModel, Field

from backend.app.api.data import records_to_dicts
from backend.app.api.schemas import context_filters
from backend.app.core.errors import ERROR_RESPONSES, AppError
from backend.app.core.security import require_user
from backend.app.services.dataset import filter_df

router = APIRouter(prefix="/api/reports", tags=["Reports"], responses=ERROR_RESPONSES)

MAX_ROWS = 50_000


class ReportExportRequest(BaseModel):
    format: Literal["csv", "xlsx"] = "csv"
    crop_type: Optional[str] = None
    region: Optional[str] = None
    year_from: Optional[int] = Field(None, ge=1900, le=2100)
    year_to: Optional[int] = Field(None, ge=1900, le=2100)


@router.post("/export", responses={200: {"content": {"text/csv": {}, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}}}})
def export_report(req: ReportExportRequest, _user: dict = Depends(require_user)):
    """Exports the real filtered dataset rows (capped at 50,000) as CSV or XLSX."""
    f = context_filters(region=req.region, crop=req.crop_type, year_from=req.year_from, year_to=req.year_to)
    df = filter_df(f)
    if df.empty:
        raise AppError(404, "No records match these filters.")
    truncated = len(df) > MAX_ROWS
    rows = records_to_dicts(df.head(MAX_ROWS))
    columns = list(rows[0].keys())
    filename = f"yieldsense_{f.slug()}.{req.format}"
    headers = {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "X-Total-Records": str(len(df)),
        "X-Truncated": "true" if truncated else "false",
        "Access-Control-Expose-Headers": "Content-Disposition, X-Total-Records, X-Truncated",
    }

    if req.format == "csv":
        def stream():
            buf = io.StringIO()
            writer = csv.DictWriter(buf, fieldnames=columns)
            writer.writeheader()
            for i, row in enumerate(rows, 1):
                writer.writerow(row)
                if i % 2000 == 0:
                    yield buf.getvalue()
                    buf.seek(0)
                    buf.truncate()
            yield buf.getvalue()

        return StreamingResponse(stream(), media_type="text/csv", headers=headers)

    wb = Workbook(write_only=True)
    ws = wb.create_sheet("records")
    ws.append(columns)
    for row in rows:
        ws.append([row[c] for c in columns])
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers=headers
    )
