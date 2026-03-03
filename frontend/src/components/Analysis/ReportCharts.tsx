import React, { useMemo } from 'react';
import {
    LineChart, Line, BarChart, Bar, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    ReferenceLine, Legend,
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { SessionData, Corner } from '../../types';
import { useTranslation } from '../../i18n/context';
import { formatLapTime } from '../../utils/formatLapTime';

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

const ReportCharts: React.FC<ReportChartsProps> = ({ data, viewData, refLapIndex, anaLapIndex }) => {
    const { t } = useTranslation();

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

    const customTooltipStyle = {
        backgroundColor: 'rgb(24 24 27 / 0.95)',
        border: '1px solid rgb(63 63 70)',
        borderRadius: '8px',
        fontSize: '11px',
        padding: '6px 10px',
    };

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
        </div>
    );
};

export default ReportCharts;
