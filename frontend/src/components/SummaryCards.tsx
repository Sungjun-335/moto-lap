import React, { useMemo } from 'react';
import { Timer, Gauge, MapPin } from 'lucide-react';
import type { SessionData } from '../types';
import { useTranslation } from '../i18n/context';

interface SummaryCardsProps {
    data: SessionData;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ data }) => {
    const { t } = useTranslation();
    const stats = useMemo(() => {
        if (!data.dataPoints.length) return { maxSpeed: 0, distance: 0, duration: 0 };

        let maxSpeed = 0;
        const speeds = data.dataPoints.map(p => p.speed);
        if (speeds.length) maxSpeed = Math.max(...speeds);

        // Distance is usually cumulative in meters or km. 
        // If unit is km (from parser logic, we parsed as is), let's assume raw was km.
        // Actually parser parsed `distance: parseFloat(row[colMap.distance])`. 
        // Header said "km".
        const totalDist = data.dataPoints[data.dataPoints.length - 1].distance;

        // Duration
        const startTime = data.dataPoints[0].time;
        const endTime = data.dataPoints[data.dataPoints.length - 1].time;
        const duration = endTime - startTime;

        return {
            maxSpeed: maxSpeed.toFixed(1),
            distance: totalDist.toFixed(2),
            duration: duration.toFixed(1)
        };
    }, [data]);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center space-x-4 hover:border-blue-500/50 transition-colors">
                <div className="p-3 bg-blue-500/10 text-blue-400 rounded-full">
                    <Gauge className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.summary.maxSpeed}</p>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-2xl font-bold text-white">{stats.maxSpeed}</span>
                        <span className="text-sm text-zinc-400">km/h</span>
                    </div>
                </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center space-x-4 hover:border-emerald-500/50 transition-colors">
                <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-full">
                    <MapPin className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.summary.totalDistance}</p>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-2xl font-bold text-white">{stats.distance}</span>
                        <span className="text-sm text-zinc-400">km</span>
                    </div>
                </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex items-center space-x-4 hover:border-amber-500/50 transition-colors">
                <div className="p-3 bg-amber-500/10 text-amber-400 rounded-full">
                    <Timer className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.summary.duration}</p>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-2xl font-bold text-white">{stats.duration}</span>
                        <span className="text-sm text-zinc-400">s</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummaryCards;
