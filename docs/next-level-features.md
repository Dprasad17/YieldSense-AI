# Next-level features (v3.0)

Everything below is implemented, tested and documented. For each feature the table gives where it lives, how it was checked, and whether it needs a key or account. Features that need one stay switched off, and the app works without them.

| # | Feature | Where | Verified | Needs |
| --- | --- | --- | --- | --- |
| 1 | Dataset 1990–2023 with real year-by-year rainfall and temperature | `scripts/build_dataset_v3.py` | Rebuilt from source; model gate passes | — |
| 2 | Yield-history model inputs and better accuracy | `history_features.py`, `train_models_v2.py` | Validation gate, tests | — |
| 3 | "Why this prediction" explanations (TreeSHAP) | Predictor | Contributions add up to the prediction (test) | — |
| 4 | Ask YieldSense AI assistant | `/app/assistant` | Test with mocked LLM; live check with Groq | `GROQ_API_KEY` (already set) |
| 5 | Satellite crop health (NASA MODIS NDVI) | Farm page | Test with mocked service; live check (26 s first load, then cached) | — |
| 6 | Market and revenue per crop | `/app/market` | Test; live check | — |
| 7 | Leaf-photo disease check (ONNX) | `/app/leaf-check` | Test with a real image through the model | — |
| 8 | Installable app (PWA) with offline shell | `manifest.webmanifest`, `sw.js` | Production build | — |
| 9 | Interface in Hindi, Kannada, Telugu and Tamil | Settings → Language | Browser test switches to Hindi | — |
| 10 | Weekly digest by email and SMS/WhatsApp | Settings → Weekly digest | Test with mocked senders | SMTP and/or Twilio |
| 11 | Google sign-in (OAuth 2.0 / OpenID Connect) | Sign-in page | Test with mocked Google | `GOOGLE_CLIENT_ID` |
| 12 | API-wide rate limit | Middleware | Test | — |
| 13 | Error tracking | Backend | Starts only with a DSN | `SENTRY_DSN` |
| 14 | Model registry, drift monitoring, scheduled retraining | Model performance; `retrain.yml` | Tests; PSI unit test | — |
| 15 | Uptime monitor and weekly digest schedule | `schedules.yml` | Workflow syntax | Repository variable `PUBLIC_URL`, secret `CRON_TOKEN` |

## 1–2. Data to 2023 and a stronger model

The old dataset was Kaggle `yield_df.csv`, which ran to 2013. Its rainfall was a single long-term value per country, so it never changed between years.

`scripts/build_dataset_v3.py` rebuilds the dataset from the original public sources:

- **Yields:** FAOSTAT crops and livestock products (QCL), up to 2023.
- **Pesticides:** FAOSTAT Pesticides Use.
- **Rainfall and temperature:** CRU TS 4.08 country averages for each year, from the World Bank Climate Change Knowledge Portal.
- **Coverage:** the same 101 countries and 10 crops, one row per country, crop and year, giving **19,834 rows**.
- **Field-condition columns:** generated exactly as before and still labelled synthetic.

The model has two new inputs, both known before the season starts:

- the country's **previous-season yield**;
- the **mean of the last three seasons**.

When a farm has its own figures, they replace the national values.

Model selection now picks the **lowest MAE** among models the API can serve. RMSE is dominated by a few very high-yield root crops (20–40 t/ha), so MAE better reflects the typical error.

The served model is XGBoost trained on a log scale. Both versions were tested on the years after their training data:

| Version | Test | R² | RMSE (kg/ha) | MAE (kg/ha) | MAPE | P10–P90 coverage (nominal 80%) |
| --- | --- | --- | --- | --- | --- | --- |
| v2.1 | 2009–2013 (trained ≤ 2008) | 0.953 | 2,065 | 1,099 | 20.3% | 74.5% |
| **v3.0** | **2018–2023 (trained ≤ 2017)** | **0.936** | **2,587** | **884** | **13.6%** | **81.9%** |

The typical error dropped by 20% (MAE) and 33% (MAPE), and the P10–P90 range now meets its target. RMSE and R² are slightly worse because the test is harder: six years ahead instead of five, on more recent and higher yields.

The weather ablation is reported honestly. Once the yield history is in the model, rainfall and temperature add little. Without both the error is slightly higher; without either one alone it is slightly lower.

Drought and flood risks now use each year's rainfall, so they appear on the yearly risk timeline. The Predictor's what-if panel has a rainfall slider.

`scripts/validate_model.py` gates every retraining with these minimums: R² ≥ 0.92, RMSE ≤ 2,900, MAE ≤ 1,000, coverage ≥ 0.75, p95 latency ≤ 50 ms. Current results: R² 0.9415, RMSE 2,481, MAE 857, coverage 0.819, p95 8 ms.

## 3. Explanations

Every prediction and what-if returns `explanation`, which holds:

- the model's base value;
- one contribution per input, computed exactly by XGBoost (`pred_contribs`, TreeSHAP);
- the yield-history values the prediction used.

The Predictor shows these as a "Why this prediction" bar chart. The card states clearly that it explains the model, not the field.

## 4. Ask YieldSense

`POST /api/assistant/ask` builds a context block on the server from the user's own data:

- farms;
- the top risks and next-season forecast for each farm's crops;
- the latest five predictions;
- open tasks.

It then asks Groq to answer only from those facts, in the user's language. Conversations are stored per user in MongoDB `assistant_chats`, and the user can clear them. Without `GROQ_API_KEY` the page explains that the assistant is unavailable.

## 5. Satellite crop health

`GET /api/farms/{id}/ndvi` uses NASA MODIS Terra MOD13Q1 NDVI (250 m, 16-day composites) from the ORNL DAAC web service, which is public and needs no key. It:

- compares the last 12 months with the same months a year earlier;
- returns Healthy, Watch or Below normal.

The service is slow, so:

- the farm page loads the data only when asked;
- chunks are cached in MongoDB (`satellite_cache`): past periods for 180 days, the newest for 8 days.

## 6. Market and revenue

`GET /api/market/crop-economics?region=…` or `?farm_id=…` returns, for each crop:

- the predicted yield for next season;
- the FAOSTAT producer price (USD per tonne, latest year since 2015);
- the gross revenue per hectare and for the farm, with a P10–P90 range.

Where a country has no recent price, the cross-country median is used and labelled as such; India, for example, has no FAOSTAT USD price after 2008. Costs are not in the data, so the page says clearly that this is **not profit**.

## 7. Leaf check

`POST /api/disease/classify` runs a MobileNetV2 model (ONNX, 9 MB) fine-tuned on PlantVillage. It covers 38 classes across 14 plants, including maize, potato, soybean and tomato, and is reported as 95.4% accurate on that dataset. The response gives:

- the top 3 classes;
- a confidence flag (below 60% shows "Not sure, retake the photo");
- treatment guidance.

It is labelled as a first check, not a diagnosis. The page opens the phone camera directly.

## 8–9. Installable app and languages

The web app installs on Android, iOS and desktop. The service worker:

- caches the app shell and the hashed assets;
- serves the last API responses when offline;
- deletes those cached responses on sign-out, so a shared phone doesn't leak data.

Menus and page titles are available in English, हिन्दी, ಕನ್ನಡ, తెలుగు and தமிழ். The assistant answers in whatever language the question is in.

## 10. Weekly digest

Users opt in under Settings → Weekly digest (email, SMS or WhatsApp, plus a phone number). The digest contains:

- unread alerts;
- open tasks;
- the top risk for each farm crop, with what to do about it.

To switch channels on, set these on the server:

- **Email:** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Any SMTP provider works, e.g. Gmail with an app password, or Brevo's free tier.
- **SMS or WhatsApp:** `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`. For the Twilio WhatsApp sandbox, use `whatsapp:+14155238886`.

`POST /api/admin/digests/send` sends to everyone who opted in. An administrator can call it, and so can the scheduled workflow, which sends the `X-Cron-Token` header (`CRON_TOKEN`).

## 11. Google sign-in

1. In Google Cloud Console, go to APIs & Services → Credentials → Create OAuth client ID → Web application.
2. Add the app's address (e.g. `https://yieldsense-ai-hilr.onrender.com`) under Authorised JavaScript origins.
3. Set `GOOGLE_CLIENT_ID` on the server.

The sign-in page then shows "Continue with Google". The server verifies the ID token with Google (audience, issuer, expiry and verified email). It reuses an account with the same email, or creates a Farmer account.

## 12–13. Platform protection

- **Rate limit:** `RATE_LIMIT_PER_MINUTE` (default 600) per signed-in user, or per IP without a token, for all `/api` routes except health. Over the limit the API returns 429 with `Retry-After`. CI sets it to 0 for the load test.
- **Sentry:** set `SENTRY_DSN` to turn it on. No personal data or request bodies are sent.

## 14–15. Model operations and schedules

- **Registry:** `models/registry.json` records every trained version, with its data window, metrics and held-out coverage.
- **Drift:** `/api/admin/model-monitoring` reports drift as PSI on recent prediction inputs against the training data, and the share of crop/region pairs the model never saw. It recommends retraining on drift, or when the records include a year after the model's training data. This is shown on the Model performance page.
- **`.github/workflows/retrain.yml`** runs quarterly or manually. It rebuilds the dataset, trains, runs the validation gate, and uploads the model for review. It never deploys automatically.
- **`.github/workflows/schedules.yml`** runs:
  - an uptime check every 30 minutes, which fails and sends an email when `/api/health` isn't healthy;
  - the Monday digest.

  It needs the repository variable `PUBLIC_URL` and, for digests, the secret `CRON_TOKEN`. GitHub runs scheduled workflows on the **default branch** only.

## Tests

- **Backend:** 142 passed, including `backend/tests/test_intelligence.py` with 11 tests for the features above.
- **Frontend:** 41 vitest tests.
- **Browser test:** 39/39 with 0 console errors. It now also covers the assistant, market, leaf check, satellite panel, language switch, explanation card and model registry.
- **Container:** the single-container image with a 512 MB limit uses 219 MB idle and 254 MB after a leaf check and predictions.
