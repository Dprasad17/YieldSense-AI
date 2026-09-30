"""PostgreSQL schema (SQLAlchemy 2). Migrations live in backend/migrations (Alembic)."""
from datetime import date, datetime, timezone
from typing import Any, Optional

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(32), nullable=False)
    email: Mapped[str] = mapped_column(String(254), nullable=False)
    full_name: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(16), nullable=False, default="Farmer")
    hashed_password: Mapped[str] = mapped_column(String(128), nullable=False)
    hash_scheme: Mapped[str] = mapped_column(String(16), nullable=False, default="bcrypt")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    notification_prefs: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    farms: Mapped[list["Farm"]] = relationship(back_populates="owner", cascade="all, delete-orphan")

    __table_args__ = (Index("uq_users_username_lower", func.lower(username), unique=True),)


class Farm(Base):
    __tablename__ = "farms"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    region: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    crops: Mapped[list[str]] = mapped_column(JsonType, nullable=False, default=list)
    irrigation_type: Mapped[Optional[str]] = mapped_column(String(32))
    soil_ph: Mapped[Optional[float]] = mapped_column(Float)
    soil_moisture_percent: Mapped[Optional[float]] = mapped_column(Float)
    soil_type: Mapped[Optional[str]] = mapped_column(String(40))
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(back_populates="farms")
    records: Mapped[list["FarmRecord"]] = relationship(back_populates="farm", cascade="all, delete-orphan", order_by="FarmRecord.year.desc()")


class FarmRecord(Base):
    """One season on a farm: what was grown, how, and what it yielded."""

    __tablename__ = "farm_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    farm_id: Mapped[int] = mapped_column(ForeignKey("farms.id", ondelete="CASCADE"), nullable=False, index=True)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    crop_type: Mapped[str] = mapped_column(String(40), nullable=False)
    area_ha: Mapped[float] = mapped_column(Float, nullable=False)
    yield_kg_ha: Mapped[Optional[float]] = mapped_column(Float)
    rainfall_mm: Mapped[Optional[float]] = mapped_column(Float)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float)
    pesticide_usage_ml: Mapped[Optional[float]] = mapped_column(Float)
    fertilizer_type: Mapped[Optional[str]] = mapped_column(String(40))
    fertilizer_kg_ha: Mapped[Optional[float]] = mapped_column(Float)
    irrigation_type: Mapped[Optional[str]] = mapped_column(String(32))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    farm: Mapped[Farm] = relationship(back_populates="records")

    __table_args__ = (Index("ix_farm_records_farm_year", "farm_id", "year"),)


class CropRecord(Base):
    """Reference dataset rows (FAOSTAT-based) plus rows imported through Data Collection."""

    __tablename__ = "crop_records"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    record_code: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    region: Mapped[str] = mapped_column(String(80), nullable=False)
    crop_type: Mapped[str] = mapped_column(String(40), nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    yield_kg_per_hectare: Mapped[float] = mapped_column(Float, nullable=False)
    rainfall_mm: Mapped[Optional[float]] = mapped_column(Float)
    temperature_c: Mapped[Optional[float]] = mapped_column(Float)
    pesticide_usage_ml: Mapped[Optional[float]] = mapped_column(Float)
    soil_ph: Mapped[Optional[float]] = mapped_column(Float)
    soil_moisture_percent: Mapped[Optional[float]] = mapped_column(Float)
    humidity_percent: Mapped[Optional[float]] = mapped_column(Float)
    sunlight_hours: Mapped[Optional[float]] = mapped_column(Float)
    total_days: Mapped[Optional[int]] = mapped_column(Integer)
    sowing_date: Mapped[Optional[date]] = mapped_column(Date)
    harvest_date: Mapped[Optional[date]] = mapped_column(Date)
    irrigation_type: Mapped[Optional[str]] = mapped_column(String(32))
    fertilizer_type: Mapped[Optional[str]] = mapped_column(String(40))
    crop_disease_status: Mapped[Optional[str]] = mapped_column(String(16))
    ndvi_index: Mapped[Optional[float]] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="reference")
    upload_id: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    __table_args__ = (
        Index("ix_crop_records_region", "region"),
        Index("ix_crop_records_crop", "crop_type"),
        Index("ix_crop_records_year", "year"),
        Index("ix_crop_records_region_crop_year", "region", "crop_type", "year"),
    )


class Prediction(Base):
    __tablename__ = "predictions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    farm_id: Mapped[Optional[int]] = mapped_column(ForeignKey("farms.id", ondelete="SET NULL"), index=True)
    record_code: Mapped[Optional[str]] = mapped_column(String(32), index=True)
    crop_type: Mapped[str] = mapped_column(String(40), nullable=False)
    region: Mapped[str] = mapped_column(String(80), nullable=False)
    year: Mapped[Optional[int]] = mapped_column(Integer)
    inputs: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False)
    predicted_yield_kg_ha: Mapped[float] = mapped_column(Float, nullable=False)
    low_kg_ha: Mapped[float] = mapped_column(Float, nullable=False)
    high_kg_ha: Mapped[float] = mapped_column(Float, nullable=False)
    productivity_rating: Mapped[str] = mapped_column(String(8), nullable=False)
    risk_rating: Mapped[str] = mapped_column(String(8), nullable=False)
    model_name: Mapped[str] = mapped_column(String(80), nullable=False)
    model_version: Mapped[Optional[str]] = mapped_column(String(16))
    model_r2: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)

    user: Mapped[User] = relationship()

    __table_args__ = (Index("ix_predictions_user_created", "user_id", "created_at"),)


class RecommendationAction(Base):
    """A user's task/decision on a recommendation (field task, snooze, dismiss, done)."""

    __tablename__ = "recommendation_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    recommendation_id: Mapped[str] = mapped_column(String(160), nullable=False)
    farm_id: Mapped[Optional[int]] = mapped_column(ForeignKey("farms.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String(80))
    crop_type: Mapped[Optional[str]] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(12), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text)
    snooze_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow)

    user: Mapped[User] = relationship()

    __table_args__ = (UniqueConstraint("recommendation_id", "user_id", name="uq_rec_action_user"),)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    category: Mapped[str] = mapped_column(String(20), nullable=False)
    severity: Mapped[str] = mapped_column(String(12), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(300))
    dedupe_key: Mapped[str] = mapped_column(String(300), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship()

    __table_args__ = (
        UniqueConstraint("user_id", "dedupe_key", name="uq_notification_dedupe"),
        Index("ix_notifications_user_created", "user_id", "created_at"),
    )


class RiskLevel(Base):
    """Last seen risk level per user/context/type, used to notify on changes."""

    __tablename__ = "risk_levels"

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    context_key: Mapped[str] = mapped_column(String(200), primary_key=True)
    risk_type: Mapped[str] = mapped_column(String(20), primary_key=True)
    level: Mapped[str] = mapped_column(String(12), nullable=False)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    actor_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor: Mapped[str] = mapped_column(String(32), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False)
    target: Mapped[str] = mapped_column(String(120), nullable=False)
    detail: Mapped[dict[str, Any]] = mapped_column(JsonType, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow, index=True)
