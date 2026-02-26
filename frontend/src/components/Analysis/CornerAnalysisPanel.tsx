import React, { useState } from 'react';
import type { Corner, BrakingProfile, LeanProfile, ThrottleProfile, DrivingFeatures } from '../../types';
import { haversineDistance } from '../../utils/trackMatcher';
import { useTranslation } from '../../i18n/context';

interface CornerAnalysisPanelProps {
    cornerId: number;
    refCorner?: Corner;
    anaCorner?: Corner;
    onClose: () => void;
    xAxisMode: 'distance' | 'time';
}

const MetricRow = ({ label, refVal, anaVal, unit, showDiff = true, lowerIsGreen = false }: {
    label: string;
    refVal?: number | null;
    anaVal?: number | null;
    unit: string;
    showDiff?: boolean;
    lowerIsGreen?: boolean;
}) => {
    if (refVal == null || anaVal == null) return null;

    const diff = anaVal - refVal;
    let isGood = diff > 0;
    if (lowerIsGreen || label.includes("Duration") || label.includes("Time")) {
        isGood = diff < 0;
    }

    const diffColor = Math.abs(diff) < 0.001 ? "text-zinc-500" : isGood ? "text-green-500" : "text-red-500";
    const diffSign = diff > 0 ? "+" : "";

    return (
        <div className="flex justify-between items-center py-2 border-b border-zinc-800 last:border-0">
            <span className="text-zinc-400 text-sm">{label}</span>
            <div className="flex items-center space-x-4">
                <div className="text-right">
                    <div className="text-xs text-zinc-500">Ref</div>
                    <div className="font-mono text-zinc-300">{refVal.toFixed(1)}{unit}</div>
                </div>
                <div className="text-right">
                    <div className="text-xs text-zinc-500">Cur</div>
                    <div className="font-mono text-white font-bold">{anaVal.toFixed(1)}{unit}</div>
                </div>
                {showDiff && (
                    <div className={`w-16 text-right font-mono text-sm font-bold ${diffColor}`}>
                        {diffSign}{diff.toFixed(2)}{unit}
                    </div>
                )}
            </div>
        </div>
    );
};

const SingleMetricRow = ({ label, value, unit }: { label: string; value: number | null | undefined; unit: string }) => {
    if (value == null) return null;
    return (
        <div className="flex justify-between items-center py-1.5">
            <span className="text-zinc-400 text-sm">{label}</span>
            <span className="font-mono text-zinc-200">{value.toFixed(2)}{unit}</span>
        </div>
    );
};

const HelpButton = ({ helpText }: { helpText: React.ReactNode }) => {
    const [showHelp, setShowHelp] = useState(false);
    return (
        <>
            <button
                onClick={(e) => { e.stopPropagation(); setShowHelp(!showHelp); }}
                className={`ml-2 w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded-full border transition-colors ${
                    showHelp
                        ? 'bg-zinc-600 border-zinc-500 text-white'
                        : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:text-zinc-200 hover:border-zinc-500'
                }`}
                title="Help"
            >
                ?
            </button>
            {showHelp && (
                <div className="mt-2 bg-zinc-900/80 border border-zinc-700 rounded p-2 text-xs text-zinc-400 leading-relaxed">
                    {helpText}
                </div>
            )}
        </>
    );
};

const CollapsibleSection = ({ title, defaultOpen = false, children, helpContent }: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
    helpContent?: React.ReactNode;
}) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="bg-zinc-950 rounded-lg border border-zinc-800">
            <div className="flex items-center">
                <button
                    onClick={() => setOpen(!open)}
                    className="flex-1 flex justify-between items-center px-3 py-2 text-sm font-semibold text-zinc-300 hover:text-white"
                >
                    <span>{title}</span>
                    <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
                </button>
                {helpContent && (
                    <div className="pr-3">
                        <HelpButton helpText={helpContent} />
                    </div>
                )}
            </div>
            {open && <div className="px-3 pb-3 space-y-1">{children}</div>}
        </div>
    );
};

// Help content moved inside component to access translations

const BrakingProfileSection = ({ refDriving, anaDriving, xAxisMode, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    xAxisMode: 'distance' | 'time';
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refBp = refDriving?.braking_profile;
    const anaBp = anaDriving?.braking_profile;

    if (!refBp && !anaBp) return null;

    const hasBoth = refBp && anaBp;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    {xAxisMode === 'time' ? (
                        <>
                            <MetricRow label="SOB Time" refVal={refBp.sob_offset_s} anaVal={anaBp.sob_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="COB Time" refVal={refBp.cob_offset_s} anaVal={anaBp.cob_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="EOB Time" refVal={refBp.eob_offset_s} anaVal={anaBp.eob_offset_s} unit="s" lowerIsGreen />
                        </>
                    ) : (
                        <>
                            <MetricRow label="SOB Dist" refVal={refBp.sob_offset_m} anaVal={anaBp.sob_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="COB Dist" refVal={refBp.cob_offset_m} anaVal={anaBp.cob_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="EOB Dist" refVal={refBp.eob_offset_m} anaVal={anaBp.eob_offset_m} unit="m" lowerIsGreen />
                        </>
                    )}
                    <MetricRow label="Total BRK" refVal={refBp.total_brk_g_s} anaVal={anaBp.total_brk_g_s} unit=" G·s" />
                    <MetricRow label="Min Decel" refVal={refBp.min_accel_x_g} anaVal={anaBp.min_accel_x_g} unit=" G" />
                </>
            ) : (
                <SingleValueBraking bp={(anaBp || refBp)!} xAxisMode={xAxisMode} />
            )}
        </CollapsibleSection>
    );
};

const SingleValueBraking = ({ bp, xAxisMode }: { bp: BrakingProfile; xAxisMode: 'distance' | 'time' }) => (
    <>
        {xAxisMode === 'time' ? (
            <>
                <SingleMetricRow label="SOB" value={bp.sob_offset_s} unit="s" />
                <SingleMetricRow label="COB" value={bp.cob_offset_s} unit="s" />
                <SingleMetricRow label="EOB" value={bp.eob_offset_s} unit="s" />
            </>
        ) : (
            <>
                <SingleMetricRow label="SOB" value={bp.sob_offset_m} unit="m" />
                <SingleMetricRow label="COB" value={bp.cob_offset_m} unit="m" />
                <SingleMetricRow label="EOB" value={bp.eob_offset_m} unit="m" />
            </>
        )}
        <SingleMetricRow label="Total BRK" value={bp.total_brk_g_s} unit=" G·s" />
        <SingleMetricRow label="Min Decel" value={bp.min_accel_x_g} unit=" G" />
    </>
);

const LeanProfileSection = ({ refDriving, anaDriving, xAxisMode, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    xAxisMode: 'distance' | 'time';
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refLp = refDriving?.lean_profile;
    const anaLp = anaDriving?.lean_profile;

    if (!refLp && !anaLp) return null;

    const hasBoth = refLp && anaLp;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    {xAxisMode === 'time' ? (
                        <>
                            <MetricRow label="SOL Time" refVal={refLp.sol_offset_s} anaVal={anaLp.sol_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="COL Time" refVal={refLp.col_offset_s} anaVal={anaLp.col_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="EOL Time" refVal={refLp.eol_offset_s} anaVal={anaLp.eol_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="Min Vel Time" refVal={refLp.min_vel_offset_s} anaVal={anaLp.min_vel_offset_s} unit="s" lowerIsGreen />
                        </>
                    ) : (
                        <>
                            <MetricRow label="SOL Dist" refVal={refLp.sol_offset_m} anaVal={anaLp.sol_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="COL Dist" refVal={refLp.col_offset_m} anaVal={anaLp.col_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="EOL Dist" refVal={refLp.eol_offset_m} anaVal={anaLp.eol_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="Min Vel Pos" refVal={refLp.min_vel_offset_m} anaVal={anaLp.min_vel_offset_m} unit="m" lowerIsGreen />
                        </>
                    )}
                    <MetricRow label="Max Lean" refVal={refLp.max_lean_deg} anaVal={anaLp.max_lean_deg} unit="°" />
                    <MetricRow label="Min Vel" refVal={refLp.min_vel_kph} anaVal={anaLp.min_vel_kph} unit=" km/h" />
                </>
            ) : (
                <SingleValueLean lp={(anaLp || refLp)!} xAxisMode={xAxisMode} />
            )}
        </CollapsibleSection>
    );
};

const SingleValueLean = ({ lp, xAxisMode }: { lp: LeanProfile; xAxisMode: 'distance' | 'time' }) => (
    <>
        {xAxisMode === 'time' ? (
            <>
                <SingleMetricRow label="SOL" value={lp.sol_offset_s} unit="s" />
                <SingleMetricRow label="COL" value={lp.col_offset_s} unit="s" />
                <SingleMetricRow label="EOL" value={lp.eol_offset_s} unit="s" />
                <SingleMetricRow label="Min Vel Time" value={lp.min_vel_offset_s} unit="s" />
            </>
        ) : (
            <>
                <SingleMetricRow label="SOL" value={lp.sol_offset_m} unit="m" />
                <SingleMetricRow label="COL" value={lp.col_offset_m} unit="m" />
                <SingleMetricRow label="EOL" value={lp.eol_offset_m} unit="m" />
                <SingleMetricRow label="Min Vel Pos" value={lp.min_vel_offset_m} unit="m" />
            </>
        )}
        <SingleMetricRow label="Max Lean" value={lp.max_lean_deg} unit="°" />
        <SingleMetricRow label="Min Vel" value={lp.min_vel_kph} unit=" km/h" />
    </>
);

const RateIntegralsSection = ({ refDriving, anaDriving, sectionTitle }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    sectionTitle: string;
}) => {
    const refRi = refDriving?.rate_integrals;
    const anaRi = anaDriving?.rate_integrals;

    if (!refRi && !anaRi) return null;

    const ri = anaRi || refRi;
    if (!ri) return null;
    // Only show if at least one value is non-null
    if (ri.pitch_rate_integral == null && ri.roll_rate_integral == null && ri.yaw_rate_integral == null) return null;

    const hasBoth = refRi && anaRi;

    return (
        <CollapsibleSection title={sectionTitle}>
            {hasBoth ? (
                <>
                    <MetricRow label="Pitch" refVal={refRi.pitch_rate_integral} anaVal={anaRi.pitch_rate_integral} unit="°" />
                    <MetricRow label="Roll" refVal={refRi.roll_rate_integral} anaVal={anaRi.roll_rate_integral} unit="°" />
                    <MetricRow label="Yaw" refVal={refRi.yaw_rate_integral} anaVal={anaRi.yaw_rate_integral} unit="°" />
                </>
            ) : (
                <>
                    <SingleMetricRow label="Pitch" value={ri.pitch_rate_integral} unit="°" />
                    <SingleMetricRow label="Roll" value={ri.roll_rate_integral} unit="°" />
                    <SingleMetricRow label="Yaw" value={ri.yaw_rate_integral} unit="°" />
                </>
            )}
        </CollapsibleSection>
    );
};

const ThrottleProfileSection = ({ refDriving, anaDriving, xAxisMode, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    xAxisMode: 'distance' | 'time';
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refTp = refDriving?.throttle_profile;
    const anaTp = anaDriving?.throttle_profile;

    if (!refTp && !anaTp) return null;

    const hasBoth = refTp && anaTp;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    {xAxisMode === 'time' ? (
                        <>
                            <MetricRow label="SOT Time" refVal={refTp.sot_offset_s} anaVal={anaTp.sot_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="COT Time" refVal={refTp.cot_offset_s} anaVal={anaTp.cot_offset_s} unit="s" lowerIsGreen />
                            <MetricRow label="EOT Time" refVal={refTp.eot_offset_s} anaVal={anaTp.eot_offset_s} unit="s" lowerIsGreen />
                        </>
                    ) : (
                        <>
                            <MetricRow label="SOT Dist" refVal={refTp.sot_offset_m} anaVal={anaTp.sot_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="COT Dist" refVal={refTp.cot_offset_m} anaVal={anaTp.cot_offset_m} unit="m" lowerIsGreen />
                            <MetricRow label="EOT Dist" refVal={refTp.eot_offset_m} anaVal={anaTp.eot_offset_m} unit="m" lowerIsGreen />
                        </>
                    )}
                    <MetricRow label="Total TPS" refVal={refTp.total_tps_g_s} anaVal={anaTp.total_tps_g_s} unit=" G·s" />
                    <MetricRow label="Max Accel" refVal={refTp.max_accel_x_g} anaVal={anaTp.max_accel_x_g} unit=" G" />
                </>
            ) : (
                <SingleValueThrottle tp={(anaTp || refTp)!} xAxisMode={xAxisMode} />
            )}
        </CollapsibleSection>
    );
};

const SingleValueThrottle = ({ tp, xAxisMode }: { tp: ThrottleProfile; xAxisMode: 'distance' | 'time' }) => (
    <>
        {xAxisMode === 'time' ? (
            <>
                <SingleMetricRow label="SOT" value={tp.sot_offset_s} unit="s" />
                <SingleMetricRow label="COT" value={tp.cot_offset_s} unit="s" />
                <SingleMetricRow label="EOT" value={tp.eot_offset_s} unit="s" />
            </>
        ) : (
            <>
                <SingleMetricRow label="SOT" value={tp.sot_offset_m} unit="m" />
                <SingleMetricRow label="COT" value={tp.cot_offset_m} unit="m" />
                <SingleMetricRow label="EOT" value={tp.eot_offset_m} unit="m" />
            </>
        )}
        <SingleMetricRow label="Total TPS" value={tp.total_tps_g_s} unit=" G·s" />
        <SingleMetricRow label="Max Accel" value={tp.max_accel_x_g} unit=" G" />
    </>
);

const GDipSection = ({ refDriving, anaDriving, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refGd = refDriving?.g_dip;
    const anaGd = anaDriving?.g_dip;

    if (!refGd && !anaGd) return null;

    const hasBoth = refGd && anaGd;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    <MetricRow label="G-Dip Value" refVal={refGd.g_dip_value} anaVal={anaGd.g_dip_value} unit=" G" />
                    <MetricRow label="G-Dip Ratio" refVal={refGd.g_dip_ratio} anaVal={anaGd.g_dip_ratio} unit="" />
                    <MetricRow label="Entry Mean G" refVal={refGd.entry_mean_g_sum} anaVal={anaGd.entry_mean_g_sum} unit=" G" />
                </>
            ) : (
                <>
                    <SingleMetricRow label="G-Dip Value" value={(anaGd || refGd)!.g_dip_value} unit=" G" />
                    <SingleMetricRow label="G-Dip Ratio" value={(anaGd || refGd)!.g_dip_ratio} unit="" />
                    <SingleMetricRow label="Entry Mean G" value={(anaGd || refGd)!.entry_mean_g_sum} unit=" G" />
                </>
            )}
        </CollapsibleSection>
    );
};

const CoastingPenaltySection = ({ refDriving, anaDriving, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refCp = refDriving?.coasting_penalty;
    const anaCp = anaDriving?.coasting_penalty;

    if (!refCp && !anaCp) return null;

    const hasBoth = refCp && anaCp;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    <MetricRow label="CST Time" refVal={refCp.cst_total_time_s} anaVal={anaCp.cst_total_time_s} unit="s" lowerIsGreen />
                    <MetricRow label="Speed Loss" refVal={refCp.cst_speed_loss_kph} anaVal={anaCp.cst_speed_loss_kph} unit=" kph" lowerIsGreen />
                    <MetricRow label="Segments" refVal={refCp.cst_segments} anaVal={anaCp.cst_segments} unit="" lowerIsGreen />
                </>
            ) : (
                <>
                    <SingleMetricRow label="CST Time" value={(anaCp || refCp)!.cst_total_time_s} unit="s" />
                    <SingleMetricRow label="Speed Loss" value={(anaCp || refCp)!.cst_speed_loss_kph} unit=" kph" />
                    <SingleMetricRow label="Segments" value={(anaCp || refCp)!.cst_segments} unit="" />
                </>
            )}
        </CollapsibleSection>
    );
};

const BrakeJerkSection = ({ refDriving, anaDriving, sectionTitle, helpContent }: {
    refDriving?: DrivingFeatures;
    anaDriving?: DrivingFeatures;
    sectionTitle: string;
    helpContent: React.ReactNode;
}) => {
    const refBj = refDriving?.brake_jerk;
    const anaBj = anaDriving?.brake_jerk;

    if (!refBj && !anaBj) return null;

    const hasBoth = refBj && anaBj;

    return (
        <CollapsibleSection title={sectionTitle} helpContent={helpContent}>
            {hasBoth ? (
                <>
                    <MetricRow label="Max Jerk" refVal={refBj.max_brake_jerk_g_per_s} anaVal={anaBj.max_brake_jerk_g_per_s} unit=" G/s" />
                    <MetricRow label="Mean Init Jerk" refVal={refBj.mean_brake_jerk_g_per_s} anaVal={anaBj.mean_brake_jerk_g_per_s} unit=" G/s" />
                </>
            ) : (
                <>
                    <SingleMetricRow label="Max Jerk" value={(anaBj || refBj)!.max_brake_jerk_g_per_s} unit=" G/s" />
                    <SingleMetricRow label="Mean Init Jerk" value={(anaBj || refBj)!.mean_brake_jerk_g_per_s} unit=" G/s" />
                </>
            )}
        </CollapsibleSection>
    );
};

const CornerAnalysisPanel: React.FC<CornerAnalysisPanelProps> = ({ cornerId, refCorner, anaCorner, onClose, xAxisMode }) => {
    const { t } = useTranslation();

    if (!refCorner && !anaCorner) return null;

    const geometryHelpContent = (
        <>
            <p><strong>{t.corner.travelDist}</strong>: {t.corner.geometryHelp_travelDist}</p>
            <p><strong>{t.corner.cpOffsetTrack}</strong>: {t.corner.geometryHelp_cpOffset}</p>
            <p><strong>{t.corner.apexDiff}</strong>: {t.corner.geometryHelp_apexDiff}</p>
        </>
    );

    const brakingHelpContent = (
        <>
            <p>{t.corner.brakingHelp_sob}</p>
            <p>{t.corner.brakingHelp_cob}</p>
            <p>{t.corner.brakingHelp_eob}</p>
            <p>{t.corner.brakingHelp_totalBrk}</p>
            <p>{t.corner.brakingHelp_minDecel}</p>
        </>
    );

    const leanHelpContent = (
        <>
            <p>{t.corner.leanHelp_sol}</p>
            <p>{t.corner.leanHelp_col}</p>
            <p>{t.corner.leanHelp_eol}</p>
            <p>{t.corner.leanHelp_maxLean}</p>
            <p>{t.corner.leanHelp_minVel}</p>
        </>
    );

    const throttleHelpContent = (
        <>
            <p>{t.corner.throttleHelp_sot}</p>
            <p>{t.corner.throttleHelp_cot}</p>
            <p>{t.corner.throttleHelp_eot}</p>
            <p>{t.corner.throttleHelp_totalTps}</p>
            <p>{t.corner.throttleHelp_maxAccel}</p>
        </>
    );

    const gDipHelpContent = (
        <>
            <p>{t.corner.gDipHelp_value}</p>
            <p>{t.corner.gDipHelp_ratio}</p>
            <p>{t.corner.gDipHelp_meanG}</p>
        </>
    );

    const coastingHelpContent = (
        <>
            <p>{t.corner.coastingHelp_time}</p>
            <p>{t.corner.coastingHelp_speedLoss}</p>
            <p>{t.corner.coastingHelp_segments}</p>
        </>
    );

    const brakeJerkHelpContent = (
        <>
            <p>{t.corner.brakeJerkHelp_max}</p>
            <p>{t.corner.brakeJerkHelp_mean}</p>
        </>
    );

    // Use track DB name if available, fallback to generic
    const cornerData = refCorner || anaCorner;
    const cornerName = cornerData?.name;
    const cornerDir = cornerData?.direction;
    const title = cornerName
        ? `${cornerName}${cornerDir ? ` (${cornerDir})` : ''}`
        : `C${cornerId}`;

    // Calculate time loss for this corner
    const timeLoss = (anaCorner?.duration || 0) - (refCorner?.duration || 0);

    return (
        <div className="w-full h-full bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl overflow-y-auto">
            <div className="bg-zinc-800 px-4 py-3 flex justify-between items-center border-b border-zinc-700">
                <h3 className="font-bold text-white text-lg">{title} {t.corner.analysisTitle}</h3>
                <button onClick={onClose} className="text-zinc-400 hover:text-white">
                    ✕
                </button>
            </div>

            <div className="p-4 space-y-4">
                {/* Main Time Loss */}
                <div className="bg-zinc-950 p-3 rounded-lg text-center border border-zinc-800">
                    <div className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{t.corner.timeGainLoss}</div>
                    <div className={`text-2xl font-mono font-bold ${timeLoss <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {timeLoss > 0 ? "+" : ""}{timeLoss.toFixed(3)}s
                    </div>
                </div>

                <div className="space-y-1">
                    <MetricRow
                        label={t.corner.entrySpeed}
                        refVal={refCorner?.metrics.entry_speed}
                        anaVal={anaCorner?.metrics.entry_speed}
                        unit=" km/h"
                    />
                    <MetricRow
                        label={t.corner.minSpeed}
                        refVal={refCorner?.metrics.min_speed}
                        anaVal={anaCorner?.metrics.min_speed}
                        unit=" km/h"
                    />
                    <MetricRow
                        label={t.corner.exitSpeed}
                        refVal={refCorner?.metrics.exit_speed}
                        anaVal={anaCorner?.metrics.exit_speed}
                        unit=" km/h"
                    />
                    <MetricRow
                        label={t.corner.cornerDuration}
                        refVal={refCorner?.duration}
                        anaVal={anaCorner?.duration}
                        unit="s"
                    />
                </div>

                {/* Corner Geometry */}
                {(refCorner?.geometry || anaCorner?.geometry) && (
                    <CollapsibleSection title={t.corner.cornerGeometry} defaultOpen helpContent={geometryHelpContent}>
                        <MetricRow label={t.corner.travelDist} refVal={refCorner?.geometry?.travel_distance_m}
                                   anaVal={anaCorner?.geometry?.travel_distance_m} unit="m" lowerIsGreen />
                        {(refCorner?.geometry?.cp_offset_track_m != null || anaCorner?.geometry?.cp_offset_track_m != null) && (
                            <MetricRow label={t.corner.cpOffsetTrack} refVal={refCorner?.geometry?.cp_offset_track_m}
                                       anaVal={anaCorner?.geometry?.cp_offset_track_m} unit="m" lowerIsGreen />
                        )}
                        {refCorner?.geometry && anaCorner?.geometry && (
                            <SingleMetricRow label={t.corner.apexDiff}
                                             value={haversineDistance(
                                                 refCorner.geometry.apex_lat, refCorner.geometry.apex_lon,
                                                 anaCorner.geometry.apex_lat, anaCorner.geometry.apex_lon
                                             )} unit="m" />
                        )}
                    </CollapsibleSection>
                )}

                {/* Driving Features */}
                <BrakingProfileSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} xAxisMode={xAxisMode} sectionTitle={t.corner.brakingProfile} helpContent={brakingHelpContent} />
                <LeanProfileSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} xAxisMode={xAxisMode} sectionTitle={t.corner.leanProfile} helpContent={leanHelpContent} />
                <RateIntegralsSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} sectionTitle={t.corner.rateIntegrals} />
                <ThrottleProfileSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} xAxisMode={xAxisMode} sectionTitle={t.corner.throttleProfile} helpContent={throttleHelpContent} />
                <GDipSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} sectionTitle={t.corner.gDip} helpContent={gDipHelpContent} />
                <CoastingPenaltySection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} sectionTitle={t.corner.coastingPenalty} helpContent={coastingHelpContent} />
                <BrakeJerkSection refDriving={refCorner?.driving} anaDriving={anaCorner?.driving} sectionTitle={t.corner.brakeJerk} helpContent={brakeJerkHelpContent} />

                {/* Insight / Advice - Mockup based on heuristics */}
                {timeLoss > 0.1 && (
                    <div className="bg-red-900/20 border border-red-900/50 p-3 rounded text-sm text-red-200">
                        {(anaCorner?.metrics.min_speed || 0) < (refCorner?.metrics.min_speed || 0) - 3 ? (
                            <p>{t.corner.insightSlowApex}</p>
                        ) : (anaCorner?.metrics.entry_speed || 0) < (refCorner?.metrics.entry_speed || 0) - 5 ? (
                            <p>{t.corner.insightSlowEntry}</p>
                        ) : (
                            <p>{t.corner.insightTimeLost}</p>
                        )}
                    </div>
                )}
                {timeLoss < -0.1 && (
                    <div className="bg-green-900/20 border border-green-900/50 p-3 rounded text-sm text-green-200">
                        {t.corner.insightGainedTime}
                    </div>
                )}

            </div>
        </div>
    );
};

export default CornerAnalysisPanel;
