import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange } from './AnalysisChartWrapper';
import { useTranslation } from '../../i18n/context';

interface ThrottleBrakeChartProps {
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

// TPS & Brake Chart Component
const ThrottleBrakeChart: React.FC<ThrottleBrakeChartProps> = ({
    data, height = 150, syncId, onMouseMove, onMouseDown, onMouseUp, onMouseLeave, zoomDomain, refAreaLeft, refAreaRight, cornerRanges
}) => {
    const { t } = useTranslation();
    return (
        <div style={{ width: '100%', height: height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <h3 className="text-xs text-zinc-400 font-medium mb-1 ml-2">{t.charts.throttleBrake}</h3>
            <div className="flex-1 w-full min-h-0">
                <ResponsiveContainer>
                    <LineChart
                        data={data}
                        syncId={syncId}
                        onMouseMove={onMouseMove}
                        onMouseDown={onMouseDown}
                        onMouseUp={onMouseUp}
                        onMouseLeave={onMouseLeave}
                        margin={{ top: 5, right: 30, left: -20, bottom: 0 }}
                    >
                        {refAreaLeft && refAreaRight ? (
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
                                label={{ value: cr.name || `C${cr.id}`, position: 'top', fill: '#aaa', fontSize: 9, fontWeight: 600 }}
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
                            domain={['auto', 'auto']}
                            tick={{ fill: '#666', fontSize: 10 }}
                            width={40}
                        />

                        <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', fontSize: '12px' }}
                            itemStyle={{ color: '#ccc' }}
                            labelFormatter={(label) => `Dist: ${label.toFixed(3)}km`}
                        />
                        <Legend verticalAlign="top" height={30} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />

                        <Line type="monotone" dataKey="anaTps" stroke="#22c55e" dot={false} strokeWidth={2} name="TPS (Ana)" />
                        <Line type="monotone" dataKey="anaBrake" stroke="#ef4444" dot={false} strokeWidth={2} name="Brake (Ana)" />
                        <Line type="monotone" dataKey="refTps" stroke="#4ade80" dot={false} strokeWidth={2} name="TPS (Ref)" />
                        <Line type="monotone" dataKey="refBrake" stroke="#f87171" dot={false} strokeWidth={2} name="Brake (Ref)" />

                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default React.memo(ThrottleBrakeChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.zoomDomain === next.zoomDomain &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges;
});
