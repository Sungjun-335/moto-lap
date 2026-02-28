import React, { useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceArea, ReferenceLine, ReferenceDot
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange, DrivingEventMarker } from './AnalysisChartWrapper';
import { findKeyPoints, findCornerKeyPoints, resolveKeyPointPositions, adjustKeyPointsForLines, formatKeyPointValue } from '../../utils/keyPoints';

export interface LineConfig {
    dataKey: keyof AnalysisPoint;
    color: string;
    name: string;
    strokeWidth?: number;
    strokeDasharray?: string;
    strokeOpacity?: number;
    type?: 'monotone' | 'stepAfter' | 'linear';
}

export interface FlexibleLineChartProps {
    data: AnalysisPoint[];
    height?: number;
    syncId?: string;
    title: string;
    lines: LineConfig[];
    yDomain?: [number | string, number | string];
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

const CORNER_COLORS = ['rgba(59,130,246,0.22)', 'rgba(168,85,247,0.22)'];

const EVENT_COLORS: Record<string, string> = {
    SOB: '#fca5a5', COB: '#ef4444', EOB: '#b91c1c',
    SOL: '#c4b5fd', COL: '#8b5cf6', EOL: '#6d28d9',
    SOT: '#86efac', COT: '#22c55e', EOT: '#15803d',
    G_DIP: '#f59e0b',
    MIN_VEL: '#06b6d4',
};

const FlexibleLineChart: React.FC<FlexibleLineChartProps> = ({
    data, height = 180, syncId, title, lines, yDomain,
    onMouseMove, onMouseDown, onMouseUp, onMouseLeave,
    zoomDomain, refAreaLeft, refAreaRight, cornerRanges, drivingEventMarkers,
}) => {
    // Find key points: per-corner if corner ranges available, else global
    // Pipeline: find → adjust for line overlap → resolve label-to-label conflicts
    const allKeyPoints = useMemo(() => {
        if (data.length < 10) return [];
        const continuousLines = lines.filter(l => l.type !== 'stepAfter');
        let raw: ReturnType<typeof findKeyPoints>;
        if (cornerRanges?.length) {
            raw = findCornerKeyPoints(data, cornerRanges, lines);
        } else {
            raw = continuousLines.flatMap(line =>
                findKeyPoints(data, line.dataKey, line.color)
            );
        }
        const adjusted = adjustKeyPointsForLines(raw, data, continuousLines);
        return resolveKeyPointPositions(adjusted);
    }, [data, lines, cornerRanges]);

    return (
        <div style={{ width: '100%', height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <h3 className="text-xs text-zinc-400 font-medium mb-1 ml-2">{title}</h3>
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
                                label={{
                                    value: cr.name || `C${cr.id}`,
                                    position: 'top',
                                    fill: '#aaa',
                                    fontSize: 9,
                                    fontWeight: 600,
                                }}
                            />
                        ))}

                        {drivingEventMarkers?.map((marker, i) => (
                            <ReferenceLine
                                key={`ev-${marker.source}-${marker.cornerId}-${marker.type}-${i}`}
                                x={marker.distance}
                                stroke={EVENT_COLORS[marker.type] || '#888'}
                                strokeWidth={1.2}
                                strokeOpacity={0.7}
                                strokeDasharray={marker.source === 'ref' ? '4 3' : undefined}
                                ifOverflow="extendDomain"
                                label={{
                                    value: marker.type,
                                    position: marker.source === 'ref' ? 'top' : 'bottom',
                                    fill: EVENT_COLORS[marker.type] || '#888',
                                    fontSize: 7,
                                    fontWeight: 500,
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
                            domain={yDomain || ['auto', 'auto']}
                            tick={{ fill: '#666', fontSize: 10 }}
                            width={40}
                        />

                        <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', fontSize: '12px' }}
                            itemStyle={{ color: '#ccc' }}
                            labelFormatter={(label) => `Dist: ${label.toFixed(3)}km`}
                        />
                        <Legend verticalAlign="top" height={30} iconSize={10} wrapperStyle={{ fontSize: '11px' }} />

                        {lines.map((line) => (
                            <Line
                                key={line.dataKey as string}
                                type={line.type ?? 'monotone'}
                                dataKey={line.dataKey as string}
                                stroke={line.color}
                                dot={false}
                                strokeWidth={line.strokeWidth ?? 2}
                                strokeOpacity={line.strokeOpacity ?? 1}
                                strokeDasharray={line.strokeDasharray}
                                name={line.name}
                            />
                        ))}

                        {allKeyPoints.map((kp, i) => (
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
                                    position: kp.labelPosition || (kp.type === 'max' ? 'top' : 'bottom'),
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

export default React.memo(FlexibleLineChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.title === next.title &&
        prev.lines === next.lines &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges &&
        prev.drivingEventMarkers === next.drivingEventMarkers;
});
