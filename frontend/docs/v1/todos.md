# Motolap Ver 1 Todos

Based on `design_v1.md`.

## 0. Setup
- [x] Initialize Vite + React + TypeScript project
- [x] Install dependencies: `papaparse`, `recharts`, `react-leaflet`, `leaflet`, `lucide-react`, `tailwindcss`
- [x] Configure Tailwind CSS & Dark Mode

## 1. Core Logic (Data)
- [x] Implement `LapData` and `SessionData` interfaces
- [x] Implement `AimParser.ts`
    - [x] Detect header/metadata
    - [x] Parse CSV body
    - [x] Handle units conversion (if needed)

## 2. Dashboard UI
- [x] Create Drag & Drop File Upload Component
- [x] Create Main Dashboard Layout (Grid)
- [x] Implement Summary Cards Component
    - [x] Max Speed
    - [x] Total Distance
    - [x] Lap Time
- [x] Implement Chart Component (`recharts`)
    - [x] Speed vs Distance
    - [x] RPM vs Time
- [x] Implement Map Component (`react-leaflet`)
    - [x] Draw Polyline from lat/lon
    - [x] (Optional) Speed heatmap coloring

## 3. Integration & State
- [x] Create global store (Context or Zustand) to hold parsed data
- [x] Connect Upload -> Parser -> Store -> Dashboard

## 4. Verification
- [ ] Test with `no2.csv`
- [ ] Verify map track shape
- [ ] Check values against raw CSV inspection
