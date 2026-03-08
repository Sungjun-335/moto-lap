import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Upload, FileText, AlertCircle, MapPin, ChevronDown, X } from 'lucide-react';
import { parseAimCsv, MissingColumnError } from '../utils/aimParser';
import { parseXrk } from '../utils/xrkParser';
import { detectCornersForSession } from '../utils/cornerDetection';
import { matchTrack } from '../utils/trackMatcher';
import { computeLapMetrics } from '../utils/formulaMetrics';
import type { SessionData, LapData, Track } from '../types';
import { useTranslation } from '../i18n/context';
import { formatLapTime } from '../utils/formatLapTime';

interface FileUploadProps {
    onDataLoaded: (data: SessionData) => void;
    onBatchLoaded?: (sessions: SessionData[]) => void;
    onCancel?: () => void;
    existingFileNames?: string[];
}

const LapMiniMap: React.FC<{ dataPoints: LapData[] }> = ({ dataPoints }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !dataPoints || dataPoints.length === 0) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Calculate bounds
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;
        let minRpm = Infinity, maxRpm = -Infinity;

        // One pass for bounds
        for (const p of dataPoints) {
            if (p.latitude < minLat) minLat = p.latitude;
            if (p.latitude > maxLat) maxLat = p.latitude;
            if (p.longitude < minLon) minLon = p.longitude;
            if (p.longitude > maxLon) maxLon = p.longitude;
            if (p.rpm < minRpm) minRpm = p.rpm;
            if (p.rpm > maxRpm) maxRpm = p.rpm;
        }

        const latSpan = maxLat - minLat;
        const lonSpan = maxLon - minLon;
        const rpmSpan = maxRpm - minRpm || 1;

        // Set canvas size (account for pixel density)
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        ctx.clearRect(0, 0, rect.width, rect.height);

        // Add padding
        const padding = 10;
        const drawWidth = rect.width - (padding * 2);
        const drawHeight = rect.height - (padding * 2);

        // Aspect ratio correction to prevent distortion
        // Maps are usually taller or wider, we want to fit within the box while maintaining Aspect Ratio
        // We use a simple normalization here, effectively assuming Mercator is roughly square at small scale
        // For a mini-map, exact projection isn't critical, but aspect ratio is good to keep.
        // However, standard normalized fitting is usually enough for shape recognition.

        // To be safe with unknown aspect ratios, we'll just normalize to fit 100% of the box center
        // But let's try to preserve the shape aspect ratio if possible.
        // Lat/Lon degrees aren't square, but close enough for small tracks or visual approximation.
        // Let's just scale X and Y independently to fill the box for maximum visibility, 
        // as users care more about the shape filling the space than perfect cartography for a button.
        // Actually, distorted tracks look weird. Let's map isotropic.

        const scaleX = drawWidth / lonSpan;
        const scaleY = drawHeight / latSpan;
        const scale = Math.min(scaleX, scaleY);

        const offsetX = (rect.width - (lonSpan * scale)) / 2;
        const offsetY = (rect.height - (latSpan * scale)) / 2;

        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw segments
        for (let i = 0; i < dataPoints.length - 1; i++) {
            const p1 = dataPoints[i];
            const p2 = dataPoints[i + 1];

            ctx.beginPath();

            // X is Longitude, Y is Latitude (inverted)
            // Longitude: minLon -> 0
            const x1 = offsetX + (p1.longitude - minLon) * scale;
            const y1 = rect.height - (offsetY + (p1.latitude - minLat) * scale); // Invert Y

            const x2 = offsetX + (p2.longitude - minLon) * scale;
            const y2 = rect.height - (offsetY + (p2.latitude - minLat) * scale);

            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);

            // Color based on RPM
            // Simple Heatmap: Low (Blue) -> High (Red)
            // Normalized 0..1
            const t = (p1.rpm - minRpm) / rpmSpan;
            // HSL: Blue(240) -> Cyan(180) -> Green(120) -> Yellow(60) -> Red(0)
            // Let's go simpler: 240 (Blue) -> 0 (Red)
            const hue = 240 - (t * 240);
            ctx.strokeStyle = `hsl(${hue}, 80%, 50%)`;

            ctx.stroke();
        }

    }, [dataPoints]);

    return <canvas ref={canvasRef} className="w-full h-full" />;
};

interface BatchProgress {
    current: number;
    total: number;
    currentFile: string;
    errors: { name: string; error: string }[];
    completed: number;
}

const RIDER_NAMES_KEY = 'motolap-rider-names';

function getSavedRiderNames(): string[] {
    try {
        const raw = localStorage.getItem(RIDER_NAMES_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch { return []; }
}

function saveRiderName(name: string) {
    if (!name.trim()) return;
    const names = getSavedRiderNames();
    const trimmed = name.trim();
    const filtered = names.filter(n => n !== trimmed);
    filtered.unshift(trimmed); // most recent first
    localStorage.setItem(RIDER_NAMES_KEY, JSON.stringify(filtered.slice(0, 20)));
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded, onBatchLoaded, onCancel, existingFileNames = [] }) => {
    const { t } = useTranslation();
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [parsedData, setParsedData] = useState<SessionData | null>(null);
    const [selectedLapIndices, setSelectedLapIndices] = useState<Set<number>>(new Set());
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [analyzing, setAnalyzing] = useState(false);

    const [missingColumns, setMissingColumns] = useState<string[]>([]);
    const [availableHeaders, setAvailableHeaders] = useState<string[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});

    const [matchedTrack, setMatchedTrack] = useState<Track | null>(null);

    const [bikeModel, setBikeModel] = useState('');
    const [riderName, setRiderName] = useState(() => getSavedRiderNames()[0] || '');
    const [savedRiderNames, setSavedRiderNames] = useState<string[]>(getSavedRiderNames);
    const [showRiderDropdown, setShowRiderDropdown] = useState(false);
    const riderInputRef = useRef<HTMLInputElement>(null);
    const riderDropdownRef = useRef<HTMLDivElement>(null);
    const [condition, setCondition] = useState<'dry' | 'wet'>('dry');
    const [tuning, setTuning] = useState<'stock' | 'tuned'>('stock');
    const [sessionType, setSessionType] = useState<'practice' | 'race' | 'warmup' | 'trackday'>('practice');
    const [eventName, setEventName] = useState('');
    const [fileName, setFileName] = useState('');

    const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
    const [duplicateConfirm, setDuplicateConfirm] = useState<{ files: File[]; duplicates: string[] } | null>(null);
    const riderWrapperRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (riderWrapperRef.current && !riderWrapperRef.current.contains(e.target as Node)) {
                setShowRiderDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const isXrkFile = (file: File) => file.name.toLowerCase().endsWith('.xrk');

    const processFile = async (file: File, mapping?: Record<string, string>) => {
        setError(null);
        setLoading(true);
        setMissingColumns([]); // Reset on new attempt

        try {
            const data = isXrkFile(file)
                ? await parseXrk(file)
                : await parseAimCsv(file, mapping);

            // Track auto-recognition
            const track = matchTrack(data.dataPoints);
            if (track) {
                console.log(`[FileUpload] Track recognized: ${track.name} (${track.shortName})`);
                data.metadata.trackId = track.id;
                setMatchedTrack(track);
            } else {
                setMatchedTrack(null);
            }

            setParsedData(data);
            setFileToUpload(file);
            setFileName(file.name);
            setSelectedLapIndices(new Set(data.laps.map(l => l.index)));
            setBikeModel(data.metadata.vehicle || '');
            if (data.metadata.user && data.metadata.user !== 'Unknown') {
                setRiderName(data.metadata.user);
            }
        } catch (err: any) {
            console.error(err);
            if (err instanceof MissingColumnError) {
                setMissingColumns(err.missingColumns);
                setAvailableHeaders(err.allHeaders);
                // Initialize mapping for missing columns to empty
                const initialMapping = { ...mapping };
                err.missingColumns.forEach((col: string) => {
                    if (!initialMapping[col]) initialMapping[col] = "";
                });
                setColumnMapping(initialMapping);
            } else {
                setError(err.message || 'Failed to parse CSV file');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRetryMapping = () => {
        // Validate all mappings are set
        const allSet = missingColumns.every(col => columnMapping[col] && columnMapping[col] !== "");
        if (!allSet) {
            setError(t.upload.mapAllColumns);
            return;
        }
        if (fileToUpload) {
            processFile(fileToUpload, columnMapping);
        }
    };

    const processBatch = async (files: File[]) => {
        const total = files.length;
        const sessions: SessionData[] = [];
        const errors: { name: string; error: string }[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setBatchProgress({ current: i + 1, total, currentFile: file.name, errors, completed: sessions.length });

            try {
                const data = isXrkFile(file)
                    ? await parseXrk(file)
                    : await parseAimCsv(file);

                const track = matchTrack(data.dataPoints);
                if (track) {
                    data.metadata.trackId = track.id;
                }

                const sampleRate = data.laps[0]?.dataPoints.length > 1
                    ? Math.round(1 / (data.laps[0].dataPoints[1].time - data.laps[0].dataPoints[0].time))
                    : 20;

                const lapsWithCorners = detectCornersForSession(data.laps, sampleRate, track ?? undefined);

                const lapsWithMetrics = lapsWithCorners.map(lap => ({
                    ...lap,
                    metrics: computeLapMetrics(lap.dataPoints, lap.index, sampleRate),
                }));

                data.metadata.fileName = file.name;
                sessions.push({ ...data, laps: lapsWithMetrics });
            } catch (err: any) {
                console.error(`[FileUpload] Batch: failed to process ${file.name}:`, err);
                errors.push({ name: file.name, error: err.message || 'Parse error' });
            }
        }

        setBatchProgress({ current: total, total, currentFile: '', errors, completed: sessions.length });

        if (sessions.length > 0 && onBatchLoaded) {
            onBatchLoaded(sessions);
        }

        // Keep batch progress visible briefly so user sees the result
        setTimeout(() => setBatchProgress(null), 2000);
    };

    const handleConfirmSelection = async () => {
        if (!parsedData) return;

        // Save rider name for future use
        if (riderName.trim()) {
            saveRiderName(riderName);
            setSavedRiderNames(getSavedRiderNames());
        }

        setAnalyzing(true);
        try {
            // Filter selected laps first
            const selectedLaps = parsedData.laps.filter(l => selectedLapIndices.has(l.index));

            // Detect sample rate from metadata or estimate from data
            const sampleRate = parsedData.laps[0]?.dataPoints.length > 1
                ? Math.round(1 / (parsedData.laps[0].dataPoints[1].time - parsedData.laps[0].dataPoints[0].time))
                : 20;

            // Local corner detection (with track DB if recognized)
            console.log("[FileUpload] Running local corner detection, sampleRate:", sampleRate, matchedTrack ? `track: ${matchedTrack.shortName}` : 'no track DB');
            const lapsWithCorners = detectCornersForSession(selectedLaps, sampleRate, matchedTrack ?? undefined);
            console.log("[FileUpload] Corner detection complete:", lapsWithCorners.map(l => `Lap ${l.index}: ${l.corners?.length ?? 0} corners`));

            // Compute formula metrics for each lap
            const lapsWithMetrics = lapsWithCorners.map(lap => ({
                ...lap,
                metrics: computeLapMetrics(lap.dataPoints, lap.index, sampleRate),
            }));
            console.log("[FileUpload] Formula metrics computed for", lapsWithMetrics.length, "laps");

            const finalData = {
                ...parsedData,
                metadata: {
                    ...parsedData.metadata,
                    bikeModel: bikeModel || undefined,
                    riderName: riderName || undefined,
                    fileName: fileName || undefined,
                    condition,
                    tuning,
                    sessionType,
                    eventName: sessionType === 'race' && eventName ? eventName : undefined,
                },
                laps: lapsWithMetrics
            };

            onDataLoaded(finalData);

        } catch (e) {
            console.error("Corner detection error:", e);
            // Fallback: load without corners
            const filteredLaps = parsedData.laps.filter(l => selectedLapIndices.has(l.index));
            const finalData = {
                ...parsedData,
                metadata: {
                    ...parsedData.metadata,
                    bikeModel: bikeModel || undefined,
                    riderName: riderName || undefined,
                    fileName: fileName || undefined,
                    condition,
                    tuning,
                    sessionType,
                    eventName: sessionType === 'race' && eventName ? eventName : undefined,
                },
                laps: filteredLaps,
            };
            onDataLoaded(finalData);
        } finally {
            setAnalyzing(false);
        }
    };

    const toggleLap = (index: number) => {
        const next = new Set(selectedLapIndices);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        setSelectedLapIndices(next);
    };

    const toggleAll = () => {
        if (!parsedData) return;
        if (selectedLapIndices.size === parsedData.laps.length) {
            setSelectedLapIndices(new Set());
        } else {
            setSelectedLapIndices(new Set(parsedData.laps.map(l => l.index)));
        }
    };

    const checkDuplicatesAndProcess = useCallback((files: File[]) => {
        const duplicates = files
            .filter(f => existingFileNames.includes(f.name))
            .map(f => f.name);

        if (duplicates.length > 0) {
            setDuplicateConfirm({ files, duplicates });
        } else {
            if (files.length === 1) {
                processFile(files[0]);
            } else {
                processBatch(files);
            }
        }
    }, [existingFileNames]);

    const handleDuplicateConfirm = () => {
        if (!duplicateConfirm) return;
        const { files } = duplicateConfirm;
        setDuplicateConfirm(null);
        if (files.length === 1) {
            processFile(files[0]);
        } else {
            processBatch(files);
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const allFiles = Array.from(e.dataTransfer.files);
        const supportedFiles = allFiles.filter(f =>
            f.name.endsWith('.csv') || f.type === 'text/csv' || f.name.toLowerCase().endsWith('.xrk')
        );

        if (supportedFiles.length === 0) {
            setError(t.upload.pleaseUploadCsv);
        } else {
            checkDuplicatesAndProcess(supportedFiles);
        }
    }, [checkDuplicatesAndProcess]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const supported = Array.from(files).filter(f =>
            f.name.endsWith('.csv') || f.type === 'text/csv' || f.name.toLowerCase().endsWith('.xrk')
        );
        if (supported.length > 0) checkDuplicatesAndProcess(supported);
    };

    // --- RENDER ---

    // 0-a. Duplicate file confirmation dialog
    if (duplicateConfirm) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                <div className="w-full max-w-md bg-zinc-900 border border-amber-500/50 rounded-2xl p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-amber-500/20 rounded-full">
                            <AlertCircle className="w-8 h-8 text-amber-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white">{t.upload.duplicateFileDetected}</h2>
                    </div>

                    <div className="space-y-2 mb-6">
                        {duplicateConfirm.duplicates.map(name => (
                            <div key={name} className="flex items-center gap-2 px-3 py-2 bg-zinc-800 rounded-lg">
                                <FileText className="w-4 h-4 text-amber-400 shrink-0" />
                                <span className="text-sm text-zinc-300 truncate">
                                    {t.upload.duplicateFileMessage.replace('{fileName}', name)}
                                </span>
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={() => setDuplicateConfirm(null)}
                            className="flex-1 px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
                        >
                            {t.upload.duplicateCancel}
                        </button>
                        <button
                            onClick={handleDuplicateConfirm}
                            className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors font-medium"
                        >
                            {t.upload.duplicateContinue}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // 0. Batch Processing Progress
    if (batchProgress) {
        const pct = Math.round((batchProgress.current / batchProgress.total) * 100);
        const isDone = batchProgress.current === batchProgress.total && batchProgress.currentFile === '';

        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                <div className="w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-blue-500/20 rounded-full">
                            <Upload className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                {isDone
                                    ? t.upload.batchComplete.replace('{success}', String(batchProgress.completed))
                                    : t.upload.batchProcessing
                                        .replace('{current}', String(batchProgress.current))
                                        .replace('{total}', String(batchProgress.total))
                                }
                            </h2>
                            {!isDone && (
                                <p className="text-zinc-400 text-sm truncate max-w-[300px]">
                                    {batchProgress.currentFile}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-zinc-800 rounded-full h-2 mb-4">
                        <div
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${pct}%` }}
                        />
                    </div>

                    {/* Error list */}
                    {batchProgress.errors.length > 0 && (
                        <div className="mt-4 space-y-1">
                            <p className="text-red-400 text-sm font-medium">
                                {t.upload.batchFailed.replace('{count}', String(batchProgress.errors.length))}
                            </p>
                            {batchProgress.errors.map((e, i) => (
                                <p key={i} className="text-zinc-500 text-xs truncate">
                                    {t.upload.batchSkipped.replace('{name}', e.name).replace('{error}', e.error)}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // 1. Missing Column Mapping Modal
    if (missingColumns.length > 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
                <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl p-8 shadow-2xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-yellow-500/20 rounded-full">
                            <AlertCircle className="w-8 h-8 text-yellow-500" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-white">{t.upload.missingColumnsDetected}</h2>
                            <p className="text-zinc-400">
                                {t.upload.missingColumnsDesc}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 mb-8">
                        {missingColumns.map(colKey => (
                            <div key={colKey} className="flex flex-col md:flex-row md:items-center justify-between gap-2 p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
                                <div className="flex flex-col">
                                    <span className="font-mono font-bold text-lg text-blue-400 uppercase">{colKey}</span>
                                    <span className="text-xs text-zinc-500">{t.upload.requiredDataColumn}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-zinc-400">{t.upload.mapTo}</span>
                                    <select
                                        className="bg-zinc-950 border border-zinc-600 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full md:w-64 p-2.5"
                                        value={columnMapping[colKey] || ""}
                                        onChange={(e) => setColumnMapping(prev => ({ ...prev, [colKey]: e.target.value }))}
                                    >
                                        <option value="" disabled>{t.upload.selectCsvHeader}</option>
                                        {availableHeaders.map(header => (
                                            <option key={header} value={header}>{header}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    {error && (
                        <div className="mb-6 flex items-center text-red-400 bg-red-400/10 px-4 py-2 rounded-lg text-sm">
                            <AlertCircle className="w-4 h-4 mr-2" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => {
                                setMissingColumns([]);
                                setFileToUpload(null);
                                setError(null);
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                        >
                            {t.common.cancel}
                        </button>
                        <button
                            onClick={handleRetryMapping}
                            className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 transition-all hover:scale-105"
                        >
                            {t.upload.retryAnalysis}
                        </button>
                    </div>
                </div>
            </div>
        );
    }


    if (parsedData) {
        return (
            <div className="flex flex-col h-screen max-w-6xl mx-auto p-6 text-zinc-100">
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-white">{t.upload.selectLaps}</h2>
                        <p className="text-zinc-400">
                            {parsedData.metadata.venue} • {parsedData.metadata.date}
                            {matchedTrack && (
                                <span className="inline-flex items-center ml-2 px-2 py-0.5 bg-emerald-900/30 text-emerald-400 text-xs rounded-full border border-emerald-800/50">
                                    <MapPin className="w-3 h-3 mr-1" />
                                    {matchedTrack.name} ({matchedTrack.shortName}) • {matchedTrack.totalLength}m
                                </span>
                            )}
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <button
                            onClick={() => {
                                setParsedData(null);
                                setSelectedLapIndices(new Set());
                            }}
                            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 transition"
                        >
                            {t.common.cancel}
                        </button>
                        <button
                            onClick={handleConfirmSelection}
                            disabled={selectedLapIndices.size === 0}
                            className="px-6 py-2 rounded-lg text-sm font-bold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition text-white"
                        >
                            {analyzing ? t.upload.analyzingCorners : t.upload.confirmSelection.replace('{count}', String(selectedLapIndices.size))}
                        </button>
                    </div>
                </header>

                {/* Session Info Form */}
                <div className="mb-6 p-4 bg-zinc-800/50 rounded-xl border border-zinc-700/50">
                    <div className="flex flex-wrap items-end gap-4">
                        {/* Rider Name with autocomplete */}
                        <div ref={riderWrapperRef} className="flex flex-col gap-1 min-w-[140px] flex-1 relative">
                            <label className="text-xs text-zinc-500">{t.upload.riderName}</label>
                            <div className="relative">
                                <input
                                    ref={riderInputRef}
                                    type="text"
                                    value={riderName}
                                    onChange={e => {
                                        setRiderName(e.target.value);
                                        setShowRiderDropdown(true);
                                    }}
                                    onFocus={() => { if (savedRiderNames.length > 0) setShowRiderDropdown(true); }}
                                    placeholder={t.upload.riderNamePlaceholder}
                                    className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 pr-14 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                                    {riderName && (
                                        <button
                                            type="button"
                                            onClick={() => { setRiderName(''); riderInputRef.current?.focus(); }}
                                            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                                        >
                                            <X size={12} />
                                        </button>
                                    )}
                                    {savedRiderNames.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setShowRiderDropdown(prev => !prev)}
                                            className="p-0.5 text-zinc-500 hover:text-zinc-300 transition"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    )}
                                </div>
                                {showRiderDropdown && savedRiderNames.length > 0 && (
                                    <div
                                        ref={riderDropdownRef}
                                        className="absolute z-50 top-full left-0 right-0 mt-1 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-h-40 overflow-auto"
                                    >
                                        {savedRiderNames
                                            .filter(n => !riderName || n.toLowerCase().includes(riderName.toLowerCase()))
                                            .map(name => (
                                                <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() => {
                                                        setRiderName(name);
                                                        setShowRiderDropdown(false);
                                                    }}
                                                    className="w-full text-left px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
                                                >
                                                    {name}
                                                </button>
                                            ))
                                        }
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Bike Model */}
                        <div className="flex flex-col gap-1 min-w-[180px] flex-1">
                            <label className="text-xs text-zinc-500">{t.upload.bikeModel}</label>
                            <input
                                type="text"
                                value={bikeModel}
                                onChange={e => setBikeModel(e.target.value)}
                                placeholder={t.upload.bikeModelPlaceholder}
                                className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        {/* Condition Toggle */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500">{t.upload.condition}</label>
                            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                                <button
                                    type="button"
                                    onClick={() => setCondition('dry')}
                                    className={`px-3 py-1.5 text-xs font-bold transition ${
                                        condition === 'dry'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {t.upload.conditionDry}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCondition('wet')}
                                    className={`px-3 py-1.5 text-xs font-bold transition ${
                                        condition === 'wet'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {t.upload.conditionWet}
                                </button>
                            </div>
                        </div>

                        {/* Tuning Toggle */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500">{t.upload.tuning}</label>
                            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                                <button
                                    type="button"
                                    onClick={() => setTuning('stock')}
                                    className={`px-3 py-1.5 text-xs font-bold transition ${
                                        tuning === 'stock'
                                            ? 'bg-zinc-600 text-white'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {t.upload.tuningStock}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTuning('tuned')}
                                    className={`px-3 py-1.5 text-xs font-bold transition ${
                                        tuning === 'tuned'
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                    }`}
                                >
                                    {t.upload.tuningTuned}
                                </button>
                            </div>
                        </div>

                        {/* Session Type */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-zinc-500">{t.upload.sessionType}</label>
                            <div className="flex rounded-lg overflow-hidden border border-zinc-700">
                                {(['practice', 'race', 'warmup', 'trackday'] as const).map(type => {
                                    const labels = {
                                        practice: t.upload.typePractice,
                                        race: t.upload.typeRace,
                                        warmup: t.upload.typeWarmup,
                                        trackday: t.upload.typeTrackday,
                                    };
                                    return (
                                        <button
                                            key={type}
                                            type="button"
                                            onClick={() => setSessionType(type)}
                                            className={`px-3 py-1.5 text-xs font-medium transition ${
                                                sessionType === type
                                                    ? 'bg-blue-600 text-white'
                                                    : 'bg-zinc-900 text-zinc-500 hover:text-zinc-300'
                                            }`}
                                        >
                                            {labels[type]}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Event Name (only when race) */}
                        {sessionType === 'race' && (
                            <div className="flex flex-col gap-1 min-w-[200px] flex-1">
                                <label className="text-xs text-zinc-500">{t.upload.eventName}</label>
                                <input
                                    type="text"
                                    value={eventName}
                                    onChange={e => setEventName(e.target.value)}
                                    placeholder={t.upload.eventNamePlaceholder}
                                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
                                />
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex justify-between items-center mb-4">
                    <button
                        onClick={toggleAll}
                        className="text-sm font-medium text-blue-400 hover:text-blue-300"
                    >
                        {selectedLapIndices.size === parsedData.laps.length ? t.upload.deselectAll : t.upload.selectAll}
                    </button>
                    <div className="text-zinc-500 text-sm">
                        {t.upload.totalLapsFound.replace('{count}', String(parsedData.laps.length))}
                    </div>
                </div>

                <div className="flex-1 overflow-auto grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pb-20">
                    {parsedData.laps.map((lap) => {
                        const isSelected = selectedLapIndices.has(lap.index);
                        const maxSpeed = Math.max(...lap.dataPoints.map(p => p.speed));

                        return (
                            <div
                                key={lap.index}
                                onClick={() => toggleLap(lap.index)}
                                className={`
                                    relative flex flex-col p-4 rounded-xl border-2 transition-all cursor-pointer group
                                    ${isSelected
                                        ? 'bg-blue-900/20 border-blue-500/50 hover:border-blue-500'
                                        : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                                    }
                                `}
                            >
                                <div className="flex justify-between items-start mb-4">
                                    <div className={`
                                        w-6 h-6 rounded flex items-center justify-center border transition-colors
                                        ${isSelected ? 'bg-blue-500 border-blue-500 text-white' : 'border-zinc-600 text-transparent'}
                                    `}>
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <span className={`font-mono text-xl ${isSelected ? 'text-white' : 'text-zinc-500'}`}>
                                        {t.common.lap} {lap.index}
                                    </span>
                                </div>

                                <div className="w-full h-32 mb-4 bg-zinc-950/50 rounded-lg p-2 opacity-80 group-hover:opacity-100 transition-opacity">
                                    <LapMiniMap dataPoints={lap.dataPoints} />
                                </div>

                                <div className="mt-auto space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-zinc-500">{t.common.time}</span>
                                        <span className="font-mono font-medium text-zinc-200">
                                            {formatLapTime(lap.duration)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-xs">
                                        <span className="text-zinc-600">{t.upload.maxSpeed}</span>
                                        <span className="font-mono text-zinc-400">
                                            {maxSpeed.toFixed(0)} km/h
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-4">
            <div
                className={`
          flex flex-col items-center justify-center w-full max-w-xl p-12 
          border-2 border-dashed rounded-3xl transition-all duration-300
          ${isDragging
                        ? 'border-blue-500 bg-blue-500/10 scale-105'
                        : 'border-white/20 hover:border-white/40 bg-zinc-900/50 backdrop-blur-sm'
                    }
        `}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
            >
                <div className="bg-zinc-800 p-4 rounded-full mb-6">
                    <Upload className="w-10 h-10 text-blue-400" />
                </div>

                <h2 className="text-2xl font-bold mb-2 text-white">{t.upload.uploadSessionData}</h2>
                <p className="text-zinc-400 mb-8 text-center text-lg">
                    {t.upload.dragAndDrop}
                </p>

                <label className="relative group cursor-pointer">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg blur opacity-60 group-hover:opacity-100 transition duration-200"></div>
                    <div className="relative flex items-center px-8 py-4 bg-zinc-900 rounded-lg leading-none">
                        <span className="text-blue-100 font-semibold group-hover:text-white transition duration-200">
                            {loading ? t.upload.processing : t.upload.selectFile}
                        </span>
                    </div>
                    <input
                        type="file"
                        className="hidden"
                        accept=".csv,.xrk"
                        multiple
                        onChange={handleChange}
                        disabled={loading || batchProgress !== null}
                    />
                </label>

                {error && (
                    <div className="mt-6 flex items-center text-red-400 bg-red-400/10 px-4 py-2 rounded-lg">
                        <AlertCircle className="w-5 h-5 mr-2" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="mt-8 flex items-center text-zinc-500 text-sm">
                    <FileText className="w-4 h-4 mr-2" />
                    <span>{t.upload.supportedFormats}</span>
                </div>
            </div>

            {onCancel && (
                <button
                    onClick={onCancel}
                    className="mt-8 text-zinc-500 hover:text-zinc-300 transition text-sm"
                >
                    {t.upload.cancelAndGoBack}
                </button>
            )}
        </div>
    );
};

export default FileUpload;
