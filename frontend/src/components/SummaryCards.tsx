import React, { useMemo } from 'react';
import { Timer, Gauge, Clock } from 'lucide-react';
import type { SessionData } from '../types';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

interface SummaryCardsProps {
    data: SessionData;
    hiddenLaps?: Set<number>;
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ data, hiddenLaps }) => {
    const { t } = useTranslation();
    const stats = useMemo(() => {
        if (!data.dataPoints.length) return { maxSpeed: '0', avgLapTime: '—', duration: '0' };

        let maxSpeed = 0;
        const speeds = data.dataPoints.map(p => p.speed);
        if (speeds.length) maxSpeed = Math.max(...speeds);

        // Duration
        const startTime = data.dataPoints[0].time;
        const endTime = data.dataPoints[data.dataPoints.length - 1].time;
        const duration = endTime - startTime;

        // Average lap time (excluding hidden laps)
        const visibleLaps = hiddenLaps?.size
            ? data.laps.filter(l => !hiddenLaps.has(l.index))
            : data.laps;
        const avgLapTime = visibleLaps.length > 0
            ? visibleLaps.reduce((sum, l) => sum + l.duration, 0) / visibleLaps.length
            : 0;

        // Format duration as Xm Xs
        const mins = Math.floor(duration / 60);
        const secs = Math.floor(duration % 60);
        const durationStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        return {
            maxSpeed: maxSpeed.toFixed(1),
            avgLapTime: avgLapTime > 0 ? formatLapTime(avgLapTime) : '—',
            duration: durationStr,
        };
    }, [data, hiddenLaps]);

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
                    <Clock className="w-6 h-6" />
                </div>
                <div>
                    <p className="text-zinc-500 text-xs uppercase tracking-wider">{t.summary.avgLapTime}</p>
                    <div className="flex items-baseline space-x-1">
                        <span className="text-2xl font-bold text-white">{stats.avgLapTime}</span>
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
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SummaryCards;
