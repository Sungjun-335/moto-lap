import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { Lap, SessionSummary } from '../../types';
import { listSessions, loadSession } from '../../utils/sessionStorage';
import { reconstructSession } from '../../utils/sessionReconstruct';
import { parseAimCsv } from '../../utils/aimParser';
import { detectCornersForSession } from '../../utils/cornerDetection';
import { computeLapMetrics } from '../../utils/formulaMetrics';
import { matchTrack } from '../../utils/trackMatcher';
import { ChevronDown, Database, Upload, Loader2 } from 'lucide-react';
import { useTranslation } from '../../i18n/context';
import { formatLapTime } from '../../utils/formatLapTime';
import { pickBestLap } from '../../utils/lapFilter';

type RefSource = 'current' | 'saved' | 'csv';

interface ReferenceSelectorProps {
    currentSessionLaps: Lap[];
    refLapIndex: number;
    onRefLapChange: (index: number) => void;
    onExternalRefLap: (lap: Lap | null) => void;
    currentSessionId?: string;
    initialExternalLaps?: Lap[];
}

const ReferenceSelector: React.FC<ReferenceSelectorProps> = ({
    currentSessionLaps,
    refLapIndex,
    onRefLapChange,
    onExternalRefLap,
    currentSessionId,
    initialExternalLaps,
}) => {
    const { t } = useTranslation();
    const hasInitialExternal = !!(initialExternalLaps && initialExternalLaps.length > 0);
    const [source, setSource] = useState<RefSource>(hasInitialExternal ? 'saved' : 'current');
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const csvInputRef = useRef<HTMLInputElement>(null);
    const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

    // Saved session state
    const [savedSessions, setSavedSessions] = useState<SessionSummary[]>([]);
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [externalLaps, setExternalLaps] = useState<Lap[]>(initialExternalLaps ?? []);
    const [loadingExternal, setLoadingExternal] = useState(false);

    // Calculate dropdown position from button rect
    const updateDropdownPos = useCallback(() => {
        if (!buttonRef.current) return;
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, left: rect.left });
    }, []);

    // Close picker on outside click
    useEffect(() => {
        if (!showSourcePicker) return;
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (
                buttonRef.current && !buttonRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setShowSourcePicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showSourcePicker]);

    // Load saved sessions when switching to 'saved' mode
    useEffect(() => {
        if (source === 'saved') {
            listSessions().then(setSavedSessions);
        }
    }, [source]);

    const togglePicker = () => {
        if (!showSourcePicker) updateDropdownPos();
        setShowSourcePicker(prev => !prev);
    };

    const handleSourceChange = (newSource: RefSource) => {
        setShowSourcePicker(false);
        if (newSource === 'current') {
            setSource('current');
            onExternalRefLap(null);
            setExternalLaps([]);
            setSelectedSessionId(null);
        } else if (newSource === 'csv') {
            // Don't try to programmatically open file dialog here.
            // The dropdown CSV option uses <label htmlFor> to natively trigger the input.
            setSource('csv');
        } else {
            setSource(newSource);
        }
    };

    const handleSavedSessionPick = async (sessionId: string) => {
        setSelectedSessionId(sessionId);
        setLoadingExternal(true);
        try {
            const stored = await loadSession(sessionId);
            if (!stored) return;
            const session = await reconstructSession(stored);
            setExternalLaps(session.laps);
            if (session.laps.length > 0) {
                const best = pickBestLap(session.laps);
                if (best) onExternalRefLap(best);
            }
        } finally {
            setLoadingExternal(false);
        }
    };

    const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setSource('csv');
        setLoadingExternal(true);
        try {
            const data = await parseAimCsv(file);
            const track = matchTrack(data.dataPoints);
            if (track) data.metadata.trackId = track.id;

            const sampleRate = data.laps[0]?.dataPoints.length > 1
                ? Math.round(1 / (data.laps[0].dataPoints[1].time - data.laps[0].dataPoints[0].time))
                : 20;

            const lapsWithCorners = detectCornersForSession(data.laps, sampleRate, track ?? undefined);
            const lapsWithMetrics = lapsWithCorners.map(lap => ({
                ...lap,
                metrics: computeLapMetrics(lap.dataPoints, lap.index, sampleRate),
            }));

            setExternalLaps(lapsWithMetrics);
            if (lapsWithMetrics.length > 0) {
                const best = pickBestLap(lapsWithMetrics);
                if (best) onExternalRefLap(best);
            }
        } catch (err) {
            console.error('CSV parse error for REF:', err);
        } finally {
            setLoadingExternal(false);
        }
        e.target.value = '';
    };

    const handleExternalLapPick = (lapIndex: number) => {
        const lap = externalLaps.find(l => l.index === lapIndex);
        if (lap) onExternalRefLap(lap);
    };

    const sourceLabel = source === 'current' ? t.reference.thisSession : source === 'saved' ? t.reference.savedSession : t.reference.csvUpload;

    return (
        <div className="flex items-center gap-1">
            <span className="text-[10px] text-zinc-500 uppercase font-semibold">REF</span>

            {/* Source picker button */}
            <button
                ref={buttonRef}
                onClick={togglePicker}
                className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded border border-zinc-700 bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
                {sourceLabel}
                <ChevronDown size={10} />
            </button>

            {/* Portal dropdown — renders at document root, always on top */}
            {showSourcePicker && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-36 bg-zinc-800 border border-zinc-700 rounded-lg shadow-2xl py-1"
                    style={{ top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                >
                    <button
                        onClick={() => handleSourceChange('current')}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                            source === 'current' ? 'text-blue-400 bg-zinc-700/50' : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                    >
                        {t.reference.thisSession}
                    </button>
                    <button
                        onClick={() => handleSourceChange('saved')}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 ${
                            source === 'saved' ? 'text-blue-400 bg-zinc-700/50' : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                    >
                        <Database size={11} />
                        {t.reference.savedSession}
                    </button>
                    <label
                        htmlFor="ref-csv-upload"
                        onClick={() => { setShowSourcePicker(false); setSource('csv'); }}
                        className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center gap-2 cursor-pointer ${
                            source === 'csv' ? 'text-blue-400 bg-zinc-700/50' : 'text-zinc-300 hover:bg-zinc-700'
                        }`}
                    >
                        <Upload size={11} />
                        {t.reference.csvUpload}
                    </label>
                </div>,
                document.body
            )}

            {/* Current session mode */}
            {source === 'current' && (
                <select
                    className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 font-medium focus:ring-1 focus:ring-zinc-500"
                    value={refLapIndex}
                    onChange={(e) => onRefLapChange(Number(e.target.value))}
                >
                    {currentSessionLaps.map(lap => (
                        <option key={lap.index} value={lap.index}>
                            L{lap.index} ({formatLapTime(lap.duration)})
                        </option>
                    ))}
                </select>
            )}

            {/* Saved session mode */}
            {source === 'saved' && (
                <>
                    <select
                        className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 font-medium focus:ring-1 focus:ring-zinc-500 max-w-[180px]"
                        value={selectedSessionId || ''}
                        onChange={(e) => handleSavedSessionPick(e.target.value)}
                    >
                        <option value="" disabled>{t.reference.selectSession}</option>
                        {savedSessions.map(s => (
                            <option key={s.id} value={s.id}>
                                {s.metadata.venue} {s.metadata.date}{s.id === currentSessionId ? ' ◀ ANA' : ''}
                            </option>
                        ))}
                    </select>
                    {loadingExternal && <Loader2 size={12} className="animate-spin text-blue-400" />}
                    {!loadingExternal && externalLaps.length > 0 && (
                        <select
                            className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 font-medium focus:ring-1 focus:ring-zinc-500"
                            onChange={(e) => handleExternalLapPick(Number(e.target.value))}
                            defaultValue={pickBestLap(externalLaps)?.index}
                        >
                            {[...externalLaps].sort((a, b) => a.duration - b.duration).map(lap => (
                                <option key={lap.index} value={lap.index}>
                                    L{lap.index} ({formatLapTime(lap.duration)})
                                </option>
                            ))}
                        </select>
                    )}
                </>
            )}

            {/* Hidden file input (always mounted, triggered via label htmlFor) */}
            <input
                id="ref-csv-upload"
                ref={csvInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvUpload}
            />

            {/* CSV upload mode */}
            {source === 'csv' && (
                <>
                    {loadingExternal && <Loader2 size={12} className="animate-spin text-blue-400" />}
                    {!loadingExternal && externalLaps.length === 0 && (
                        <button
                            onClick={() => csvInputRef.current?.click()}
                            className="flex items-center gap-1 px-1.5 py-0.5 text-xs bg-zinc-800 border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                        >
                            <Upload size={11} />
                            {t.reference.chooseCsv}
                        </button>
                    )}
                    {!loadingExternal && externalLaps.length > 0 && (
                        <>
                            <select
                                className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-zinc-400 font-medium focus:ring-1 focus:ring-zinc-500"
                                onChange={(e) => handleExternalLapPick(Number(e.target.value))}
                                defaultValue={pickBestLap(externalLaps)?.index}
                            >
                                {[...externalLaps].sort((a, b) => a.duration - b.duration).map(lap => (
                                    <option key={lap.index} value={lap.index}>
                                        L{lap.index} ({formatLapTime(lap.duration)})
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={() => csvInputRef.current?.click()}
                                className="flex items-center px-1 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                            >
                                <Upload size={9} />
                            </button>
                        </>
                    )}
                </>
            )}
        </div>
    );
};

export default ReferenceSelector;
