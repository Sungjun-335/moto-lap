# Motolap Design Document (Ver 1)

## 1. Overview
Motolap is a web-based service designed to analyze driving data exported from **AIM Data Loggers** (specifically `.csv` format). 
The goal of Ver 1 is to provide a quick, client-side analysis tool that visualizes track position, speed, and vehicle telemetry without requiring complex server-side processing.

## 2. System Architecture
- **Tech Stack**: React (Vite), TypeScript, Tailwind CSS.
- **Data Processing**: Client-side parsing using `PapaParse`. No database required for Ver 1.
- **State Management**: React Context or local state to hold the parsed `LapData`.

## 3. Key Features

### 3.1 Data Import
- **File Support**: AIM CSV export format (e.g., `no2.csv`).
- **Mechanism**: Drag & Drop area.
- **Parsing Logic**:
  - Detect header row (dynamic start).
  - Extract metadata: `Venue`, `Vehicle`, `User`, `Date`, `Time`.
  - Parse telemetry columns: `Time`, `Distance`, `GPS_Latitude`, `GPS_Longitude`, `GPS_Speed`, `RPM`, `LateralAcc`, `LongitudinalAcc`.

### 3.2 Dashboard UI
The dashboard consists of a grid layout with the following widgets:

#### A. Summary Cards
- **Max Speed**: Derived from `GPS_Speed` or `Speed` column.
- **Total Distance**: Total session distance.
- **Lap Time**: (If lap beacons exist, otherwise total duration).
- **Vehicle/Venue Info**: Displayed from metadata.

#### B. GPS Track Map
- **Library**: `react-leaflet`.
- **Visualization**: Polyline of (Lat, Lon) points.
- **Coloring**: Path colored by speed (Heatmap style: Green=Regen/Slow, Red=Fast).

#### C. Telemetry Charts
- **Library**: `recharts`.
- **Main Chart**: Speed (km/h) vs Distance (m).
- **Secondary Chart**: RPM vs Time, or G-Force Scatter (Lat vs Lon G).
- **Interaction**: Hovering over the chart highlights the corresponding point on the GPS map (cursor synchronization).

## 4. Data Structure
```typescript
interface LapPoint {
  time: number;       // sec
  distance: number;   // m
  speed: number;      // km/h
  rpm: number;
  lat: number;
  lon: number;
  latAcc: number;
  lonAcc: number;
}

interface SessionData {
  metadata: {
    venue: string;
    vehicle: string;
    date: string;
  };
  points: LapPoint[];
}
```

## 5. Future Considerations
- Multiple file comparison (Ghost lap).
- Automatic lap segmentation logic (if beacon data is missing).
- Server-side storage for sharing links.
