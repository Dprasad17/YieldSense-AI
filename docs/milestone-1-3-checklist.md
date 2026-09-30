# Milestones 1–3 checklist

Status as of 30 September 2026 (branch `DURGA-PRASAD-A`). Each item is checked against the project specification (`docs/YieldSense_AI_Project_Specification.md`). An item is marked **Done** only when it works end to end on the real data in PostgreSQL/MongoDB, and a test is named where one exists. Milestone 4 (Docker, cloud deployment, CI/CD) is out of scope.

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
| Leakage removed | ✅ | NDVI excluded (derived from yield). `total_days` excluded since v2.1: it is a fixed per-crop base ± 10 random days, so it only re-encoded the crop. No synthetic column passed the permutation-importance check. The model uses 6 real inputs: crop, region, year, rainfall, temperature, pesticides |
| Evaluate accuracy (MAE, RMSE, R², MAPE, latency, coverage) | ✅ | Random, temporal (train ≤ 2008, test 2009–2013) and unseen-region splits, stored in `models/v2/model_card.json` and shown on Model Performance |
| Served model | ✅ | XGBoost v2.1.0 (raw target) on the temporal split: R² 0.9528, RMSE 2,065 kg/ha, MAE 1,099 kg/ha, MAPE 20.3%, p50/p95 5.6/7.0 ms. Before (v2.0.0, with `total_days`): R² 0.9514, RMSE 2,096, MAE 1,125, MAPE 21.5%. The Keras MLP scores slightly better (RMSE 2,042) but is not served because it would add TensorFlow to the API |
| Prediction interval | ⚠️ | Split-conformal P10–P90. Held-out check: calibrated on 2009–2010 (2,487 rows), evaluated on 2011–2013 (3,764 rows): coverage 74.5% against the nominal 80%, mean width 2,523 kg/ha. The band is a little too narrow; both numbers are on Model Performance |
| AI model inference, yield forecasting | ✅ | `POST /api/predict` (saved) and `/what-if` (not saved); a test checks the API against the bundle's own output |
| Harvest / production estimation | ✅ | With a farm selected, the Predictor shows predicted yield × farm area, in tonnes, with the P10–P90 range |
| Prediction reports | ✅ | Printable prediction report (`/report/prediction`) and server-side history with compare and re-run |
| Weather analysis: rainfall, temperature, climate trend | ✅ | Dataset weather scores, live forecast, ERA5 yearly trend with °C/decade and mm/decade slopes |
| Weather impact assessment | ⚠️ | Heat risk varies by year and is shown on the risk timeline. Drought and flood use rainfall, which is one long-term value per country (verified: 1 distinct value in each of 101 regions), so they are labelled climate-zone (structural) risks and left off the yearly timeline. Rainfall has no model-estimated kg/ha impact, and the Predictor has no rainfall what-if |
| Soil quality / fertility assessment | ✅ | Per farm, from ISRIC SoilGrids 2.0 (pH, organic carbon, nitrogen, clay, sand, CEC; 0–30 cm weighted mean, cached in MongoDB) plus the farm's soil tests. Shown on the farm page and the Soil page as "Real · SoilGrids". If SoilGrids is down the page shows the error; it never substitutes synthetic values. The reference-dataset soil view remains and is labelled synthetic |
| Nutrient analysis | ✅ | Soil tests are rated Low/Medium/High against Soil Health Card limits: N 280/560 kg/ha, P 10/25 kg P/ha, K 120/280 kg K/ha, organic carbon 0.5/0.75 %, with fertilizer guidance. P and K are treated as elemental and the oxide equivalents are shown; the unit basis of the national table could not be confirmed from an official source, and some state charts differ (TNAU: N 240/480, P 11/22, K 110/280) |
| Soil suitability recommendations | ⚠️ | Crop ranking per farm from real pH (soil test or SoilGrids), organic carbon and CEC. The per-crop pH ranges are general agronomic guides, not a cited dataset |
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
| Health and system metrics | ✅ | `/api/health` checks DB, Mongo, model; `/api/admin/metrics` and Admin → System metrics show API and inference p50/p95, per-route latency and row counts |
| Security review | ✅ | Hardcoded JWT fallback secret removed (random per process in dev; required in production). Upload content is checked (xlsx magic bytes, UTF-8 CSV, no binary), plus size, row and Mongo document limits. No secrets in git. CORS allowlist. Rate-limited login and password change |
| DB indexes and pagination | ✅ | Composite and partial indexes (migration 0003); every list endpoint uses the `{items,total,page,page_size}` envelope |
| Lighthouse ≥ 90 | ✅ | `/`, `/login`, `/app/dashboard`, desktop and mobile: performance 97–100, accessibility 100, best practices 100, SEO 100 |
| Responsive 360–1920 px, both themes | ✅ | The browser test checks for no horizontal overflow at 360 px on 15 screens, and renders the light theme |
| Tests | ✅ | pytest 118, vitest 41, browser test with 37 checks for all 3 roles and 0 console errors |
| README (setup, architecture, screenshots) | ✅ | `README.md`, `docs/screenshots/`, `docs/system_architecture.md`, `docs/ui_layout.md`, `docs/YieldSense.postman_collection.json` (60 requests) |

## Performance metrics (spec section 8)

| Metric | Status | Measured |
| --- | --- | --- |
| Prediction accuracy, MAE, RMSE | ✅ | Temporal split: R² 0.9528, MAE 1,099, RMSE 2,065 kg/ha |
| Model inference time | ✅ | 5.6 ms p50 / 7.0 ms p95 in training; 8.1 / 14.0 ms through the live API |
| Weather impact prediction accuracy | ⚠️ | Ablation on the temporal split (XGBoost, raw target). Without temperature: RMSE +13 (2,078), R² −0.0006. Without rainfall: RMSE +131 (2,197), R² −0.0061. Without both: RMSE +97 (2,163), R² −0.0045. Temperature adds almost nothing; rainfall's effect is a country effect because it is constant per country |
| Recommendation effectiveness | ⚠️ | Tracked in Admin → System metrics: 1 of 4 tasks done (25%), median 0.24 h from alert to first action. Yield outcomes after completed tasks: none yet. Measuring real effectiveness needs several seasons per farm |
| Dashboard response time | ✅ | Lighthouse LCP 0.6 s desktop, 2.1 s mobile |
| API latency | ✅ | 54 ms p50 / 294 ms p95 over 444 requests (browser-test run) |
| Data processing speed | ✅ | Seed: 28,242 rows in 2.0 s (14,139 rows/s). Upload validation: 2.9 ms per row. Upload import: 64 rows/s. The upload figures come from two very small files, so they are dominated by fixed overhead |

## Known limitations

1. The model predicts **country-level** yields. A farm-level prediction is the national expectation for that crop and year, not a field model.
2. Tree models don't extrapolate: seasons after 2013 are predicted at the 2013 level.
3. Humidity, sunlight, irrigation, fertilizer and disease analyses, and the reference-dataset soil view, run on synthetic columns. Farm soil uses real SoilGrids data and soil tests.
4. SoilGrids is a 250 m global model, not a field measurement, and it has no data for urban pixels or water; the nearest pixel with data is used and the page says so. The public API is slow (about 10 s uncached) and sometimes times out. `scripts/seed.py` pre-warms the cache for the three demo farms (live fetch, or the saved snapshot of SoilGrids' real responses in `datasets/processed/soilgrids_demo_farms.json` if the API is down); new farms still wait on the live API the first time.
5. Rainfall is constant per country in the dataset, so the app cannot show a year-to-year rainfall effect.
6. The AI rationale and insight depend on the Groq key and quota. Without it, or when the reply is malformed, the app shows rule-based text and labels it as a fallback.

## Deviations from spec

- **CSS Modules instead of Tailwind.** The app uses CSS Modules with a design-token file (`tokens.css`) for light and dark themes.
- **React + Vite instead of Next.js.** The spec allows either; a single-page app behind FastAPI needs no server rendering.
- **FastAPI only.** Flask, the spec's alternative, is not used.
- **Yearly instead of seasonal.** The dataset has one row per country, crop and year and no within-year data, so trends and reports are yearly.
- **USDA data not used.** The FAOSTAT-based dataset already covers 101 countries; USDA data is US-only and would need a separate harmonisation step for crops and units. It would mainly add US state-level detail.
- **Production = yield × farm area.** The dataset has no harvested-area or production column, so harvest estimates use the farm's own area.
- **TensorFlow in training only.** The Keras MLP is trained and evaluated but the served model is XGBoost; TensorFlow is in `requirements-train.txt`, not the API runtime.
