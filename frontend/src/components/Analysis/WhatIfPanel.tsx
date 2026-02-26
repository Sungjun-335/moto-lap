import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Corner } from '../../types';
import type { Translations } from '../../i18n/types';
import type { FeatureName, PredictionResult } from '../../utils/onnxInference';
import { isModelAvailable, predictLapTime } from '../../utils/onnxInference';
import WhatIfSummary from './WhatIfSummary';
import WhatIfCornerCard from './WhatIfCornerCard';

interface WhatIfPanelProps {
    corners: Corner[];
    t: Translations;
}

export default function WhatIfPanel({ corners, t }: WhatIfPanelProps) {
    const [modelReady, setModelReady] = useState<boolean | null>(null); // null = checking
    const [overrides, setOverrides] = useState<Map<number, Partial<Record<FeatureName, number>>>>(new Map());
    const [baselineResult, setBaselineResult] = useState<PredictionResult | null>(null);
    const [currentResult, setCurrentResult] = useState<PredictionResult | null>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Check model availability on mount
    useEffect(() => {
        isModelAvailable().then(setModelReady);
    }, []);

    // Compute baseline prediction (no overrides)
    useEffect(() => {
        if (!modelReady || corners.length === 0) return;
        predictLapTime(corners).then(setBaselineResult).catch(console.error);
    }, [modelReady, corners]);

    // Recompute with overrides (debounced)
    useEffect(() => {
        if (!modelReady || corners.length === 0) return;

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            predictLapTime(corners, overrides.size > 0 ? overrides : undefined)
                .then(setCurrentResult)
                .catch(console.error);
        }, 100);

        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [modelReady, corners, overrides]);

    const handleOverrideChange = useCallback((cornerId: number, name: FeatureName, value: number) => {
        setOverrides((prev) => {
            const next = new Map(prev);
            const cornerOverrides = { ...(next.get(cornerId) || {}) };
            cornerOverrides[name] = value;
            next.set(cornerId, cornerOverrides);
            return next;
        });
    }, []);

    const handleOverrideReset = useCallback((cornerId: number, name: FeatureName) => {
        setOverrides((prev) => {
            const next = new Map(prev);
            const cornerOverrides = { ...(next.get(cornerId) || {}) };
            delete cornerOverrides[name];
            if (Object.keys(cornerOverrides).length === 0) {
                next.delete(cornerId);
            } else {
                next.set(cornerId, cornerOverrides);
            }
            return next;
        });
    }, []);

    const handleResetAll = useCallback(() => {
        setOverrides(new Map());
    }, []);

    // Build per-corner prediction map
    const cornerPredictions = useMemo(() => {
        const map = new Map<number, { predicted: number; actual: number | null }>();
        const source = currentResult || baselineResult;
        if (source) {
            for (const cp of source.cornerDurations) {
                map.set(cp.cornerId, { predicted: cp.predicted, actual: cp.actual });
            }
        }
        return map;
    }, [currentResult, baselineResult]);

    // Model not yet checked
    if (modelReady === null) {
        return (
            <div className="flex items-center justify-center p-8 text-zinc-500 text-sm">
                {t.whatIf.loading}
            </div>
        );
    }

    // Model not available
    if (!modelReady) {
        return (
            <div className="flex flex-col items-center justify-center p-8 gap-2">
                <span className="text-zinc-400 text-sm font-medium">{t.whatIf.noModel}</span>
                <span className="text-zinc-500 text-xs text-center max-w-xs">{t.whatIf.noModelDesc}</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-3 p-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-medium text-zinc-200">{t.whatIf.title}</h3>
                    <p className="text-[11px] text-zinc-500">{t.whatIf.subtitle}</p>
                </div>
                {overrides.size > 0 && (
                    <button
                        onClick={handleResetAll}
                        className="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded bg-blue-500/10 hover:bg-blue-500/20"
                    >
                        {t.whatIf.resetAll}
                    </button>
                )}
            </div>

            {/* Summary */}
            <WhatIfSummary
                result={currentResult || baselineResult}
                baselineResult={baselineResult}
                t={t}
            />

            {/* Corner Cards */}
            <div className="space-y-2 max-h-[calc(100vh-320px)] overflow-y-auto">
                {corners.map((corner) => {
                    const pred = cornerPredictions.get(corner.id);
                    return (
                        <WhatIfCornerCard
                            key={corner.id}
                            corner={corner}
                            predicted={pred?.predicted ?? 0}
                            actual={pred?.actual ?? null}
                            overrides={overrides.get(corner.id) || {}}
                            onOverrideChange={handleOverrideChange}
                            onOverrideReset={handleOverrideReset}
                            t={t}
                        />
                    );
                })}
            </div>
        </div>
    );
}
