# WindLens — day-ahead wind forecast confidence

WindLens is a decision-support web app for a UK utility's day-ahead procurement desk. It answers two tightly scoped questions for **January 2026** using Elexon data only:

1. What national wind forecast was actually available at the chosen T−1 decision cutoff?
2. How accurate was that decision-time forecast versus wind outturn?

It deliberately does **not** calculate a purchase quantity, price forecast, or trading order. Demand, portfolio position, risk limits, prices and the desk's market-gate convention remain outside this first release.

## Client pitch

The usual forecast chart is easy to misread after the event: it often shows a revised forecast that the buyer could not have seen. WindLens makes the time boundary explicit. Select a January delivery day and your desk's prior-day cutoff; then the app freezes the last eligible wind run, overlays it with actual wind, and shows the miss in MW.

This turns a vague caveat—"wind can be wrong"—into usable risk context:

- **MAE** gives the typical half-hourly miss.
- **Bias** shows whether this decision view systematically over- or under-forecast wind; negative bias means the forecast was short on wind.
- **P90 absolute error** is a transparent, tail-risk guardrail for the desk to combine with its own reserve policy.
- Clicking a period exposes the exact publication timestamp behind that point, so the result is auditable.

The product is intentionally narrow: no proprietary inputs and no hidden model. It is a fast evidence layer the buyer can use before making their authorised day-ahead decision.

## Data and methodology

Data is requested live from Elexon's public Insights API (no key):

- `FUELHH` / `stream`, filtering `fuelType = WIND`, provides national half-hourly actual generation.
- `WINDFOR` forecast evolution provides all historical forecast versions for a target delivery hour.

For each delivery hour, the service selects the newest `WINDFOR.publishTime` at or before the chosen previous-day UK-local cutoff. It duplicates that hourly forecast across the two matched `FUELHH` half-hours and scores `forecast − actual`. This is an explicit resolution assumption: the current WINDFOR evolution endpoint returns hourly target points, while FUELHH is half-hourly. UK-local time is converted with `Europe/London`, so daylight-saving transitions are not silently treated as UTC.

The default 11:00 cutoff is a **configurable desk assumption**, not a claim about a specific auction's gate closure. Confirm the utility's product, exchange and operational cutoff before use.

Metrics: MAE, RMSE, signed bias, MAPE (zero actuals excluded), percentage of periods under-forecast, and empirical P90 absolute error. Metrics are descriptive sample statistics, not probabilistic confidence intervals.

Sources: [Elexon Insights API developer portal](https://developer.data.elexon.co.uk/) and [WINDFOR latest endpoint documentation](https://bmrs.elexon.co.uk/api-documentation/endpoint/forecast/generation/wind/latest). The app uses the API base `https://data.elexon.co.uk/bmrs/api/v1`.

## Technical handover

```text
React / Vite browser UI
        │ GET /api/decision-view?delivery_date&cutoff_hour
        ▼
FastAPI decision-time selector
  ├── FUELHH actuals (WIND only, 30 min)
  └── WINDFOR evolution (one request per target hour)
        │ select latest publishTime <= T−1 cutoff
        ▼
aligned observations → metric calculator → auditable JSON → chart / inspection panel
```

The frontend is a responsive React/Vite single page using Recharts. It has no data logic beyond presentation. The FastAPI backend is the trust boundary: it calls Elexon, applies the as-of rule, aligns the resolution, and returns points plus metrics. The logic is covered by focused tests for future-data exclusion, cutoff computation and metric sign convention.

For a production hardening phase, add a persistent cache of Elexon responses keyed by `delivery_date` / `cutoff`, retries and rate limits, structured observability, authentication/authorisation, agreed market-gate configuration, source freshness checks, and an approved data-retention policy. The present in-memory/no-cache approach favours a transparent first version over operating efficiency.

## Run locally

Prerequisites: Docker Desktop.

```bash
docker compose up --build
```

Open `http://localhost:5173` for the Vite development UI. The API is at `http://localhost:8000` (`/docs` has the OpenAPI explorer). For a production-like, single-container build:

```bash
docker build -t windlens .
docker run --rm -p 8000:8000 windlens
```

Then open `http://localhost:8000`. The React build is served by FastAPI.

If external Elexon access is unavailable, set `DEMO_MODE=true` for a clearly labelled deterministic offline walkthrough; do not use it for analysis.

## Repository contents

```text
.
├── backend/
│   ├── main.py              FastAPI service, Elexon retrieval and scoring logic
│   ├── requirements.txt     Pinned Python runtime and test dependencies
│   └── tests/test_main.py   Unit tests for cutoff, forecast selection and metrics
├── frontend/
│   ├── src/main.jsx         React dashboard and API client
│   ├── src/styles.css       Responsive dashboard styling
│   ├── index.html           Vite entry document
│   ├── package.json         Frontend scripts and dependencies
│   └── package-lock.json    Locked frontend dependency graph
├── Dockerfile               Production multi-stage frontend/backend image
├── docker-compose.yml       Local UI + API development services
├── Procfile                 Heroku process definition
├── heroku.yml               Heroku container build definition
├── VIDEO_DEMO_GUIDE.md      Screen-only customer and technical demo script
├── .dockerignore            Docker build exclusions
└── .gitignore               Local/generated-file exclusions
```

## Test and build

```bash
python -m pip install -r backend/requirements.txt
PYTHONPATH=backend pytest backend/tests -q
cd frontend && npm install && npm run build
```

## Deployment

The repository is prepared for Heroku Container Registry (`Dockerfile`, `Procfile`, and `heroku.yml`):

```bash
heroku container:push web --app <your-app-name>
heroku container:release web --app <your-app-name>
```

Set `CORS_ORIGINS` if separating the UI from the API. A live deployment requires the client's Heroku/Vercel account and app name, which are not available in this workspace. Do not enable `DEMO_MODE` in a client deployment.

### Live application

**Deployment URL:** to be added after the Heroku app is created and the release health check succeeds. Do not submit this repository until this line contains the verified `https://<anonymous-app-name>.herokuapp.com` URL.

## AI assistance disclosure

This first version was developed with OpenAI Codex as an AI coding assistant. It assisted with implementation, interface copy, tests and documentation; the Elexon API approach and output must still be reviewed and accepted by the utility's market and engineering owners before operational use.
