import type { PredictionResult } from '../../utils/onnxInference';
import type { Translations } from '../../i18n/types';
import { formatLapTime } from '../../utils/formatLapTime';

interface WhatIfSummaryProps {
    result: PredictionResult | null;
    baselineResult: PredictionResult | null;
    t: Translations;
}

export default function WhatIfSummary({ result, baselineResult, t }: WhatIfSummaryProps) {
    if (!result) return null;

    const predictedDelta = baselineResult
        ? result.totalPredicted - baselineResult.totalPredicted
        : null;

    return (
        <div className="bg-zinc-800/80 rounded-lg border border-zinc-700/50 p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
                {/* Predicted */}
                <div>
                    <div className="text-[11px] text-zinc-500 mb-1">{t.whatIf.predictedLapTime}</div>
                    <div className="text-lg font-mono text-zinc-100">
                        {formatLapTime(result.totalPredicted)}
                    </div>
                </div>

                {/* Actual */}
                <div>
                    <div className="text-[11px] text-zinc-500 mb-1">{t.whatIf.actualLapTime}</div>
                    <div className="text-lg font-mono text-zinc-300">
                        {result.totalActual !== null ? formatLapTime(result.totalActual) : '—'}
                    </div>
                </div>

                {/* Delta from override changes */}
                <div>
                    <div className="text-[11px] text-zinc-500 mb-1">{t.whatIf.difference}</div>
                    {predictedDelta !== null ? (
                        <div className={`text-lg font-mono ${predictedDelta < -0.001 ? 'text-green-400' : predictedDelta > 0.001 ? 'text-red-400' : 'text-zinc-400'}`}>
                            {predictedDelta > 0 ? '+' : ''}{(predictedDelta * 1000).toFixed(0)}ms
                        </div>
                    ) : (
                        <div className="text-lg font-mono text-zinc-500">—</div>
                    )}
                </div>
            </div>

            {predictedDelta !== null && Math.abs(predictedDelta) > 0.001 && (
                <div className="mt-2 text-center text-xs">
                    <span className={predictedDelta < 0 ? 'text-green-400' : 'text-red-400'}>
                        {Math.abs(predictedDelta * 1000).toFixed(0)}ms {predictedDelta < 0 ? t.whatIf.faster : t.whatIf.slower}
                    </span>
                </div>
            )}
        </div>
    );
}
