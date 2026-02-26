import React from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea,
} from 'recharts';
import type { AnalysisPoint } from '../../utils/analysis';
import type { CornerRange, DrivingEventMarker } from './AnalysisChartWrapper';

interface DrivingEventsChartProps {
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
    drivingEventMarkers?: DrivingEventMarker[];
}

const CORNER_COLORS = ['rgba(59,130,246,0.22)', 'rgba(168,85,247,0.22)'];

// Color mapping by category
const CATEGORY_COLORS: Record<string, string> = {
    SOB: '#fca5a5', COB: '#ef4444', EOB: '#b91c1c',    // Braking: light→dark red
    SOL: '#c4b5fd', COL: '#8b5cf6', EOL: '#6d28d9',    // Lean: light→dark purple
    SOT: '#86efac', COT: '#22c55e', EOT: '#15803d',    // Throttle: light→dark green
    G_DIP: '#f59e0b',                                    // G-dip: amber
    MIN_VEL: '#06b6d4',                                  // Min velocity: cyan
};

const DrivingEventsChart: React.FC<DrivingEventsChartProps> = ({
    data, height = 200, syncId, onMouseMove, onMouseDown, onMouseUp, onMouseLeave,
    zoomDomain, refAreaLeft, refAreaRight, cornerRanges, drivingEventMarkers,
}) => {
    return (
        <div style={{ width: '100%', height }} className="bg-zinc-900 rounded-lg border border-zinc-800 p-2 flex flex-col" onMouseUp={onMouseUp}>
            <h3 className="text-xs text-zinc-400 font-medium mb-1 ml-2">
                Driving Events
                <span className="text-zinc-600 ml-2 text-[10px]">
                    <span className="text-red-400">BRK</span>{' '}
                    <span className="text-violet-400">LEAN</span>{' '}
                    <span className="text-green-400">TPS</span>{' '}
                    <span className="text-amber-400">G-DIP</span>{' '}
                    <span className="text-cyan-400">MIN_V</span>
                    {' | '}
                    <span>--- Ref</span>{' '}
                    <span>--- Ana</span>
                </span>
            </h3>
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

                        {/* Driving event markers */}
                        {drivingEventMarkers?.map((marker, i) => (
                            <ReferenceLine
                                key={`ev-${marker.source}-${marker.cornerId}-${marker.type}-${i}`}
                                x={marker.distance}
                                stroke={CATEGORY_COLORS[marker.type] || '#888'}
                                strokeWidth={1.5}
                                strokeDasharray={marker.source === 'ref' ? '4 3' : undefined}
                                ifOverflow="extendDomain"
                                label={{
                                    value: marker.type.replace('_', '\n'),
                                    position: marker.source === 'ref' ? 'top' : 'bottom',
                                    fill: CATEGORY_COLORS[marker.type] || '#888',
                                    fontSize: 8,
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
                            tick={{ fill: '#666', fontSize: 10 }}
                            domain={['auto', 'auto']}
                            width={40}
                            label={{ value: 'km/h', angle: -90, position: 'insideLeft', fill: '#555', fontSize: 9 }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#333', fontSize: '12px' }}
                            itemStyle={{ color: '#ccc' }}
                            labelFormatter={(label) => `Dist: ${Number(label).toFixed(3)}km`}
                        />

                        {/* Speed lines as context background */}
                        <Line
                            type="monotone"
                            dataKey="anaSpeed"
                            stroke="#ef4444"
                            strokeWidth={1}
                            strokeOpacity={0.4}
                            dot={false}
                            name="Speed (Ana)"
                        />
                        <Line
                            type="monotone"
                            dataKey="refSpeed"
                            stroke="#3b82f6"
                            strokeWidth={1}
                            strokeOpacity={0.4}
                            dot={false}
                            name="Speed (Ref)"
                        />

                        {refAreaLeft && refAreaRight ? (
                            <ReferenceArea
                                x1={refAreaLeft}
                                x2={refAreaRight}
                                strokeOpacity={0.3}
                                ifOverflow="extendDomain"
                            />
                        ) : null}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default React.memo(DrivingEventsChart, (prev, next) => {
    return prev.height === next.height &&
        prev.syncId === next.syncId &&
        prev.data === next.data &&
        prev.zoomDomain === next.zoomDomain &&
        prev.refAreaLeft === next.refAreaLeft &&
        prev.refAreaRight === next.refAreaRight &&
        prev.cornerRanges === next.cornerRanges &&
        prev.drivingEventMarkers === next.drivingEventMarkers;
});
