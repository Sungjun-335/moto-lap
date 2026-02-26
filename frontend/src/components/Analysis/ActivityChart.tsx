import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea, ReferenceLine
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange } from './AnalysisChartWrapper';
import { useTranslation } from '../../i18n/context';

interface ActivityChartProps {
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
}

const CHANNEL_COLORS = {
    brk: '#ef4444',
    crn: '#3b82f6',
    tps: '#22c55e',
    cst: '#71717a',
};

const CORNER_COLORS = ['rgba(59,130,246,0.08)', 'rgba(168,85,247,0.08)'];

interface ActivityData {
    distance: number;
    // Ana channels: mutually exclusive stacking (value 1 = active at that layer)
    anaBrk: number;
    anaCrn: number;
    anaTps: number;
    anaCst: number;
    // Ref channels: negative side (value -1 = active at that layer)
    refBrk: number;
    refCrn: number;
    refTps: number;
    refCst: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;

    const d = payload[0]?.payload as ActivityData | undefined;
    if (!d) return null;

    const anaActive = d.anaBrk > 0 ? 'BRK' : d.anaCrn > 0 ? 'CRN' : d.anaTps > 0 ? 'TPS' : 'CST';
    const refActive = d.refBrk < 0 ? 'BRK' : d.refCrn < 0 ? 'CRN' : d.refTps < 0 ? 'TPS' : 'CST';

    const colorMap: Record<string, string> = {
        BRK: CHANNEL_COLORS.brk,
        CRN: CHANNEL_COLORS.crn,
        TPS: CHANNEL_COLORS.tps,
        CST: CHANNEL_COLORS.cst,
    };

    return (
        <div className="bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-xs">
            <div className="text-zinc-400 mb-1">Dist: {Number(label).toFixed(3)} km</div>
            <div className="flex gap-4">
                <div>
                    <span className="text-zinc-500">Ana: </span>
                    <span style={{ color: colorMap[anaActive] }} className="font-bold">{anaActive}</span>
                </div>
                <div>
                    <span className="text-zinc-500">Ref: </span>
                    <span style={{ color: colorMap[refActive] }} className="font-bold">{refActive}</span>
                </div>
            </div>
        </div>
    );
};

const ActivityChart: React.FC<ActivityChartProps> = ({
    data, height = 120, syncId, onMouseMove, onMouseDown, onMouseUp, onMouseLeave, zoomDomain, refAreaLeft, refAreaRight, cornerRanges
}) => {
    const { t } = useTranslation();
    const chartData = useMemo<ActivityData[]>(() => {
        return data.map(p => {
            // For Ana (top half: 0 to 1), pick the dominant channel
            // Priority: BRK > CRN > TPS > CST
            let anaBrk = 0, anaCrn = 0, anaTps = 0, anaCst = 0;
            if (p.anaBrkOn) anaBrk = 1;
            else if (p.anaCrnOn) anaCrn = 1;
            else if (p.anaTpsOn) anaTps = 1;
            else anaCst = 1;

            // For Ref (bottom half: 0 to -1)
            let refBrk = 0, refCrn = 0, refTps = 0, refCst = 0;
            if (p.refBrkOn) refBrk = -1;
            else if (p.refCrnOn) refCrn = -1;
            else if (p.refTpsOn) refTps = -1;
            else refCst = -1;

            return {
                distance: p.distance,
                anaBrk, anaCrn, anaTps, anaCst,
                refBrk, refCrn, refTps, refCst,
            };
        });
    }, [data]);

    return (
        <div style={{ width: '100%', height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <div className="flex items-center gap-3 mb-1 ml-2">
                <h3 className="text-xs text-zinc-400 font-medium">{t.charts.activityChannel}</h3>
                <div className="flex items-center gap-2 text-[10px]">
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: CHANNEL_COLORS.brk }} />BRK</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: CHANNEL_COLORS.crn }} />CRN</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: CHANNEL_COLORS.tps }} />TPS</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm" style={{ background: CHANNEL_COLORS.cst }} />CST</span>
                </div>
            </div>
            <div className="flex-1 w-full min-h-0 relative">
                {/* Center label indicators */}
                <div className="absolute left-1 top-1 text-[9px] text-zinc-500 z-10">Ana</div>
                <div className="absolute left-1 bottom-1 text-[9px] text-zinc-500 z-10">Ref</div>
                <ResponsiveContainer>
                    <AreaChart
                        data={chartData}
                        syncId={syncId}
                        onMouseMove={onMouseMove}
                        onMouseDown={onMouseDown}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseLeave}
                        margin={{ top: 2, right: 10, left: -20, bottom: 2 }}
                    >
                        {refAreaLeft != null && refAreaRight != null ? (
                            <ReferenceArea
                                x1={refAreaLeft}
                                x2={refAreaRight}
                                strokeOpacity={0.3}
                                ifOverflow="extendDomain"
                            />
                        ) : null}

                        {cornerRanges?.map((cr, i) => (
                            <ReferenceArea
                                key={`corner-bg-${cr.id}`}
                                x1={cr.startDist}
                                x2={cr.endDist}
                                fill={CORNER_COLORS[i % 2]}
                                fillOpacity={1}
                                stroke="none"
                                ifOverflow="extendDomain"
                            />
                        ))}
                        {cornerRanges?.map(cr => (
                            <ReferenceLine
                                key={`corner-label-${cr.id}`}
                                x={(cr.startDist + cr.endDist) / 2}
                                stroke="rgba(255,255,255,0.15)"
                                strokeDasharray="2 4"
                                ifOverflow="extendDomain"
                                label={{ value: cr.name || `C${cr.id}`, position: 'top', fill: '#888', fontSize: 9, fontWeight: 600 }}
                            />
                        ))}

                        <CartesianGrid strokeDasharray="3 3" stroke="#333" vertical={false} />
                        <XAxis
                            dataKey="distance"
                            type="number"
                            domain={zoomDomain || ['dataMin', 'dataMax']}
                            allowDataOverflow={true}
                            tick={{ fill: '#666', fontSize: 10 }}
                            tickFormatter={(val) => val.toFixed(3)}
                        />
                        <YAxis
                            domain={[-1, 1]}
                            tick={false}
                            axisLine={false}
                            tickLine={false}
                        />
                        {/* Center line */}
                        <ReferenceLine y={0} stroke="#555" strokeWidth={1} />

                        <Tooltip content={<CustomTooltip />} />

                        {/* Ana channels (positive, stacked) */}
                        <Area type="stepAfter" dataKey="anaBrk" stackId="ana" fill={CHANNEL_COLORS.brk} stroke="none" fillOpacity={0.8} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="anaCrn" stackId="ana" fill={CHANNEL_COLORS.crn} stroke="none" fillOpacity={0.8} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="anaTps" stackId="ana" fill={CHANNEL_COLORS.tps} stroke="none" fillOpacity={0.8} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="anaCst" stackId="ana" fill={CHANNEL_COLORS.cst} stroke="none" fillOpacity={0.4} isAnimationActive={false} />

                        {/* Ref channels (negative, stacked) */}
                        <Area type="stepAfter" dataKey="refBrk" stackId="ref" fill={CHANNEL_COLORS.brk} stroke="none" fillOpacity={0.5} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="refCrn" stackId="ref" fill={CHANNEL_COLORS.crn} stroke="none" fillOpacity={0.5} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="refTps" stackId="ref" fill={CHANNEL_COLORS.tps} stroke="none" fillOpacity={0.5} isAnimationActive={false} />
                        <Area type="stepAfter" dataKey="refCst" stackId="ref" fill={CHANNEL_COLORS.cst} stroke="none" fillOpacity={0.3} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default React.memo(ActivityChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.zoomDomain === next.zoomDomain &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges;
});
