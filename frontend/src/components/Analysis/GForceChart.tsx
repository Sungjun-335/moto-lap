import React, { useRef, useState } from 'react';
import {
    ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange } from './AnalysisChartWrapper';
import { useTranslation } from '../../i18n/context';

interface GForceChartProps {
    data: AnalysisPoint[];
    activePoint?: AnalysisPoint | null;
    cornerRanges?: CornerRange[];
}

const ANA_COLOR = '#3b82f6';
const REF_COLOR = '#f97316';

const CORNER_PALETTE = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
];

const NoDot = (): React.ReactElement => <g />;

const ActiveDotShape = (props: any): React.ReactElement => {
    const { cx, cy, fill } = props;
    if (cx == null || cy == null) return <g />;
    return (
        <g>
            <circle cx={cx} cy={cy} r={8} fill="none" stroke={fill} strokeWidth={1.5} strokeOpacity={0.6} />
            <circle cx={cx} cy={cy} r={4} fill={fill} fillOpacity={0.9} />
        </g>
    );
};

interface SingleGCircleProps {
    plotData: { latG: number; lonG: number }[];
    activeData: { latG: number; lonG: number }[];
    color: string;
    label: string;
    activeG?: number | null;
}

const SingleGCircle: React.FC<SingleGCircleProps> = ({ plotData, activeData, color, label, activeG }) => (
    <div className="flex flex-col items-center flex-1 min-w-0 min-h-0">
        <div className="flex items-center justify-between w-full px-1 mb-0.5">
            <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-zinc-500">{label}</span>
            </div>
            {activeG != null && (
                <span className="text-[10px] font-mono" style={{ color }}>{activeG.toFixed(2)}G</span>
            )}
        </div>
        <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 2, right: 2, bottom: 12, left: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                        dataKey="lonG"
                        type="number"
                        name="Lon G"
                        domain={[-1.5, 1.5]}
                        tick={{ fill: '#666', fontSize: 9 }}
                        label={{ value: 'Lon G', position: 'bottom', fill: '#555', fontSize: 8 }}
                    />
                    <YAxis
                        dataKey="latG"
                        type="number"
                        name="Lat G"
                        domain={[-1.5, 1.5]}
                        tick={{ fill: '#666', fontSize: 9 }}
                        label={{ value: 'Lat G', angle: -90, position: 'left', fill: '#555', fontSize: 8 }}
                    />
                    <ReferenceLine y={0} stroke="#555" />
                    <ReferenceLine x={0} stroke="#555" />
                    <Scatter data={plotData} fill={color} shape={NoDot} line={{ stroke: color, strokeWidth: 1.5, strokeOpacity: 0.7 }} isAnimationActive={false} legendType="none" />
                    {activeData.length > 0 && (
                        <Scatter data={activeData} fill={color} shape={ActiveDotShape} isAnimationActive={false} legendType="none" />
                    )}
                </ScatterChart>
            </ResponsiveContainer>
        </div>
    </div>
);

interface CornerGData {
    id: number;
    name: string;
    color: string;
    data: { latG: number; lonG: number }[];
}

interface CornerGCircleProps {
    cornerDataSets: CornerGData[];
    activeData: { latG: number; lonG: number }[];
    label: string;
    activeG?: number | null;
}

const CornerGCircle: React.FC<CornerGCircleProps> = ({ cornerDataSets, activeData, label, activeG }) => (
    <div className="flex flex-col items-center flex-1 min-w-0 min-h-0">
        <div className="flex items-center justify-between w-full px-1 mb-0.5">
            <span className="text-[10px] text-zinc-500">{label}</span>
            {activeG != null && (
                <span className="text-[10px] font-mono text-zinc-300">{activeG.toFixed(2)}G</span>
            )}
        </div>
        <div className="flex-1 w-full min-h-0">
            <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 2, right: 2, bottom: 12, left: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                    <XAxis
                        dataKey="lonG"
                        type="number"
                        name="Lon G"
                        domain={[-1.5, 1.5]}
                        tick={{ fill: '#666', fontSize: 9 }}
                        label={{ value: 'Lon G', position: 'bottom', fill: '#555', fontSize: 8 }}
                    />
                    <YAxis
                        dataKey="latG"
                        type="number"
                        name="Lat G"
                        domain={[-1.5, 1.5]}
                        tick={{ fill: '#666', fontSize: 9 }}
                        label={{ value: 'Lat G', angle: -90, position: 'left', fill: '#555', fontSize: 8 }}
                    />
                    <ReferenceLine y={0} stroke="#555" />
                    <ReferenceLine x={0} stroke="#555" />
                    {cornerDataSets.map(cs => (
                        <Scatter
                            key={cs.id}
                            data={cs.data}
                            fill={cs.color}
                            shape={NoDot}
                            line={{ stroke: cs.color, strokeWidth: 1.5, strokeOpacity: 0.8 }}
                            isAnimationActive={false}
                            name={cs.name}
                            legendType="none"
                        />
                    ))}
                    {activeData.length > 0 && (
                        <Scatter data={activeData} fill="#fff" shape={ActiveDotShape} isAnimationActive={false} legendType="none" />
                    )}
                </ScatterChart>
            </ResponsiveContainer>
        </div>
        {/* Corner legend */}
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 px-1 mt-0.5">
            {cornerDataSets.map(cs => (
                <span key={cs.id} className="flex items-center gap-0.5 text-[9px] text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cs.color }} />
                    {cs.name}
                </span>
            ))}
        </div>
    </div>
);

const GForceChart: React.FC<GForceChartProps> = ({ data, activePoint = null, cornerRanges }) => {
    const { t } = useTranslation();
    const containerRef = useRef<HTMLDivElement>(null);
    const [gMode, setGMode] = useState<'all' | 'corner'>('all');

    const hasCorners = cornerRanges && cornerRanges.length > 0;

    const { anaPlot, refPlot } = React.useMemo(() => {
        const maxPoints = 1000;
        const step = data.length > maxPoints ? Math.ceil(data.length / maxPoints) : 1;
        const ana: { latG: number; lonG: number }[] = [];
        const ref: { latG: number; lonG: number }[] = [];
        for (let i = 0; i < data.length; i += step) {
            const p = data[i];
            ana.push({ latG: p.anaLatG, lonG: p.anaLonG });
            ref.push({ latG: p.refLatG, lonG: p.refLonG });
        }
        return { anaPlot: ana, refPlot: ref };
    }, [data]);

    const cornerData = React.useMemo(() => {
        if (!cornerRanges?.length) return { ana: [] as CornerGData[], ref: [] as CornerGData[] };
        const ana: CornerGData[] = [];
        const ref: CornerGData[] = [];

        cornerRanges.forEach((cr, idx) => {
            const color = CORNER_PALETTE[idx % CORNER_PALETTE.length];
            const cornerPoints = data.filter(p => p.distance >= cr.startDist && p.distance <= cr.endDist);
            const maxPts = 200;
            const step = cornerPoints.length > maxPts ? Math.ceil(cornerPoints.length / maxPts) : 1;

            const anaData: { latG: number; lonG: number }[] = [];
            const refData: { latG: number; lonG: number }[] = [];
            for (let i = 0; i < cornerPoints.length; i += step) {
                const p = cornerPoints[i];
                anaData.push({ latG: p.anaLatG, lonG: p.anaLonG });
                refData.push({ latG: p.refLatG, lonG: p.refLonG });
            }

            ana.push({ id: cr.id, name: cr.name || `C${cr.id}`, color, data: anaData });
            ref.push({ id: cr.id, name: cr.name || `C${cr.id}`, color, data: refData });
        });

        return { ana, ref };
    }, [data, cornerRanges]);

    const activeAna = React.useMemo(() => {
        if (!activePoint || activePoint.anaLatG == null || activePoint.anaLonG == null) return [];
        return [{ latG: activePoint.anaLatG, lonG: activePoint.anaLonG }];
    }, [activePoint]);

    const activeRef = React.useMemo(() => {
        if (!activePoint || activePoint.refLatG == null || activePoint.refLonG == null) return [];
        return [{ latG: activePoint.refLatG, lonG: activePoint.refLonG }];
    }, [activePoint]);

    const activeGValues = React.useMemo(() => {
        if (!activePoint) return null;
        const aLat = activePoint.anaLatG, aLon = activePoint.anaLonG;
        const rLat = activePoint.refLatG, rLon = activePoint.refLonG;
        if (aLat == null || aLon == null || rLat == null || rLon == null) return null;
        return {
            anaTotal: Math.sqrt(aLat * aLat + aLon * aLon),
            refTotal: Math.sqrt(rLat * rLat + rLon * rLon),
        };
    }, [activePoint]);

    return (
        <div ref={containerRef} className="w-full h-full bg-zinc-900 rounded-xl border border-zinc-800 p-2 flex flex-col">
            <div className="flex items-center justify-between px-1 mb-1">
                <h3 className="text-xs text-zinc-400 font-medium">{t.charts.gCircle}</h3>
                {hasCorners && (
                    <div className="flex items-center gap-0.5">
                        <button
                            onClick={() => setGMode('all')}
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                                gMode === 'all'
                                    ? 'bg-zinc-700 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {t.charts.gCircleAll}
                        </button>
                        <button
                            onClick={() => setGMode('corner')}
                            className={`px-1.5 py-0.5 text-[10px] font-medium rounded transition-all ${
                                gMode === 'corner'
                                    ? 'bg-zinc-700 text-white'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {t.charts.gCircleCorner}
                        </button>
                    </div>
                )}
            </div>
            <div className="flex-1 flex gap-1 min-h-0">
                {gMode === 'all' || !hasCorners ? (
                    <>
                        <SingleGCircle
                            plotData={anaPlot}
                            activeData={activeAna}
                            color={ANA_COLOR}
                            label={t.charts.current}
                            activeG={activeGValues?.anaTotal}
                        />
                        <SingleGCircle
                            plotData={refPlot}
                            activeData={activeRef}
                            color={REF_COLOR}
                            label={t.charts.reference}
                            activeG={activeGValues?.refTotal}
                        />
                    </>
                ) : (
                    <>
                        <CornerGCircle
                            cornerDataSets={cornerData.ana}
                            activeData={activeAna}
                            label={t.charts.current}
                            activeG={activeGValues?.anaTotal}
                        />
                        <CornerGCircle
                            cornerDataSets={cornerData.ref}
                            activeData={activeRef}
                            label={t.charts.reference}
                            activeG={activeGValues?.refTotal}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default React.memo(GForceChart, (prev, next) => {
    return prev.data === next.data && prev.activePoint === next.activePoint && prev.cornerRanges === next.cornerRanges;
});
