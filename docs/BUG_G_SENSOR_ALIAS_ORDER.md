# Bug Report: G-Force Sensor Alias Priority (latG/lonG Column Detection)

## Summary

CSV column detection for `latG` and `lonG` was using on-board accelerometer values instead of GPS-derived acceleration values, causing data inconsistency and missing longitudinal G data in analysis.

## Affected Files

- `frontend/src/utils/aimParser.ts` — `COLUMN_ALIASES` definition (lines 28-29)

## Root Cause

AiM CSV files can contain **two separate sets** of lateral/longitudinal acceleration data:

| Source | Column Examples | Characteristics |
|--------|----------------|-----------------|
| **GPS-derived** | `GPS LatAcc`, `GPS LonAcc` | Computed from GPS velocity changes. No gravitational bias. Preferred for lap analysis. |
| **On-board sensor** | `LateralAcc`, `InlineAcc` | Physical accelerometer on the device. Contains gravitational bias (~0.2g offset when stationary due to bike lean). |

### The Bug

The `COLUMN_ALIASES` array had on-board sensor names listed **before** GPS column names:

```typescript
// BEFORE (buggy)
latG: ['LateralAcc', 'GPS LatAcc', ...],  // LateralAcc matched first
lonG: ['InlineAcc', 'GPS LonAcc', ...],    // InlineAcc matched first
```

Since `findColumnIndex()` returns the **first match**, the on-board sensor was always selected when present.

### Impact by CSV File

**25.csv** (only `LateralAcc`, no `InlineAcc`):
- `latG` -> Column 14 (`LateralAcc`, on-board) -- WRONG
- `lonG` -> Column 4 (`GPS LonAcc`, GPS) -- correct (because no `InlineAcc` existed)
- **Result**: Mixed data sources. latG from on-board sensor had ~0.2g constant offset. lonG from GPS had no offset. G-circle and calibration were inconsistent.

**36.csv** (both `InlineAcc` and `LateralAcc`):
- `latG` -> Column 19 (`LateralAcc`, on-board) -- WRONG
- `lonG` -> Column 18 (`InlineAcc`, on-board) -- WRONG
- **Result**: Both channels used on-board sensors with gravitational bias instead of GPS values.

### How the Data Differs

Example from 25.csv, straight section (time ~897s):

| Channel | GPS Value | On-board Value | Notes |
|---------|-----------|----------------|-------|
| Lateral | `GPS LatAcc` = -0.0015g | `LateralAcc` = 0.2399g | On-board has ~0.24g gravity bias |
| Longitudinal | `GPS LonAcc` = 0.0798g | (no InlineAcc) | Only GPS available |

The on-board `LateralAcc` sensor reads ~0.2g even when riding straight due to gravitational component from bike lean angle. GPS-derived `GPS LatAcc` correctly reads ~0g on a straight.

## Fix

Reordered the alias arrays to prioritize GPS columns:

```typescript
// AFTER (fixed)
latG: ['GPS LatAcc', 'GPS_LatAcc', 'LateralAcc', ...],  // GPS first
lonG: ['GPS LonAcc', 'GPS_LonAcc', 'InlineAcc', ...],    // GPS first
```

This ensures:
1. GPS-derived acceleration is used when available (preferred for track analysis)
2. Falls back to on-board sensor only when no GPS acceleration columns exist

## Important Note: IndexedDB Sessions

Sessions already saved in IndexedDB contain pre-parsed `dataPoints` with the old column mapping. The fix only applies to **newly uploaded CSV files**. To apply the fix to existing sessions:

1. Delete the session from the session list
2. Re-upload the CSV file

The `reconstructSession()` function re-runs lap segmentation and corner detection on stored `dataPoints`, but does NOT re-parse the CSV. So the underlying `latG`/`lonG` values in stored data remain from the original (buggy) parse.

## Related Documentation

From `CLAUDE.md`:
> **CSV Column Detection Gotcha:** `aimParser.ts` uses alias lists with exact match first, then partial match (`includes`). **Alias order matters** -- GPS-specific aliases (`GPS LonAcc`, `GPS LatAcc`) must come before short aliases (`LonG`, `LatG`) in the alias arrays.

## Verification

After fix, both CSV files should map to GPS columns:

| CSV | latG | lonG |
|-----|------|------|
| 25.csv | Column 3 (`GPS LatAcc`) | Column 4 (`GPS LonAcc`) |
| 36.csv | Column 3 (`GPS LatAcc`) | Column 4 (`GPS LonAcc`) |

Check the browser console for `[AIM Parser] Column Map:` log to verify correct mapping.
