"""One error envelope for the whole API: {"error": {"code": str, "message": str}}."""
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
    500: "internal_error",
    502: "bad_gateway",
    503: "unavailable",
}


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorEnvelope(BaseModel):
    error: ErrorBody


class AppError(StarletteHTTPException):
    """HTTP error with an explicit machine-readable code (e.g. "token_expired")."""

    def __init__(self, status_code: int, message: str, code: str | None = None, headers: dict | None = None):
        super().__init__(status_code=status_code, detail=message, headers=headers)
        self.code = code or STATUS_CODES.get(status_code, "error")


def _envelope(status: int, code: str, message: str, headers=None) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}}, headers=headers)


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = getattr(exc, "code", None) or STATUS_CODES.get(exc.status_code, "error")
        message = exc.detail if isinstance(exc.detail, str) else "Request failed"
        return _envelope(exc.status_code, code, message, getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        first = exc.errors()[0] if exc.errors() else {}
        field = ".".join(str(p) for p in first.get("loc", [])[1:]) or "request"
        message = f"{field}: {first.get('msg', 'invalid value')}"
        return _envelope(422, "validation_error", message)

    @app.exception_handler(Exception)
    async def unhandled_error(_: Request, exc: Exception):
        print(f"[API] Unhandled error: {exc!r}")
        return _envelope(500, "internal_error", "Something went wrong on our side. Please try again.")


# Documented on every router so OpenAPI shows the envelope for error statuses.
ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    401: {"model": ErrorEnvelope, "description": "Not signed in or session expired"},
    403: {"model": ErrorEnvelope, "description": "Role not allowed"},
    404: {"model": ErrorEnvelope, "description": "Not found"},
    422: {"model": ErrorEnvelope, "description": "Invalid request"},
}

RATE_LIMIT_RESPONSE: dict[int | str, dict[str, Any]] = {
    429: {"model": ErrorEnvelope, "description": "Too many attempts"},
}
