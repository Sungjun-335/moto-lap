
import os
import json
from corner_detector import CornerDetector
from visualizer import plot_corners, plot_trackmaps_by_lap

def main():
    # Define paths
    curr_dir = os.path.dirname(os.path.abspath(__file__))
    csv_path = os.path.join(curr_dir, '.', 'no3.csv')
    
    if not os.path.exists(csv_path):
        print(f"Error: File not found at {csv_path}")
        return

    print(f"Processing {csv_path}...")
    
    # Initialize and process
    detector = CornerDetector(csv_path)
    detector.compute_metrics()
    
    # Detect
    results_json = detector.to_json()
    results = json.loads(results_json)
    
    # Print Summary
    print("-" * 30)
    print("Detection Summary")
    print("-" * 30)
    print(results)
    print(json.dumps(results['assumptions'], indent=2))
    print(f"Found {len(results['corners'])} corners.")
    
    # Print first 3 corners as sample
    print("\nFirst 3 Corners:")
    print(json.dumps(results['corners'][:3], indent=2))
    
    # Output directory
    output_dir = os.path.join(curr_dir, 'lap_results')
    os.makedirs(output_dir, exist_ok=True)
    
    # Global Result
    full_json_path = os.path.join(output_dir, 'full_session.json')
    with open(full_json_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"Full session JSON saved to {full_json_path}")
    
    full_plot_path = os.path.join(output_dir, 'full_session.png')
    plot_corners(detector, results, save_path=full_plot_path)
    print(f"Full session Plot saved to {full_plot_path}")

    # Per-Lap Results
    laps = sorted(detector.df['lap_id'].unique())
    original_df = detector.df.copy()
    valid_laps = []
    for lap_id in laps:
        try:
            lap_id = int(lap_id)
        except Exception:
            continue
        if lap_id > 0:
            valid_laps.append(lap_id)
    
    for lap_id in laps:
        # lap_id in pandas might be categorical/int, cast to int
        try:
            lap_id = int(lap_id)
        except:
            continue
            
        if lap_id == 0:
            continue # Skip outlap/invalid if desired, or keep it. Let's keep valid laps > 0 usually? 
                     # Wait, earlier output showed lap_id 0, 1, 2...
                     # If lap_id is 0-based index or just whatever `cut` produced.
                     # Let's verify lap validness? 
                     # If lap_id=0 exists and has data, generate it.
        
        print(f"Generating results for Lap {lap_id}...")
        
        # Filter Data
        lap_mask = original_df['lap_id'] == lap_id
        if not lap_mask.any():
            continue
            
        lap_df = original_df[lap_mask].copy()
        
        # Filter Corners
        lap_corners = [c for c in results['corners'] if c.get('lap_id') == lap_id]
        
        # Construct Lap Result
        lap_result = {
            'assumptions': results['assumptions'],
            'corners': lap_corners
        }
        
        # Save JSON
        lap_json_path = os.path.join(output_dir, f'lap_{lap_id}.json')
        with open(lap_json_path, 'w') as f:
            json.dump(lap_result, f, indent=2)
            
        # Save Plot
        # We temporarily swap df in detector for visualization
        detector.df = lap_df
        lap_plot_path = os.path.join(output_dir, f'lap_{lap_id}.png')
        try:
            plot_corners(detector, lap_result, save_path=lap_plot_path)
        except Exception as e:
            print(f"Error plotting Lap {lap_id}: {e}")
            
    # Restore
    detector.df = original_df

    # TrackMap per Lap (single image)
    trackmap_grid_path = os.path.join(output_dir, 'trackmaps_by_lap.png')
    try:
        plot_trackmaps_by_lap(detector, lap_ids=valid_laps, save_path=trackmap_grid_path, results=results)
        print(f"TrackMap grid saved to {trackmap_grid_path}")
    except Exception as e:
        print(f"Error generating TrackMap grid: {e}")
    
    print(f"\nAll results saved to {output_dir}")

if __name__ == "__main__":
    main()
