import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { SessionData, Lap } from '../../types';

import GForceChart from './GForceChart';
import AnalysisMap from './AnalysisMap';
import { RotateCcw, Play, Pause, Square, Plus, X, ChevronDown, LayoutDashboard, LineChart, MapPin, ArrowLeft, Sparkles, Waves, Maximize2 } from 'lucide-react';
import { AnalysisChartWrapper } from './AnalysisChartWrapper';
import { useAnalysisState } from './useAnalysisState';
import CornerAnalysisPanel from './CornerAnalysisPanel';
import { CHART_REGISTRY, getDefaultVisibleCharts } from './chartRegistry';
import LapMetricsSummary from './LapMetricsSummary';
import RiderStatsCard from './RiderStatsCard';
import ReportModal from './ReportModal';
import { collectReportData, buildReportPrompt, generateReport, fetchVenueStats, computeSessionMetrics } from '../../utils/reportApi';
import type { VenueStats } from '../../utils/reportApi';
import ReferenceSelector from './ReferenceSelector';
import { saveReport, loadReport, listAllReports } from '../../utils/sessionStorage';
import type { StoredReport } from '../../utils/sessionStorage';
import { useTranslation } from '../../i18n/context';
import { getChartLabel, getChartTitle } from '../../i18n/chartLabels';
import { formatLapTime } from '../../utils/formatLapTime';
import { smoothGData, smoothGyroData } from '../../utils/smoothing';
import { pickBestLap } from '../../utils/lapFilter';

// const WhatIfPanel = lazy(() => import('./WhatIfPanel')); // TODO: 추후 구현 예정

interface AnalysisDashboardProps {
    data: SessionData;
    onBack?: () => void;
    onSwitchToOverview?: () => void;
    matchedTrack?: { shortName: string; totalLength: number } | null;
    initialCornerId?: number | null;
    onInitialCornerHandled?: () => void;
    initialRefSession?: SessionData | null;
}

// Chart ID sets for smoothing lookup (module scope to avoid re-creation on render)
const G_CHART_IDS = new Set(['lat_g', 'lon_g']);
const GYRO_CHART_IDS = new Set(['pitch_rate', 'roll_rate', 'yaw_rate']);

// Extracted from inline IIFE for cleaner rendering
const ExpandedChartModal: React.FC<{
    chart: import('./chartRegistry').ChartDefinition;
    chartData: import('../../utils/analysis').AnalysisPoint[];
    expandedHeight: number;
    flexConfig?: { title: string; lines: import('./FlexibleLineChart').LineConfig[]; yDomain?: [number | string, number | string] };
    dragState: any;
    onMouseMove: any;
    onMouseDown: any;
    onMouseUp: any;
    zoomDomain: [number, number] | null;
    cursorDistance: number | null;
    cornerRanges: any;
    drivingEventMarkers: any;
    onClose: () => void;
    t: any;
}> = ({ chart, chartData, expandedHeight, flexConfig, dragState, onMouseMove, onMouseDown, onMouseUp, zoomDomain, cursorDistance, cornerRanges, drivingEventMarkers, onClose, t }) => (
    <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
        <div className="w-[95vw] h-[85vh] bg-zinc-900 rounded-xl border border-zinc-700 shadow-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 flex-shrink-0">
                <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                    <Maximize2 size={14} className="text-zinc-400" />
                    {getChartTitle(chart.id, t)}
                </h2>
                <span className="text-[10px] text-zinc-500">{t.analysisDashboard.expandClose}</span>
                <button onClick={onClose} className="text-zinc-400 hover:text-white transition-colors p-1 rounded hover:bg-zinc-700">
                    <X size={16} />
                </button>
            </div>
            <div className="flex-1 p-4 min-h-0">
                <AnalysisChartWrapper
                    chartId={`expanded-${chart.id}`}
                    ChartComponent={chart.component}
                    flexConfig={flexConfig}
                    data={chartData}
                    height={expandedHeight}
                    dragState={dragState}
                    onMouseMove={onMouseMove}
                    onMouseDown={onMouseDown}
                    onMouseUp={onMouseUp}
                    zoomDomain={zoomDomain}
                    cursorDistance={cursorDistance}
                    cornerRanges={cornerRanges}
                    drivingEventMarkers={drivingEventMarkers}
                />
            </div>
        </div>
    </div>
);

// Resizable divider handle
const ResizeHandle: React.FC<{
    direction: 'horizontal' | 'vertical';
    onDrag: (delta: number) => void;
}> = ({ direction, onDrag }) => {
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startPos = direction === 'horizontal' ? e.clientX : e.clientY;

        const onMouseMove = (me: MouseEvent) => {
            const currentPos = direction === 'horizontal' ? me.clientX : me.clientY;
            onDrag(currentPos - startPos);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };

        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [direction, onDrag]);

    return (
        <div
            onMouseDown={handleMouseDown}
            className={`flex-shrink-0 flex items-center justify-center group ${
                direction === 'horizontal'
                    ? 'w-2 cursor-col-resize hover:bg-blue-500/20'
                    : 'h-2 cursor-row-resize hover:bg-blue-500/20'
            }`}
        >
            <div className={`rounded-full bg-zinc-600 group-hover:bg-blue-400 transition-colors ${
                direction === 'horizontal' ? 'w-0.5 h-8' : 'h-0.5 w-8'
            }`} />
        </div>
    );
};

const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ data, onBack, onSwitchToOverview, matchedTrack, initialCornerId, onInitialCornerHandled, initialRefSession }) => {
    const { t } = useTranslation();

    // If a REF session was passed from session list pair-select, use its best lap
    const [externalRefLap, setExternalRefLap] = useState<Lap | null>(() => {
        if (!initialRefSession?.laps?.length) return null;
        return pickBestLap(initialRefSession.laps) ?? null;
    });

    const {
        sortedLaps,
        outlierLapIndices,
        refLapIndex,
        anaLapIndex,
        setRefLapIndex,
        setAnaLapIndex,
        anaLapDuration,
        totalDiff,
        fullAnalysisData,
        viewData,
        brushRange,
        handleResetZoom,
        hoveredPoint,
        dragState,
        handleChartMouseDown,
        handleChartMouseMove,
        handleChartMouseUp,
        selectedCornerId,
        selectCorner,
        closeCornerAnalysis,
        cornerDistanceRanges,
        drivingEventMarkers,
        isPlaying,
        playbackProgress,
        togglePlayback,
        stopPlayback,
        xAxisMode,
        setXAxisMode
    } = useAnalysisState(data, externalRefLap);

    // Handle initial corner selection from Overview navigation
    useEffect(() => {
        if (initialCornerId != null) {
            selectCorner(initialCornerId);
            onInitialCornerHandled?.();
        }
    }, [initialCornerId]); // eslint-disable-line react-hooks/exhaustive-deps

    const zoomDomain: [number, number] | null = brushRange
        ? [brushRange.startDist, brushRange.endDist]
        : null;
    const cursorDistance = hoveredPoint?.distance ?? null;

    // G-force smoothing toggle
    const [gSmoothing, setGSmoothing] = useState(true);
    const smoothedViewData = useMemo(
        () => gSmoothing ? smoothGData(viewData) : viewData,
        [viewData, gSmoothing]
    );

    // Gyro (Pitch/Roll/Yaw) smoothing toggle
    const [gyroSmoothing, setGyroSmoothing] = useState(true);
    const smoothedGyroData = useMemo(
        () => gyroSmoothing ? smoothGyroData(viewData) : viewData,
        [viewData, gyroSmoothing]
    );

    // Driving event markers toggle
    const [showDrivingMarkers, setShowDrivingMarkers] = useState(false);

    // Expanded chart modal state
    const [expandedChartId, setExpandedChartId] = useState<string | null>(null);

    // Memoized flexConfig objects to avoid re-creation on every render
    const flexConfigMap = useMemo(() => {
        const map: Record<string, { title: string; lines: import('./FlexibleLineChart').LineConfig[]; yDomain?: [number | string, number | string] }> = {};
        for (const chart of CHART_REGISTRY) {
            if (chart.flexConfig) {
                map[chart.id] = { ...chart.flexConfig, title: getChartTitle(chart.id, t) };
            }
        }
        return map;
    }, [t]);

    // Chart selection state
    const [visibleCharts, setVisibleCharts] = useState<string[]>(getDefaultVisibleCharts);
    const [showChartPicker, setShowChartPicker] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);

    // Resizable panel states (percentages)
    const [leftPanelPct, setLeftPanelPct] = useState(35); // left panel width %
    const [mapPct, setMapPct] = useState(63); // map height % — G-circle gets ~37%, roughly square
    const [showLapMetrics, setShowLapMetrics] = useState(true);
    // const [showWhatIf, setShowWhatIf] = useState(false); // TODO: 추후 구현 예정
    const containerRef = useRef<HTMLDivElement>(null);
    const leftPanelRef = useRef<HTMLDivElement>(null);

    // Close picker on outside click
    useEffect(() => {
        if (!showChartPicker) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowChartPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showChartPicker]);

    // Close expanded chart on Escape
    useEffect(() => {
        if (!expandedChartId) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setExpandedChartId(null);
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [expandedChartId]);

    const handleHorizontalResize = useCallback((delta: number) => {
        if (!containerRef.current) return;
        const totalWidth = containerRef.current.offsetWidth;
        const deltaPct = (delta / totalWidth) * 100;
        setLeftPanelPct(prev => Math.min(60, Math.max(20, prev + deltaPct)));
    }, []);

    const handleVerticalResize = useCallback((delta: number) => {
        if (!leftPanelRef.current) return;
        const totalHeight = leftPanelRef.current.offsetHeight;
        const deltaPct = (delta / totalHeight) * 100;
        setMapPct(prev => Math.min(70, Math.max(15, prev + deltaPct)));
    }, []);

    const toggleChart = useCallback((chartId: string) => {
        setVisibleCharts(prev => {
            if (prev.includes(chartId)) {
                return prev.filter(id => id !== chartId);
            }
            const registryOrder = CHART_REGISTRY.map(c => c.id);
            const newList = [...prev, chartId];
            return newList.sort((a, b) => registryOrder.indexOf(a) - registryOrder.indexOf(b));
        });
    }, []);

    const removeChart = useCallback((chartId: string) => {
        setVisibleCharts(prev => prev.filter(id => id !== chartId));
    }, []);

    const activeCharts = CHART_REGISTRY.filter(c => visibleCharts.includes(c.id));

    // Lap metrics for summary card
    const refMetrics = (externalRefLap ?? data.laps.find(l => l.index === refLapIndex))?.metrics;
    const anaMetrics = data.laps.find(l => l.index === anaLapIndex)?.metrics;

    const refCorners = (externalRefLap ?? sortedLaps.find(l => l.index === refLapIndex))?.corners;

    // AI Report state
    const [reportState, setReportState] = useState<{
        open: boolean;
        status: 'confirm' | 'loading' | 'error' | 'success';
        report: string;
        error: string;
    }>({ open: false, status: 'confirm', report: '', error: '' });
    const [reportLang, setReportLang] = useState<'ko' | 'en'>('ko');
    const [hasSavedReport, setHasSavedReport] = useState(false);
    const [allSavedReports, setAllSavedReports] = useState<StoredReport[]>([]);
    const abortRef = useRef<AbortController | null>(null);
    const reportCacheRef = useRef<Map<string, string>>(new Map());

    const getCacheKey = useCallback((lang: 'ko' | 'en') => {
        return `${refLapIndex}-${anaLapIndex}-${lang}`;
    }, [refLapIndex, anaLapIndex]);

    // Check if saved report exists in DB on mount / lap change
    useEffect(() => {
        if (!data.id) return;
        let cancelled = false;
        (async () => {
            try {
                const [ko, en] = await Promise.all([
                    loadReport(data.id!, refLapIndex, anaLapIndex, 'ko'),
                    loadReport(data.id!, refLapIndex, anaLapIndex, 'en'),
                ]);
                if (!cancelled) {
                    setHasSavedReport(!!(ko || en));
                    // Pre-populate memory cache
                    if (ko) reportCacheRef.current.set(getCacheKey('ko'), ko.report);
                    if (en) reportCacheRef.current.set(getCacheKey('en'), en.report);
                }
            } catch {
                // IndexedDB may fail — ignore
            }
        })();
        return () => { cancelled = true; };
    }, [data.id, refLapIndex, anaLapIndex, getCacheKey]);

    // Load all saved reports — refresh on mount, after generation, and when modal opens
    useEffect(() => {
        let cancelled = false;
        listAllReports()
            .then(reports => { if (!cancelled) setAllSavedReports(reports); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [hasSavedReport, reportState.open]);

    // Session metrics (always computed locally)
    const sessionMetrics = useMemo(() => computeSessionMetrics(data), [data]);

    // Venue stats for rider percentile ranking (may be null if backend unavailable)
    const [venueStats, setVenueStats] = useState<VenueStats | null>(null);

    useEffect(() => {
        if (!data.metadata.venue) return;
        let cancelled = false;
        fetchVenueStats(data.metadata.venue, sessionMetrics)
            .then(stats => { if (!cancelled && stats) setVenueStats(stats); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [data, sessionMetrics]);

    const fetchReport = useCallback(async (lang: 'ko' | 'en') => {
        abortRef.current?.abort();
        const ac = new AbortController();
        abortRef.current = ac;

        setReportState({ open: true, status: 'loading', report: '', error: '' });

        try {
            const rd = collectReportData(data, refLapIndex, anaLapIndex, viewData, cornerDistanceRanges, venueStats ?? undefined, sessionMetrics);
            const prompt = buildReportPrompt(rd, lang);
            const report = await generateReport(prompt, ac.signal);
            if (!ac.signal.aborted) {
                reportCacheRef.current.set(getCacheKey(lang), report);
                setReportState({ open: true, status: 'success', report, error: '' });
                setHasSavedReport(true);
                // Auto-save to IndexedDB
                if (data.id) {
                    saveReport(data.id, refLapIndex, anaLapIndex, lang, report).catch(() => {});
                }
            }
        } catch (err: unknown) {
            if (!ac.signal.aborted) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                setReportState({ open: true, status: 'error', report: '', error: message });
            }
        }
    }, [data, refLapIndex, anaLapIndex, getCacheKey, venueStats, sessionMetrics]);

    // Button click: memory cache → DB cache → confirm screen
    const handleGenerateReport = useCallback(async () => {
        try {
            const cached = reportCacheRef.current.get(getCacheKey(reportLang));
            if (cached) {
                setReportState({ open: true, status: 'success', report: cached, error: '' });
                return;
            }
            // Try loading from IndexedDB
            if (data.id) {
                const stored = await loadReport(data.id, refLapIndex, anaLapIndex, reportLang);
                if (stored) {
                    reportCacheRef.current.set(getCacheKey(reportLang), stored.report);
                    setReportState({ open: true, status: 'success', report: stored.report, error: '' });
                    return;
                }
            }
        } catch {
            // IndexedDB may fail — fall through to confirm screen
        }
        setReportState({ open: true, status: 'confirm', report: '', error: '' });
    }, [getCacheKey, reportLang, data.id, refLapIndex, anaLapIndex]);

    // Confirm screen → generate
    const handleConfirmGenerate = useCallback(() => {
        fetchReport(reportLang);
    }, [fetchReport, reportLang]);

    // Regenerate: delete cache, fetch again
    const handleRegenerateReport = useCallback(() => {
        reportCacheRef.current.delete(getCacheKey(reportLang));
        fetchReport(reportLang);
    }, [fetchReport, reportLang, getCacheKey]);

    // Language change while modal is open
    const handleLangChange = useCallback(async (lang: 'ko' | 'en') => {
        setReportLang(lang);
        if (reportState.open && reportState.status !== 'loading') {
            const cached = reportCacheRef.current.get(getCacheKey(lang));
            if (cached) {
                setReportState({ open: true, status: 'success', report: cached, error: '' });
                return;
            }
            // Try DB
            try {
                if (data.id) {
                    const stored = await loadReport(data.id, refLapIndex, anaLapIndex, lang);
                    if (stored) {
                        reportCacheRef.current.set(getCacheKey(lang), stored.report);
                        setReportState({ open: true, status: 'success', report: stored.report, error: '' });
                        return;
                    }
                }
            } catch {
                // IndexedDB may fail — fall through to confirm screen
            }
            setReportState({ open: true, status: 'confirm', report: '', error: '' });
        }
    }, [getCacheKey, reportState.open, reportState.status, data.id, refLapIndex, anaLapIndex]);

    const handleCloseReport = useCallback(() => {
        abortRef.current?.abort();
        setReportState(prev => ({ ...prev, open: false }));
    }, []);

    return (
        <div className="flex flex-col h-full bg-zinc-950">
            {/* Combined Header */}
            <header className="flex items-center justify-between px-4 py-2 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm flex-shrink-0 relative z-10">
                {/* Left: Back + Venue + Mode Switcher */}
                <div className="flex items-center space-x-3 min-w-0">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
                            title={t.analysisDashboard.backToSessions}
                        >
                            <ArrowLeft size={14} />
                        </button>
                    )}
                    <div className="min-w-0">
                        <h1 className="text-sm font-bold truncate">
                            {data.metadata.venue}
                            {matchedTrack && (
                                <span className="ml-1.5 inline-flex items-center px-1.5 py-0 text-[10px] font-medium bg-emerald-900/30 text-emerald-400 rounded-full border border-emerald-800/50 align-middle">
                                    <MapPin className="w-2.5 h-2.5 mr-0.5" />
                                    {matchedTrack.shortName}
                                </span>
                            )}
                        </h1>
                        <p className="text-[10px] text-zinc-500 truncate">{data.metadata.date} • {data.metadata.vehicle}</p>
                    </div>
                    <div className="h-6 w-px bg-zinc-700 flex-shrink-0" />
                    {onSwitchToOverview && (
                        <div className="flex bg-zinc-800/50 rounded-md p-0.5 border border-zinc-700/50 flex-shrink-0">
                            <button
                                onClick={onSwitchToOverview}
                                className="flex items-center space-x-1 px-2 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-all"
                            >
                                <LayoutDashboard size={13} />
                                <span>{t.common.overview}</span>
                            </button>
                            <button className="flex items-center space-x-1 px-2 py-1 rounded text-xs bg-blue-600 text-white shadow-sm transition-all">
                                <LineChart size={13} />
                                <span>{t.common.analysis}</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Center: Lap Selectors + Corner Buttons */}
                <div className="flex items-center space-x-3 mx-3">
                    {/* Compact Lap Selectors */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <div className="flex items-center gap-1">
                            <span className="text-[10px] text-zinc-500 uppercase font-semibold">ANA</span>
                            <select
                                className="bg-zinc-800 text-xs border border-zinc-700 rounded px-1.5 py-0.5 text-red-400 font-medium focus:ring-1 focus:ring-red-500"
                                value={anaLapIndex}
                                onChange={(e) => setAnaLapIndex(Number(e.target.value))}
                            >
                                {sortedLaps.map(lap => (
                                    <option key={lap.index} value={lap.index} className={outlierLapIndices.has(lap.index) ? 'text-zinc-600' : ''}>
                                        {outlierLapIndices.has(lap.index) ? '⚠ ' : ''}L{lap.index} ({formatLapTime(lap.duration)})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <ReferenceSelector
                            currentSessionLaps={sortedLaps}
                            refLapIndex={refLapIndex}
                            onRefLapChange={setRefLapIndex}
                            onExternalRefLap={setExternalRefLap}
                            currentSessionId={data.id}
                            initialExternalLaps={initialRefSession?.laps}
                        />
                    </div>

                    {/* Corner Zoom Buttons */}
                    {refCorners && refCorners.length > 0 && (
                        <>
                            <div className="h-5 w-px bg-zinc-700 flex-shrink-0" />
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={() => { handleResetZoom(); closeCornerAnalysis(); }}
                                    className={`px-1.5 py-0.5 text-[11px] font-mono font-medium rounded border transition-all ${
                                        !selectedCornerId
                                            ? 'bg-zinc-700 border-zinc-500 text-white ring-1 ring-zinc-400/50'
                                            : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-600 text-zinc-400'
                                    }`}
                                >
                                    ALL
                                </button>
                                {refCorners.map(corner => {
                                    const isActive = selectedCornerId === corner.id;
                                    const isLeft = corner.direction === 'L';
                                    const isRight = corner.direction === 'R';
                                    const dirColor = isLeft
                                        ? 'border-blue-500 text-blue-400'
                                        : isRight
                                        ? 'border-red-500 text-red-400'
                                        : 'border-zinc-600 text-zinc-300';
                                    const activeStyle = isActive
                                        ? isLeft
                                            ? 'bg-blue-600/30 border-blue-400 text-blue-300 ring-1 ring-blue-500/50'
                                            : isRight
                                            ? 'bg-red-600/30 border-red-400 text-red-300 ring-1 ring-red-500/50'
                                            : 'bg-zinc-700 border-zinc-500 text-white ring-1 ring-zinc-400/50'
                                        : `bg-zinc-800/80 hover:bg-zinc-700 ${dirColor}`;
                                    return (
                                        <button
                                            key={corner.id}
                                            onClick={() => isActive ? handleResetZoom() : selectCorner(corner.id)}
                                            className={`px-1.5 py-0.5 text-[11px] font-mono font-medium rounded border transition-all ${activeStyle}`}
                                            title={`${corner.name || `C${corner.id}`} ${corner.direction ? `(${corner.direction})` : ''}`}
                                        >
                                            {corner.name || `C${corner.id}`}
                                            {corner.direction && (
                                                <span className="ml-0.5 text-[9px] opacity-70">{corner.direction}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}

                </div>

                {/* Right: AI Report + Playback + Times */}
                <div className="flex items-center space-x-3 flex-shrink-0">
                    {/* AI Report */}
                    <button
                        onClick={handleGenerateReport}
                        className="relative flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors
                            bg-violet-600/20 border-violet-500/50 text-violet-300 hover:bg-violet-600/30 hover:text-violet-200"
                        title="AI 분석 리포트"
                    >
                        <Sparkles size={13} />
                        {t.analysisDashboard.aiReport}
                        {hasSavedReport && (
                            <span className="absolute -top-1 -right-1 w-2 h-2 bg-violet-400 rounded-full" />
                        )}
                    </button>
                    {/* What-If — TODO: 추후 구현 예정 */}
                </div>
            </header>

            <div className="flex-1 flex flex-col min-h-0 p-4 space-y-4">
            <div ref={containerRef} className="flex-1 flex min-h-0">
                {/* Left Panel: Map + GForce */}
                <div
                    ref={leftPanelRef}
                    className="flex flex-col min-h-0"
                    style={{ width: `${leftPanelPct}%` }}
                >
                    {/* Map */}
                    <div
                        className="bg-zinc-900 rounded-xl border border-zinc-800 p-2 relative min-h-[100px]"
                        style={{ height: `${mapPct}%` }}
                    >
                        <AnalysisMap
                            data={fullAnalysisData}
                            zoomedData={viewData}
                            activePoint={hoveredPoint}
                            corners={refCorners}
                            cornerRanges={cornerDistanceRanges}
                            onCornerSelect={selectCorner}
                        />
                    </div>

                    {/* Vertical resize handle */}
                    <ResizeHandle direction="vertical" onDrag={handleVerticalResize} />

                    {/* GForce Chart */}
                    <div className="flex-1 min-h-[150px]">
                        <GForceChart
                            data={smoothedViewData}
                            activePoint={hoveredPoint}
                            cornerRanges={cornerDistanceRanges}
                        />
                    </div>
                </div>

                {/* Horizontal resize handle */}
                <ResizeHandle direction="horizontal" onDrag={handleHorizontalResize} />

                {/* Right Panel */}
                <div className="flex-1 flex flex-col space-y-2 overflow-y-auto pr-2 custom-scrollbar relative min-w-0">

                    {/* Chart Picker Bar */}
                    <div className="flex items-center justify-between sticky top-0 z-20 bg-zinc-950 pb-1">
                        <div className="flex items-center gap-1 flex-wrap">
                            {/* G Smoothing Toggle */}
                            <button
                                onClick={() => setGSmoothing(prev => !prev)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all ${
                                    gSmoothing
                                        ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                                }`}
                                title={gSmoothing ? t.analysisDashboard.gSmoothOn : t.analysisDashboard.gSmoothOff}
                            >
                                <Waves size={11} />
                                {t.analysisDashboard.gSmooth}
                            </button>
                            <button
                                onClick={() => setGyroSmoothing(prev => !prev)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all ${
                                    gyroSmoothing
                                        ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                                }`}
                                title={gyroSmoothing ? t.analysisDashboard.gyroSmoothOn : t.analysisDashboard.gyroSmoothOff}
                            >
                                <Waves size={11} />
                                {t.analysisDashboard.gyroSmooth}
                            </button>
                            <button
                                onClick={() => setShowDrivingMarkers(prev => !prev)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-md border transition-all ${
                                    showDrivingMarkers
                                        ? 'bg-amber-600/30 border-amber-500/50 text-amber-300'
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                                }`}
                                title={showDrivingMarkers ? t.analysisDashboard.drivingMarkersOn : t.analysisDashboard.drivingMarkersOff}
                            >
                                <MapPin size={11} />
                                {t.analysisDashboard.drivingMarkers}
                            </button>
                            <div className="h-4 w-px bg-zinc-700" />
                            {activeCharts.map(chart => (
                                <span
                                    key={chart.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[11px] rounded-md border border-zinc-700"
                                >
                                    {getChartLabel(chart.id, t)}
                                    <button
                                        onClick={() => removeChart(chart.id)}
                                        className="text-zinc-500 hover:text-zinc-200 transition-colors"
                                        title={`Remove ${getChartLabel(chart.id, t)}`}
                                    >
                                        <X size={10} />
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="relative" ref={pickerRef}>
                            <button
                                onClick={() => setShowChartPicker(prev => !prev)}
                                className="flex items-center gap-1 px-2 py-1 text-[11px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md border border-zinc-700 transition-colors"
                            >
                                <Plus size={12} />
                                {t.analysisDashboard.addChart}
                                <ChevronDown size={10} />
                            </button>
                            {showChartPicker && (
                                <div className="absolute right-0 top-full mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-30 py-1">
                                    {CHART_REGISTRY.map(chart => {
                                        const isActive = visibleCharts.includes(chart.id);
                                        return (
                                            <button
                                                key={chart.id}
                                                onClick={() => toggleChart(chart.id)}
                                                className={`w-full text-left px-3 py-1.5 text-xs transition-colors flex items-center justify-between ${
                                                    isActive
                                                        ? 'text-blue-400 bg-zinc-700/50'
                                                        : 'text-zinc-300 hover:bg-zinc-700'
                                                }`}
                                            >
                                                {getChartLabel(chart.id, t)}
                                                {isActive && (
                                                    <span className="text-blue-400 text-[10px]">ON</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Lap Activity Breakdown — full width, above charts+corner row */}
                    {showLapMetrics && (
                        <div className="relative">
                            <button
                                onClick={() => setShowLapMetrics(false)}
                                className="absolute top-2 right-2 z-10 text-zinc-500 hover:text-zinc-200 transition-colors"
                                title={t.analysisDashboard.hideLapActivity}
                            >
                                <X size={14} />
                            </button>
                            <LapMetricsSummary refMetrics={refMetrics} anaMetrics={anaMetrics} />
                            <RiderStatsCard metrics={sessionMetrics} venue={data.metadata.venue} stats={venueStats} />
                        </div>
                    )}

                    {/* Controls Bar: Analysis Time, DIFF, Dist/Time, Playback */}
                    <div className="flex items-center gap-3 bg-zinc-900/80 rounded-lg border border-zinc-800 px-3 py-1.5">
                        <div className="text-right">
                            <div className="text-[10px] text-zinc-500">{t.common.analysis}</div>
                            <div className="text-sm font-bold text-white font-mono leading-tight">
                                {formatLapTime(anaLapDuration)}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] text-zinc-500">{t.common.diff}</div>
                            <div className={`text-sm font-bold font-mono leading-tight ${totalDiff < 0 ? 'text-green-500' : 'text-red-500'}`}>
                                {totalDiff > 0 ? '+' : ''}{totalDiff.toFixed(3)}
                            </div>
                        </div>

                        <div className="h-5 w-px bg-zinc-700" />

                        {/* X-Axis Mode Toggle */}
                        <div className="flex items-center gap-0.5">
                            <button
                                onClick={() => setXAxisMode('distance')}
                                className={`px-1.5 py-0.5 text-[11px] font-mono font-medium rounded border transition-all ${
                                    xAxisMode === 'distance'
                                        ? 'bg-zinc-700 border-zinc-500 text-white'
                                        : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-600 text-zinc-400'
                                }`}
                            >
                                {t.common.dist}
                            </button>
                            <button
                                onClick={() => setXAxisMode('time')}
                                className={`px-1.5 py-0.5 text-[11px] font-mono font-medium rounded border transition-all ${
                                    xAxisMode === 'time'
                                        ? 'bg-zinc-700 border-zinc-500 text-white'
                                        : 'bg-zinc-800/80 hover:bg-zinc-700 border-zinc-600 text-zinc-400'
                                }`}
                            >
                                {t.common.time}
                            </button>
                        </div>

                        <div className="h-5 w-px bg-zinc-700" />

                        {/* Playback Controls */}
                        <div className="flex items-center space-x-1">
                            <button
                                onClick={togglePlayback}
                                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors border ${
                                    isPlaying
                                        ? 'bg-blue-600 border-blue-500 text-white'
                                        : 'bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300'
                                }`}
                                title={isPlaying ? 'Pause' : 'Play'}
                            >
                                {isPlaying ? <Pause size={12} /> : <Play size={12} />}
                            </button>
                            {(isPlaying || playbackProgress > 0) && (
                                <button
                                    onClick={stopPlayback}
                                    className="flex items-center justify-center w-7 h-7 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-md transition-colors border border-zinc-700"
                                    title="Stop"
                                >
                                    <Square size={10} />
                                </button>
                            )}
                            {isPlaying && (
                                <div className="w-16 h-1 bg-zinc-700 rounded-full ml-1.5 overflow-hidden">
                                    <div
                                        className="h-full bg-blue-500 rounded-full transition-[width] duration-100"
                                        style={{ width: `${playbackProgress * 100}%` }}
                                    />
                                </div>
                            )}
                        </div>

                        {brushRange && (
                            <button
                                onClick={handleResetZoom}
                                className="flex items-center px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-md transition-colors border border-zinc-700"
                            >
                                <RotateCcw size={12} className="mr-1" />
                                {t.common.reset}
                            </button>
                        )}
                    </div>

                    {/* Charts + Corner Panel side by side */}
                    <div className="flex flex-1 min-h-0 min-w-0">
                        {/* Charts Column */}
                        <div className="flex-1 flex flex-col space-y-2 min-w-0">
                            {activeCharts.map(chart => (
                                <AnalysisChartWrapper
                                    key={chart.id}
                                    chartId={chart.id}
                                    ChartComponent={chart.component}
                                    flexConfig={flexConfigMap[chart.id]}
                                    data={G_CHART_IDS.has(chart.id) ? smoothedViewData : GYRO_CHART_IDS.has(chart.id) ? smoothedGyroData : viewData}
                                    height={chart.height}
                                    dragState={dragState}
                                    onMouseMove={handleChartMouseMove}
                                    onMouseDown={handleChartMouseDown}
                                    onMouseUp={handleChartMouseUp}
                                    zoomDomain={zoomDomain}
                                    cursorDistance={cursorDistance}
                                    cornerRanges={cornerDistanceRanges}
                                    drivingEventMarkers={chart.id === 'driving_events' || showDrivingMarkers ? drivingEventMarkers : undefined}
                                    onDoubleClick={() => setExpandedChartId(chart.id)}
                                />
                            ))}
                            <div className="h-6"></div>
                        </div>

                        {/* Corner Analysis Side Panel */}
                        {selectedCornerId && sortedLaps && (
                            <div className="w-72 flex-shrink-0 pl-2">
                                <CornerAnalysisPanel
                                    cornerId={selectedCornerId}
                                    refCorner={sortedLaps.find(l => l.index === refLapIndex)?.corners?.find(c => c.id === selectedCornerId)}
                                    anaCorner={sortedLaps.find(l => l.index === anaLapIndex)?.corners?.find(c => c.id === selectedCornerId)}
                                    onClose={closeCornerAnalysis}
                                    xAxisMode={xAxisMode}
                                />
                            </div>
                        )}

                        {/* What-If Side Panel — TODO: 추후 구현 예정 */}
                    </div>
                </div>
            </div>
            </div>

            {/* Expanded Chart Modal */}
            {expandedChartId && (() => {
                const chart = CHART_REGISTRY.find(c => c.id === expandedChartId);
                if (!chart) return null;
                const chartData = G_CHART_IDS.has(chart.id) ? smoothedViewData : GYRO_CHART_IDS.has(chart.id) ? smoothedGyroData : viewData;
                const expandedHeight = Math.round(window.innerHeight * 0.85 - 72);
                return (
                    <ExpandedChartModal
                        chart={chart}
                        chartData={chartData}
                        expandedHeight={expandedHeight}
                        flexConfig={flexConfigMap[chart.id]}
                        dragState={dragState}
                        onMouseMove={handleChartMouseMove}
                        onMouseDown={handleChartMouseDown}
                        onMouseUp={handleChartMouseUp}
                        zoomDomain={zoomDomain}
                        cursorDistance={cursorDistance}
                        cornerRanges={cornerDistanceRanges}
                        drivingEventMarkers={chart.id === 'driving_events' || showDrivingMarkers ? drivingEventMarkers : undefined}
                        onClose={() => setExpandedChartId(null)}
                        t={t}
                    />
                );
            })()}

            {/* AI Report Modal */}
            {reportState.open && (
                <ReportModal
                    status={reportState.status}
                    report={reportState.report}
                    error={reportState.error}
                    onClose={handleCloseReport}
                    onGenerate={handleConfirmGenerate}
                    onRegenerate={handleRegenerateReport}
                    reportLang={reportLang}
                    onLangChange={handleLangChange}
                    savedReports={allSavedReports}
                    chartData={{
                        data,
                        viewData,
                        refLapIndex,
                        anaLapIndex,
                    }}
                />
            )}
        </div>
    );
};

export default AnalysisDashboard;
