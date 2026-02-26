import type { ComponentType } from 'react';
import type { ChartComponentProps } from './AnalysisChartWrapper';
import type { LineConfig } from './FlexibleLineChart';

import DeltaChart from './DeltaChart';
import InputChart from './InputChart';
import ThrottleBrakeChart from './ThrottleBrakeChart';
import GSumChart from './GSumChart';
import ActivityChart from './ActivityChart';
import DrivingEventsChart from './DrivingEventsChart';

export interface ChartDefinition {
    id: string;
    label: string;
    height: number;
    defaultVisible: boolean;
    // Either a dedicated component or flexible line config
    component?: ComponentType<ChartComponentProps>;
    flexConfig?: {
        title: string;
        lines: LineConfig[];
        yDomain?: [number | string, number | string];
    };
}

// Consistent color scheme: Ana = red, Ref = blue
const ANA_COLOR = '#ef4444';
const REF_COLOR = '#3b82f6';

export const CHART_REGISTRY: ChartDefinition[] = [
    {
        id: 'delta',
        label: 'Time Delta',
        height: 180,
        defaultVisible: true,
        component: DeltaChart,
    },
    {
        id: 'speed',
        label: 'Speed',
        height: 180,
        defaultVisible: true,
        flexConfig: {
            title: 'Speed',
            lines: [
                { dataKey: 'anaSpeed', color: ANA_COLOR, name: 'Speed (Ana)', strokeWidth: 2 },
                { dataKey: 'refSpeed', color: REF_COLOR, name: 'Speed (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'input',
        label: 'RPM',
        height: 220,
        defaultVisible: false,
        component: InputChart,
    },
    {
        id: 'throttle_brake',
        label: 'Throttle & Brake',
        height: 150,
        defaultVisible: false,
        component: ThrottleBrakeChart,
    },
    {
        id: 'gsum',
        label: 'G-Sum',
        height: 180,
        defaultVisible: false,
        component: GSumChart,
    },
    {
        id: 'activity',
        label: 'Activity Channel',
        height: 140,
        defaultVisible: false,
        component: ActivityChart,
    },
    {
        id: 'lat_g',
        label: 'Lateral G',
        height: 180,
        defaultVisible: true,
        flexConfig: {
            title: 'Lateral G',
            lines: [
                { dataKey: 'anaLatG', color: ANA_COLOR, name: 'Lat G (Ana)', strokeWidth: 2 },
                { dataKey: 'refLatG', color: REF_COLOR, name: 'Lat G (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'lon_g',
        label: 'Longitudinal G',
        height: 180,
        defaultVisible: true,
        flexConfig: {
            title: 'Longitudinal G',
            lines: [
                { dataKey: 'anaLonG', color: ANA_COLOR, name: 'Lon G (Ana)', strokeWidth: 2 },
                { dataKey: 'refLonG', color: REF_COLOR, name: 'Lon G (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'lean',
        label: 'Lean Angle',
        height: 180,
        defaultVisible: false,
        flexConfig: {
            title: 'Lean Angle',
            lines: [
                { dataKey: 'anaLean', color: ANA_COLOR, name: 'Lean (Ana)', strokeWidth: 2 },
                { dataKey: 'refLean', color: REF_COLOR, name: 'Lean (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'gear',
        label: 'Gear',
        height: 150,
        defaultVisible: false,
        flexConfig: {
            title: 'Gear',
            lines: [
                { dataKey: 'anaGear', color: ANA_COLOR, name: 'Gear (Ana)', strokeWidth: 2 },
                { dataKey: 'refGear', color: REF_COLOR, name: 'Gear (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'speed_delta',
        label: 'Speed Delta',
        height: 180,
        defaultVisible: false,
        flexConfig: {
            title: 'Speed Delta (Ana - Ref)',
            lines: [
                { dataKey: 'speedDelta', color: '#f59e0b', name: 'Speed Delta', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'brk',
        label: 'Braking (BRK)',
        height: 120,
        defaultVisible: false,
        flexConfig: {
            title: 'Braking Zone (lonG < -0.15)',
            lines: [
                { dataKey: 'anaBrkOn', color: ANA_COLOR, name: 'BRK (Ana)', strokeWidth: 2, type: 'stepAfter' },
                { dataKey: 'refBrkOn', color: REF_COLOR, name: 'BRK (Ref)', strokeWidth: 2, type: 'stepAfter' },
            ],
            yDomain: [-0.1, 1.1],
        },
    },
    {
        id: 'crn',
        label: 'Cornering (CRN)',
        height: 120,
        defaultVisible: false,
        flexConfig: {
            title: 'Cornering Zone (|latG| > 0.2)',
            lines: [
                { dataKey: 'anaCrnOn', color: ANA_COLOR, name: 'CRN (Ana)', strokeWidth: 2, type: 'stepAfter' },
                { dataKey: 'refCrnOn', color: REF_COLOR, name: 'CRN (Ref)', strokeWidth: 2, type: 'stepAfter' },
            ],
            yDomain: [-0.1, 1.1],
        },
    },
    {
        id: 'tps',
        label: 'Throttle (TPS)',
        height: 120,
        defaultVisible: false,
        flexConfig: {
            title: 'Throttle Zone (lonG > 0.05)',
            lines: [
                { dataKey: 'anaTpsOn', color: ANA_COLOR, name: 'TPS (Ana)', strokeWidth: 2, type: 'stepAfter' },
                { dataKey: 'refTpsOn', color: REF_COLOR, name: 'TPS (Ref)', strokeWidth: 2, type: 'stepAfter' },
            ],
            yDomain: [-0.1, 1.1],
        },
    },
    {
        id: 'cst',
        label: 'Coasting (CST)',
        height: 120,
        defaultVisible: false,
        flexConfig: {
            title: 'Coasting Zone (no BRK/TPS/CRN)',
            lines: [
                { dataKey: 'anaCstOn', color: '#ef4444', name: 'CST (Ana)', strokeWidth: 2, type: 'stepAfter' },
                { dataKey: 'refCstOn', color: '#3b82f6', name: 'CST (Ref)', strokeWidth: 2, type: 'stepAfter' },
            ],
            yDomain: [-0.1, 1.1],
        },
    },
    {
        id: 'pitch_rate',
        label: 'Pitch Rate (GyroX)',
        height: 180,
        defaultVisible: false,
        flexConfig: {
            title: 'Pitch Rate (\u00b0/s)',
            lines: [
                { dataKey: 'anaGyroX', color: ANA_COLOR, name: 'GyroX (Ana)', strokeWidth: 2 },
                { dataKey: 'refGyroX', color: REF_COLOR, name: 'GyroX (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'roll_rate',
        label: 'Roll Rate (GyroY)',
        height: 180,
        defaultVisible: false,
        flexConfig: {
            title: 'Roll Rate (\u00b0/s)',
            lines: [
                { dataKey: 'anaGyroY', color: ANA_COLOR, name: 'GyroY (Ana)', strokeWidth: 2 },
                { dataKey: 'refGyroY', color: REF_COLOR, name: 'GyroY (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'yaw_rate',
        label: 'Yaw Rate (GyroZ)',
        height: 180,
        defaultVisible: false,
        flexConfig: {
            title: 'Yaw Rate (\u00b0/s)',
            lines: [
                { dataKey: 'anaGyroZ', color: ANA_COLOR, name: 'GyroZ (Ana)', strokeWidth: 2 },
                { dataKey: 'refGyroZ', color: REF_COLOR, name: 'GyroZ (Ref)', strokeWidth: 2 },
            ],
        },
    },
    {
        id: 'driving_events',
        label: 'Driving Events',
        height: 200,
        defaultVisible: false,
        component: DrivingEventsChart,
    },
];

export const getDefaultVisibleCharts = (): string[] =>
    CHART_REGISTRY.filter(c => c.defaultVisible).map(c => c.id);
