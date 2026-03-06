import React, { useMemo, useState } from 'react';
import {
    LineChart, Line, BarChart, Bar, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Legend, ComposedChart,
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { SessionData, Corner } from '../../types';
import { useTranslation } from '../../i18n/context';
import { formatLapTime } from '../../utils/formatLapTime';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ReportChartsProps {
    data: SessionData;
    viewData: AnalysisPoint[];
    refLapIndex: number;
    anaLapIndex: number;
}

const DOWNSAMPLE_TARGET = 300;

function downsamplePoints(pts: AnalysisPoint[]): AnalysisPoint[] {
    if (pts.length <= DOWNSAMPLE_TARGET) return pts;
    const step = pts.length / DOWNSAMPLE_TARGET;
    const result: AnalysisPoint[] = [];
    for (let i = 0; i < DOWNSAMPLE_TARGET; i++) {
        result.push(pts[Math.floor(i * step)]);
    }
    return result;
}

interface CornerDelta {
    name: string;
    delta: number;
    direction: string;
}

interface CornerChartData {
    id: number;
    name: string;
    direction: string;
    delta: number;
    points: {
        d: number;
        refSpeed: number;
        anaSpeed: number;
        refGSum: number;
        anaGSum: number;
        refLonG: number;
        anaLonG: number;
    }[];
}

// Compute corner distance ranges from analysis data (same logic as useAnalysisState)
function computeCornerRanges(corners: Corner[], analysisData: AnalysisPoint[]): Map<number, { startDist: number; endDist: number }> {
    const rangeMap = new Map<number, { startDist: number; endDist: number }>();
    if (!corners.length || !analysisData.length) return rangeMap;

    for (const corner of corners) {
        const startPointIdx = analysisData.findIndex(p => p.refTime >= corner.start_time);
        const startPoint = startPointIdx >= 0 ? analysisData[startPointIdx] : undefined;
        let endPoint: AnalysisPoint | undefined;
        for (let i = analysisData.length - 1; i >= 0; i--) {
            if (analysisData[i].refTime <= corner.end_time) {
                endPoint = analysisData[i];
                break;
            }
        }
        if (startPoint && endPoint) {
            rangeMap.set(corner.id, { startDist: startPoint.distance, endDist: endPoint.distance });
        }
    }
    return rangeMap;
}

const customTooltipStyle = {
    backgroundColor: 'rgb(24 24 27 / 0.95)',
    border: '1px solid rgb(63 63 70)',
    borderRadius: '8px',
    fontSize: '11px',
    padding: '6px 10px',
};

// Per-corner mini chart component
const CornerMiniChart: React.FC<{
    corner: CornerChartData;
    refLapIndex: number;
    anaLapIndex: number;
}> = ({ corner }) => {
    if (corner.points.length < 3) return null;

    const isLeft = corner.direction === 'L';
    const isRight = corner.direction === 'R';
    const isFaster = corner.delta < 0;
    const isSlower = corner.delta > 0;

    return (
        <div className="bg-zinc-800/40 rounded-lg border border-zinc-700/50 p-3">
            {/* Corner header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-zinc-200">{corner.name}</span>
                    {corner.direction && (
                        <span className={`text-[10px] font-semibold ${isLeft ? 'text-blue-400' : isRight ? 'text-red-400' : 'text-zinc-400'}`}>
                            {corner.direction}
                        </span>
                    )}
                </div>
                <span className={`text-xs font-mono font-bold ${isFaster ? 'text-green-400' : isSlower ? 'text-red-400' : 'text-zinc-400'}`}>
                    {corner.delta > 0 ? '+' : ''}{corner.delta.toFixed(3)}s
                </span>
            </div>

            {/* Speed comparison */}
            <div className="h-[100px] mb-1">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={corner.points} margin={{ top: 2, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#1e1e1e" />
                        <XAxis dataKey="d" type="number" tick={{ fill: '#3f3f46', fontSize: 9 }} tickFormatter={v => (v * 1000).toFixed(0)} hide />
                        <YAxis tick={{ fill: '#3f3f46', fontSize: 9 }} width={40} domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={customTooltipStyle}
                            formatter={(v: any, name?: string) => [`${Number(v).toFixed(1)} km/h`, name ?? '']}
                            labelFormatter={v => `${(Number(v) * 1000).toFixed(0)}m`}
                        />
                        <Line dataKey="refSpeed" name={`REF`} stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        <Line dataKey="anaSpeed" name={`ANA`} stroke="#f87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    </LineChart>
                </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-zinc-600 text-center mb-2">Speed (km/h)</div>

            {/* G-Sum + LonG combined */}
            <div className="h-[80px]">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={corner.points} margin={{ top: 2, right: 5, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="2 2" stroke="#1e1e1e" />
                        <XAxis dataKey="d" type="number" tick={{ fill: '#3f3f46', fontSize: 9 }} tickFormatter={v => (v * 1000).toFixed(0)} />
                        <YAxis tick={{ fill: '#3f3f46', fontSize: 9 }} width={40} domain={['auto', 'auto']} />
                        <Tooltip
                            contentStyle={customTooltipStyle}
                            formatter={(v: any, name?: string) => [`${Number(v).toFixed(2)} G`, name ?? '']}
                            labelFormatter={v => `${(Number(v) * 1000).toFixed(0)}m`}
                        />
                        <ReferenceLine y={0} stroke="#27272a" />
                        <Line dataKey="refGSum" name="REF G-Sum" stroke="#fb923c" strokeWidth={1} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
                        <Line dataKey="anaGSum" name="ANA G-Sum" stroke="#f87171" strokeWidth={1} strokeDasharray="3 2" dot={false} isAnimationActive={false} />
                        <Line dataKey="refLonG" name="REF LonG" stroke="#fdba74" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                        <Line dataKey="anaLonG" name="ANA LonG" stroke="#fca5a5" strokeWidth={1.2} dot={false} isAnimationActive={false} />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
            <div className="text-[9px] text-zinc-600 text-center">
                <span>─ LonG</span>
                <span className="mx-2">┈ G-Sum</span>
                <span className="text-zinc-700">Distance (m)</span>
            </div>
        </div>
    );
};

const ReportCharts: React.FC<ReportChartsProps> = ({ data, viewData, refLapIndex, anaLapIndex }) => {
    const { t } = useTranslation();
    const [showCornerCharts, setShowCornerCharts] = useState(true);

    const refLap = data.laps.find(l => l.index === refLapIndex);
    const anaLap = data.laps.find(l => l.index === anaLapIndex);

    // Downsample for performance
    const chartPoints = useMemo(() => downsamplePoints(viewData), [viewData]);

    // Speed overlay data
    const speedData = useMemo(() =>
        chartPoints.map(p => ({
            d: Math.round(p.distance * 1000) / 1000,
            refVal: Math.round(p.refSpeed * 10) / 10,
            anaVal: Math.round(p.anaSpeed * 10) / 10,
        })),
        [chartPoints]);

    // Time delta data
    const deltaData = useMemo(() =>
        chartPoints.map(p => ({
            d: Math.round(p.distance * 1000) / 1000,
            delta: Math.round(p.timeDelta * 1000) / 1000,
        })),
        [chartPoints]);

    // Corner time comparison
    const cornerDeltas = useMemo((): CornerDelta[] => {
        if (!refLap?.corners || !anaLap?.corners) return [];
        const refMap = new Map<number, Corner>();
        for (const c of refLap.corners) refMap.set(c.id, c);
        return anaLap.corners
            .filter(ac => refMap.has(ac.id))
            .map(ac => {
                const rc = refMap.get(ac.id)!;
                return {
                    name: ac.name || `C${ac.id}`,
                    delta: ac.duration - rc.duration,
                    direction: ac.direction ?? '?',
                };
            })
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [refLap, anaLap]);

    // Per-corner chart data
    const cornerCharts = useMemo((): CornerChartData[] => {
        if (!refLap?.corners || !anaLap?.corners || !viewData.length) return [];

        const refCorners = refLap.corners;
        const anaCornerMap = new Map<number, Corner>();
        for (const c of anaLap.corners) anaCornerMap.set(c.id, c);

        // Compute distance ranges from ref corners
        const rangeMap = computeCornerRanges(refCorners, viewData);

        return refCorners
            .filter(rc => anaCornerMap.has(rc.id) && rangeMap.has(rc.id))
            .map(rc => {
                const ac = anaCornerMap.get(rc.id)!;
                const range = rangeMap.get(rc.id)!;

                // Slice analysis points for this corner
                const pts = viewData.filter(p => p.distance >= range.startDist && p.distance <= range.endDist);

                // Downsample if too many points
                const maxPts = 40;
                let sampled = pts;
                if (pts.length > maxPts) {
                    const step = pts.length / maxPts;
                    sampled = [];
                    for (let i = 0; i < maxPts; i++) {
                        sampled.push(pts[Math.floor(i * step)]);
                    }
                    // Always include last point
                    if (sampled[sampled.length - 1] !== pts[pts.length - 1]) {
                        sampled.push(pts[pts.length - 1]);
                    }
                }

                return {
                    id: rc.id,
                    name: rc.name || `C${rc.id}`,
                    direction: rc.direction ?? '?',
                    delta: ac.duration - rc.duration,
                    points: sampled.map(p => ({
                        d: Math.round(p.distance * 1000) / 1000,
                        refSpeed: Math.round(p.refSpeed * 10) / 10,
                        anaSpeed: Math.round(p.anaSpeed * 10) / 10,
                        refGSum: Math.round((p.refGSum ?? 0) * 100) / 100,
                        anaGSum: Math.round((p.anaGSum ?? 0) * 100) / 100,
                        refLonG: Math.round((p.refLonG ?? 0) * 100) / 100,
                        anaLonG: Math.round((p.anaLonG ?? 0) * 100) / 100,
                    })),
                };
            })
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [refLap, anaLap, viewData]);

    // Lap activity (BRK/CRN/TPS/CST percentages from analysis points)
    const activityData = useMemo(() => {
        if (!viewData.length) return null;
        const total = viewData.length;
        const calc = (key: 'anaBrkOn' | 'anaCrnOn' | 'anaTpsOn' | 'anaCstOn' | 'refBrkOn' | 'refCrnOn' | 'refTpsOn' | 'refCstOn') =>
            Math.round(viewData.filter(p => p[key] === 1).length / total * 100);
        return [
            { name: 'BRK', anaVal: calc('anaBrkOn'), refVal: calc('refBrkOn') },
            { name: 'CRN', anaVal: calc('anaCrnOn'), refVal: calc('refCrnOn') },
            { name: 'TPS', anaVal: calc('anaTpsOn'), refVal: calc('refTpsOn') },
            { name: 'CST', anaVal: calc('anaCstOn'), refVal: calc('refCstOn') },
        ];
    }, [viewData]);

    if (!refLap || !anaLap || !viewData.length) return null;

    const timeDiff = anaLap.duration - refLap.duration;

    return (
        <div className="space-y-5 mb-6 pb-5 border-b border-zinc-800">
            {/* Lap summary header */}
            <div className="flex items-center gap-4 text-xs font-mono">
                <div className="flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-orange-400 inline-block rounded" />
                    <span className="text-orange-400 font-bold">REF L{refLapIndex}</span>
                    <span className="text-zinc-400">{formatLapTime(refLap.duration)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-red-400 inline-block rounded" />
                    <span className="text-red-400 font-bold">ANA L{anaLapIndex}</span>
                    <span className="text-zinc-400">{formatLapTime(anaLap.duration)}</span>
                </div>
                <span className={`font-bold ${timeDiff < 0 ? 'text-green-400' : timeDiff > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                    {timeDiff > 0 ? '+' : ''}{timeDiff.toFixed(3)}s
                </span>
            </div>

            {/* Speed comparison */}
            <div>
                <h4 className="text-[11px] text-zinc-500 uppercase font-semibold mb-2">{t.charts.speed} vs {t.charts.distanceLabel}</h4>
                <div className="h-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={speedData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis
                                dataKey="d" type="number" domain={[0, 'auto']}
                                tick={{ fill: '#52525b', fontSize: 10 }}
                                tickFormatter={v => v.toFixed(1)}
                            />
                            <YAxis tick={{ fill: '#52525b', fontSize: 10 }} width={40} />
                            <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => `${Number(v).toFixed(1)} km/h`} labelFormatter={v => `${Number(v).toFixed(2)} km`} />
                            <Line dataKey="refVal" name={`REF L${refLapIndex}`} stroke="#fb923c" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                            <Line dataKey="anaVal" name={`ANA L${anaLapIndex}`} stroke="#f87171" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Time delta */}
            <div>
                <h4 className="text-[11px] text-zinc-500 uppercase font-semibold mb-2">{t.charts.timeDelta}</h4>
                <div className="h-[140px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={deltaData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                            <XAxis
                                dataKey="d" type="number" domain={[0, 'auto']}
                                tick={{ fill: '#52525b', fontSize: 10 }}
                                tickFormatter={v => v.toFixed(1)}
                            />
                            <YAxis tick={{ fill: '#52525b', fontSize: 10 }} width={40} />
                            <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(3)}s`} labelFormatter={v => `${Number(v).toFixed(2)} km`} />
                            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
                            <defs>
                                <linearGradient id="reportDeltaGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                                    <stop offset="50%" stopColor="#71717a" stopOpacity={0.05} />
                                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0.3} />
                                </linearGradient>
                            </defs>
                            <Line dataKey="delta" name={t.charts.timeDelta} stroke="#a78bfa" strokeWidth={2} dot={false} isAnimationActive={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Corner time delta bar chart */}
            {cornerDeltas.length > 0 && (
                <div>
                    <h4 className="text-[11px] text-zinc-500 uppercase font-semibold mb-2">
                        {t.overview.cornerTimeComparison}
                    </h4>
                    <div className="h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={cornerDeltas} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                                <XAxis type="number" tick={{ fill: '#52525b', fontSize: 10 }} tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(2)}`} />
                                <YAxis type="category" dataKey="name" width={50} tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={customTooltipStyle}
                                    formatter={(v: any) => `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(3)}s`}
                                />
                                <ReferenceLine x={0} stroke="#52525b" />
                                <Bar dataKey="delta" isAnimationActive={false} radius={[0, 3, 3, 0]}>
                                    {cornerDeltas.map((cd, i) => (
                                        <Cell key={i} fill={cd.delta < 0 ? '#22c55e' : cd.delta > 0 ? '#ef4444' : '#71717a'} fillOpacity={0.7} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Lap activity breakdown */}
            {activityData && (
                <div>
                    <h4 className="text-[11px] text-zinc-500 uppercase font-semibold mb-2">
                        {t.lapMetrics.lapActivityBreakdown}
                    </h4>
                    <div className="h-[120px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={activityData} barGap={2} barCategoryGap="20%">
                                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                                <XAxis dataKey="name" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#52525b', fontSize: 10 }} width={30} tickFormatter={v => `${v}%`} />
                                <Tooltip contentStyle={customTooltipStyle} formatter={(v: any) => `${v}%`} />
                                <Legend wrapperStyle={{ fontSize: '10px' }} />
                                <Bar dataKey="refVal" name={`REF L${refLapIndex}`} fill="#fb923c" fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                                <Bar dataKey="anaVal" name={`ANA L${anaLapIndex}`} fill="#f87171" fillOpacity={0.7} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Per-corner detail charts */}
            {cornerCharts.length > 0 && (
                <div>
                    <button
                        onClick={() => setShowCornerCharts(prev => !prev)}
                        className="flex items-center gap-1.5 text-[11px] text-zinc-500 uppercase font-semibold mb-3 hover:text-zinc-300 transition-colors"
                    >
                        {showCornerCharts ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {t.corner.analysisTitle} — {cornerCharts.length} {t.common.corners}
                    </button>
                    {showCornerCharts && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {cornerCharts.map(cc => (
                                <CornerMiniChart
                                    key={cc.id}
                                    corner={cc}
                                    refLapIndex={refLapIndex}
                                    anaLapIndex={anaLapIndex}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ReportCharts;
