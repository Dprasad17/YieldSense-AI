# Milestones 1–3 checklist

Status as of 30 September 2026 (branch `milestone-1-3`). Each item is checked against the project specification (`docs/YieldSense_AI_Project_Specification.md`). An item is marked **Done** only when it works end to end on the real data in PostgreSQL/MongoDB, and a test is named where one exists. Milestone 4 (Docker, cloud deployment, CI/CD) is out of scope.

Legend: ✅ Done · ⚠️ Done with a data caveat · ❌ Not done

## Data honesty (read first)

The reference dataset has 28,242 rows from the Kaggle "Crop Yield Prediction" dataset (`yield_df.csv`), which is built from FAOSTAT and World Bank data. Each row is one country × crop × year, covering 101 countries, 10 crops and 1990–2013.

- **Real columns:** region, crop, year, yield, rainfall (a long-term country average, so it doesn't change between years), temperature (annual mean) and pesticides (national tonnes × 100).
- **Synthetic columns:** soil pH, soil moisture, humidity, sunlight, irrigation, fertilizer, disease status and crop duration. `scripts/preprocess_real_dataset.py` generated these; none of them were measured.
- **Derived column:** NDVI is computed from the yield's own percentile rank, which is target leakage. It is excluded from the model.

`GET /api/data/provenance` exposes this for every column, and the app shows it as R/S/D badges in the Dataset Explorer, on Model Performance and in the Soil bands table. Any feature that depends on synthetic columns carries a ⚠️ below.

## Milestone 1 — Initialization, design, core setup

| Requirement | Status | Evidence |
| --- | --- | --- |
| Architecture and database design | ✅ | README architecture diagram; `docs/database-schema.md` (ERD + Mongo collections); Alembic migrations 0001–0003 |
| UI wireframes / workflow planning | ✅ | `docs/ui_layout.md`, `docs/stitch_design_system.md`; implemented design-token system (light/dark) |
| Frontend and backend environments | ✅ | React 19 + Vite + TS; FastAPI + SQLAlchemy 2 + Alembic; `.env.example` for root, backend and frontend |
| Authentication | ✅ | JWT (60 min), bcrypt with legacy-hash migration, login rate limit, change password, session-expiry handling; `test_auth.py` |
| Role-based access (Farmer, Agronomist, Admin) | ✅ | Server gates on every route; the no-token test walks every OpenAPI path; role matrix in `test_access.py`; the browser test signs in as all 3 roles |
| Registration and profile management | ✅ | 2-step registration, profile edit, notification preferences (`/api/auth/me` PATCH) |
| Farm information management | ✅ | Farms CRUD, seasons, map, soil tests; owner/admin write rules; `test_management.py` |
| Dataset collection | ✅ | FAOSTAT-based dataset seeded into `crop_records` (28,242 rows) |
| Data collection and preprocessing workflow | ✅ | CSV/XLSX wizard: upload (type, content, size and row limits) → column mapping → row validation → import. Raw rows go to MongoDB, clean rows to PostgreSQL. Covered by tests |
| Historical farming records | ✅ | Farm seasons (manual or imported) and prediction history on the server |
| Weather data integration | ✅ | Open-Meteo live 7-day forecast and ERA5 yearly archive, cached in MongoDB; weather observations can be imported |
| Soil information collection | ✅ | Soil test form (pH, moisture, N/P/K, organic matter) stored in MongoDB per farm |

## Milestone 2 — Yield prediction and agricultural analysis

| Requirement | Status | Evidence |
| --- | --- | --- |
| Train forecasting models | ✅ | `scripts/train_models_v2.py`: Linear, Ridge, RF, XGBoost, LightGBM and a Keras MLP, each on raw and log1p targets |
| Leakage removed | ✅ | NDVI excluded. Each synthetic column was kept only if permutation importance showed signal; only `total_days` passed (0.479 ± 0.006) |
| Evaluate accuracy (MAE, RMSE, R², MAPE, latency, coverage) | ✅ | Random, temporal (train ≤ 2008, test 2009–2013) and unseen-region splits, stored in `models/v2/model_card.json` and shown on Model Performance |
| Served model | ✅ | XGBoost (raw target) on the temporal split: R² 0.9514, RMSE 2,096 kg/ha, MAE 1,125 kg/ha, MAPE 21.5%, p50/p95 6.2/7.8 ms. The Keras MLP scores slightly better (RMSE 2,028) but is not served because it would add TensorFlow to the API |
| Prediction interval | ⚠️ | Split-conformal P10–P90 built from out-of-time residuals. Calibrated on a random split, coverage on the temporal test is only 61.3% against the nominal 80%; the served band uses the out-of-time residuals to correct for this, and the page reports both |
| AI model inference, yield forecasting | ✅ | `POST /api/predict` (saved) and `/what-if` (not saved); a test checks the API against the bundle's own output |
| Harvest / production estimation | ✅ | With a farm selected, the Predictor shows predicted yield × farm area, in tonnes, with the P10–P90 range |
| Prediction reports | ✅ | Printable prediction report (`/report/prediction`) and server-side history with compare and re-run |
| Weather analysis: rainfall, temperature, climate trend | ✅ | Dataset weather scores, live forecast, ERA5 yearly trend with °C/decade and mm/decade slopes |
| Weather impact assessment | ✅ | Drought, flood and heat risks: share of records breaching crop thresholds and median yield loss, on real rainfall and temperature |
| Soil quality / fertility assessment | ⚠️ | Works, but uses synthetic pH and moisture. The health index no longer uses NDVI |
| Nutrient analysis | ❌ | N/P/K is captured in soil tests, but there is no reference nutrient data to evaluate it against |
| Soil suitability recommendations | ⚠️ | Crop suitability ranking works, but on synthetic soil columns |
| Agricultural insights | ✅ | Groq-written insight and rationale when available; otherwise a deterministic fallback that is labelled as such |

## Milestone 3 — Dashboard, reporting and recommendations

| Requirement | Status | Evidence |
| --- | --- | --- |
| Analytics dashboard | ✅ | Dashboard KPIs, crop portfolio, data coverage, recommendation preview |
| Productivity analytics and seasonal performance | ✅ | Yearly trend, CAGR, YoY, next-year model forecast with P10–P90 |
| Farm comparison reports | ✅ | Record comparison (top/bottom), and real farms vs regional reference (`/api/analytics/my-farms`) |
| Productivity report | ✅ | `/report/productivity`, printable A4, scoped to Farm · Region · Crop · Year |
| Export | ✅ | CSV and XLSX export (`/api/reports/export`) |
| Visualization components | ✅ | Theme-aware chart library with screen-reader summaries (trend, bars, grouped, scatter-fit, multi-line, rain/temperature) |
| Recommendation workflow | ✅ | Rule engine; tasks (create, done, snooze, dismiss) saved per user; farm, severity and category filters |
| Model-estimated impact | ⚠️ | Estimated only for rules on model inputs (rainfall, temperature). Rules on synthetic columns show "not estimated" and take their severity from the share of records affected |
| Risk assessment | ✅ | Likelihood × impact matrix, yearly timeline, anomalies (>3σ), mitigation with links to recommendations |
| Risk alerts / notifications | ✅ | Bell with unread count and a notifications page; deduplicated alerts for high/critical risks and recommendations |
| Context switcher | ✅ | Farm · Region · Crop · Year kept in the URL |
| Model card and provenance in the UI | ✅ | Model Performance page; R/S/D badges in Dataset Explorer |

## Cross-cutting (Phase F)

| Requirement | Status | Evidence |
| --- | --- | --- |
| Request IDs, timing, structured logs | ✅ | `X-Request-ID`, `Server-Timing`, one JSON log line per request; 500 responses quote the request ID |
| Health and system metrics | ✅ | `/api/health` checks the DB, Mongo and model; `/api/admin/metrics` gives API and inference p50/p95, per-route latency and row counts (Admin → System metrics) |
| Security review | ✅ | Hardcoded JWT fallback secret removed (random per process in dev; required in production). Upload content is checked (xlsx magic bytes, UTF-8 CSV, no binary), plus size, row and Mongo document limits. No secrets in git. CORS allowlist. Rate-limited login and password change |
| DB indexes and pagination | ✅ | Composite and partial indexes (migration 0003); every list endpoint uses the `{items,total,page,page_size}` envelope |
| Lighthouse ≥ 90 | ✅ | `/`, `/login`, `/app/dashboard`, desktop and mobile: performance 99–100, accessibility 100, best practices 100, SEO 100 |
| Responsive 360–1920 px, both themes | ✅ | The browser test checks for no horizontal overflow at 360 px on 15 screens, and renders the light theme |
| Tests | ✅ | pytest 109, vitest 41, browser test with 34 checks for all 3 roles and 0 console errors |
| README (setup, architecture, screenshots) | ✅ | `README.md`, `docs/screenshots/` |

## Known limitations

1. The model predicts **country-level** yields. A farm-level prediction is the national expectation for that crop and year, not a field model.
2. Tree models don't extrapolate: seasons after 2013 are predicted at the 2013 level.
3. Soil, humidity, sunlight, irrigation, fertilizer and disease analyses run on synthetic columns. They demonstrate the workflow but aren't agronomic evidence.
4. Nutrient (N/P/K) analysis needs a reference dataset, which the project doesn't have yet.
5. The AI rationale depends on the Groq key and quota. Without it, the app shows rule-based text and says so.
