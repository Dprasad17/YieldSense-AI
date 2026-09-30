# YieldSense database schema

YieldSense uses **PostgreSQL** for relational, transactional data and **MongoDB** for raw documents and caches.
Migrations: `alembic -c backend/alembic.ini upgrade head` (see `backend/migrations`).

## PostgreSQL

```mermaid
erDiagram
    users ||--o{ farms : owns
    users ||--o{ predictions : makes
    users ||--o{ recommendation_actions : takes
    users ||--o{ notifications : receives
    users ||--o{ risk_levels : tracks
    users ||--o{ audit_log : "acts in"
    users ||--o{ crop_records : imports
    farms ||--o{ farm_records : has
    farms ||--o{ predictions : "linked to"
    farms ||--o{ recommendation_actions : "scoped to"

    users {
        int id PK
        varchar username "unique, case-insensitive"
        varchar email
        varchar full_name
        varchar role "Farmer | Agronomist | Admin"
        varchar hashed_password
        varchar hash_scheme "bcrypt | sha256 (legacy, migrated on sign-in)"
        bool active
        jsonb notification_prefs
        timestamptz created_at
        timestamptz updated_at
    }
    farms {
        int id PK
        int owner_id FK
        varchar name
        varchar region "dataset country"
        float area_ha
        jsonb crops
        varchar irrigation_type
        float soil_ph
        float soil_moisture_percent
        varchar soil_type
        float latitude
        float longitude
        text notes
    }
    farm_records {
        int id PK
        int farm_id FK
        int year
        varchar crop_type
        float area_ha
        float yield_kg_ha
        float rainfall_mm
        float temperature_c
        float pesticide_usage_ml
        varchar fertilizer_type
        float fertilizer_kg_ha
        varchar irrigation_type
        text notes
    }
    crop_records {
        bigint id PK
        varchar record_code "unique (FARM00001...)"
        varchar region "indexed"
        varchar crop_type "indexed"
        int year "indexed"
        float yield_kg_per_hectare
        float rainfall_mm
        float temperature_c
        float pesticide_usage_ml
        float soil_ph "synthetic"
        float soil_moisture_percent "synthetic"
        float humidity_percent "synthetic"
        float sunlight_hours "synthetic"
        int total_days "synthetic"
        varchar crop_disease_status "synthetic"
        float ndvi_index "derived from yield (leak)"
        varchar source "reference | upload"
        varchar upload_id "Mongo uploads._id"
        int created_by FK
    }
    predictions {
        varchar id PK
        int user_id FK
        int farm_id FK "nullable"
        varchar record_code "nullable"
        varchar crop_type
        varchar region
        int year
        jsonb inputs
        float predicted_yield_kg_ha
        float low_kg_ha
        float high_kg_ha
        varchar productivity_rating
        varchar risk_rating
        varchar model_name
        varchar model_version
        float model_r2
        timestamptz created_at
    }
    recommendation_actions {
        varchar id PK
        int user_id FK
        varchar recommendation_id "unique per user"
        int farm_id FK "nullable"
        varchar title
        varchar status "open | done | dismissed | snoozed"
        timestamptz snooze_until
        text note
    }
    notifications {
        varchar id PK
        int user_id FK
        varchar category "alerts | weather | recommendations | system"
        varchar severity
        varchar title
        text body
        varchar link
        varchar dedupe_key "unique per user"
        timestamptz read_at
    }
    risk_levels {
        int user_id PK
        varchar context_key PK
        varchar risk_type PK
        varchar level
    }
    audit_log {
        varchar id PK
        int actor_id FK
        varchar actor
        varchar action
        varchar target
        jsonb detail
        timestamptz created_at
    }
```

Indexes worth knowing: `crop_records(region)`, `(crop_type)`, `(year)`, `(region, crop_type, year)`; `predictions(user_id, created_at)`;
`notifications(user_id, created_at)`; `farm_records(farm_id, year)`; unique `lower(users.username)`.

## MongoDB (`MONGO_DB`)

| Collection | Contents | Indexes |
|---|---|---|
| `uploads` | Raw uploaded rows, column mapping, validation report, import summary | `created_at`, `(user, created_at)` |
| `soil_tests` | Soil test reports per farm (pH, N, P, K, organic matter, moisture, lab, date) | `(farm_id, sampled_on)`, `user` |
| `weather_cache` | Open-Meteo responses keyed by request URL | unique `key`; TTL on `expires_at` |
| `llm_cache` | LLM rationale text keyed by a hash of the recommendation | unique `key`; TTL 30 days on `created_at` |

## Data flow

- `scripts/seed.py` loads the reference dataset into `crop_records` (COPY), creates the demo users and three demo farms.
- `scripts/migrate_legacy_stores.py` moves the pre-database `users_db.json` and SQLite store into PostgreSQL (one-time, idempotent).
- The API reads `crop_records` once into memory for analytics and invalidates that cache after imports.
