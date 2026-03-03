import React, { useMemo, useState, useCallback } from 'react';
import type { SessionData, Corner, Lap } from '../types';
import SummaryCards from './SummaryCards';
import Chart from './Chart';
import MapComponent from './Map';
import { ArrowRight, Trophy, Eye, EyeOff, Trash2, ArrowUpDown, Hash, Clock } from 'lucide-react';
import { haversineDistance } from '../utils/trackMatcher';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

interface OverviewProps {
    data: SessionData;
    onCornerNavigate?: (cornerId: number) => void;
    refSession?: SessionData | null;
    selectedLapIndex: number | 'all';
    anaLapIdx: number;
    refLapIdx: number;
    externalRefLap: Lap | null;
    outlierLapIndices: Set<number>;
    hiddenLaps: Set<number>;
    onToggleLap: (lapIndex: number) => void;
    onDeleteLap: (lapIndex: number) => void;
    onSetAnaLap: (lapIndex: number) => void;
    onSetRefLap: (lapIndex: number) => void;
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

const Overview: React.FC<OverviewProps> = ({ data, onCornerNavigate, selectedLapIndex, anaLapIdx, refLapIdx, externalRefLap, outlierLapIndices, hiddenLaps, onToggleLap, onDeleteLap, onSetAnaLap, onSetRefLap }) => {
    const { t } = useTranslation();
    const [deleteConfirmLap, setDeleteConfirmLap] = useState<number | null>(null);
    const [lapSortBy, setLapSortBy] = useState<'time' | 'index'>('time');
    const [lapSortAsc, setLapSortAsc] = useState(true);

    const handleDeleteConfirm = useCallback(() => {
        if (deleteConfirmLap !== null) {
            onDeleteLap(deleteConfirmLap);
        }
        setDeleteConfirmLap(null);
    }, [deleteConfirmLap, onDeleteLap]);

    // The ref lap used for corner diffs: external if loaded, otherwise from current session
    const refLap = externalRefLap ?? data.laps.find(l => l.index === refLapIdx) ?? null;

    // Best lap and lap time comparison
    const { bestLap, lapComparisons } = useMemo(() => {
        if (!data.laps.length) return { bestLap: null, lapComparisons: [] };
        const best = [...data.laps].sort((a, b) => a.duration - b.duration)[0];
        const comparisons = data.laps.map(lap => ({
            index: lap.index,
            duration: lap.duration,
            diff: lap.duration - best.duration,
            isBest: lap.index === best.index,
            isOutlier: outlierLapIndices.has(lap.index),
            maxSpeed: Math.max(...lap.dataPoints.map(p => p.speed)),
        }));
        return { bestLap: best, lapComparisons: comparisons };
    }, [data.laps, outlierLapIndices]);

    const sortedLapComparisons = useMemo(() => {
        const arr = [...lapComparisons];
        arr.sort((a, b) => {
            const cmp = lapSortBy === 'time' ? a.duration - b.duration : a.index - b.index;
            return lapSortAsc ? cmp : -cmp;
        });
        return arr;
    }, [lapComparisons, lapSortBy, lapSortAsc]);

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
                    <SummaryCards data={displayData} hiddenLaps={hiddenLaps} />
                </div>

                {/* Best Lap Comparison */}
                {bestLap && lapComparisons.length > 1 && (
                    <div className="mt-3 bg-zinc-900 rounded-xl border border-zinc-800 p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Trophy size={12} className="text-yellow-500" />
                                <h3 className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                                    {t.sessions.bestLap}: {formatLapTime(bestLap.duration)}
                                </h3>
                            </div>
                            {/* Sort controls */}
                            <div className="flex items-center gap-1">
                                <button
                                    onClick={() => setLapSortBy('index')}
                                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                        lapSortBy === 'index' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                    title="Sort by lap number"
                                >
                                    <Hash size={11} />
                                </button>
                                <button
                                    onClick={() => setLapSortBy('time')}
                                    className={`flex items-center gap-0.5 px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                                        lapSortBy === 'time' ? 'bg-zinc-700 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
                                    }`}
                                    title="Sort by lap time"
                                >
                                    <Clock size={11} />
                                </button>
                                <button
                                    onClick={() => setLapSortAsc(prev => !prev)}
                                    className="flex items-center px-1 py-0.5 rounded text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                                    title={lapSortAsc ? 'Ascending' : 'Descending'}
                                >
                                    <ArrowUpDown size={12} className={lapSortAsc ? '' : 'rotate-180'} />
                                </button>
                            </div>
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-2">
                            {sortedLapComparisons.map(lc => {
                                const isHidden = hiddenLaps.has(lc.index);
                                const isAna = lc.index === anaLapIdx;
                                const isRef = lc.index === refLapIdx && !externalRefLap;
                                return (
                                    <div
                                        key={lc.index}
                                        onClick={() => onToggleLap(lc.index)}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            if (data.laps.length <= 1) return;
                                            setDeleteConfirmLap(lc.index);
                                        }}
                                        className={`group rounded-lg border px-2 py-1.5 text-center cursor-pointer transition-all hover:scale-[1.03] select-none ${
                                            isHidden
                                                ? 'bg-zinc-900/30 border-zinc-800/30 opacity-40'
                                                : lc.isBest
                                                ? 'bg-yellow-900/20 border-yellow-700/50'
                                                : lc.isOutlier
                                                ? 'bg-zinc-800/30 border-zinc-700/30 opacity-50'
                                                : 'bg-zinc-800/50 border-zinc-700/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-mono font-bold text-zinc-300">
                                                {lc.isBest && <Trophy size={10} className="inline mr-0.5 text-yellow-500" />}
                                                L{lc.index}
                                            </span>
                                            <div className="flex items-center gap-0.5">
                                                <Trash2 size={10} className="text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all" onClick={(e) => { e.stopPropagation(); if (data.laps.length > 1) setDeleteConfirmLap(lc.index); }} />
                                                {isHidden
                                                    ? <EyeOff size={10} className="text-zinc-600" />
                                                    : <Eye size={10} className="text-zinc-500 opacity-0 group-hover:opacity-100" />
                                                }
                                            </div>
                                        </div>
                                        <div className={`text-sm font-mono leading-tight ${isHidden ? 'text-zinc-600 line-through' : 'text-zinc-200'}`}>
                                            {formatLapTime(lc.duration)}
                                        </div>
                                        <div className="flex items-center justify-between mt-0.5">
                                            <span className={`text-[11px] font-mono ${
                                                isHidden ? 'text-zinc-700' : lc.isBest ? 'text-yellow-500' : lc.diff < 0.5 ? 'text-green-400' : lc.diff < 1.0 ? 'text-zinc-400' : 'text-red-400'
                                            }`}>
                                                {lc.isBest ? 'BEST' : `+${lc.diff.toFixed(2)}`}
                                            </span>
                                            <span className="text-[10px] text-zinc-600">
                                                {lc.maxSpeed.toFixed(0)}
                                            </span>
                                        </div>
                                        {/* ANA / REF */}
                                        <div className="flex gap-0.5 mt-0.5 justify-center">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSetAnaLap(lc.index); }}
                                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors ${
                                                    isAna
                                                        ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                                                        : 'text-zinc-700 hover:text-red-400 hover:bg-red-500/10 border border-transparent'
                                                }`}
                                            >
                                                A
                                            </button>
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onSetRefLap(lc.index); }}
                                                className={`text-[10px] px-1.5 py-0.5 rounded font-bold transition-colors ${
                                                    isRef
                                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                                                        : 'text-zinc-700 hover:text-blue-400 hover:bg-blue-500/10 border border-transparent'
                                                }`}
                                            >
                                                R
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

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
                        <Chart data={data} selectedLapIndex={selectedLapIndex} hiddenLaps={hiddenLaps} onRemoveLap={onToggleLap} onDeleteLap={onDeleteLap} />
                    </div>

                    {/* Map */}
                    <div className="lg:col-span-1 bg-zinc-900 rounded-xl border border-zinc-800 flex flex-col pointer-events-auto">
                        <MapComponent data={displayData} />
                    </div>
                </div>
            </div>

            {/* Delete confirmation dialog */}
            {deleteConfirmLap !== null && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setDeleteConfirmLap(null)}>
                    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 shadow-2xl min-w-[280px]" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-bold text-zinc-200 mb-1">
                            {t.overview.deleteLapTitle} — L{deleteConfirmLap}
                        </h3>
                        <p className="text-xs text-zinc-400 mb-1">
                            {formatLapTime(data.laps.find(l => l.index === deleteConfirmLap)?.duration ?? 0)}
                        </p>
                        <p className="text-xs text-zinc-500 mb-4">
                            {t.overview.deleteLapMessage}
                        </p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeleteConfirmLap(null)}
                                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
                            >
                                {t.common.cancel}
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                className="px-3 py-1.5 text-xs text-red-400 hover:text-white bg-red-900/30 hover:bg-red-800/50 border border-red-800/50 rounded-lg transition-colors"
                            >
                                {t.overview.delete}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Overview;
