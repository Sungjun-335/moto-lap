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
import type { SessionData, LapData } from '../types';
import { downsample } from '../utils/downsample';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

export type ChartMetric = 'speed' | 'tps' | 'brake' | 'latG' | 'lonG' | 'rpm';

const METRIC_CONFIG: Record<ChartMetric, { field: keyof LapData; unit: string; decimals: number }> = {
    speed: { field: 'speed', unit: 'km/h', decimals: 1 },
    tps: { field: 'tps', unit: '%', decimals: 0 },
    brake: { field: 'brake', unit: '', decimals: 0 },
    latG: { field: 'latG', unit: 'G', decimals: 2 },
    lonG: { field: 'lonG', unit: 'G', decimals: 2 },
    rpm: { field: 'rpm', unit: 'rpm', decimals: 0 },
};

interface ChartProps {
    data: SessionData;
    selectedLapIndex?: number | 'all';
    hiddenLaps?: Set<number>;
    onRemoveLap?: (lapIndex: number) => void;
    onDeleteLap?: (lapIndex: number) => void;
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

const Chart: React.FC<ChartProps> = ({ data, selectedLapIndex = 'all', hiddenLaps, onRemoveLap, onDeleteLap }) => {
    const { t } = useTranslation();
    const [hoveredLapKey, setHoveredLapKey] = useState<string | null>(null);
    const [metric, setMetric] = useState<ChartMetric>('speed');
    const [deleteConfirmLap, setDeleteConfirmLap] = useState<number | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);

    const config = METRIC_CONFIG[metric];

    const metricLabelMap: Record<ChartMetric, string> = {
        speed: t.charts.metricSpeed,
        tps: t.charts.metricThrottle,
        brake: t.charts.metricBrake,
        latG: t.charts.metricLatG,
        lonG: t.charts.metricLonG,
        rpm: t.charts.metricRpm,
    };

    // Check which metrics have data
    const availableMetrics = useMemo(() => {
        const all: ChartMetric[] = ['speed', 'tps', 'brake', 'latG', 'lonG', 'rpm'];
        return all.filter(m => {
            const field = METRIC_CONFIG[m].field;
            return data.laps.some(lap =>
                lap.dataPoints.some(p => (p[field] as number) !== 0)
            );
        });
    }, [data.laps]);

    // Map lap index → { duration, color }
    const lapInfoMap = useMemo(() => {
        const map = new Map<number, { duration: number; color: string }>();
        data.laps.forEach((lap, i) => {
            map.set(lap.index, { duration: lap.duration, color: LAP_COLORS[i % LAP_COLORS.length] });
        });
        return map;
    }, [data.laps]);

    // Filter visible laps
    const visibleLaps = useMemo(() => {
        if (!hiddenLaps?.size) return data.laps;
        return data.laps.filter(lap => !hiddenLaps.has(lap.index));
    }, [data.laps, hiddenLaps]);

    // Build merged dataset
    const chartData = useMemo(() => {
        const laps = visibleLaps;
        if (!laps.length) return [] as LapChartData[];

        const field = config.field;
        const lapDataSets: { key: string; points: { distance: number; value: number }[] }[] = [];
        for (const lap of laps) {
            const pts = lap.dataPoints;
            if (!pts.length) continue;
            const startDist = pts[0].distance;
            const normalized = downsample(pts, 500).map(p => ({
                distance: Math.round((p.distance - startDist) * 10000) / 10000,
                value: p[field] as number,
            }));
            lapDataSets.push({ key: `${metric}_L${lap.index}`, points: normalized });
        }

        if (!lapDataSets.length) return [];

        const refSet = lapDataSets.reduce((a, b) => a.points.length >= b.points.length ? a : b);
        const merged: LapChartData[] = refSet.points.map(p => {
            const row: LapChartData = { distance: p.distance };
            row[refSet.key] = p.value;
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
                    row[ls.key] = p1.value;
                } else {
                    const ratio = (d - p1.distance) / (p2.distance - p1.distance);
                    row[ls.key] = p1.value + (p2.value - p1.value) * Math.max(0, Math.min(1, ratio));
                }
            }
        }

        return merged;
    }, [visibleLaps, metric, config.field]);

    // Compute max/min value
    const { maxVal, minVal } = useMemo(() => {
        let max = -Infinity;
        let min = Infinity;
        const field = config.field;
        const targetLaps = selectedLapIndex === 'all' ? visibleLaps : visibleLaps.filter(l => l.index === selectedLapIndex);
        for (const lap of targetLaps) {
            for (const p of lap.dataPoints) {
                const v = p[field] as number;
                if (v > max) max = v;
                if (v < min) min = v;
            }
        }
        return { maxVal: max === -Infinity ? 0 : max, minVal: min === Infinity ? 0 : min };
    }, [visibleLaps, selectedLapIndex, config.field]);

    const extractLapIndex = (dataKey: string) => parseInt(dataKey.split('_L').pop() || '0');

    // Find closest lap to mouse Y on chart mouse move
    const handleChartMouseMove = useCallback((state: any) => {
        if (!state?.activePayload?.length || !state.chartY) {
            return;
        }
        const payload = state.activePayload;
        const yAxisMap = state.activePayload[0]?.payload;
        if (!yAxisMap) return;

        const container = chartContainerRef.current;
        if (!container) return;
        const svgEl = container.querySelector('.recharts-surface');
        if (!svgEl) return;

        const yAxis = container.querySelector('.recharts-yAxis');
        if (!yAxis) return;
        const ticks = yAxis.querySelectorAll('.recharts-cartesian-axis-tick-value');
        if (ticks.length < 2) return;

        const tickValues = Array.from(ticks).map(t => parseFloat(t.textContent || '0'));
        const minTick = Math.min(...tickValues);
        const maxTick = Math.max(...tickValues);

        const plotArea = container.querySelector('.recharts-cartesian-grid');
        if (!plotArea) return;
        const plotRect = plotArea.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const plotTop = plotRect.top - containerRect.top;
        const plotBottom = plotRect.bottom - containerRect.top;
        const plotHeight = plotBottom - plotTop;

        const mouseY = state.chartY;
        const yRatio = (mouseY - plotTop) / plotHeight;
        const mouseValue = maxTick - yRatio * (maxTick - minTick);

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

    // Custom tooltip
    const renderTooltip = useCallback((props: any) => {
        if (!props.active || !props.payload?.length) return null;

        const entries = props.payload.filter((p: any) => p.value != null);
        if (!entries.length) return null;

        const focusKey = hoveredLapKey || entries[0]?.dataKey;
        const focusEntry = entries.find((e: any) => e.dataKey === focusKey) || entries[0];
        const focusLapIdx = extractLapIndex(focusEntry.dataKey);
        const focusInfo = lapInfoMap.get(focusLapIdx);

        const others = entries
            .filter((e: any) => e.dataKey !== focusEntry.dataKey)
            .sort((a: any, b: any) => b.value - a.value);

        return (
            <div className="bg-zinc-900/95 border border-zinc-600 rounded-lg shadow-2xl overflow-hidden min-w-[180px]">
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
                        {focusEntry.value.toFixed(config.decimals)} <span className="text-xs text-zinc-400">{config.unit}</span>
                    </div>
                </div>
                {others.length > 0 && (
                    <div className="px-3 py-1.5 space-y-0.5">
                        {others.map((entry: any) => {
                            const lapIdx = extractLapIndex(entry.dataKey);
                            const diff = entry.value - focusEntry.value;
                            return (
                                <div key={entry.dataKey} className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
                                    <span className="w-5">L{lapIdx}</span>
                                    <span className="w-12 text-right">{entry.value.toFixed(config.decimals)}</span>
                                    <span className={`ml-1 ${diff > 0 ? 'text-green-500/70' : diff < 0 ? 'text-red-500/70' : ''}`}>
                                        {diff > 0 ? '+' : ''}{diff.toFixed(config.decimals)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                <div className="px-3 py-1 border-t border-zinc-800 text-[9px] text-zinc-600 font-mono">
                    {Number(props.label).toFixed(3)} km
                </div>
            </div>
        );
    }, [hoveredLapKey, lapInfoMap, config]);

    // Determine line styles
    const getLineStyle = useCallback((lapIndex: number) => {
        const key = `${metric}_L${lapIndex}`;
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
    }, [selectedLapIndex, hoveredLapKey, metric]);

    const handleDeleteConfirm = useCallback(() => {
        if (deleteConfirmLap !== null && onDeleteLap) {
            onDeleteLap(deleteConfirmLap);
        }
        setDeleteConfirmLap(null);
    }, [deleteConfirmLap, onDeleteLap]);

    return (
        <div className="w-full h-full p-4 relative" ref={chartContainerRef}>
            {/* Header: metric tabs */}
            <div className="flex items-center gap-2 mb-2">
                <div className="flex gap-1 flex-wrap">
                    {availableMetrics.map(m => (
                        <button
                            key={m}
                            onClick={() => setMetric(m)}
                            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
                                metric === m
                                    ? 'bg-zinc-700 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                            }`}
                        >
                            {metricLabelMap[m]}
                        </button>
                    ))}
                </div>
                <span className="text-zinc-600 text-[9px] ml-auto">
                    vs {t.charts.distanceLabel}
                </span>
            </div>
            {/* Lap legend */}
            {onRemoveLap && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                    {data.laps.map((lap, i) => {
                        const isHidden = hiddenLaps?.has(lap.index);
                        const color = LAP_COLORS[i % LAP_COLORS.length];
                        return (
                            <button
                                key={lap.index}
                                onClick={() => onRemoveLap(lap.index)}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    if (onDeleteLap && data.laps.length > 1) setDeleteConfirmLap(lap.index);
                                }}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-all border ${
                                    isHidden
                                        ? 'border-zinc-800 bg-zinc-900/50 text-zinc-600 opacity-50'
                                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700/50'
                                }`}
                            >
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: isHidden ? '#52525b' : color }}
                                />
                                <span className={isHidden ? 'line-through' : ''}>
                                    L{lap.index}
                                </span>
                                <span className={`text-zinc-500 ${isHidden ? 'line-through' : ''}`}>
                                    {formatLapTime(lap.duration)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
            <div className={`w-full ${onRemoveLap ? 'h-[calc(100%-80px)]' : 'h-[90%]'}`}>
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
                            label={{ value: `${metricLabelMap[metric]} (${config.unit})`, angle: -90, position: 'insideLeft', fill: '#71717a' }}
                        />
                        <Tooltip
                            content={renderTooltip}
                            allowEscapeViewBox={{ x: false, y: true }}
                        />
                        <ReferenceLine y={maxVal} stroke="#22c55e" strokeDasharray="4 4" strokeOpacity={0.6}>
                            <Label value={`MAX ${maxVal.toFixed(config.decimals)}`} position="right" fill="#22c55e" fontSize={11} />
                        </ReferenceLine>
                        <ReferenceLine y={minVal} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.6}>
                            <Label value={`MIN ${minVal.toFixed(config.decimals)}`} position="right" fill="#f59e0b" fontSize={11} />
                        </ReferenceLine>
                        {visibleLaps.map((lap, i) => {
                            const key = `${metric}_L${lap.index}`;
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

            {/* Delete confirmation dialog */}
            {deleteConfirmLap !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteConfirmLap(null)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 shadow-2xl min-w-[280px]" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-zinc-200 mb-1">
                            {t.overview.deleteLapTitle} — L{deleteConfirmLap}
                        </h3>
                        <p className="text-xs text-zinc-400 mb-1">
                            {formatLapTime(lapInfoMap.get(deleteConfirmLap)?.duration ?? 0)}
                        </p>
                        <p className="text-xs text-zinc-500 mb-4">
                            {t.overview.deleteLapMessage}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirmLap(null)}
                                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-3 py-1.5 text-xs text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800/50 border border-red-800/50 rounded-lg transition-colors"
                            >
                                {t.overview.delete}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chart;
