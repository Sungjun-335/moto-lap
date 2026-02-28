import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    Label
} from 'recharts';
import type { SessionData } from '../types';
import { downsample } from '../utils/downsample';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

interface ChartProps {
    data: SessionData;
    selectedLapIndex?: number | 'all';
}

const LAP_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
    '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#facc15',
];

interface LapChartData {
    distance: number;
    [key: string]: number;
}

const Chart: React.FC<ChartProps> = ({ data, selectedLapIndex = 'all' }) => {
    const { t } = useTranslation();
    const [hoveredLapKey, setHoveredLapKey] = useState<string | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);

    // Map lap index → { duration, color }
    const lapInfoMap = useMemo(() => {
        const map = new Map<number, { duration: number; color: string }>();
        data.laps.forEach((lap, i) => {
            map.set(lap.index, { duration: lap.duration, color: LAP_COLORS[i % LAP_COLORS.length] });
        });
        return map;
    }, [data.laps]);

    // Build merged dataset
    const chartData = useMemo(() => {
        const laps = data.laps;
        if (!laps.length) return [] as LapChartData[];

        const lapDataSets: { key: string; points: { distance: number; speed: number }[] }[] = [];
        for (const lap of laps) {
            const pts = lap.dataPoints;
            if (!pts.length) continue;
            const startDist = pts[0].distance;
            const normalized = downsample(pts, 500).map(p => ({
                distance: Math.round((p.distance - startDist) * 10000) / 10000,
                speed: p.speed,
            }));
            lapDataSets.push({ key: `speed_L${lap.index}`, points: normalized });
        }

        if (!lapDataSets.length) return [];

        const refSet = lapDataSets.reduce((a, b) => a.points.length >= b.points.length ? a : b);
        const merged: LapChartData[] = refSet.points.map(p => {
            const row: LapChartData = { distance: p.distance };
            row[refSet.key] = p.speed;
            return row;
        });

        for (const ls of lapDataSets) {
            if (ls.key === refSet.key) continue;
            let idx = 0;
            for (const row of merged) {
                const d = row.distance;
                while (idx < ls.points.length - 1 && ls.points[idx + 1].distance < d) idx++;
                const p1 = ls.points[idx];
                const p2 = ls.points[idx + 1];
                if (!p1 || !p2) continue;
                if (p1.distance === p2.distance) {
                    row[ls.key] = p1.speed;
                } else {
                    const ratio = (d - p1.distance) / (p2.distance - p1.distance);
                    row[ls.key] = p1.speed + (p2.speed - p1.speed) * Math.max(0, Math.min(1, ratio));
                }
            }
        }

        return merged;
    }, [data.laps]);

    // Compute max/min speed
    const { maxSpeed, minSpeed } = useMemo(() => {
        let max = -Infinity;
        let min = Infinity;
        const targetLaps = selectedLapIndex === 'all' ? data.laps : data.laps.filter(l => l.index === selectedLapIndex);
        for (const lap of targetLaps) {
            for (const p of lap.dataPoints) {
                if (p.speed > max) max = p.speed;
                if (p.speed < min) min = p.speed;
            }
        }
        return { maxSpeed: max === -Infinity ? 0 : max, minSpeed: min === Infinity ? 0 : min };
    }, [data.laps, selectedLapIndex]);

    // Find closest lap to mouse Y on chart mouse move
    const handleChartMouseMove = useCallback((state: any) => {
        if (!state?.activePayload?.length || !state.chartY) {
            return;
        }
        // Use chartY and the YAxis scale to find which lap value is closest to cursor
        const payload = state.activePayload;

        // Get chart area from the internal coordinate info
        // activeCoordinate.y is the Y pixel position of the tooltip anchor
        // We need to compare each lap's value pixel position with the mouse position
        // Recharts gives us coordinate info we can use
        const yAxisMap = state.activePayload[0]?.payload;
        if (!yAxisMap) return;

        // Get the Y axis scale from the chart container
        const container = chartContainerRef.current;
        if (!container) return;
        const svgEl = container.querySelector('.recharts-surface');
        if (!svgEl) return;

        // Get Y-axis domain from the rendered ticks
        const yAxis = container.querySelector('.recharts-yAxis');
        if (!yAxis) return;
        const ticks = yAxis.querySelectorAll('.recharts-cartesian-axis-tick-value');
        if (ticks.length < 2) return;

        const tickValues = Array.from(ticks).map(t => parseFloat(t.textContent || '0'));
        const minTick = Math.min(...tickValues);
        const maxTick = Math.max(...tickValues);

        // Get the plot area bounds
        const plotArea = container.querySelector('.recharts-cartesian-grid');
        if (!plotArea) return;
        const plotRect = plotArea.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const plotTop = plotRect.top - containerRect.top;
        const plotBottom = plotRect.bottom - containerRect.top;
        const plotHeight = plotBottom - plotTop;

        // Convert mouse Y (from container top) to value
        // Recharts Y axis is inverted (top = max, bottom = min)
        const mouseY = state.chartY;
        const yRatio = (mouseY - plotTop) / plotHeight;
        const mouseValue = maxTick - yRatio * (maxTick - minTick);

        // Find the closest lap
        let closestKey: string | null = null;
        let closestDist = Infinity;
        for (const entry of payload) {
            if (entry.value == null) continue;
            const dist = Math.abs(entry.value - mouseValue);
            if (dist < closestDist) {
                closestDist = dist;
                closestKey = entry.dataKey;
            }
        }

        setHoveredLapKey(closestKey);
    }, []);

    const handleChartMouseLeave = useCallback(() => {
        setHoveredLapKey(null);
    }, []);

    // Custom tooltip - show only closest lap prominently, others dimmed
    const renderTooltip = useCallback((props: any) => {
        if (!props.active || !props.payload?.length) return null;

        const entries = props.payload.filter((p: any) => p.value != null);
        if (!entries.length) return null;

        // Determine the "focused" lap
        const focusKey = hoveredLapKey || entries[0]?.dataKey;
        const focusEntry = entries.find((e: any) => e.dataKey === focusKey) || entries[0];
        const focusLapIdx = parseInt(focusEntry.dataKey.replace('speed_L', ''));
        const focusInfo = lapInfoMap.get(focusLapIdx);

        // Other laps sorted by speed descending
        const others = entries
            .filter((e: any) => e.dataKey !== focusEntry.dataKey)
            .sort((a: any, b: any) => b.value - a.value);

        return (
            <div className="bg-zinc-900/95 border border-zinc-600 rounded-lg shadow-2xl overflow-hidden min-w-[180px]">
                {/* Focused lap - large */}
                <div className="px-3 py-2 border-b border-zinc-700/50" style={{ borderLeftWidth: 3, borderLeftColor: focusEntry.color }}>
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-sm font-mono font-bold text-white">
                            L{focusLapIdx}
                        </span>
                        {focusInfo && (
                            <span className="text-xs font-mono text-zinc-400">
                                {formatLapTime(focusInfo.duration)}
                            </span>
                        )}
                    </div>
                    <div className="text-lg font-mono font-bold text-white mt-0.5">
                        {focusEntry.value.toFixed(1)} <span className="text-xs text-zinc-400">km/h</span>
                    </div>
                </div>
                {/* Other laps - compact */}
                {others.length > 0 && (
                    <div className="px-3 py-1.5 space-y-0.5">
                        {others.map((entry: any) => {
                            const lapIdx = parseInt(entry.dataKey.replace('speed_L', ''));
                            const diff = entry.value - focusEntry.value;
                            return (
                                <div key={entry.dataKey} className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                    <span className="w-5">L{lapIdx}</span>
                                    <span className="w-12 text-right">{entry.value.toFixed(1)}</span>
                                    <span className={`ml-1 ${diff > 0 ? 'text-green-500/70' : diff < 0 ? 'text-red-500/70' : ''}`}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                {/* Distance */}
                <div className="px-3 py-1 border-t border-zinc-800 text-[9px] text-zinc-600 font-mono">
                    {Number(props.label).toFixed(3)} km
                </div>
            </div>
        );
    }, [hoveredLapKey, lapInfoMap]);

    // Determine line styles
    const getLineStyle = useCallback((lapIndex: number) => {
        const key = `speed_L${lapIndex}`;
        const isSelected = selectedLapIndex !== 'all' && lapIndex === selectedLapIndex;
        const hasSelection = selectedLapIndex !== 'all';
        const isHovered = hoveredLapKey === key;
        const hasHover = hoveredLapKey !== null;

        let strokeWidth = 1.2;
        let strokeOpacity = 0.7;

        if (hasSelection) {
            strokeWidth = isSelected ? 2.5 : 0.8;
            strokeOpacity = isSelected ? 1 : 0.2;
        }

        if (hasHover && !hasSelection) {
            strokeWidth = isHovered ? 2.5 : 0.8;
            strokeOpacity = isHovered ? 1 : 0.25;
        }

        if (hasHover && hasSelection) {
            if (isHovered) {
                strokeWidth = 2.5;
                strokeOpacity = 1;
            } else if (isSelected) {
                strokeWidth = 1.5;
                strokeOpacity = 0.5;
            }
        }

        return { strokeWidth, strokeOpacity };
    }, [selectedLapIndex, hoveredLapKey]);

    return (
        <div className="w-full h-full p-4" ref={chartContainerRef}>
            <h3 className="text-zinc-400 text-sm mb-4 font-medium">{t.charts.speedVsDistance}</h3>
            <div className="w-full h-[90%]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        onMouseMove={handleChartMouseMove}
                        onMouseLeave={handleChartMouseLeave}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                            dataKey="distance"
                            type="number"
                            domain={[0, 'auto']}
                            allowDataOverflow={true}
                            tick={{ fill: '#71717a', fontSize: 12 }}
                            tickFormatter={(val) => val.toFixed(1)}
                            label={{ value: t.charts.distanceLabel, position: 'insideBottomRight', offset: -5, fill: '#71717a' }}
                        />
                        <YAxis
                            tick={{ fill: '#71717a', fontSize: 12 }}
                            label={{ value: t.charts.speedLabel, angle: -90, position: 'insideLeft', fill: '#71717a' }}
                        />
                        <Tooltip
                            content={renderTooltip}
                            allowEscapeViewBox={{ x: false, y: true }}
                        />
                        <ReferenceLine y={maxSpeed} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6}>
                            <Label value={`MAX ${maxSpeed.toFixed(0)}`} position="right" fill="#22c55e" fontSize={11} />
                        </ReferenceLine>
                        <ReferenceLine y={minSpeed} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6}>
                            <Label value={`MIN ${minSpeed.toFixed(0)}`} position="right" fill="#f59e0b" fontSize={11} />
                        </ReferenceLine>
                        {data.laps.map((lap, i) => {
                            const key = `speed_L${lap.index}`;
                            const { strokeWidth, strokeOpacity } = getLineStyle(lap.index);
                            const isActive = hoveredLapKey === key ||
                                (selectedLapIndex !== 'all' && lap.index === selectedLapIndex) ||
                                (selectedLapIndex === 'all' && !hoveredLapKey);
                            return (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={`L${lap.index}`}
                                    stroke={LAP_COLORS[i % LAP_COLORS.length]}
                                    strokeWidth={strokeWidth}
                                    strokeOpacity={strokeOpacity}
                                    dot={false}
                                    activeDot={isActive ? { r: hoveredLapKey === key ? 6 : 3, fill: hoveredLapKey === key ? '#fff' : LAP_COLORS[i % LAP_COLORS.length], stroke: hoveredLapKey === key ? LAP_COLORS[i % LAP_COLORS.length] : 'none', strokeWidth: 2 } : false}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default Chart;
