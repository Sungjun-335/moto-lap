import React from 'react';
import type { Lap } from '../../types';
import { formatLapTime } from '../../utils/formatLapTime';

interface LapSelectorProps {
    laps: Lap[];
    refLapIndex: number;
    anaLapIndex: number;
    onRefChange: (index: number) => void;
    onAnaChange: (index: number) => void;
}

const LapSelector: React.FC<LapSelectorProps> = ({
    laps,
    refLapIndex,
    anaLapIndex,
    onRefChange,
    onAnaChange
}) => {
    return (
        <div className="flex flex-col space-y-2 bg-zinc-900 p-3 rounded-xl border border-zinc-800">
            <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500 uppercase font-semibold w-24">Analysis Lap</label>
                <select
                    className="flex-1 bg-zinc-800 text-sm border border-zinc-700 rounded px-2 py-1 text-red-400 font-medium focus:ring-1 focus:ring-red-500"
                    value={anaLapIndex}
                    onChange={(e) => onAnaChange(Number(e.target.value))}
                >
                    {laps.map(lap => (
                        <option key={lap.index} value={lap.index}>
                            Lap {lap.index} ({formatLapTime(lap.duration)})
                        </option>
                    ))}
                </select>
            </div>

            <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500 uppercase font-semibold w-24">Reference Lap</label>
                <select
                    className="flex-1 bg-zinc-800 text-sm border border-zinc-700 rounded px-2 py-1 text-zinc-400 font-medium focus:ring-1 focus:ring-zinc-500"
                    value={refLapIndex}
                    onChange={(e) => onRefChange(Number(e.target.value))}
                >
                    {laps.map(lap => (
                        <option key={lap.index} value={lap.index}>
                            Lap {lap.index} ({formatLapTime(lap.duration)})
                        </option>
                    ))}
                </select>
            </div>
        </div>
    );
};

export default LapSelector;
