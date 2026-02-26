import React, { useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine, ReferenceDot
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange } from './AnalysisChartWrapper';
import { useTranslation } from '../../i18n/context';
import { findKeyPoints, formatKeyPointValue } from '../../utils/keyPoints';

interface InputChartProps {
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

// RPM Chart Component (RPM Only)
const InputChart: React.FC<InputChartProps> = ({
    data, height = 150, syncId, onMouseMove, onMouseDown, onMouseUp, onMouseLeave, zoomDomain, refAreaLeft, refAreaRight, cornerRanges
}) => {
    const { t } = useTranslation();
    const keyPoints = useMemo(() => {
        if (data.length < 10) return [];
        return [
            ...findKeyPoints(data, 'anaRpm', '#ef4444'),
            ...findKeyPoints(data, 'refRpm', '#3b82f6'),
        ];
    }, [data]);

    return (
        <div style={{ width: '100%', height: height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <h3 className="text-xs text-zinc-400 font-medium mb-1 ml-2">{t.charts.rpm}</h3>
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
                            labelFormatter={(label) => `Dist: ${(label / 1000).toFixed(3)}km`}
                        />
                        <Legend verticalAlign="top" height={30} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />

                        <Line type="monotone" dataKey="anaRpm" stroke="#ef4444" dot={false} strokeWidth={2} name="RPM (Ana)" />
                        <Line type="monotone" dataKey="refRpm" stroke="#3b82f6" dot={false} strokeWidth={2} name="RPM (Ref)" />

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
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default React.memo(InputChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.zoomDomain === next.zoomDomain &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges;
});
