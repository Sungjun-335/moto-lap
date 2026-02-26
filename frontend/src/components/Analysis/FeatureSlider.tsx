import { useCallback } from 'react';
import type { FeatureName } from '../../utils/onnxInference';

interface FeatureSliderProps {
    name: FeatureName;
    label: string;
    value: number;
    defaultValue: number;
    min: number;
    max: number;
    step: number;
    unit?: string;
    onChange: (name: FeatureName, value: number) => void;
    onReset: (name: FeatureName) => void;
}

export default function FeatureSlider({
    name,
    label,
    value,
    defaultValue,
    min,
    max,
    step,
    unit = '',
    onChange,
    onReset,
}: FeatureSliderProps) {
    const isModified = Math.abs(value - defaultValue) > step * 0.5;
    const delta = value - defaultValue;

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            onChange(name, parseFloat(e.target.value));
        },
        [name, onChange],
    );

    const handleReset = useCallback(() => {
        onReset(name);
    }, [name, onReset]);

    return (
        <div className={`flex flex-col gap-0.5 px-2 py-1 rounded ${isModified ? 'bg-blue-500/10' : ''}`}>
            <div className="flex items-center justify-between text-[11px]">
                <span className="text-zinc-400 truncate max-w-[120px]" title={name}>
                    {label}
                </span>
                <div className="flex items-center gap-1.5">
                    <span className="text-zinc-300 font-mono text-[10px]">
                        {value.toFixed(2)}{unit}
                    </span>
                    {isModified && (
                        <>
                            <span className={`font-mono text-[10px] ${delta < 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ({delta > 0 ? '+' : ''}{delta.toFixed(2)})
                            </span>
                            <button
                                onClick={handleReset}
                                className="text-zinc-500 hover:text-zinc-300 text-[9px]"
                                title="Reset"
                            >
                                ↺
                            </button>
                        </>
                    )}
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={handleChange}
                className="w-full h-1 accent-blue-500 cursor-pointer"
            />
        </div>
    );
}
