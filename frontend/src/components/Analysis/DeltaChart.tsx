import React, { useMemo } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea, ReferenceDot
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange } from './AnalysisChartWrapper';
import { useTranslation } from '../../i18n/context';
import { findKeyPoints, formatKeyPointValue } from '../../utils/keyPoints';

interface DeltaChartProps {
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

const CORNER_COLORS = ['rgba(59,130,246,0.22)', 'rgba(168,85,247,0.22)'];

const DeltaChart: React.FC<DeltaChartProps> = ({
    data, height = 200, syncId, onMouseMove, onMouseDown, onMouseUp, onMouseLeave, zoomDomain, refAreaLeft, refAreaRight, cornerRanges
}) => {
    const { t } = useTranslation();
    const keyPoints = useMemo(() => {
        if (data.length < 10) return [];
        return findKeyPoints(data, 'timeDelta', '#ef4444');
    }, [data]);

    return (
        <div style={{ width: '100%', height: height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <h3 className="text-xs text-zinc-400 font-medium mb-1 ml-2">{t.charts.timeDelta} <span className="text-zinc-500">{t.charts.timeDeltaSuffix}</span></h3>
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer>
                    <AreaChart
                        data={data}
                        syncId={syncId}
                        onMouseMove={onMouseMove}
                        onMouseDown={onMouseDown}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseLeave}
                        margin={{ top: 5, right: 30, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorDelta" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                            </linearGradient>
                        </defs>
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

                        {cornerRanges?.map((cr, i) => (
                            i > 0 ? <ReferenceLine
                                key={`corner-border-${cr.id}`}
                                x={cr.startDist}
                                stroke="rgba(255,255,255,0.25)"
                                strokeWidth={1}
                                ifOverflow="extendDomain"
                            /> : null
                        ))}

                        {cornerRanges?.map(cr => (
                            <ReferenceLine
                                key={`corner-label-${cr.id}`}
                                x={(cr.startDist + cr.endDist) / 2}
                                stroke="none"
                                ifOverflow="extendDomain"
                                label={{
                                    value: cr.name || `C${cr.id}`,
                                    position: 'top',
                                    fill: '#aaa',
                                    fontSize: 9,
                                    fontWeight: 600,
                                }}
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
                            tick={{ fill: '#666', fontSize: 10 }}
                            domain={['auto', 'auto']}
                            width={40}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', fontSize: '12px' }}
                            itemStyle={{ color: '#ccc' }}
                            labelFormatter={(label) => `Dist: ${(label / 1000).toFixed(3)}km`}
                            formatter={(value: number) => [value.toFixed(3) + 's', 'Delta']}
                        />
                        <ReferenceLine y={0} stroke="#666" />

                        {/* 
                            We want to color above 0 red (Loss) and below 0 green (Gain).
                            Recharts local gradient split is complex.
                            For V1, just use a single line or Area.
                            Let's use a simple red line, user understands Up = slower, Down = faster.
                        */}
                        <Area
                            type="monotone"
                            dataKey="timeDelta"
                            stroke="#ef4444"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorDelta)" // Enh: Dynamic fill based on value?
                        />

                        {keyPoints.map((kp, i) => (
                            <ReferenceDot
                                key={`kp-${i}`}
                                x={kp.distance}
                                y={kp.value}
                                r={3}
                                fill={kp.lineColor || (kp.type === 'max' ? '#22c55e' : '#ef4444')}
                                stroke="rgba(0,0,0,0.5)"
                                strokeWidth={1}
                                ifOverflow="extendDomain"
                                label={{
                                    value: formatKeyPointValue(kp.value),
                                    position: kp.type === 'max' ? 'top' : 'bottom',
                                    fill: kp.lineColor || (kp.type === 'max' ? '#22c55e' : '#ef4444'),
                                    fontSize: 9,
                                    fontWeight: 600,
                                }}
                            />
                        ))}

                        {refAreaLeft && refAreaRight ? (
                            <ReferenceArea
                                x1={refAreaLeft}
                                x2={refAreaRight}
                                strokeOpacity={0.3}
                                ifOverflow="extendDomain"
                            />
                        ) : null}

                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

// Relax memoization to allow re-rendering during drag (for ReferenceArea update)
export default React.memo(DeltaChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.zoomDomain === next.zoomDomain &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges;
});
