# YieldSense AI — UI Layout & Design System

> **Version**: 2.1.0 · Dark-first design, CSS Modules + design tokens

## Design Principles

- **Dark-first**: The default theme is a deep green-black dark mode. Light mode is opt-in via a toggle.
- **Token-driven**: All colours, spacing, typography, and radii come from `src/styles/tokens.css`. No hardcoded hex values outside token definitions.
- **Component library**: Reusable primitives in `src/components/ui/` (Button, Card, Badge, DataTable, StatCard, etc.) and chart wrappers in `src/components/charts/`.
- **Responsive**: All screens work from 360px to 1920px+. The sidebar collapses to a hamburger menu on mobile.

## App Shell

```
┌──────────────────────────────────────────────────┐
│  TopBar: logo · context switcher · theme · bell  │
├──────┬───────────────────────────────────────────┤
│      │                                           │
│  S   │              Page Content                 │
│  i   │                                           │
│  d   │  ┌─────────┐  ┌─────────┐               │
│  e   │  │ StatCard │  │ StatCard │               │
│  b   │  └─────────┘  └─────────┘               │
│  a   │                                           │
│  r   │  ┌──────────────────────────┐            │
│      │  │      DataTable / Chart   │            │
│      │  └──────────────────────────┘            │
├──────┴───────────────────────────────────────────┤
│  Footer (landing only)                           │
└──────────────────────────────────────────────────┘
```

## Context Switcher

The top bar contains a context switcher with four dimensions:
- **Farm**: scope data to one of the user's farms (or "All farms")
- **Region**: filter by country/region
- **Crop**: filter by crop type
- **Year**: filter by year range

## Colour Tokens (Dark Theme)

| Token | Value | Purpose |
|-------|-------|---------|
| `--canvas` | `#0a0f0c` | Page background |
| `--surface` | `#111814` | Card background |
| `--ink` | `#e7eee9` | Primary text |
| `--muted` | `#8b978f` | Secondary text |
| `--primary` | `#2fbf7a` | Interactive accent |
| `--danger` | `#ef5a5a` | Error / destructive |
| `--data-water` | `#4c8df6` | Rainfall charts |
| `--data-temperature` | `#e8a33a` | Temperature charts |
| `--data-vegetation` | `#3cc47c` | NDVI / vegetation |
| `--data-model` | `#9b7bf0` | ML model metrics |

## Screen List

| Screen | Route | Role | Description |
|--------|-------|------|-------------|
| Landing | `/` | Public | Marketing page with feature cards and FAQ |
| Sign In | `/login` | Public | Full-page auth with role demo cards |
| Dashboard | `/app/dashboard` | All | KPIs, data coverage, yield ranking |
| Predictor | `/app/predict` | All | Model inputs + field conditions + what-if |
| Weather | `/app/weather` | All | Live forecast + climate trends |
| Soil | `/app/soil` | All | SoilGrids data + nutrient ratings |
| Recommendations | `/app/recommendations` | All | AI insights + task management |
| Analytics | `/app/analytics` | All | Trends, farm comparison, export |
| Dataset Explorer | `/app/dataset` | Agro/Admin | Paginated records + provenance |
| EDA | `/app/eda` | Agro/Admin | Distributions, correlations |
| Risk | `/app/risk` | All | Matrix, timeline, anomalies |
| Models | `/app/models` | Agro/Admin | Performance, ablation, model card |
| History | `/app/history` | All | Prediction history |
| Farms | `/app/farms` | All | CRUD + map + seasons |
| Data Upload | `/app/data` | Agro/Admin | CSV/XLSX wizard |
| Report | `/report/productivity` | All | Printable productivity report |
| Notifications | `/app/notifications` | All | Alerts |
| Settings | `/app/settings` | All | Profile, password, preferences |
| Users | `/app/users` | Admin | User management + audit log |

## Component Library

Core components in `src/components/ui/`:
- `Button` (primary, secondary, ghost, danger, link variants)
- `Card`, `CardHeader` (with actions slot)
- `Badge` (success, warning, danger, info, model, neutral tones)
- `DataTable` (sortable, compact, with row key)
- `StatCard` (icon, accent colour, info tooltip)
- `Input`, `Select`, `Slider`, `Toggle`
- `Banner` (info, warning, danger, success)
- `PageHeader`, `Section`, `Skeleton`, `Spinner`
- `SegmentedControl`, `Tabs`, `ConfirmDialog`
- Loading/Empty/Error states
