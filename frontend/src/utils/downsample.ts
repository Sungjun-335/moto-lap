// Simple Decimation
// Returns at most targetCount points
export const downsample = <T>(data: T[], targetCount: number = 2000): T[] => {
    const length = data.length;
    if (length <= targetCount) return data;

    const step = Math.ceil(length / targetCount);
    const result: T[] = [];

    for (let i = 0; i < length; i += step) {
        result.push(data[i]);
    }

    // Always include the last point to ensure full range
    if (result[result.length - 1] !== data[length - 1]) {
        result.push(data[length - 1]);
    }

    return result;
};

// More specific downsampling for Charts to preserve peaks/valleys could be LTTB, 
// but for high frequency telemetry, simple decimation is usually acceptable for "Overview".
