/**
 * Format a duration in seconds to M:SS.XXX format.
 * e.g., 83.456 → "1:23.456", 45.123 → "0:45.123"
 */
export function formatLapTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toFixed(3).padStart(6, '0')}`;
}
