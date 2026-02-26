import React from 'react';
import type { LapMetrics } from '../../types';
import { useTranslation } from '../../i18n/context';

interface LapMetricsSummaryProps {
    refMetrics?: LapMetrics;
    anaMetrics?: LapMetrics;
}

const CHANNELS = [
    { key: 'brk', label: 'BRK', color: '#ef4444', bgClass: 'bg-red-500/10 border-red-900/30' },
    { key: 'crn', label: 'CRN', color: '#3b82f6', bgClass: 'bg-blue-500/10 border-blue-900/30' },
    { key: 'tps', label: 'TPS', color: '#22c55e', bgClass: 'bg-green-500/10 border-green-900/30' },
    { key: 'cst', label: 'CST', color: '#71717a', bgClass: 'bg-zinc-500/10 border-zinc-700/30' },
] as const;

type ChannelKey = 'brk' | 'crn' | 'tps' | 'cst';

function getPctKey(ch: ChannelKey): keyof LapMetrics {
    return `${ch}_pct` as keyof LapMetrics;
}

function getTimeKey(ch: ChannelKey): keyof LapMetrics {
    return `${ch}_time_s` as keyof LapMetrics;
}

const MetricValue: React.FC<{
    label: string;
    refVal: number;
    anaVal: number;
    unit: string;
    precision?: number;
    lowerIsBetter?: boolean;
}> = ({ label, refVal, anaVal, unit, precision = 1, lowerIsBetter = false }) => {
    const diff = anaVal - refVal;
    const isGood = lowerIsBetter ? diff < 0 : diff > 0;
    const diffColor = Math.abs(diff) < 0.05 ? 'text-zinc-500' : isGood ? 'text-green-400' : 'text-red-400';
    const diffSign = diff > 0 ? '+' : '';

    return (
        <div className="flex items-center justify-between text-[11px]">
            <span className="text-zinc-500">{label}</span>
            <div className="flex items-center gap-2">
                <span className="text-zinc-400 font-mono">{refVal.toFixed(precision)}{unit}</span>
                <span className="text-white font-mono font-semibold">{anaVal.toFixed(precision)}{unit}</span>
                <span className={`font-mono w-14 text-right ${diffColor}`}>
                    {diffSign}{diff.toFixed(precision)}{unit}
                </span>
            </div>
        </div>
    );
};

const LapMetricsSummary: React.FC<LapMetricsSummaryProps> = ({ refMetrics, anaMetrics }) => {
    const { t } = useTranslation();
    if (!refMetrics || !anaMetrics) return null;

    return (
        <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-3">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs text-zinc-400 font-medium">{t.lapMetrics.lapActivityBreakdown}</h3>
                <div className="flex items-center gap-3 text-[10px] text-zinc-500">
                    <span>{t.common.ref}</span>
                    <span className="font-semibold text-zinc-300">{t.common.ana}</span>
                    <span className="w-14 text-right">{t.common.diff}</span>
                </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {CHANNELS.map(ch => {
                    const refPct = refMetrics[getPctKey(ch.key)] as number;
                    const anaPct = anaMetrics[getPctKey(ch.key)] as number;
                    const refTime = refMetrics[getTimeKey(ch.key)] as number;
                    const anaTime = anaMetrics[getTimeKey(ch.key)] as number;

                    return (
                        <div key={ch.key} className={`rounded-lg border p-2 ${ch.bgClass}`}>
                            <div className="flex items-center gap-1.5 mb-1.5">
                                <span className="w-2 h-2 rounded-sm" style={{ background: ch.color }} />
                                <span className="text-xs font-bold" style={{ color: ch.color }}>{ch.label}</span>
                            </div>
                            <MetricValue label="%" refVal={refPct} anaVal={anaPct} unit="%" />
                            <MetricValue label="Time" refVal={refTime} anaVal={anaTime} unit="s" lowerIsBetter={ch.key === 'brk'} />
                        </div>
                    );
                })}
            </div>

            {/* G-Sum row */}
            <div className="mt-2 pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2">
                <MetricValue label="G-Sum (mean)" refVal={refMetrics.mean_g_sum} anaVal={anaMetrics.mean_g_sum} unit="G" precision={2} />
                <MetricValue label="G-Sum (max)" refVal={refMetrics.max_g_sum} anaVal={anaMetrics.max_g_sum} unit="G" precision={2} />
            </div>
        </div>
    );
};

export default LapMetricsSummary;
