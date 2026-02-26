import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { SessionData, Lap } from '../../types';
import type { DrivingEventMarker } from './AnalysisChartWrapper';
import { alignLaps } from '../../utils/analysis';
import { downsample } from '../../utils/downsample';
import { getOutlierLapIndices } from '../../utils/lapFilter';

export const useAnalysisState = (data: SessionData, externalRefLap?: Lap | null) => {
    // 1. Lap Selection Logic
    const sortedLaps = useMemo(() => [...data.laps].sort((a, b) => a.duration - b.duration), [data.laps]);

    // Detect outlier laps: >10% deviation from average duration
    const outlierLapIndices = useMemo(() => getOutlierLapIndices(data.laps), [data.laps]);

    // Non-outlier laps sorted by duration (for default selection)
    const validLaps = useMemo(() => sortedLaps.filter(l => !outlierLapIndices.has(l.index)), [sortedLaps, outlierLapIndices]);
    const bestLap = validLaps[0] ?? sortedLaps[0];
    const secondBestLap = validLaps[1] ?? validLaps[0] ?? sortedLaps[0];

    const [refLapIndex, setRefLapIndex] = useState<number>(secondBestLap?.index || 1);
    const [anaLapIndex, setAnaLapIndex] = useState<number>(bestLap?.index || 1);

    // 2. Data Preparation (Alignment)
    const fullAnalysisData = useMemo(() => {
        const refLap = externalRefLap ?? data.laps.find(l => l.index === refLapIndex);
        const anaLap = data.laps.find(l => l.index === anaLapIndex);

        if (!refLap || !anaLap) return [];

        return alignLaps(refLap, anaLap);
    }, [data.laps, refLapIndex, anaLapIndex, externalRefLap]);

    // Compute corner distance ranges from reference lap corners
    const cornerDistanceRanges = useMemo(() => {
        const refLap = externalRefLap ?? data.laps.find(l => l.index === refLapIndex);
        const corners = refLap?.corners;
        if (!corners || !fullAnalysisData.length) return [];

        // Sort by start_time to identify the first corner
        const sortedCorners = [...corners].sort((a, b) => a.start_time - b.start_time);
        const firstCornerId = sortedCorners.length > 0 ? sortedCorners[0].id : -1;

        const ranges = corners.map(corner => {
            // Both corner.start_time and refTime are absolute session times
            const startPointIdx = fullAnalysisData.findIndex(p => p.refTime >= corner.start_time);
            const startPoint = startPointIdx >= 0 ? fullAnalysisData[startPointIdx] : undefined;
            let endPoint: typeof fullAnalysisData[0] | undefined;
            for (let i = fullAnalysisData.length - 1; i >= 0; i--) {
                if (fullAnalysisData[i].refTime <= corner.end_time) {
                    endPoint = fullAnalysisData[i];
                    break;
                }
            }

            let startDist = startPoint?.distance ?? 0;

            // For the first corner, extend backwards to include the top speed zone
            if (corner.id === firstCornerId && startPointIdx > 0) {
                // Find the max speed point before the corner (top of the straight)
                let maxSpeed = 0;
                let maxSpeedIdx = 0;
                for (let i = 0; i < startPointIdx; i++) {
                    if (fullAnalysisData[i].refSpeed > maxSpeed) {
                        maxSpeed = fullAnalysisData[i].refSpeed;
                        maxSpeedIdx = i;
                    }
                }
                // From the max speed point, search backwards for the start of the plateau
                const threshold = maxSpeed - 3; // 3 kph margin
                let extendedIdx = maxSpeedIdx;
                for (let i = maxSpeedIdx - 1; i >= 0; i--) {
                    if (fullAnalysisData[i].refSpeed >= threshold) {
                        extendedIdx = i;
                    } else {
                        break;
                    }
                }
                startDist = fullAnalysisData[extendedIdx].distance;
            }

            return {
                id: corner.id,
                startDist,
                endDist: endPoint?.distance ?? 0,
                name: corner.name,
                direction: corner.direction,
            };
        }).filter(r => r.endDist > r.startDist);

        // Extend each corner's endDist to the next corner's startDist
        // (how you ride a corner affects the straight until next corner)
        ranges.sort((a, b) => a.startDist - b.startDist);
        for (let i = 0; i < ranges.length - 1; i++) {
            ranges[i].endDist = ranges[i + 1].startDist;
        }
        // Last corner extends to end of data
        if (ranges.length > 0 && fullAnalysisData.length > 0) {
            ranges[ranges.length - 1].endDist = fullAnalysisData[fullAnalysisData.length - 1].distance;
        }

        return ranges;
    }, [data.laps, refLapIndex, fullAnalysisData, externalRefLap]);

    // Compute driving event markers from corner driving features
    const drivingEventMarkers = useMemo((): DrivingEventMarker[] => {
        if (!cornerDistanceRanges.length) return [];

        const refLap = externalRefLap ?? data.laps.find(l => l.index === refLapIndex);
        const anaLap = data.laps.find(l => l.index === anaLapIndex);
        const markers: DrivingEventMarker[] = [];

        const extractMarkers = (
            corners: Lap['corners'],
            source: 'ref' | 'ana'
        ) => {
            if (!corners) return;
            for (const corner of corners) {
                const range = cornerDistanceRanges.find(r => r.id === corner.id);
                if (!range || !corner.driving) continue;
                const baseDist = range.startDist;

                const { braking_profile, lean_profile, throttle_profile, g_dip } = corner.driving;

                // Braking events
                if (braking_profile) {
                    const brkEvents = [
                        { type: 'SOB', offset: braking_profile.sob_offset_m },
                        { type: 'COB', offset: braking_profile.cob_offset_m },
                        { type: 'EOB', offset: braking_profile.eob_offset_m },
                    ];
                    for (const ev of brkEvents) {
                        if (ev.offset != null) {
                            markers.push({
                                distance: baseDist + ev.offset / 1000,
                                type: ev.type,
                                category: 'braking',
                                source,
                                cornerId: corner.id,
                            });
                        }
                    }
                }

                // Lean events
                if (lean_profile) {
                    const leanEvents = [
                        { type: 'SOL', offset: lean_profile.sol_offset_m },
                        { type: 'COL', offset: lean_profile.col_offset_m },
                        { type: 'EOL', offset: lean_profile.eol_offset_m },
                    ];
                    for (const ev of leanEvents) {
                        if (ev.offset != null) {
                            markers.push({
                                distance: baseDist + ev.offset / 1000,
                                type: ev.type,
                                category: 'lean',
                                source,
                                cornerId: corner.id,
                            });
                        }
                    }
                    // Min velocity
                    if (lean_profile.min_vel_offset_m != null) {
                        markers.push({
                            distance: baseDist + lean_profile.min_vel_offset_m / 1000,
                            type: 'MIN_VEL',
                            category: 'velocity',
                            source,
                            cornerId: corner.id,
                        });
                    }
                }

                // Throttle events
                if (throttle_profile) {
                    const tpsEvents = [
                        { type: 'SOT', offset: throttle_profile.sot_offset_m },
                        { type: 'COT', offset: throttle_profile.cot_offset_m },
                        { type: 'EOT', offset: throttle_profile.eot_offset_m },
                    ];
                    for (const ev of tpsEvents) {
                        if (ev.offset != null) {
                            markers.push({
                                distance: baseDist + ev.offset / 1000,
                                type: ev.type,
                                category: 'throttle',
                                source,
                                cornerId: corner.id,
                            });
                        }
                    }
                }

                // G-dip
                if (g_dip?.g_dip_offset_m != null) {
                    markers.push({
                        distance: baseDist + g_dip.g_dip_offset_m / 1000,
                        type: 'G_DIP',
                        category: 'gdip',
                        source,
                        cornerId: corner.id,
                    });
                }
            }
        };

        extractMarkers(refLap?.corners, 'ref');
        extractMarkers(anaLap?.corners, 'ana');

        return markers;
    }, [cornerDistanceRanges, data.laps, refLapIndex, anaLapIndex, externalRefLap]);

    const anaLapDuration = data.laps.find(l => l.index === anaLapIndex)?.duration || 0;
    const refLapDuration = (externalRefLap ?? data.laps.find(l => l.index === refLapIndex))?.duration || 0;
    const totalDiff = anaLapDuration - refLapDuration;

    // 3. Zoom & View Data Logic
    const [brushRange, setBrushRange] = useState<{ startDist: number; endDist: number } | null>(null);

    const viewData = useMemo(() => {
        if (!fullAnalysisData.length) return [];

        let targetData = fullAnalysisData;
        if (brushRange) {
            targetData = fullAnalysisData.filter(p =>
                p.distance >= brushRange.startDist && p.distance <= brushRange.endDist
            );
        }

        const targetCount = brushRange ? 1000 : 500;
        return downsample(targetData, targetCount);
    }, [fullAnalysisData, brushRange]);

    const handleResetZoom = useCallback(() => {
        setBrushRange(null);
    }, []);

    // 4. Interaction State (Hover & Drag)
    const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

    const dragStateRef = useRef<{ isDragging: boolean; startDist: number | null; currDist: number | null; activeChartId: string | null }>({
        isDragging: false,
        startDist: null,
        currDist: null,
        activeChartId: null
    });

    const [dragState, setDragState] = useState<{ isDragging: boolean; startDist: number | null; currDist: number | null; activeChartId: string | null }>({
        isDragging: false,
        startDist: null,
        currDist: null,
        activeChartId: null
    });

    const [selectedCornerId, setSelectedCornerId] = useState<number | null>(null);

    // X-axis mode: distance or time
    const [xAxisMode, setXAxisMode] = useState<'distance' | 'time'>('distance');

    // 5. Playback State
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackIndex, setPlaybackIndex] = useState(0);
    const animationRef = useRef<number | null>(null);

    // Reset playback when data changes
    useEffect(() => {
        setIsPlaying(false);
        setPlaybackIndex(0);
    }, [refLapIndex, anaLapIndex, brushRange]);

    // Playback animation loop
    useEffect(() => {
        if (!isPlaying || !viewData.length) {
            if (animationRef.current !== null) {
                clearInterval(animationRef.current);
                animationRef.current = null;
            }
            return;
        }

        animationRef.current = window.setInterval(() => {
            setPlaybackIndex(prev => {
                const next = prev + 1;
                if (next >= viewData.length) {
                    setIsPlaying(false);
                    return prev;
                }
                return next;
            });
        }, 40);

        return () => {
            if (animationRef.current !== null) {
                clearInterval(animationRef.current);
                animationRef.current = null;
            }
        };
    }, [isPlaying, viewData.length]);

    const togglePlayback = useCallback(() => {
        setIsPlaying(prev => {
            if (!prev && playbackIndex >= viewData.length - 1) {
                setPlaybackIndex(0);
            }
            return !prev;
        });
    }, [playbackIndex, viewData.length]);

    const stopPlayback = useCallback(() => {
        setIsPlaying(false);
        setPlaybackIndex(0);
        setHoveredIndex(null);
    }, []);

    const handleChartMouseDown = useCallback((e: any, chartId: string) => {
        if (e && (e.activePayload || e.activeTooltipIndex !== undefined)) {
            let dist = null;

            if (e.activePayload && e.activePayload[0] && e.activePayload[0].payload) {
                dist = e.activePayload[0].payload.distance;
            }
            else if (e.activeTooltipIndex !== undefined && viewData[e.activeTooltipIndex]) {
                dist = viewData[e.activeTooltipIndex].distance;
            }

            if (dist !== null) {
                const newState = {
                    isDragging: true,
                    startDist: dist,
                    currDist: dist,
                    activeChartId: chartId
                };
                dragStateRef.current = newState;
                setDragState(newState);
            }
        }
    }, [viewData]);

    const handleChartMouseMove = useCallback((e: any) => {
        if (e && e.activeTooltipIndex !== undefined) {
            setHoveredIndex(e.activeTooltipIndex);
        } else {
            setHoveredIndex(null);
        }

        if (dragStateRef.current.isDragging) {
            let dist = null;

            if (e && e.activePayload && e.activePayload[0] && e.activePayload[0].payload) {
                dist = e.activePayload[0].payload.distance;
            }
            else if (e && e.activeTooltipIndex !== undefined && viewData[e.activeTooltipIndex]) {
                dist = viewData[e.activeTooltipIndex].distance;
            }

            if (dist !== null) {
                const newState = {
                    ...dragStateRef.current,
                    currDist: dist
                };
                dragStateRef.current = newState;

                setDragState(prev => ({
                    ...prev,
                    isDragging: true,
                    startDist: newState.startDist,
                    currDist: newState.currDist,
                    activeChartId: newState.activeChartId
                }));
            }
        }
    }, [viewData]);

    const handleChartMouseUp = useCallback(() => {
        const state = dragStateRef.current;

        if (state.isDragging && state.startDist !== null && state.currDist !== null) {
            const start = Math.min(state.startDist, state.currDist);
            const end = Math.max(state.startDist, state.currDist);

            if (end - start > 0.005) {
                setBrushRange({ startDist: start, endDist: end });
            }
        }

        const resetState = { isDragging: false, startDist: null, currDist: null, activeChartId: null };
        dragStateRef.current = resetState;

        setDragState({
            isDragging: false,
            startDist: null,
            currDist: null,
            activeChartId: null
        });
    }, []);

    const hoveredPoint = useMemo(() => {
        if (isPlaying && viewData[playbackIndex]) {
            return viewData[playbackIndex];
        }
        if (hoveredIndex !== null && viewData[hoveredIndex]) {
            return viewData[hoveredIndex];
        }
        return null;
    }, [isPlaying, playbackIndex, hoveredIndex, viewData]);

    const selectCorner = useCallback((cornerId: number) => {
        setSelectedCornerId(cornerId);

        // Use pre-computed corner distance ranges (includes C1 widening)
        const range = cornerDistanceRanges.find(r => r.id === cornerId);
        if (range && range.endDist > range.startDist) {
            setBrushRange({
                startDist: range.startDist,
                endDist: range.endDist
            });
        }
    }, [cornerDistanceRanges]);

    return {
        // Data & Laps
        sortedLaps,
        outlierLapIndices,
        refLapIndex,
        anaLapIndex,
        setRefLapIndex,
        setAnaLapIndex,
        anaLapDuration,
        totalDiff,
        fullAnalysisData, // Needed for Map track
        viewData,         // Needed for Charts & Map zoom
        cornerDistanceRanges,
        drivingEventMarkers,

        // Interaction
        brushRange,
        handleResetZoom,
        hoveredPoint,
        dragState,
        handleChartMouseDown,
        handleChartMouseMove,
        handleChartMouseUp,
        selectedCornerId,
        selectCorner,
        closeCornerAnalysis: () => setSelectedCornerId(null),
        xAxisMode,
        setXAxisMode,

        // Playback
        isPlaying,
        playbackProgress: viewData.length > 0 ? playbackIndex / (viewData.length - 1) : 0,
        togglePlayback,
        stopPlayback
    };
};
