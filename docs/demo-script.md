# Demo script (about 8 minutes)

A tested path through the platform for the final demonstration. It works on the local Docker stack (http://localhost) or on the deployed site.

## Before the demo

1. Start the stack: `docker compose --env-file .env.docker up -d` and wait until `docker compose --env-file .env.docker ps` shows every service as **healthy**.
2. Open http://localhost/api/health and check that it reports `"status": "healthy"`.
3. Open the site in a private window so no earlier session is signed in.
4. Keep `docs/presentation/YieldSense_AI_Final_Presentation.pptx` open on slide 15.

Demo accounts: `farmer / farmer123`, `agronomist / agro123`, `admin / admin123` (one-click buttons on the sign-in page).

## Path

| # | Do | Show and say |
| --- | --- | --- |
| 1 | Open http://localhost | Landing page; the accuracy claim states the temporal split |
| 2 | Sign in → **Farmer** | Dashboard: real figures from 28,242 records; the product tour can be skipped |
| 3 | Context bar → Farm **Green Valley Farm** | Every screen now follows Farm · Region · Crop · Year |
| 4 | **Yield Predictor** → Predict | Six model inputs; predicted yield with the P10–P90 range, harvest in tonnes for the farm, AI or fallback label on the insight |
| 5 | What if? → temperature +2 °C | The estimate moves; rainfall is deliberately not a what-if (constant per country) |
| 6 | **Risk assessment** | Matrix, timeline without drought/flood (structural), anomalies, mitigation |
| 7 | **Soil** | "Real · SoilGrids" panel for the farm, crop suitability, nutrient ratings with fertilizer guidance |
| 8 | **Recommendations** → create a task on one card | Evidence, model-estimated impact (or why it is not estimated), task saved |
| 9 | **Analytics & Reports** → Print report | Trend with next-year forecast; printable productivity report |
| 10 | Sign out → **Agronomist** → **Model performance** | All models × 3 splits, selection rule, held-out coverage, ablation, v2.0 → v2.1 |
| 11 | Sign out → **Admin** → Users & roles → **System metrics** | API and inference latency, recommendation effectiveness, data processing speed |
| 12 | Optional: http://localhost/docs | Interactive API documentation (60 operations) |

## If something goes wrong

| Problem | Recovery |
| --- | --- |
| Soil panel shows an error | SoilGrids is slow; use Green Valley Farm (pre-cached) or retry |
| AI insight shows "Fallback" | Expected without a Groq key or when Groq is slow; the label is the point |
| Page shows "Something went wrong" | Reload; check `docker compose --env-file .env.docker logs api --tail 50` |
| Containers not healthy | `docker compose --env-file .env.docker restart` and wait for healthy |
