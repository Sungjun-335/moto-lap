"""
TRP 트랙 중심선 추출 스크립트
- CSV에서 GPS 경로 추출
- 여러 랩 평균하여 중심선 생성
- 1m 간격으로 리샘플링
- JSON 출력
"""
import csv
import json
import math
import sys

CSV_PATH = "tan ga_TRP_a_0498.csv"
OUTPUT_PATH = "scripts/trp_centerline.json"

def haversine(lat1, lon1, lat2, lon2):
    """두 GPS 좌표 사이의 거리 (미터)"""
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def parse_csv(path):
    """CSV에서 시간, GPS 좌표, 속도 등 추출"""
    rows = []
    with open(path, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        lines = list(reader)

    # 메타데이터 파싱
    beacon_markers = []
    for line in lines:
        if len(line) >= 2 and line[0].strip('"') == "Beacon Markers":
            raw = ",".join(line[1:])
            beacon_markers = [float(x.strip().strip('"')) for x in raw.split(",") if x.strip().strip('"')]
            break

    # 헤더 행 찾기 (첫 번째 "Time" 데이터 행)
    data_start = None
    for i, line in enumerate(lines):
        if i < 14:
            continue
        # 숫자 데이터 시작점 찾기
        try:
            if len(line) > 5:
                float(line[0])
                data_start = i
                break
        except (ValueError, IndexError):
            continue

    if data_start is None:
        print("데이터 시작점을 찾을 수 없습니다")
        sys.exit(1)

    # 컬럼 인덱스 찾기
    header = lines[14]  # 첫 번째 헤더 행 (15번째 줄)
    col_map = {}
    for idx, name in enumerate(header):
        name = name.strip().strip('"')
        if name:
            col_map[name] = idx

    print(f"발견된 컬럼: {list(col_map.keys())[:10]}...")
    print(f"GPS 컬럼 인덱스: Lat={col_map.get('GPS_Latitude')}, Lon={col_map.get('GPS_Longitude')}")
    print(f"비콘 마커: {beacon_markers}")
    print(f"데이터 시작 행: {data_start}")

    lat_idx = col_map.get('GPS_Latitude')
    lon_idx = col_map.get('GPS_Longitude')
    time_idx = col_map.get('Time', 0)
    speed_idx = col_map.get('GPS_Speed')
    heading_idx = col_map.get('GPS_Heading')

    for i in range(data_start, len(lines)):
        line = lines[i]
        if len(line) < max(lat_idx, lon_idx) + 1:
            continue
        try:
            t = float(line[time_idx])
            lat = float(line[lat_idx])
            lon = float(line[lon_idx])
            spd = float(line[speed_idx]) if speed_idx else 0
            hdg = float(line[heading_idx]) if heading_idx else 0

            if lat == 0 or lon == 0 or abs(lat) < 1 or abs(lon) < 1:
                continue

            rows.append({
                'time': t, 'lat': lat, 'lon': lon,
                'speed': spd, 'heading': hdg
            })
        except (ValueError, IndexError):
            continue

    print(f"총 {len(rows)}개 GPS 포인트 파싱 완료")
    return rows, beacon_markers

def segment_laps(rows, beacons):
    """시간 리셋 포인트로 랩 분리 (AIM CSV는 랩마다 time이 0으로 리셋)"""
    laps = []
    current_lap = [rows[0]]

    for i in range(1, len(rows)):
        if rows[i]['time'] < rows[i-1]['time'] - 0.5:
            # 시간이 급격히 감소 → 새 랩 시작
            if len(current_lap) > 100:
                laps.append(current_lap)
            current_lap = [rows[i]]
        else:
            current_lap.append(rows[i])

    # 마지막 랩 추가
    if len(current_lap) > 100:
        laps.append(current_lap)

    print(f"{len(laps)}개 랩 분리 완료")
    for i, lap in enumerate(laps):
        dur = lap[-1]['time'] - lap[0]['time']
        print(f"  Lap {i+1}: {len(lap)}개 포인트, {dur:.1f}초")
    return laps

def compute_cumulative_distance(points):
    """각 포인트에 누적 거리 부여"""
    points[0]['dist'] = 0
    for i in range(1, len(points)):
        d = haversine(points[i-1]['lat'], points[i-1]['lon'],
                      points[i]['lat'], points[i]['lon'])
        points[i]['dist'] = points[i-1]['dist'] + d
    return points

def resample_by_distance(points, interval=1.0):
    """일정 거리 간격으로 리샘플링 (선형 보간)"""
    total_dist = points[-1]['dist']
    resampled = []
    j = 0
    d = 0.0

    while d <= total_dist:
        # points[j]와 points[j+1] 사이에서 보간
        while j < len(points) - 2 and points[j + 1]['dist'] < d:
            j += 1

        if j >= len(points) - 1:
            break

        p0 = points[j]
        p1 = points[j + 1]
        seg = p1['dist'] - p0['dist']

        if seg < 0.001:
            t = 0
        else:
            t = (d - p0['dist']) / seg

        t = max(0, min(1, t))
        lat = p0['lat'] + t * (p1['lat'] - p0['lat'])
        lon = p0['lon'] + t * (p1['lon'] - p0['lon'])
        spd = p0['speed'] + t * (p1['speed'] - p0['speed'])
        hdg = p0['heading'] + t * (p1['heading'] - p0['heading'])

        resampled.append({
            'dist': round(d, 2),
            'lat': lat,
            'lon': lon,
            'speed': round(spd, 2),
            'heading': round(hdg, 2)
        })
        d += interval

    return resampled

def average_laps(laps_resampled):
    """여러 랩의 리샘플링 데이터를 평균"""
    # 가장 짧은 랩 기준 (모든 랩이 커버하는 거리)
    min_len = min(len(lap) for lap in laps_resampled)
    print(f"평균 계산: {len(laps_resampled)}개 랩, 공통 포인트 수: {min_len}")

    averaged = []
    for i in range(min_len):
        lat_sum = sum(lap[i]['lat'] for lap in laps_resampled)
        lon_sum = sum(lap[i]['lon'] for lap in laps_resampled)
        spd_sum = sum(lap[i]['speed'] for lap in laps_resampled)
        hdg_sum = sum(lap[i]['heading'] for lap in laps_resampled)
        n = len(laps_resampled)

        averaged.append({
            'dist': laps_resampled[0][i]['dist'],
            'lat': lat_sum / n,
            'lon': lon_sum / n,
            'speed': round(spd_sum / n, 2),
            'heading': round(hdg_sum / n, 2)
        })

    return averaged

def main():
    print("=== TRP 트랙 중심선 추출 ===\n")

    # 1. CSV 파싱
    rows, beacons = parse_csv(CSV_PATH)

    # 2. 랩 분리
    laps = segment_laps(rows, beacons)

    # 3. 각 랩에 누적 거리 계산 + 리샘플링
    laps_resampled = []
    for i, lap in enumerate(laps):
        lap = compute_cumulative_distance(lap)
        total = lap[-1]['dist']
        resampled = resample_by_distance(lap, interval=1.0)
        print(f"  Lap {i+1}: 트랙 길이 {total:.1f}m → {len(resampled)}개 포인트 (1m 간격)")
        laps_resampled.append(resampled)

    # 4. 여러 랩 평균 (아웃랩/인랩 제외: 첫 랩, 마지막 랩 제외)
    valid_laps = laps_resampled[1:-1]  # 중간 랩만 사용
    print(f"\n평균 대상: Lap 2 ~ Lap {len(laps_resampled)-1} ({len(valid_laps)}개 랩)")

    centerline = average_laps(valid_laps)

    # 5. 누적 거리 재계산 (평균 후 실제 거리 기반)
    centerline[0]['dist'] = 0
    for i in range(1, len(centerline)):
        d = haversine(centerline[i-1]['lat'], centerline[i-1]['lon'],
                      centerline[i]['lat'], centerline[i]['lon'])
        centerline[i]['dist'] = round(centerline[i-1]['dist'] + d, 2)

    total_length = centerline[-1]['dist']
    print(f"\n=== 결과 ===")
    print(f"중심선 포인트 수: {len(centerline)}")
    print(f"트랙 총 길이: {total_length:.1f}m")
    print(f"시작점: lat={centerline[0]['lat']:.6f}, lon={centerline[0]['lon']:.6f}")
    print(f"끝점: lat={centerline[-1]['lat']:.6f}, lon={centerline[-1]['lon']:.6f}")

    # 6. JSON 저장
    output = {
        'track': {
            'id': 'trp',
            'name': '태백 레이싱파크',
            'shortName': 'TRP',
            'country': 'KR',
            'totalLength': round(total_length, 1),
            'pointCount': len(centerline),
            'location': {
                'lat': centerline[len(centerline)//2]['lat'],
                'lon': centerline[len(centerline)//2]['lon']
            }
        },
        'centerline': [{
            'dist': p['dist'],
            'lat': round(p['lat'], 8),
            'lon': round(p['lon'], 8),
            'speed': p['speed'],
            'heading': p['heading']
        } for p in centerline],
        'laps_info': [{
            'lap_num': i + 1,
            'point_count': len(lap),
            'total_dist': round(lap[-1]['dist'], 1)
        } for i, lap in enumerate(laps_resampled)]
    }

    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\n결과 저장: {OUTPUT_PATH}")

    # 7. 개별 랩 경로도 저장 (시각화용)
    all_laps_output = {
        'laps': [{
            'lap_num': i + 1,
            'points': [{
                'lat': round(p['lat'], 8),
                'lon': round(p['lon'], 8),
                'dist': p['dist']
            } for p in lap]
        } for i, lap in enumerate(laps_resampled)]
    }

    with open("scripts/trp_all_laps.json", 'w', encoding='utf-8') as f:
        json.dump(all_laps_output, f, indent=2, ensure_ascii=False)

    print(f"개별 랩 경로 저장: scripts/trp_all_laps.json")

if __name__ == '__main__':
    main()
