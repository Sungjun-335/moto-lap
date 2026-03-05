import { useTranslation } from '../../i18n/context';
import type { VenueStats } from '../../utils/reportApi';

interface RiderStatsCardProps {
    stats: VenueStats;
}

const METRIC_KEYS = [
    'lap_time_s',
    'max_braking_g',
    'trail_braking_quality',
    'mean_g_sum',
    'max_lean_deg',
    'coasting_penalty_s',
] as const;

function formatValue(key: string, value: number): string {
    switch (key) {
        case 'lap_time_s': {
            const min = Math.floor(value / 60);
            const sec = (value % 60).toFixed(1);
            return `${min}:${sec.padStart(4, '0')}`;
        }
        case 'max_braking_g': return `${value.toFixed(2)}G`;
        case 'trail_braking_quality': return `${Math.round(value)}pts`;
        case 'mean_g_sum': return `${value.toFixed(2)}G`;
        case 'max_lean_deg': return `${value.toFixed(1)}\u00b0`;
        case 'coasting_penalty_s': return `${value.toFixed(1)}s`;
        default: return String(value);
    }
}

export default function RiderStatsCard({ stats }: RiderStatsCardProps) {
    const { t } = useTranslation();

    const labelMap: Record<string, string> = {
        lap_time_s: t.riderStats.lapTime,
        max_braking_g: t.riderStats.brakingG,
        trail_braking_quality: t.riderStats.trailBrake,
        mean_g_sum: t.riderStats.gSum,
        max_lean_deg: t.riderStats.leanAngle,
        coasting_penalty_s: t.riderStats.coasting,
    };

    if (!stats.sufficient_data) {
        return (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500">
                <div className="font-medium text-zinc-400 mb-1">{t.riderStats.insufficientData}</div>
                <div>{t.riderStats.insufficientDataDesc}</div>
            </div>
        );
    }

    const percentiles = stats.session_stats?.percentiles;
    if (!percentiles || Object.keys(percentiles).length === 0) return null;

    return (
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-baseline gap-2 mb-3">
                <span className="text-sm font-semibold text-zinc-200">{t.riderStats.title}</span>
                <span className="text-xs text-zinc-500">@ {stats.venue}</span>
                <span className="text-xs text-zinc-600">({stats.total_sessions} {t.riderStats.sessions})</span>
            </div>
            <div className="space-y-2">
                {METRIC_KEYS.map(key => {
                    const info = percentiles[key];
                    if (!info) return null;
                    const pct = info.percentile;
                    const barWidth = Math.max(4, Math.min(100, 100 - pct)); // inverted: top 5% = narrow bar on left
                    const color = pct >= 75 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : pct >= 25 ? 'bg-amber-500' : 'bg-red-500';

                    return (
                        <div key={key} className="flex items-center gap-2 text-xs">
                            <span className="w-24 text-zinc-400 shrink-0 truncate">{labelMap[key]}</span>
                            <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full ${color} transition-all duration-500`}
                                    style={{ width: `${100 - barWidth}%` }}
                                />
                            </div>
                            <span className="w-14 text-right text-zinc-300 font-mono shrink-0">
                                {t.riderStats.top} {100 - pct}%
                            </span>
                            <span className="w-16 text-right text-zinc-500 font-mono shrink-0">
                                {formatValue(key, info.value)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
