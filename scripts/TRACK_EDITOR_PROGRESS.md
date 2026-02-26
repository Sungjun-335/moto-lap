# Track Editor 기능 추가 진행 상황

## 수정 파일
- `scripts/track_editor.html`

## 완료된 기능

### Feature 1: GPS 오프셋 보정
- [x] 사이드바에 오프셋 패널 추가
- [x] 위도 슬라이더 (±100 단위, 1단위 = 0.00001° ≈ 1.1m)
- [x] 경도 슬라이더 (±100 단위, 1단위 = 0.00001° ≈ 0.9m)
- [x] **-/+ 스텝 버튼** (한 클릭 = 1단위 이동)
- [x] 실시간 미리보기: 녹색 점선으로 이동된 주행선 오버레이
- [x] 적용 버튼: centerline 전체 좌표 이동, localStorage 저장
- [x] 초기화 버튼: 적용된 오프셋 전부 되돌리기
- [x] 슬라이더 0 버튼: 미리보기만 리셋
- [x] 내보내기(export) 시 적용된 오프셋 값 JSON에 포함 (`gpsOffset` 필드)
- [x] 누적 오프셋 localStorage 저장/복원 (`trackEditor_gpsOffset`)

> **참고**: "적용"은 메모리 + localStorage에만 반영. 원본 `trp_compact.json`은 변경 안 됨.

### Feature 2: 위성사진 경계 자동 인식
- [x] UI 패널: 감지 임계값(80~200), 스무딩(0~5), 단순화(0.5~5m) 슬라이더
- [x] "자동 감지 시작" / "취소" / "경계 적용" 버튼
- [x] "처리 결과 보기" 디버그 체크박스
- [x] 진행 상태 표시 (타일 캡처 → 경계 감지 → 좌표 변환)
- [x] 타일 캡처: Esri 위성 타일 zoom 18, bounding box + 30m 패딩
- [x] 이미지 처리 파이프라인:
  - RGB → 그레이스케일
  - 임계값 이진화 (아스팔트=어두움)
  - 모폴로지 closing → opening (노이즈 제거)
  - Sobel 엣지 검출
  - Moore neighbor contour tracing
  - Douglas-Peucker 단순화
- [x] 픽셀 → lat/lon 변환 (Web Mercator 타일 좌표계)
- [x] centerline 기준 cross product로 좌/우 분류
- [x] 미리보기 (시안/주황 점선) → 사용자 확인 → 경계 데이터 적용
- [x] 디버그 canvas: 엣지 + 컨투어 시각화

### 버그 수정
- [x] `maxCurv` 변수 스코프 버그 수정 (if 블록 밖으로 이동)

## 미완료 / 추후 작업
- [ ] 실제 트랙에서 위성 감지 테스트 및 파라미터 튜닝
- [ ] GPS 오프셋 UI가 작은 화면에서 잘 안 보이는 문제 → 별도 모달이나 플로팅 패널로 변경 검토
- [ ] confirm 메시지 문구 개선 ("영구 적용" → "현재 세션에 적용" 등)

## 추가된 함수 목록

| 함수 | 역할 |
|------|------|
| `stepOffset(axis, delta)` | 오프셋 슬라이더 ±1 스텝 |
| `onOffsetChange()` | 슬라이더 변경 시 미리보기 업데이트 |
| `drawOffsetPreview(latDeg, lonDeg)` | 녹색 점선 미리보기 폴리라인 |
| `applyGpsOffset()` | 오프셋을 centerline에 영구 적용 |
| `resetGpsOffset()` | 누적 오프셋 되돌리기 |
| `saveGpsOffsetToStorage()` | 오프셋 localStorage 저장 |
| `loadGpsOffsetFromStorage()` | 오프셋 localStorage 로드 |
| `captureSatelliteTiles(bounds, zoom)` | Esri 타일 fetch + canvas 스티칭 |
| `toGrayscale(imageData)` | RGB → 그레이스케일 |
| `threshold(gray, w, h, thresh)` | 이진화 |
| `morphologyClose(binary, w, h, iter)` | 모폴로지 닫힘 |
| `morphologyOpen(binary, w, h, iter)` | 모폴로지 열림 |
| `sobelEdge(binary, w, h)` | Sobel 엣지 검출 |
| `traceContours(edge, w, h, minLen)` | Moore neighbor 컨투어 추적 |
| `douglasPeucker(points, tolerance)` | 폴리라인 단순화 |
| `pixelToLatLon(px, py, tileBounds, zoom)` | 픽셀 → 위경도 변환 |
| `splitBoundaries(points)` | centerline 기준 좌/우 분류 |
| `startSatelliteDetection()` | 전체 감지 파이프라인 실행 |
| `cancelSatelliteDetection()` | 감지 취소 |
| `showSatPreview()` / `clearSatPreview()` | 미리보기 표시/제거 |
| `applySatelliteBoundaries()` | 감지 결과를 경계 데이터로 적용 |
| `showSatDebug(...)` | 디버그 canvas 표시 |
| `toggleSatDebug()` | 디버그 토글 |
