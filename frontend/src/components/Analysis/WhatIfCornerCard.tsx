import { useState, useCallback, useMemo } from 'react';
import type { Corner } from '../../types';
import type { Translations } from '../../i18n/types';
import type { FeatureName } from '../../utils/onnxInference';
import { FEATURE_GROUPS, cornerToFeatures, FEATURE_NAMES, getFeatureStats } from '../../utils/onnxInference';
import FeatureSlider from './FeatureSlider';

interface WhatIfCornerCardProps {
    corner: Corner;
    predicted: number;
    actual: number | null;
    overrides: Partial<Record<FeatureName, number>>;
    onOverrideChange: (cornerId: number, name: FeatureName, value: number) => void;
    onOverrideReset: (cornerId: number, name: FeatureName) => void;
    t: Translations;
}

const GROUP_LABELS: Record<keyof typeof FEATURE_GROUPS, (t: Translations) => string> = {
    speed: (t) => t.whatIf.groupSpeed,
    braking: (t) => t.whatIf.groupBraking,
    lean: (t) => t.whatIf.groupLean,
    throttle: (t) => t.whatIf.groupThrottle,
    gDip: (t) => t.whatIf.groupGDip,
    coasting: (t) => t.whatIf.groupCoasting,
    brakeJerk: (t) => t.whatIf.groupBrakeJerk,
    timing: (t) => t.whatIf.groupTiming,
    dynamics: (t) => t.whatIf.groupDynamics,
};

export default function WhatIfCornerCard({
    corner,
    predicted,
    actual,
    overrides,
    onOverrideChange,
    onOverrideReset,
    t,
}: WhatIfCornerCardProps) {
    const [expanded, setExpanded] = useState(false);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

    const delta = actual !== null ? predicted - actual : null;
    const dirColor = corner.direction === 'L' ? 'text-blue-400' : corner.direction === 'R' ? 'text-red-400' : 'text-zinc-400';

    // Get default feature values from the corner
    const defaultFeatures = useMemo(() => {
        const arr = cornerToFeatures(corner);
        const map: Record<string, number> = {};
        for (let i = 0; i < FEATURE_NAMES.length; i++) {
            map[FEATURE_NAMES[i]] = arr[i];
        }
        return map;
    }, [corner]);

    const handleChange = useCallback(
        (name: FeatureName, value: number) => {
            onOverrideChange(corner.id, name, value);
        },
        [corner.id, onOverrideChange],
    );

    const handleReset = useCallback(
        (name: FeatureName) => {
            onOverrideReset(corner.id, name);
        },
        [corner.id, onOverrideReset],
    );

    const hasOverrides = Object.keys(overrides).length > 0;

    return (
        <div className={`rounded-lg border ${hasOverrides ? 'border-blue-500/30 bg-blue-500/5' : 'border-zinc-700/50 bg-zinc-800/50'}`}>
            {/* Header */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-700/30 rounded-lg transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className={`font-medium text-sm ${dirColor}`}>
                        {t.whatIf.corner} {corner.id}
                        {corner.direction ? ` (${corner.direction})` : ''}
                    </span>
                    {corner.name && <span className="text-zinc-500 text-xs">{corner.name}</span>}
                </div>
                <div className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-400">
                        {t.whatIf.predicted}: <span className="text-zinc-200 font-mono">{predicted.toFixed(3)}s</span>
                    </span>
                    {actual !== null && (
                        <span className="text-zinc-400">
                            {t.whatIf.actual}: <span className="text-zinc-200 font-mono">{actual.toFixed(3)}s</span>
                        </span>
                    )}
                    {delta !== null && (
                        <span className={`font-mono ${delta < 0 ? 'text-green-400' : delta > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                            {delta > 0 ? '+' : ''}{(delta * 1000).toFixed(0)}ms
                        </span>
                    )}
                    <span className="text-zinc-500">{expanded ? '▲' : '▼'}</span>
                </div>
            </button>

            {/* Feature Groups */}
            {expanded && (
                <div className="px-3 pb-3 space-y-1">
                    {(Object.entries(FEATURE_GROUPS) as [keyof typeof FEATURE_GROUPS, readonly string[]][]).map(([groupKey, features]) => (
                        <div key={groupKey}>
                            <button
                                onClick={() => setExpandedGroup(expandedGroup === groupKey ? null : groupKey)}
                                className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-300 py-1 px-1"
                            >
                                <span>{GROUP_LABELS[groupKey](t)}</span>
                                <span>{expandedGroup === groupKey ? '−' : '+'}</span>
                            </button>
                            {expandedGroup === groupKey && (
                                <div className="space-y-0.5 ml-1">
                                    {features.map((feat) => {
                                        const featureName = feat as FeatureName;
                                        const defaultVal = defaultFeatures[feat] ?? 0;
                                        const currentVal = overrides[featureName] ?? defaultVal;
                                        const stats = getFeatureStats(featureName);
                                        const mean = stats?.mean ?? defaultVal;
                                        const std = stats?.std ?? Math.max(Math.abs(defaultVal) * 0.5, 1);
                                        const rangeMin = stats?.min ?? mean - 3 * std;
                                        const rangeMax = stats?.max ?? mean + 3 * std;
                                        const step = (rangeMax - rangeMin) / 200 || 0.01;

                                        return (
                                            <FeatureSlider
                                                key={feat}
                                                name={featureName}
                                                label={feat}
                                                value={currentVal}
                                                defaultValue={defaultVal}
                                                min={rangeMin}
                                                max={rangeMax}
                                                step={step}
                                                onChange={handleChange}
                                                onReset={handleReset}
                                            />
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
