# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Motolap은 모터사이클 랩 텔레메트리 분석 웹앱입니다. AIM CSV 데이터를 파싱하여 랩 비교, 코너 분석, 실시간 차트를 제공합니다.

## Development Commands

```bash
# Frontend (frontend/)
npm run dev          # Vite dev server (localhost:5173)
npm run build        # tsc -b && vite build
npm run lint         # ESLint

# Backend (backend/)
npx wrangler dev     # Cloudflare Worker dev server (localhost:8787)
npx wrangler deploy  # Deploy to Cloudflare

# mise tasks (root)
mise run dev:frontend
mise run dev:backend       # includes sync-logic
mise run sync-logic        # rsync analysis/ → backend/src/logic/
```

### Environment Variables

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:8787
VITE_CORNER_API_URL=<lambda-url>
VITE_GOOGLE_MAPS_API_KEY=<google-maps-key>
VITE_GEMINI_API_KEY=<gemini-key>
VITE_GOOGLE_CLIENT_ID=<google-oauth-client-id>
```

**Backend** (`backend/.dev.vars`):
```
GEMINI_API_KEY=<gemini-key>
LAMBDA_URL=<lambda-url>
LAMBDA_TOKEN=<lambda-token>
JWT_SECRET=<jwt-signing-secret>
GOOGLE_CLIENT_ID=<google-oauth-client-id>
FRONTEND_URL=<frontend-origin-for-cors>
```

## Architecture

### Monorepo Layout

- `frontend/` — React 19 + TypeScript + Vite + Tailwind v4 + Recharts
- `backend/` — Cloudflare Workers (Python) + D1 (SQLite)
- `analysis/` — Python corner detection research code (source of truth)
- `lambda/` — AWS Lambda corner detection service (synced from analysis/ via mise)

### Frontend Architecture

**No router, no Redux.** View state is a simple state machine in `App.tsx`: `'landing' | 'list' | 'upload' | 'analysis'`. All session state lives in App-level `useState`. Google OAuth authentication via `AuthContext` wraps the app; `useAuth()` provides user info for user-scoped session storage.

**Data flow:**
1. CSV upload → `aimParser.ts` (parse + metadata extraction) → `cornerDetection.ts` (client-side) → `SessionData`
2. Session saved to IndexedDB via `sessionStorage.ts` (DB: `motolap-sessions`, stores: `sessions`, `reports`)
3. Analysis mode: `alignLaps()` creates `AnalysisPoint[]` (distance-based interpolation, time delta)
4. All chart state managed by `useAnalysisState` hook — lap selection, zoom/brush, hover, playback, corner ranges
5. Sessions can be loaded from IndexedDB via `sessionReconstruct.ts` (re-runs lap segmentation, corner detection, metrics)

**Chart system uses a registry pattern:** `chartRegistry.ts` declares all charts with `defaultVisible`. Two types: dedicated components (DeltaChart, ThrottleBrakeChart, etc.) and `FlexibleLineChart` for simple metrics. `AnalysisChartWrapper` provides common features (corner range overlays, drag state, zoom sync, double-click expand to modal). All time-series charts use `YAxis width={40}` and `margin={{ top: 5, right: 30, left: -20, bottom: 0 }}` for X-axis alignment.

**Key point labels:** `keyPoints.ts` provides a pipeline: `findCornerKeyPoints()` (per-corner max/min) or `findKeyPoints()` (prominence-based) -> `adjustKeyPointsForLines()` (avoid line overlap using other lines' Y values) -> `resolveKeyPointPositions()` (prevent nearby label collision).

**I18n:** `frontend/src/i18n/` with `context.tsx` (locale provider), `types.ts` (translation keys), `ko.ts`/`en.ts`. Locale toggle: `'en' | 'ko'`. All UI strings go through `useTranslation()` hook.

### Critical Time/Distance Convention

- `AnalysisPoint.refTime`, `anaTime`, and `Corner.start_time` / `end_time` are **absolute session times** (seconds from session start, not from lap start)
- Laps are distance-normalized to start at 0 for alignment
- G-force auto-detection: if max value > 2.0, treats as m/s² and converts to G
- Distance unit auto-detection in `alignLaps()`: if maxDist > 100, treats as meters and converts to km

### CSV Column Detection Gotcha

`aimParser.ts` uses alias lists with exact match first, then partial match (`includes`). **Alias order matters** — a short alias like `LonG` can partial-match `GPS Longitude` (coordinate) instead of the intended `GPS LonAcc` (acceleration). GPS-specific aliases (`GPS LonAcc`, `GPS LatAcc`) must come before short aliases (`LonG`, `LatG`) in the alias arrays.

### Corner Detection (Dual Implementation)

**Frontend (JS):** Speed-peak based + lateral G auxiliary. Constants: `MIN_SPEED_DROP=5kph`, `LAT_G_THRESHOLD=0.3`, `PEAK_PROMINENCE=5kph`. Segments between speed maxima = corners. `detectCornersForSession` uses median-duration reference lap and GPS spatial matching for consistent corner IDs across laps.

**Backend (Python):** Hybrid intensity (gyro_z + accel_y + curvature) with hysteresis segmentation. This is the more advanced implementation in `analysis/seperate_corners/corner_detection/`.

### Key Files

| File | Role |
|------|------|
| `frontend/src/types.ts` | All type definitions (LapData, Corner, Lap, SessionData, Track types) |
| `frontend/src/utils/aimParser.ts` | CSV parsing with column alias detection and metadata extraction |
| `frontend/src/utils/analysis.ts` | `alignLaps()` — distance interpolation, delta calculation, G calibration |
| `frontend/src/utils/cornerDetection.ts` | Client-side corner detection + cross-lap spatial matching |
| `frontend/src/utils/lapSegmentation.ts` | Beacon marker-based lap splitting |
| `frontend/src/utils/sessionStorage.ts` | IndexedDB persistence (`idb` library) — save/load/list sessions |
| `frontend/src/utils/sessionReconstruct.ts` | Rebuild full SessionData from stored data (re-runs detection pipeline) |
| `frontend/src/utils/formulaMetrics.ts` | Client-side boolean channels + lap metrics computation |
| `frontend/src/utils/lapFilter.ts` | `getOutlierLapIndices()` (>10% from avg), `pickBestLap()` |
| `frontend/src/utils/trackMatcher.ts` | GPS-based track identification against known tracks DB |
| `frontend/src/utils/keyPoints.ts` | Key point detection + label positioning pipeline |
| `frontend/src/utils/smoothing.ts` | Gaussian smoothing for G-force and Gyro (PRY) fields |
| `frontend/src/utils/apiClient.ts` | JWT Bearer token management for authenticated API calls |
| `frontend/src/auth/AuthContext.tsx` | Google OAuth context (GSI integration, JWT token exchange) |
| `frontend/src/components/UserMenu.tsx` | User profile menu (login/logout) |
| `frontend/src/components/Analysis/useAnalysisState.ts` | Central analysis state hook (lap selection, zoom, playback, hover) |
| `frontend/src/components/Analysis/chartRegistry.ts` | Chart configuration registry with `defaultVisible` flag |
| `frontend/src/components/Analysis/AnalysisChartWrapper.tsx` | Shared chart wrapper (corner ranges, interactions) |
| `frontend/src/components/Analysis/AnalysisDashboard.tsx` | Main analysis view (map, G circle, charts, activity panel) |
| `frontend/src/components/Analysis/ReferenceSelector.tsx` | REF lap source: current session / saved session / CSV upload |
| `backend/src/entry.py` | Worker entry point — CORS proxy to Lambda, D1 integration, Gemini reports, JWT auth |
| `backend/schema.sql` | D1 schema: Users, Sessions, Corners (driving_json), LapMetrics |
| `backend/migrations/002_add_users.sql` | D1 migration: add Users table |

### Formula Metrics Pipeline

> 수식 상세: `FORMULA_SPEC.md` 참조

`FormulaMetricsComputer` (`lambda/logic/formula_metrics.py`) + `DrivingFeatureExtractor` (`lambda/logic/features.py`)

**파이프라인 실행 순서:**
```
preprocess.apply(df)
  → formula.compute_boolean_channels(df)   # brk_on, crn_on, tps_on, cst_on
  → formula.compute_lean_angle(df)         # lean_angle (deg)
  → formula.compute_g_sum(df)              # g_sum
  → corner detection (spatial/temporal)
  → features.extract()                     # 코너별 driving 피처
  → formula.compute_all_lap_metrics(df)    # 랩별 적분 메트릭
```

**Boolean 채널 (config.py 임계값):**
| 컬럼 | 수식 | 임계값 |
|------|------|--------|
| `brk_on` | `accel_x < -0.15` | `BRK_ON_THRESHOLD_G` |
| `crn_on` | `\|accel_y\| > 0.2` | `CRN_ON_THRESHOLD_G` |
| `tps_on` | `accel_x > 0.05` | `TPS_ON_THRESHOLD_G` |
| `cst_on` | `NOT(brk) AND NOT(tps) AND NOT(crn)` | — |

**파생 채널:**
- `lean_angle` = `degrees(atan(speed_m/s × gyro_rad/s / 9.80665))`
- `g_sum` = `sqrt(accel_x² + accel_y²)`

**코너별 피처 (features.py → `corners[].driving`):**
- `braking_profile`: SOB/COB/EOB (`_offset_s` + `_offset_m`), `total_brk_g_s`, `min_accel_x_g`
  - 수식: `cumsum(|accel_x| × brk_on)` 이 total의 10/50/90% 도달하는 시점의 시간·거리
- `lean_profile`: SOL/COL/EOL (`_offset_s` + `_offset_m`), `max_lean_deg`, `min_vel_kph`, `min_vel_offset_s/m`
  - 수식: `cumsum(|lean_angle|)` 이 total의 10/50/90% 도달하는 시점의 시간·거리
- `rate_integrals`: `pitch/roll/yaw_rate_integral` = `sum(|rate|) × dt`

**랩별 메트릭 (formula_metrics.py → `lap_metrics[]`):**
- 각 채널(brk/crn/tps/cst): `{ch}_time_s`, `{ch}_pct`, `{ch}_dist_m`
- `max_lean_angle_deg`, `mean_g_sum`, `max_g_sum`

**Lambda 응답 구조:**
```json
{
  "corners": [{ "driving": { "braking_profile": {...}, "lean_profile": {...}, "rate_integrals": {...} } }],
  "lap_metrics": [{ "lap_id": 1, "brk_time_s": ..., "brk_pct": ..., "brk_dist_m": ..., ... }],
  "metadata": { ... }
}
```

**DB 테이블:**
- `Users` — Google OAuth 사용자 (google_id, email, name, picture_url)
- `Sessions` — user_id FK로 Users 연결
- `LapMetrics` — 랩별 BRK/CRN/TPS/CST 시간·비율·거리 + max_lean + g_sum
- `Corners.driving_json` — driving dict 전체 JSON 저장

**관련 파일:**
- `lambda/logic/config.py` — Formula 상수 (BRK/CRN/TPS 임계값, GRAVITY)
- `lambda/logic/formula_metrics.py` — Boolean 채널, lean_angle, g_sum, 랩별 적분
- `lambda/logic/features.py` — 코너별 braking_profile, lean_profile, rate_integrals
- `lambda/logic/facade.py` — preprocess 후 formula 채널 계산
- `lambda/handler.py` — formula 파이프라인 + lap_metrics 응답
- `backend/schema.sql` — LapMetrics 테이블 + Corners.driving_json
- `backend/src/entry.py` — LapMetrics INSERT + driving_json 저장
- `analysis/.../` — lambda/logic/ 동일 미러링
- `FORMULA_SPEC.md` — 전체 수식 상세 명세서

### Deployment

Cloudflare stack: Workers + Assets (frontend SPA), Workers Python (backend), D1 (SQLite). CI/CD via GitHub Actions on push to main. See `DEPLOY.md` for details.

- `deploy.yml` — Frontend build + Backend deploy (Cloudflare)
- `deploy-lambda.yml` — Lambda function deploy (AWS)
- Required secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, AWS credentials, `JWT_SECRET`, `GOOGLE_CLIENT_ID`
- Required variables: `VITE_API_URL`, `VITE_GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_CLIENT_ID`

### Authentication

Google Sign-In (GSI) flow:
1. Frontend loads GSI script, renders Google Sign-In button via `AuthContext`
2. On sign-in, frontend receives Google `id_token` and POSTs to `/api/auth/google/token`
3. Backend verifies `id_token` via Google's `tokeninfo` endpoint, upserts user in D1 `Users` table
4. Backend creates HS256 JWT (7-day expiry) and returns it
5. Frontend stores JWT in localStorage (`motolap-auth-token`) via `apiClient.ts`
6. All subsequent API calls include `Authorization: Bearer <jwt>` header
7. `sessionStorage.ts` supports user-scoped session listing via `user_id`

## Progress Log

### 2026-03-01
- Chart double-click expand modal (AnalysisDashboard + AnalysisChartWrapper)
- Key point label auto-positioning pipeline (adjustKeyPointsForLines, resolveKeyPointPositions)
- Google OAuth authentication (AuthContext, UserMenu, apiClient, backend JWT)
- Gyro (PRY) smoothing toggle + driving event markers global toggle
- Batch CSV upload support (FileUpload + App)
- SessionList grouped by venue/rider/bike + back button
- Overview best lap comparison grid
- Chart.tsx lap hover highlight + max/min speed labels
- AI Report prompt improvements (curves data, G-Sum explanation, distance-based coaching)
