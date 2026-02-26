# corner_detection

이 디렉토리는 AIM 계열 CSV 텔레메트리로부터 **랩별 코너를 탐지**하고, 탐지 결과를 **공간(Track Map) 기준으로 정렬/정규화**해서 비교 가능한 형태(JSON/시각화)로 만드는 모듈입니다.

## 전체 흐름(요약)

1. **데이터 로딩**: AIM CSV를 읽고 메타데이터(샘플링레이트/Beacon Markers 등)를 파싱합니다.
2. **랩 구간화**: `Beacon Markers`(세션 타임 기준)를 이용해 `lap_id`를 만듭니다.
3. **전처리**: 컬럼명을 내부 표준(`speed_kph`, `lat`, `lon`, `gyro_z`, `accel_y`, `time`)으로 정리하고 Savitzky–Golay로 스무딩합니다.
4. **좌표/곡률 계산**: 위도/경도를 `pos_x/pos_y(m)`로 변환하고(근사), 곡률(curvature)을 계산합니다.
5. **Hybrid Intensity 생성**: 여러 “회전 지표”를 견고하게 정규화해 `hybrid_intensity`(회전 강도)를 만듭니다.
6. **코너 세그먼트 추출**: `hybrid_intensity`에 히스테리시스(ON/OFF) 규칙을 적용해 코너 구간(start/end)을 얻습니다.
7. **TrackMap 생성(옵션)**: 기준 랩의 세그먼트에서 코너 중심점을 뽑아 TrackMap(코너 정의 목록)을 만듭니다.
8. **Spatial 탐지(권장)**: TrackMap을 기준으로 각 랩에서 코너를 “공간 윈도우”로 찾아 start/end를 정밀화합니다.

## 핵심 아이디어 1) Hybrid Intensity

코너는 한 가지 센서(예: gyro)만으로 잡으면 상황(노이즈/캘리브레이션/센서 누락)에 따라 취약해집니다. 그래서 여러 지표를 동시에 보고 **가장 강한(turning strongest)** 신호를 사용합니다.

- 후보 지표
  - `gyro_z`(yaw rate) 절대값
  - `accel_y`(lateral accel) 절대값
  - `curvature`(곡률) 절대값
- 각 지표를 “퍼센타일 기반 임계값”으로 정규화(바닥값/상한 포함)
- 최종 회전 강도: `hybrid_intensity = max(gyro_norm, accel_norm, curvature_norm)`

이 방식은 특정 센서가 약해도 다른 지표로 보완되고, 퍼센타일 기반이라 세션별 스케일이 달라도 비교적 안정적으로 동작합니다.

구현: `corner_detection/metrics.py` (`HybridIntensityComputer`, `get_detail_metric_col`)

## 핵심 아이디어 2) 히스테리시스 세그먼트(HysteresisSegmenter)

`hybrid_intensity`는 연속 신호이므로, 코너 구간을 “임계값을 넘는 시간대”로 자르면 됩니다. 다만 한 임계값만 쓰면 경계가 흔들려(노이즈/순간 하락) 구간이 잘게 쪼개질 수 있습니다.

그래서 다음과 같이 ON/OFF 임계값을 분리합니다.

- ON: `hybrid_intensity > th_on`이면 코너 시작
- OFF: `hybrid_intensity < th_off`이면 코너 종료 (`th_off < th_on`)

추가로 다음 후처리를 합니다.

- **최소 속도 필터**: `speed_kph < min_speed_kph` 구간은 코너로 보지 않음
- **갭 머지**: 매우 짧은 끊김(gap)은 하나의 코너로 합침
- **최소 길이 필터**: 너무 짧은 구간은 제거

구현: `corner_detection/segmentation.py` (`HysteresisSegmenter`)

## 데이터 소스 확장(BaseDataset)

향후 CSV 포맷/로거 종류가 늘어나는 것을 대비해서, 로딩 단계는 Dataset 추상화로 감쌉니다.

- `BaseDataset`: `load()`를 통해 `df + metadata + sampling_rate_hz`를 반환
- `AIMDataLoggerDataset`: AIM Data Logger CSV 구현체

즉, `CornerDetector`는 **경로 문자열** 또는 **Dataset 인스턴스**를 모두 받을 수 있습니다.

```python
from corner_detection import AIMDataLoggerDataset, CornerDetector

dataset = AIMDataLoggerDataset("no3.csv")
detector = CornerDetector(dataset)
```

## TrackMap 생성(기준 랩 코너 정의)

Spatial 탐지를 위해 “코너가 어디에 있는지”를 나타내는 TrackMap을 만들 수 있습니다.

1. 기준 랩(`reference_lap_id`)에서 `hybrid_intensity`를 추출하고 약간 스무딩합니다.
2. 히스테리시스 세그먼트를 구합니다.
3. 각 세그먼트에서 **apex(절대값 기준 최대)** 지점을 찾아 해당 시점의 `pos_x/pos_y`를 코너 중심으로 사용합니다.
4. 코너마다 반경(`radius`)과 진행 방향(`direction`)을 부여합니다.

구현: `corner_detection/track_map.py` (`TrackMapGenerator`)

## Spatial Corner Detection (권장)

Temporal 방식(시간축에서만 세그먼트 추출)은 “같은 코너가 랩마다 같은 corner_id로 매칭되는” 보장이 약합니다. 반면 Spatial 방식은 TrackMap을 기준으로 **각 랩에서 코너를 같은 공간 윈도우로 탐색**하므로 lap-to-lap 비교가 쉬워집니다.

동작 개요:

1. TrackMap의 각 코너에 대해 해당 반경(`radius`) 안에 들어오는 샘플만 추립니다.
2. 윈도우 안에서 `hybrid_intensity`가 충분히 큰지 확인하고 peak를 찾습니다.
3. peak를 기준으로 `th_off`를 이용해 start/end를 확장(refine)합니다.
4. 같은 구간을 중복 탐지하지 않도록 `used_mask`로 소비 처리합니다.

구현: `corner_detection/detectors.py` (`SpatialCornerDetector`)

## 코드 구조(파일별 역할)

- `corner_detection/facade.py`: 외부에서 쓰는 단일 진입점 `CornerDetector`(오케스트레이션)
- `corner_detection/loader.py`: AIM CSV 로딩 + 메타데이터/랩 구간화
- `corner_detection/preprocess.py`: 컬럼 표준화 + 스무딩
- `corner_detection/metrics.py`: 좌표/곡률, hybrid_intensity 계산
- `corner_detection/segmentation.py`: 히스테리시스 세그먼트 추출/머지/필터
- `corner_detection/track_map.py`: 기준 랩 TrackMap 생성
- `corner_detection/detectors.py`: Temporal/Spatial 코너 탐지기
- `corner_detection/features.py`: 코너 주행 특징 추출(브레이킹/스로틀 등)
- `corner_detection/result_builder.py`: 최종 결과(JSON dict) 생성
- `corner_detection/models.py`: 데이터 모델(TrackMap/CornerSegment 등)
- `corner_detection/config.py`: 기본 파라미터 상수

## 사용 예시

```python
from corner_detector import CornerDetector

detector = CornerDetector("no3.csv")
detector.compute_metrics()

results = detector.detect_corners_spatial()  # 권장(TrackMap 기반)
print(len(results["corners"]))
```

특정 랩만 탐지:

```python
results_lap10 = detector.detect_corners_spatial(lap_id=10)
```

데모 실행:

```bash
python demo.py
```

## 튜닝 포인트

- `th_on`, `th_off`: 코너 시작/종료 민감도 (기본 0.6 / 0.3)
- `percentile`: hybrid 정규화 임계값 산정 퍼센타일(기본 80)
- `DEFAULT_MIN_SPEED_KPH`: 저속 구간 제외 기준
- `DEFAULT_GAP_LIMIT_S`, `DEFAULT_MIN_DURATION_S`: 머지/필터 기준(초 단위)

기본값: `corner_detection/config.py`

## 출력 형태(요약)

Spatial 결과는 대략 아래 형태를 갖습니다.

- 최상위: `mode`, `track_map_source`, `assumptions`, `corners`
- 각 코너: `corner_id`, `lap_id`, `start_time`, `apex_time`, `end_time`, `direction`, `metrics`, `driving`

실제 예시는 `lap_results/*.json`을 참고하세요.
