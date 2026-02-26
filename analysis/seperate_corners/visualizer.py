
import math
import matplotlib.pyplot as plt
import numpy as np

def plot_trackmaps_by_lap(
    detector,
    lap_ids=None,
    save_path=None,
    max_cols: int = 4,
    method: str = "hybrid_segments",
    show_radius: bool = False,
    results=None,
):
    df = detector.df
    if df is None:
        print("No data to visualize.")
        return

    if 'pos_x' not in df.columns or 'pos_y' not in df.columns:
        print("No GPS data to visualize.")
        return

    if lap_ids is None:
        lap_ids = []
        for lap_id in sorted(df['lap_id'].unique()):
            try:
                lap_id = int(lap_id)
            except Exception:
                continue
            if lap_id > 0:
                lap_ids.append(lap_id)
    else:
        parsed = []
        for lap_id in lap_ids:
            try:
                lap_id = int(lap_id)
            except Exception:
                continue
            if lap_id > 0:
                parsed.append(lap_id)
        lap_ids = sorted(parsed)

    if not lap_ids:
        print("No laps to visualize.")
        return

    n_laps = len(lap_ids)
    ncols = min(max_cols, n_laps)
    nrows = int(math.ceil(n_laps / ncols))

    fig, axs = plt.subplots(nrows, ncols, figsize=(4.8 * ncols, 4.8 * nrows))
    axes = np.array(axs).reshape(-1)

    x_min = float(df['pos_x'].min())
    x_max = float(df['pos_x'].max())
    y_min = float(df['pos_y'].min())
    y_max = float(df['pos_y'].max())

    pad_x = max(10.0, (x_max - x_min) * 0.05)
    pad_y = max(10.0, (y_max - y_min) * 0.05)

    per_lap_corners = {}
    draw_detected_segments = False
    if isinstance(results, dict) and isinstance(results.get("corners"), list):
        for c in results["corners"]:
            try:
                lap_id = int(c.get("lap_id", -1))
            except Exception:
                continue
            per_lap_corners.setdefault(lap_id, []).append(c)
        draw_detected_segments = True

    for i, lap_id in enumerate(lap_ids):
        ax = axes[i]
        lap_df = df[df['lap_id'] == lap_id]

        if lap_df.empty:
            ax.text(0.5, 0.5, f"Lap {lap_id}\n(no data)", ha='center', va='center')
            ax.axis('off')
            continue

        ax.plot(lap_df['pos_x'], lap_df['pos_y'], color='lightgray', zorder=1, linewidth=1, label='Track')

        if draw_detected_segments:
            lap_corners = per_lap_corners.get(lap_id, [])
            for c in lap_corners:
                t_start = c.get("start_time")
                t_end = c.get("end_time")
                if t_start is None or t_end is None or 'time' not in lap_df.columns:
                    continue

                mask = (lap_df['time'] >= t_start) & (lap_df['time'] <= t_end)
                seg_df = lap_df[mask]
                if seg_df.empty:
                    continue

                color = 'red' if c.get('direction') == 'L' else 'blue'
                ax.plot(seg_df['pos_x'], seg_df['pos_y'], color=color, linewidth=2, zorder=2)

                corner_id = c.get("corner_id")
                if corner_id is not None:
                    mid = len(seg_df) // 2
                    ax.text(
                        float(seg_df['pos_x'].iloc[mid]),
                        float(seg_df['pos_y'].iloc[mid]),
                        str(corner_id),
                        fontsize=8,
                        color='black',
                        ha='center',
                        va='center',
                        weight='bold',
                    )

            ax.set_title(f"Lap {lap_id} (Detected corners={len(lap_corners)})")
        else:
            track_map = detector.generate_track_map(reference_lap_id=lap_id, method=method)

            for c in track_map.corners:
                if getattr(c, "direction", "") == 'L':
                    color = 'red'
                elif getattr(c, "direction", "") == 'R':
                    color = 'blue'
                else:
                    color = 'black'

                ax.scatter([c.center_x], [c.center_y], color=color, s=30, zorder=3)
                ax.text(
                    c.center_x,
                    c.center_y,
                    str(c.id),
                    fontsize=8,
                    color='black',
                    ha='center',
                    va='center',
                    weight='bold',
                )

                if show_radius:
                    circle = plt.Circle(
                        (c.center_x, c.center_y),
                        float(getattr(c, "radius", 0.0)),
                        fill=False,
                        color=color,
                        alpha=0.25,
                        linewidth=1,
                        zorder=2,
                    )
                    ax.add_patch(circle)

            ax.set_title(f"Lap {lap_id} (TrackMap corners={len(track_map.corners)})")
        ax.set_aspect('equal')
        ax.grid(True)
        ax.set_xlim(x_min - pad_x, x_max + pad_x)
        ax.set_ylim(y_min - pad_y, y_max + pad_y)

    for j in range(n_laps, len(axes)):
        fig.delaxes(axes[j])

    if draw_detected_segments:
        fig.suptitle("Track Map by Lap (Detected Segments: Red=Left, Blue=Right)")
    else:
        fig.suptitle("TrackMap by Lap (Generated Corners: Red=Left, Blue=Right)")
    fig.tight_layout(rect=[0, 0, 1, 0.96])

    if save_path:
        plt.savefig(save_path, dpi=200, bbox_inches='tight')
        print(f"Plot saved to {save_path}")
        plt.close(fig)
    else:
        plt.show()

def plot_corners(detector, results, save_path=None):
    df = detector.df
    corners = results['corners']
    
    if df is None:
        print("No data to visualize.")
        return

    # Create a figure with subplots
    fig = plt.figure(figsize=(15, 10))
    gs = fig.add_gridspec(2, 2)
    
    # 1. Track Map (Top Left)
    ax_map = fig.add_subplot(gs[0, 0])
    
    # Check if we have X/Y
    if 'pos_x' in df.columns and 'pos_y' in df.columns:
        x = df['pos_x']
        y = df['pos_y']
        ax_map.plot(x, y, color='lightgray', zorder=1, label='Track')
        
        # Highlight corners
        for c in corners:
            # find indices based on time since we didn't export indices in JSON
            # But we can find them from time
            t_start = c['start_time']
            t_end = c['end_time']
            mask = (df['time'] >= t_start) & (df['time'] <= t_end)
            
            c_x = x[mask]
            c_y = y[mask]
            
            color = 'red' if c['direction'] == 'L' else 'blue'
            ax_map.plot(c_x, c_y, color=color, linewidth=2, zorder=2)
            
            # Label Corner ID
            if len(c_x) > 0:
                mid_idx = len(c_x) // 2
                ax_map.text(c_x.iloc[mid_idx], c_y.iloc[mid_idx], str(c['corner_id']), 
                            fontsize=8, color='black', ha='center', va='center', weight='bold')
                            
        ax_map.set_title("Track Map (Red=Left, Blue=Right)")
        ax_map.set_aspect('equal')
        ax_map.grid(True)
    else:
        ax_map.text(0.5, 0.5, "No GPS Data", ha='center')

    # 2. Turning Metric (Bottom)
    ax_metric = fig.add_subplot(gs[1, :])
    metric_name = results['assumptions']['turning_metric_used']
    if metric_name and metric_name in df.columns:
        t = df['time']
        val = df[metric_name]
        
        ax_metric.plot(t, val, color='black', alpha=0.6, label=metric_name)
        
        # Draw thresholds
        th = results['assumptions']['thresholds']
        th_on = 0
        th_off = 0
        
        if metric_name == 'hybrid_intensity':
            if th and 'on' in th and 'off' in th and th['on'] is not None and th['off'] is not None:
                th_on = th['on']
                th_off = th['off']
            else:
                th_on = 0.6
                th_off = 0.3
            ax_metric.axhline(th_on, color='green', linestyle='--', label=f'On Threshold ({th_on:.2f})')
            ax_metric.axhline(th_off, color='orange', linestyle='--', label=f'Off Threshold ({th_off:.2f})')
        elif th and 'on' in th:
            th_on = th['on']
            th_off = th['off']
            ax_metric.axhline(th_on, color='green', linestyle='--', label='On Threshold')
            ax_metric.axhline(th_off, color='orange', linestyle='--', label='Off Threshold')
            if metric_name in ['curvature', 'gyro_z', 'accel_y']:
                 ax_metric.axhline(-th_on, color='green', linestyle='--')
                 ax_metric.axhline(-th_off, color='orange', linestyle='--')

        # Shade corners
        for c in corners:
            color = 'red' if c['direction'] == 'L' else 'blue'
            ax_metric.axvspan(c['start_time'], c['end_time'], color=color, alpha=0.2)
            
        ax_metric.set_title(f"Segmentation based on {metric_name}")
        ax_metric.set_xlabel("Time (s)")
        ax_metric.grid(True)
        ax_metric.legend()

    # 3. Speed Trace (Top Right)
    ax_speed = fig.add_subplot(gs[0, 1])
    ax_speed.plot(df['time'], df['speed_kph'], color='purple')
    for c in corners:
        ax_speed.axvspan(c['start_time'], c['end_time'], color='gray', alpha=0.1)
    ax_speed.set_title("Speed (kph)")
    ax_speed.grid(True)

    plt.tight_layout()
    
    if save_path:
        plt.savefig(save_path)
        print(f"Plot saved to {save_path}")
    else:
        plt.show()
