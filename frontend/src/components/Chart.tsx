import React, { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import type { SessionData } from '../types';
import { downsample } from '../utils/downsample';
import { useTranslation } from '../i18n/context';

interface ChartProps {
    data: SessionData;
    selectedLapIndex?: number | 'all';
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

const Chart: React.FC<ChartProps> = ({ data, selectedLapIndex = 'all' }) => {
    const { t } = useTranslation();

    // Build merged dataset: all laps normalized to distance=0, keyed by lap index
    const { chartData } = useMemo(() => {
        const laps = data.laps;
        if (!laps.length) return { chartData: [] as LapChartData[], lapKeys: [] as string[] };

        const keys = laps.map(l => `speed_L${l.index}`);

        // Normalize each lap and collect all distance points
        const lapDataSets: { key: string; points: { distance: number; speed: number }[] }[] = [];
        for (const lap of laps) {
            const pts = lap.dataPoints;
            if (!pts.length) continue;
            const startDist = pts[0].distance;
            const normalized = downsample(pts, 500).map(p => ({
                distance: Math.round((p.distance - startDist) * 10000) / 10000,
                speed: p.speed,
            }));
            lapDataSets.push({ key: `speed_L${lap.index}`, points: normalized });
        }

        // Merge all lap data into a unified distance axis
        // Use the lap with most points as distance reference, interpolate others
        const refSet = lapDataSets.reduce((a, b) => a.points.length >= b.points.length ? a : b);
        const merged: LapChartData[] = refSet.points.map(p => {
            const row: LapChartData = { distance: p.distance };
            row[refSet.key] = p.speed;
            return row;
        });

        // For each other lap, interpolate onto the reference distance axis
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
                    row[ls.key] = p1.speed;
                } else {
                    const ratio = (d - p1.distance) / (p2.distance - p1.distance);
                    row[ls.key] = p1.speed + (p2.speed - p1.speed) * Math.max(0, Math.min(1, ratio));
                }
            }
        }

        return { chartData: merged, lapKeys: keys };
    }, [data.laps]);

    return (
        <div className="w-full h-full p-4">
            <h3 className="text-zinc-400 text-sm mb-4 font-medium">{t.charts.speedVsDistance}</h3>
            <div className="w-full h-[90%]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
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
                            label={{ value: t.charts.speedLabel, angle: -90, position: 'insideLeft', fill: '#71717a' }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number, name: string) => [value.toFixed(1), name.replace('speed_', '')]}
                            labelFormatter={(label) => `Dist: ${Number(label).toFixed(3)} km`}
                        />
                        {data.laps.map((lap, i) => {
                            const key = `speed_L${lap.index}`;
                            const isSelected = selectedLapIndex !== 'all' && lap.index === selectedLapIndex;
                            const hasSelection = selectedLapIndex !== 'all';
                            return (
                                <Line
                                    key={key}
                                    type="monotone"
                                    dataKey={key}
                                    name={`L${lap.index}`}
                                    stroke={LAP_COLORS[i % LAP_COLORS.length]}
                                    strokeWidth={isSelected ? 2.5 : hasSelection ? 0.8 : 1.2}
                                    strokeOpacity={isSelected ? 1 : hasSelection ? 0.25 : 0.7}
                                    dot={false}
                                    activeDot={isSelected || !hasSelection ? { r: 4, fill: '#fff' } : false}
                                    isAnimationActive={false}
                                    connectNulls={false}
                                />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default Chart;
