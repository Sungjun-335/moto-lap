import React, { useMemo } from 'react';
import type { SessionData, Corner, Lap } from '../types';
import SummaryCards from './SummaryCards';
import Chart from './Chart';
import MapComponent from './Map';
import { ArrowRight } from 'lucide-react';
import { haversineDistance } from '../utils/trackMatcher';
import { useTranslation } from '../i18n/context';

interface OverviewProps {
    data: SessionData;
    onCornerNavigate?: (cornerId: number) => void;
    refSession?: SessionData | null;
    selectedLapIndex: number | 'all';
    anaLapIdx: number;
    refLapIdx: number;
    externalRefLap: Lap | null;
    outlierLapIndices: Set<number>;
}

interface CornerDiff {
    cornerId: number;
    name: string;
    direction?: string;
    anaDuration: number;
    refDuration: number;
    diff: number;
    anaTravelDist?: number;
    refTravelDist?: number;
    apexDiffM?: number;
}

const Overview: React.FC<OverviewProps> = ({ data, onCornerNavigate, selectedLapIndex, anaLapIdx, refLapIdx, externalRefLap }) => {
    const { t } = useTranslation();

    // The ref lap used for corner diffs: external if loaded, otherwise from current session
    const refLap = externalRefLap ?? data.laps.find(l => l.index === refLapIdx) ?? null;

    const displayData = useMemo(() => {
        if (selectedLapIndex === 'all') {
            return data;
        }
        const lap = data.laps.find(l => l.index === selectedLapIndex);
        if (!lap) return data;

        const startDist = lap.dataPoints[0]?.distance || 0;
        const normalizedPoints = lap.dataPoints.map(p => ({
            ...p,
            distance: p.distance - startDist
        }));

        return {
            ...data,
            dataPoints: normalizedPoints
        };
    }, [data, selectedLapIndex]);

    // Compute corner-by-corner time differences
    const cornerDiffs = useMemo((): CornerDiff[] => {
        const anaLap = data.laps.find(l => l.index === anaLapIdx);
        if (!anaLap?.corners || !refLap?.corners) return [];

        const refCornerMap = new Map<number, Corner>();
        for (const c of refLap.corners) {
            refCornerMap.set(c.id, c);
        }

        return anaLap.corners
            .filter(ac => refCornerMap.has(ac.id))
            .map(ac => {
                const rc = refCornerMap.get(ac.id)!;
                return {
                    cornerId: ac.id,
                    name: ac.name || `C${ac.id}`,
                    direction: ac.direction,
                    anaDuration: ac.duration,
                    refDuration: rc.duration,
                    diff: ac.duration - rc.duration,
                    anaTravelDist: ac.geometry?.travel_distance_m,
                    refTravelDist: rc.geometry?.travel_distance_m,
                    apexDiffM: (ac.geometry && rc.geometry)
                        ? haversineDistance(ac.geometry.apex_lat, ac.geometry.apex_lon,
                                          rc.geometry.apex_lat, rc.geometry.apex_lon)
                        : undefined,
                };
            });
    }, [data.laps, refLap, anaLapIdx]);

    const totalCornerDiff = cornerDiffs.reduce((sum, c) => sum + c.diff, 0);

    return (
        <div className="flex flex-col h-full w-full">
            {/* Content Grid — no toolbar, controls are in Dashboard header */}
            <div className="flex-1 p-4 overflow-y-auto">
                <div className="mb-4">
                    <SummaryCards data={displayData} />
                </div>

                {/* Corner Time Comparison */}
                {data.laps.some(l => l.corners && l.corners.length > 0) && (
                    <div className="mt-4 bg-zinc-900 rounded-xl border border-zinc-800 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{t.overview.cornerTimeComparison}</h3>
                        </div>
                        {cornerDiffs.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2">
                                {cornerDiffs.map(cd => {
                                    const isLeft = cd.direction === 'L';
                                    const isRight = cd.direction === 'R';
                                    const isFaster = cd.diff < 0;
                                    const isSlower = cd.diff > 0;
                                    const borderColor = isLeft
                                        ? 'border-blue-800/50'
                                        : isRight
                                        ? 'border-red-800/50'
                                        : 'border-zinc-700/50';
                                    return (
                                        <button
                                            key={cd.cornerId}
                                            onClick={() => onCornerNavigate?.(cd.cornerId)}
                                            className={`group relative bg-zinc-800/50 hover:bg-zinc-700/50 rounded-lg border ${borderColor} p-2.5 text-left transition-all hover:scale-[1.02]`}
                                        >
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className="text-xs font-mono font-bold text-zinc-200">
                                                    {cd.name}
                                                </span>
                                                {cd.direction && (
                                                    <span className={`text-[10px] font-semibold ${isLeft ? 'text-blue-400' : isRight ? 'text-red-400' : 'text-zinc-400'}`}>
                                                        {cd.direction}
                                                    </span>
                                                )}
                                            </div>
                                            <div className={`text-sm font-mono font-bold ${isFaster ? 'text-green-400' : isSlower ? 'text-red-400' : 'text-zinc-400'}`}>
                                                {cd.diff > 0 ? '+' : ''}{cd.diff.toFixed(3)}
                                            </div>
                                            <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                                                <span>{cd.anaDuration.toFixed(3)}</span>
                                                <span>{cd.refDuration.toFixed(3)}</span>
                                            </div>
                                            {cd.anaTravelDist != null && (
                                                <div className="text-[9px] text-zinc-500 mt-1">
                                                    {cd.anaTravelDist.toFixed(0)}m
                                                    {cd.apexDiffM != null && ` | apex Δ${cd.apexDiffM.toFixed(1)}m`}
                                                </div>
                                            )}
                                            <ArrowRight size={12} className="absolute top-2.5 right-2 text-zinc-600 group-hover:text-zinc-300 transition-colors opacity-0 group-hover:opacity-100" />
                                        </button>
                                    );
                                })}

                                {/* Total */}
                                <div className="bg-zinc-900 rounded-lg border border-zinc-600/50 p-2.5">
                                    <div className="text-[10px] text-zinc-500 uppercase font-semibold mb-1.5">{t.common.total}</div>
                                    <div className={`text-sm font-mono font-bold ${totalCornerDiff < 0 ? 'text-green-400' : totalCornerDiff > 0 ? 'text-red-400' : 'text-zinc-400'}`}>
                                        {totalCornerDiff > 0 ? '+' : ''}{totalCornerDiff.toFixed(3)}
                                    </div>
                                    <div className="text-[10px] text-zinc-500 mt-1">{cornerDiffs.length} {t.common.corners}</div>
                                </div>
                            </div>
                        ) : (
                            <p className="text-sm text-zinc-500">{t.overview.noCornerData}</p>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px] mt-4">
                    {/* Main Chart — all laps overlaid */}
                    <div className="lg:col-span-2 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col pointer-events-auto">
                        <Chart data={data} selectedLapIndex={selectedLapIndex} />
                    </div>

                    {/* Map */}
                    <div className="lg:col-span-1 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col pointer-events-auto">
                        <MapComponent data={displayData} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Overview;
