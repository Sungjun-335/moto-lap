# MOTO LAP Formula Specification

Formula Table 메트릭의 입력, 수식, 출력을 정의한 문서.

> 구현 파일: `lambda/logic/formula_metrics.py`, `lambda/logic/features.py`
> 설정 파일: `lambda/logic/config.py`

---

## 1. 공통 정의

| 기호 | 의미 | 비고 |
|------|------|------|
| `dt` | `1 / sampling_rate` | 샘플 간격 (초) |
| `t_start` | 코너 시작 시각 (절대 세션 시간) | |
| `D_start` | 코너 시작 지점 Distance (m) | `Distance[start_idx]` |
| `seg_df` | 코너 구간 DataFrame (`start_idx:end_idx`) | |

---

## 2. Boolean 채널 (FormulaMetricsComputer)

DataFrame에 in-place로 컬럼을 추가한다. 랩 전체에 적용.

| 채널 | 입력 | 수식 | 출력 컬럼 | 임계값 |
|------|------|------|-----------|--------|
| BRK | `accel_x` (G) | `accel_x < -0.15` | `brk_on` (bool) | `BRK_ON_THRESHOLD_G = -0.15` |
| CRN | `accel_y` (G) | `\|accel_y\| > 0.2` | `crn_on` (bool) | `CRN_ON_THRESHOLD_G = 0.2` |
| TPS | `accel_x` (G) | `accel_x > 0.05` | `tps_on` (bool) | `TPS_ON_THRESHOLD_G = 0.05` |
| CST | `brk_on`, `tps_on`, `crn_on` | `NOT(brk) AND NOT(tps) AND NOT(crn)` | `cst_on` (bool) | - |

---

## 3. Lean Angle (FormulaMetricsComputer)

| 항목 | 입력 | 수식 | 출력 컬럼 | 단위 |
|------|------|------|-----------|------|
| lean_angle | `speed_kph`, `gyro_z` (deg/s) | `degrees(arctan(speed_m/s * gyro_rad/s / 9.80665))` | `lean_angle` | deg |

```
speed_m/s = speed_kph / 3.6
gyro_rad/s = radians(gyro_z)
lean_angle = degrees(arctan(speed_m/s * gyro_rad/s / 9.80665))
```

---

## 4. G-Sum (FormulaMetricsComputer)

| 항목 | 입력 | 수식 | 출력 컬럼 | 단위 |
|------|------|------|-----------|------|
| g_sum | `accel_x` (G), `accel_y` (G) | `sqrt(accel_x^2 + accel_y^2)` | `g_sum` | G |

---

## 5. 랩별 적분 메트릭 (FormulaMetricsComputer)

각 Boolean 채널(`brk`, `crn`, `tps`, `cst`)에 대해 랩 단위로 계산.

| 출력 키 | 입력 | 수식 | 단위 |
|---------|------|------|------|
| `{ch}_time_s` | `{ch}_on` (bool) | `count({ch}_on == True) * dt` | s |
| `{ch}_pct` | `{ch}_time_s`, `lap_time` | `{ch}_time_s / lap_time * 100` | % |
| `{ch}_dist_m` | `{ch}_on`, `speed_kph` | `sum({ch}_on * speed_m/s) * dt` | m |
| `max_lean_angle_deg` | `lean_angle` | `max(\|lean_angle\|)` | deg |
| `mean_g_sum` | `g_sum` | `mean(g_sum)` | G |
| `max_g_sum` | `g_sum` | `max(g_sum)` | G |

### 출력 JSON 예시

```json
{
  "lap_id": 1,
  "lap_time_s": 85.32,
  "brk_time_s": 12.5,   "brk_pct": 14.6,  "brk_dist_m": 320.1,
  "crn_time_s": 35.2,   "crn_pct": 41.3,  "crn_dist_m": 1200.5,
  "tps_time_s": 28.1,   "tps_pct": 32.9,  "tps_dist_m": 1050.3,
  "cst_time_s": 9.5,    "cst_pct": 11.2,  "cst_dist_m": 280.0,
  "max_lean_angle_deg": 48.2,
  "mean_g_sum": 0.65,
  "max_g_sum": 1.42
}
```

---

## 6. Braking Profile (DrivingFeatureExtractor)

코너 구간 내 브레이킹 분포를 누적 감속량 기준으로 분석.

### 입력

| 컬럼 | 설명 | 단위 |
|------|------|------|
| `brk_on` | Boolean 채널 (BRK 활성 여부) | bool |
| `accel_x` | 종가속도 | G |
| `time` | 세션 시간 | s |
| `Distance` | 누적 주행 거리 | m |

### 수식

```
1. brk_ax[i] = |accel_x[i]|   if brk_on[i] == True
               0               otherwise

2. B[i] = cumsum(brk_ax)       -- 누적 감속량 배열

3. B_total = B[마지막]          -- 총 감속량

4. SOB: B[i] >= 0.1 * B_total 을 최초로 만족하는 인덱스 i
   - sob_offset_s = time[i] - t_start
   - sob_offset_m = Distance[i] - D_start

5. COB: B[i] >= 0.5 * B_total 을 최초로 만족하는 인덱스 i
   - cob_offset_s = time[i] - t_start
   - cob_offset_m = Distance[i] - D_start

6. EOB: B[i] >= 0.9 * B_total 을 최초로 만족하는 인덱스 i
   - eob_offset_s = time[i] - t_start
   - eob_offset_m = Distance[i] - D_start

7. total_brk_g_s = sum(brk_ax) * dt

8. min_accel_x_g = min(accel_x  where brk_on)
```

### 출력

| 키 | 설명 | 단위 |
|----|------|------|
| `sob_offset_s` | 누적 감속 10% 도달 시간 | s |
| `sob_offset_m` | 누적 감속 10% 도달 거리 | m |
| `cob_offset_s` | 누적 감속 50% 도달 시간 | s |
| `cob_offset_m` | 누적 감속 50% 도달 거리 | m |
| `eob_offset_s` | 누적 감속 90% 도달 시간 | s |
| `eob_offset_m` | 누적 감속 90% 도달 거리 | m |
| `total_brk_g_s` | 총 감속량 | G*s |
| `min_accel_x_g` | 최대 감속 G (가장 강한 브레이킹) | G |

### 출력 JSON 예시

```json
{
  "sob_offset_s": 0.12,  "sob_offset_m": 3.45,
  "cob_offset_s": 0.45,  "cob_offset_m": 12.80,
  "eob_offset_s": 0.78,  "eob_offset_m": 22.15,
  "total_brk_g_s": 2.34,
  "min_accel_x_g": -0.95
}
```

---

## 7. Lean Profile (DrivingFeatureExtractor)

코너 구간 내 기울기 분포를 누적 lean angle 기준으로 분석.

### 입력

| 컬럼 | 설명 | 단위 |
|------|------|------|
| `lean_angle` | 바이크 기울기 (Section 3에서 계산) | deg |
| `speed_kph` | 주행 속도 | km/h |
| `time` | 세션 시간 | s |
| `Distance` | 누적 주행 거리 | m |

### 수식

```
1. la[i] = |lean_angle[i]|

2. L[i] = cumsum(la)            -- 누적 기울기 배열

3. L_total = L[마지막]           -- 총 기울기량

4. SOL: L[i] >= 0.1 * L_total 을 최초로 만족하는 인덱스 i
   - sol_offset_s = time[i] - t_start
   - sol_offset_m = Distance[i] - D_start

5. COL: L[i] >= 0.5 * L_total 을 최초로 만족하는 인덱스 i
   - col_offset_s = time[i] - t_start
   - col_offset_m = Distance[i] - D_start

6. EOL: L[i] >= 0.9 * L_total 을 최초로 만족하는 인덱스 i
   - eol_offset_s = time[i] - t_start
   - eol_offset_m = Distance[i] - D_start

7. max_lean_deg = max(|lean_angle|)

8. min_vel_kph = min(speed_kph)

9. min_vel_offset_s = time[argmin(speed_kph)] - t_start
   min_vel_offset_m = Distance[argmin(speed_kph)] - D_start
```

### 출력

| 키 | 설명 | 단위 |
|----|------|------|
| `sol_offset_s` | 누적 기울기 10% 도달 시간 | s |
| `sol_offset_m` | 누적 기울기 10% 도달 거리 | m |
| `col_offset_s` | 누적 기울기 50% 도달 시간 | s |
| `col_offset_m` | 누적 기울기 50% 도달 거리 | m |
| `eol_offset_s` | 누적 기울기 90% 도달 시간 | s |
| `eol_offset_m` | 누적 기울기 90% 도달 거리 | m |
| `max_lean_deg` | 코너 내 최대 기울기 | deg |
| `min_vel_kph` | 코너 내 최저 속도 | km/h |
| `min_vel_offset_s` | 최저속 도달 시간 | s |
| `min_vel_offset_m` | 최저속 도달 거리 | m |

### 출력 JSON 예시

```json
{
  "sol_offset_s": 0.08,  "sol_offset_m": 2.10,
  "col_offset_s": 0.52,  "col_offset_m": 15.30,
  "eol_offset_s": 0.91,  "eol_offset_m": 28.70,
  "max_lean_deg": 42.3,
  "min_vel_kph": 67.5,
  "min_vel_offset_s": 0.64,  "min_vel_offset_m": 18.50
}
```

---

## 8. Rate Integrals (DrivingFeatureExtractor)

코너 구간 내 각속도 절대값 적분. 라이딩 스타일 비교 지표.

### 입력

| 컬럼 | 설명 | 단위 |
|------|------|------|
| `pitch_rate` | 피치 각속도 | deg/s |
| `roll_rate` | 롤 각속도 | deg/s |
| `yaw_rate` | 요 각속도 | deg/s |

### 수식

```
pitch_rate_integral = sum(|pitch_rate|) * dt
roll_rate_integral  = sum(|roll_rate|)  * dt
yaw_rate_integral   = sum(|yaw_rate|)   * dt
```

### 출력

| 키 | 설명 | 단위 | 분석 용도 |
|----|------|------|----------|
| `pitch_rate_integral` | 피치 적분값 | deg | 쇼바 사용 정도 비교 |
| `roll_rate_integral` | 롤 적분값 | deg | 기울기 사용 정도 비교 |
| `yaw_rate_integral` | 요 적분값 | deg | 선회 효율 비교 |

### 출력 JSON 예시

```json
{
  "pitch_rate_integral": 12.45,
  "roll_rate_integral": 8.73,
  "yaw_rate_integral": 15.21
}
```

---

## 9. 전체 파이프라인 흐름

```
CSV 업로드
  |
  v
preprocess.apply(df)           -- 컬럼명 정규화, 스무딩
  |
  v
formula.compute_boolean_channels(df)   -- brk_on, crn_on, tps_on, cst_on
formula.compute_lean_angle(df)         -- lean_angle
formula.compute_g_sum(df)              -- g_sum
  |
  v
corner detection (spatial/temporal)
  |
  v
features.extract(df, start, apex, end)  -- 코너별:
  |  +-- braking_profile  (SOB/COB/EOB, TOTAL_BRK, MIN_ACCEL_X)
  |  +-- lean_profile     (SOL/COL/EOL, MAX_LEAN, MIN_VEL, LOC)
  |  +-- rate_integrals   (pitch/roll/yaw)
  |
  v
formula.compute_all_lap_metrics(df)     -- 랩별:
  |  +-- brk/crn/tps/cst time_s, pct, dist_m
  |  +-- max_lean_angle_deg, mean_g_sum, max_g_sum
  |
  v
JSON 응답:
  { "corners": [...], "lap_metrics": [...], "metadata": {...} }
```

---

## 10. 전체 출력 구조

### corners[].driving

```json
{
  "time_to_apex_s": 1.2,
  "time_from_apex_to_exit_s": 0.8,
  "brake_start_offset_s": -0.5,
  "brake_release_offset_s": 0.3,
  "max_decel_mps2": -8.5,
  "entry_brake_ratio": 0.45,
  "trail_braking": true,
  "throttle_at_apex": 0.1,
  "throttle_pickup_delay_s": 0.15,
  "max_lat_g": 1.1,
  "mean_lat_g": 0.7,
  "max_yaw_deg_s": 35.2,
  "braking_profile": {
    "sob_offset_s": 0.12,  "sob_offset_m": 3.45,
    "cob_offset_s": 0.45,  "cob_offset_m": 12.80,
    "eob_offset_s": 0.78,  "eob_offset_m": 22.15,
    "total_brk_g_s": 2.34,
    "min_accel_x_g": -0.95
  },
  "lean_profile": {
    "sol_offset_s": 0.08,  "sol_offset_m": 2.10,
    "col_offset_s": 0.52,  "col_offset_m": 15.30,
    "eol_offset_s": 0.91,  "eol_offset_m": 28.70,
    "max_lean_deg": 42.3,
    "min_vel_kph": 67.5,
    "min_vel_offset_s": 0.64,  "min_vel_offset_m": 18.50
  },
  "rate_integrals": {
    "pitch_rate_integral": 12.45,
    "roll_rate_integral": 8.73,
    "yaw_rate_integral": 15.21
  },
  "throttle_profile": {
    "sot_offset_s": 0.12, "sot_offset_m": 2.50,
    "cot_offset_s": 0.45, "cot_offset_m": 9.80,
    "eot_offset_s": 0.89, "eot_offset_m": 22.30,
    "total_tps_g_s": 1.85,
    "max_accel_x_g": 0.32
  },
  "g_dip": {
    "g_dip_value": 0.15,
    "g_dip_offset_s": 0.35,
    "g_dip_offset_m": 8.20,
    "entry_mean_g_sum": 0.72,
    "g_dip_ratio": 0.2083
  },
  "coasting_penalty": {
    "cst_total_time_s": 0.24,
    "cst_speed_loss_kph": 3.5,
    "cst_segments": 1
  },
  "brake_jerk": {
    "max_brake_jerk_g_per_s": 4.52,
    "brake_jerk_offset_s": -0.15,
    "mean_brake_jerk_g_per_s": 2.85
  }
}
```

---

## Throttle Roll-on Profile (SOT / COT / EOT)

**목적**: 에이펙스~탈출 구간의 스로틀 전개 분포 분석

**입력**: exit phase (apex → end) DataFrame, `tps_on` boolean, `accel_x`

**수식**:
- `tps_ax = max(accel_x, 0) where tps_on == True, else 0`
- `cumsum = cumsum(tps_ax)`
- SOT: cumsum이 total의 10% 도달 시점 (apex 기준 오프셋)
- COT: 50% 도달 시점
- EOT: 90% 도달 시점
- `total_tps_g_s = sum(tps_ax) × dt`
- `max_accel_x_g = max(accel_x[tps_on])`

**출력**: `{sot_offset_s, sot_offset_m, cot_offset_s, cot_offset_m, eot_offset_s, eot_offset_m, total_tps_g_s, max_accel_x_g}`

---

## G-Dip Analysis

**목적**: 진입 구간의 마찰원 전환 효율 분석 (브레이킹 → 코너링 전환 시 G-Sum 저하점)

**입력**: entry phase (start → apex) DataFrame, `g_sum` column

**수식**:
- `dip_idx = argmin(g_sum[entry])`
- `g_dip_value = g_sum[dip_idx]`
- `entry_mean_g_sum = mean(g_sum[entry])`
- `g_dip_ratio = g_dip_value / entry_mean_g_sum` (1.0에 가까울수록 전환이 매끄러움)

**출력**: `{g_dip_value, g_dip_offset_s, g_dip_offset_m, entry_mean_g_sum, g_dip_ratio}`

---

## Coasting Penalty

**목적**: 코스팅 구간의 속도 손실 분석

**입력**: 전체 코너 segment DataFrame, `cst_on` boolean, `speed_kph`

**수식**:
- `cst_on = NOT(brk_on) AND NOT(tps_on) AND NOT(crn_on)`
- `diff(cst_on.astype(int))`로 연속 세그먼트 경계 검출
- 각 세그먼트: `speed_loss = speed[start] - speed[end]`
- `cst_total_time_s = sum(segment_lengths) × dt`
- `cst_speed_loss_kph = sum(segment_speed_losses)`

**출력**: `{cst_total_time_s, cst_speed_loss_kph, cst_segments}`

---

## Brake Jerk

**목적**: 초기 브레이킹 공격성 분석 (가속도 변화율)

**입력**: approach(3s 전) ~ apex 구간, `accel_x`

**수식**:
- `jerk = gradient(accel_x) × sampling_rate` (G/s)
- `max_brake_jerk_g_per_s = max(|jerk|) where jerk < 0`
- `brake_jerk_offset_s = time[max_neg_jerk_idx] - t_start`
- `mean_brake_jerk_g_per_s = mean(|jerk[first_brk : first_brk + 0.5s]|) where jerk < 0`
  - `BRAKE_JERK_INITIAL_WINDOW_S = 0.5` (config.py)

**출력**: `{max_brake_jerk_g_per_s, brake_jerk_offset_s, mean_brake_jerk_g_per_s}`

### lap_metrics[]

```json
{
  "lap_id": 1,
  "lap_time_s": 85.32,
  "brk_time_s": 12.5,  "brk_pct": 14.6,  "brk_dist_m": 320.1,
  "crn_time_s": 35.2,  "crn_pct": 41.3,  "crn_dist_m": 1200.5,
  "tps_time_s": 28.1,  "tps_pct": 32.9,  "tps_dist_m": 1050.3,
  "cst_time_s": 9.5,   "cst_pct": 11.2,  "cst_dist_m": 280.0,
  "max_lean_angle_deg": 48.2,
  "mean_g_sum": 0.65,
  "max_g_sum": 1.42
}
```
