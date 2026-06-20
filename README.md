# Dark Energy

A customer **intelligence layer** over residential energy telemetry.
*Less cost. More loyalty. Zero disruption.*

Dark Energy turns per-device energy data (PV, battery, heat pump, EV, household
load) into **forecasts, anomaly detection, and AI-phrased, actionable advice**,
served through an API for a separate per-household dashboard with live updates.

It ships as a thin but complete slice of the platform: real-time streaming
(device simulators → ingest API), an ETL/analytics layer, explainable
forecasting + anomaly detection, a pluggable AI phrasing layer, mocked-but-real
control actions, an API backend, and a separate React dashboard using SSE.

## Capabilities

| Capability | Where |
|---|---|
| Real-time streaming for devices | `darkenergy/ingest/` + `darkenergy/simulators/` |
| ETL over energy usage & production | `darkenergy/analytics/metrics.py` |
| Bill forecasting & anomaly detection | `darkenergy/analytics/{forecast,anomalies}.py` |
| AI layer: insights → user-friendly feedback + actions | `darkenergy/ai/` |
| Per-household dashboard (insights, forecast, actions) | `frontend/` + `darkenergy/web/` API |

### Design principles
- **One unified telemetry schema** (`models.TelemetryRecord`) is written by both
  the seed loader and the live ingest endpoint, so analytics is completely
  source-agnostic — it never knows whether a row is historical or streamed.
- **Format-driven, not dataset-specific.** The bundled `enpal-track-dataset/` is
  treated as *one instance of a format*. Household IDs, the year, and the time
  range are all derived from the loaded data — point `DARKENERGY_DATASET_DIR` at
  a differently-dated dataset and everything still works.
- **The LLM only rephrases facts, never invents numbers.** ETL/forecast/anomaly
  compute every figure; the AI layer rewords a structured `FactBundle`, and a
  post-generation grounding check rejects any number not in the source facts
  (falling back to deterministic templates).
- **Per-household tenant separation.** Every query is scoped by `household_id`;
  the SSE event bus is keyed per household.
- **Graceful degradation.** A home with no battery/heat-pump/EV (HH-1004) hides
  the irrelevant cards and skips the inapplicable detectors and actions.

## Quick start

```bash
python3 -m venv .venv
.venv/bin/pip install -e ".[dev]"        # add ".[claude]" / ".[openai]" for LLM phrasing
(cd frontend && npm install)

.venv/bin/darkenergy seed                 # load the dataset into data.db (~140k rows)
.venv/bin/darkenergy serve                # FastAPI API backend on :8000
(cd frontend && npm run dev)              # React frontend on :5173
```

Open <http://localhost:5173> and pick a household. In another terminal, stream
live device data into it:

```bash
.venv/bin/darkenergy sim --household HH-1001 --devices all --speed 60 --clock rebase
```

The status card ticks via SSE; the insights feed shows the heat-pump anomaly,
cheapest-charging-window nudge, and bill-spike insight; the action buttons
return a mocked effect inline and over the live stream.

## Frontend

The UI is a React + TypeScript Vite app in `frontend/`. Everything frontend
related, including `package.json`, Vite config, TypeScript config, source, and
build output, lives there. It talks to the Python backend through JSON endpoints
under `/api`, plus the existing action and SSE routes.

```bash
cd frontend
npm run dev       # Vite on :5173, proxying /api to :8000
npm run build     # production bundle in frontend/dist
```

For a deployed frontend served from a different origin, set
`VITE_API_BASE_URL` to the backend origin before building.

## AI phrasing backends

Default is a deterministic template phraser (no API key). To have an LLM phrase
the insights instead:

```bash
DARKENERGY_PHRASER_BACKEND=claude  ANTHROPIC_API_KEY=...  .venv/bin/darkenergy serve
DARKENERGY_PHRASER_BACKEND=openai  OPENAI_API_KEY=...      .venv/bin/darkenergy serve
```

Both go through the same `Phraser` protocol and the same number-grounding
post-check, so the guarantee holds regardless of provider. If a backend's SDK or
key is unavailable, it falls back to the template phraser.

## Tests

```bash
.venv/bin/python -m pytest
```

The suite verifies metrics reproduce the ground-truth `monthly_bills.json`, the
detectors reproduce the seeded `insight_events.json`, the ingest merge holds the
energy-balance invariant, and the phraser never surfaces an ungrounded number.

## Configuration

All settings are environment variables prefixed `DARKENERGY_` (see
`darkenergy/config.py`): `DB_PATH`, `DATASET_DIR`, `PHRASER_BACKEND`,
`CLAUDE_MODEL`, `OPENAI_MODEL`, `HOST`, `PORT`, `BALANCE_EPSILON_KW`.
