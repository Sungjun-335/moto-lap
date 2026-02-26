import React, { useMemo } from 'react';
import type { AnalysisPoint } from '../../utils/analysis';
import FlexibleLineChart from './FlexibleLineChart';
import type { LineConfig } from './FlexibleLineChart';

export interface CornerRange {
    id: number;
    startDist: number;
    endDist: number;
    name?: string;
    direction?: string;
}

export interface DrivingEventMarker {
    distance: number;       // 절대 거리 (km)
    type: string;           // 'SOB', 'COB', 'EOB', 'SOL', 'COL', 'EOL', 'SOT', 'COT', 'EOT', 'G_DIP', 'MIN_VEL'
    category: 'braking' | 'lean' | 'throttle' | 'gdip' | 'velocity';
    source: 'ref' | 'ana';
    cornerId: number;
}

// Interface for what the individual Chart components expect
export interface ChartComponentProps {
    data: AnalysisPoint[];
    height?: number;
    syncId?: string;
    onMouseMove?: (e: any) => void;
    onMouseDown?: (e: any) => void;
    onMouseUp?: () => void;
    onMouseLeave?: () => void;
    zoomDomain?: [number, number] | null;
    refAreaLeft?: number | null;
    refAreaRight?: number | null;
    cornerRanges?: CornerRange[];
    drivingEventMarkers?: DrivingEventMarker[];
}

export interface FlexChartConfig {
    title: string;
    lines: LineConfig[];
    yDomain?: [number | string, number | string];
}

interface AnalysisChartWrapperProps {
    chartId: string;
    ChartComponent?: React.ComponentType<ChartComponentProps>;
    flexConfig?: FlexChartConfig;
    data: AnalysisPoint[];
    height?: number;
    dragState: {
        isDragging: boolean;
        activeChartId: string | null;
        startDist: number | null;
        currDist: number | null;
    };
    onMouseMove: (e: any) => void;
    onMouseDown: (e: any, chartId: string) => void;
    onMouseUp: () => void;
    zoomDomain?: [number, number] | null;
    cursorDistance?: number | null;
    cornerRanges?: CornerRange[];
    drivingEventMarkers?: DrivingEventMarker[];
}

const CursorOverlay: React.FC<{ cursorDistance: number | null; data: AnalysisPoint[] }> = React.memo(
    ({ cursorDistance, data }) => {
        const leftPercent = useMemo(() => {
            if (cursorDistance == null || !data.length) return null;
            const minDist = data[0].distance;
            const maxDist = data[data.length - 1].distance;
            const range = maxDist - minDist;
            if (range <= 0) return null;
            const fraction = (cursorDistance - minDist) / range;
            if (fraction < 0 || fraction > 1) return null;
            // Chart area: ~8% left padding (YAxis), ~3% right padding
            return 8 + fraction * 89;
        }, [cursorDistance, data]);

        if (leftPercent == null) return null;

        return (
            <div
                className="absolute top-0 bottom-0 pointer-events-none z-10"
                style={{
                    left: `${leftPercent}%`,
                    width: '1px',
                    background: 'rgba(255,255,255,0.5)',
                }}
            />
        );
    },
    (prev, next) => prev.cursorDistance === next.cursorDistance && prev.data === next.data
);

export const AnalysisChartWrapper: React.FC<AnalysisChartWrapperProps> = ({
    chartId,
    ChartComponent,
    flexConfig,
    data,
    height = 200,
    dragState,
    onMouseMove,
    onMouseDown,
    onMouseUp,
    zoomDomain,
    cursorDistance,
    cornerRanges,
    drivingEventMarkers
}) => {
    let refAreaLeft: number | null = null;
    let refAreaRight: number | null = null;

    if (dragState.isDragging && dragState.activeChartId === chartId) {
        const { startDist, currDist } = dragState;
        if (startDist !== null && currDist !== null) {
            refAreaLeft = Math.min(startDist, currDist);
            refAreaRight = Math.max(startDist, currDist);
        }
    }

    const sharedProps = {
        data,
        height,
        syncId: "motolap-sync" as const,
        onMouseMove,
        onMouseDown: (e: any) => onMouseDown(e, chartId),
        onMouseUp,
        onMouseLeave: onMouseUp,
        zoomDomain: zoomDomain || null,
        refAreaLeft,
        refAreaRight,
        cornerRanges,
        drivingEventMarkers,
    };

    return (
        <div className="bg-zinc-900 rounded-lg p-1 relative">
            {ChartComponent ? (
                <ChartComponent {...sharedProps} />
            ) : flexConfig ? (
                <FlexibleLineChart
                    {...sharedProps}
                    title={flexConfig.title}
                    lines={flexConfig.lines}
                    yDomain={flexConfig.yDomain}
                />
            ) : null}
            <CursorOverlay cursorDistance={cursorDistance ?? null} data={data} />
        </div>
    );
};
