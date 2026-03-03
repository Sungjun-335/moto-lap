import type { SessionData, Corner, LapMetrics, BrakingProfile, LeanProfile, ThrottleProfile, GDip, CoastingPenalty, BrakeJerk } from '../types';
import type { AnalysisPoint } from './analysis';

// ─── Report Data Types ───

interface ReportCorner {
  id: number;
  name?: string;
  direction?: string;
  duration: number;
  metrics: {
    entry_speed?: number;
    min_speed?: number;
    exit_speed?: number;
    max_lat_g?: number;
  };
  braking?: {
    sob_s: number | null;
    cob_s: number | null;
    eob_s: number | null;
    total_brk_g_s: number;
    min_accel_x_g: number | null;
  };
  lean?: {
    sol_s: number | null;
    col_s: number | null;
    eol_s: number | null;
    max_lean_deg: number;
    min_vel_kph: number;
    min_vel_offset_s: number;
  };
  throttle?: {
    sot_s: number | null;
    cot_s: number | null;
    eot_s: number | null;
    total_tps_g_s: number;
    max_accel_x_g: number | null;
  };
  g_dip?: {
    g_dip_value: number;
    g_dip_ratio: number | null;
    entry_mean_g_sum: number;
  };
  coasting?: {
    cst_total_time_s: number;
    cst_speed_loss_kph: number;
    cst_segments: number;
  };
  brake_jerk?: {
    max_brake_jerk_g_per_s: number;
    mean_brake_jerk_g_per_s: number | null;
  };
}

interface CornerComparison {
  id: number;
  name: string;
  direction: string;
  ref: ReportCorner;
  ana: ReportCorner;
  time_delta_s: number;
  braking_phase_duration_s: number | null;
  lean_phase_duration_s: number | null;
  trail_braking_overlap_s: number | null;
}

interface CornerRange {
  id: number;
  startDist: number;
  endDist: number;
}

export interface ReportData {
  venue: string;
  vehicle: string;
  date: string;
  refLapIndex: number;
  anaLapIndex: number;
  refLapTime: number;
  anaLapTime: number;
  timeDiff: number;
  refMetrics: LapMetrics | undefined;
  anaMetrics: LapMetrics | undefined;
  corners: CornerComparison[];
  analysisPoints?: AnalysisPoint[];
  cornerRanges?: CornerRange[];
}

// ─── Data Collection ───

function pickBraking(bp: BrakingProfile | null | undefined): ReportCorner['braking'] {
  if (!bp) return undefined;
  return {
    sob_s: bp.sob_offset_s,
    cob_s: bp.cob_offset_s,
    eob_s: bp.eob_offset_s,
    total_brk_g_s: bp.total_brk_g_s,
    min_accel_x_g: bp.min_accel_x_g,
  };
}

function pickLean(lp: LeanProfile | null | undefined): ReportCorner['lean'] {
  if (!lp) return undefined;
  return {
    sol_s: lp.sol_offset_s,
    col_s: lp.col_offset_s,
    eol_s: lp.eol_offset_s,
    max_lean_deg: lp.max_lean_deg,
    min_vel_kph: lp.min_vel_kph,
    min_vel_offset_s: lp.min_vel_offset_s,
  };
}

function pickThrottle(tp: ThrottleProfile | null | undefined): ReportCorner['throttle'] {
  if (!tp) return undefined;
  return {
    sot_s: tp.sot_offset_s,
    cot_s: tp.cot_offset_s,
    eot_s: tp.eot_offset_s,
    total_tps_g_s: tp.total_tps_g_s,
    max_accel_x_g: tp.max_accel_x_g,
  };
}

function pickGDip(gd: GDip | null | undefined): ReportCorner['g_dip'] {
  if (!gd) return undefined;
  return {
    g_dip_value: gd.g_dip_value,
    g_dip_ratio: gd.g_dip_ratio,
    entry_mean_g_sum: gd.entry_mean_g_sum,
  };
}

function pickCoasting(cp: CoastingPenalty | null | undefined): ReportCorner['coasting'] {
  if (!cp) return undefined;
  return {
    cst_total_time_s: cp.cst_total_time_s,
    cst_speed_loss_kph: cp.cst_speed_loss_kph,
    cst_segments: cp.cst_segments,
  };
}

function pickBrakeJerk(bj: BrakeJerk | null | undefined): ReportCorner['brake_jerk'] {
  if (!bj) return undefined;
  return {
    max_brake_jerk_g_per_s: bj.max_brake_jerk_g_per_s,
    mean_brake_jerk_g_per_s: bj.mean_brake_jerk_g_per_s,
  };
}

function toReportCorner(c: Corner): ReportCorner {
  return {
    id: c.id,
    name: c.name,
    direction: c.direction,
    duration: c.duration,
    metrics: {
      entry_speed: c.metrics.entry_speed,
      min_speed: c.metrics.min_speed,
      exit_speed: c.metrics.exit_speed,
      max_lat_g: c.metrics.max_lat_g,
    },
    braking: pickBraking(c.driving?.braking_profile),
    lean: pickLean(c.driving?.lean_profile),
    throttle: pickThrottle(c.driving?.throttle_profile),
    g_dip: pickGDip(c.driving?.g_dip),
    coasting: pickCoasting(c.driving?.coasting_penalty),
    brake_jerk: pickBrakeJerk(c.driving?.brake_jerk),
  };
}

function computeDerived(ref: ReportCorner, ana: ReportCorner) {
  const time_delta_s = ana.duration - ref.duration;

  // Use ana lap for braking/lean phase durations (the lap being analyzed)
  const anaBrk = ana.braking;
  const braking_phase_duration_s =
    anaBrk?.eob_s != null && anaBrk?.sob_s != null
      ? anaBrk.eob_s - anaBrk.sob_s
      : null;

  const anaLean = ana.lean;
  const lean_phase_duration_s =
    anaLean?.eol_s != null && anaLean?.sol_s != null
      ? anaLean.eol_s - anaLean.sol_s
      : null;

  const trail_braking_overlap_s =
    anaBrk?.eob_s != null && anaLean?.sol_s != null
      ? Math.max(0, anaBrk.eob_s - anaLean.sol_s)
      : null;

  return { time_delta_s, braking_phase_duration_s, lean_phase_duration_s, trail_braking_overlap_s };
}

export function collectReportData(
  data: SessionData,
  refLapIndex: number,
  anaLapIndex: number,
  analysisPoints?: AnalysisPoint[],
  cornerRanges?: { id: number; startDist: number; endDist: number }[],
): ReportData {
  const refLap = data.laps.find(l => l.index === refLapIndex);
  const anaLap = data.laps.find(l => l.index === anaLapIndex);

  const refCorners = (refLap?.corners ?? []).map(toReportCorner);
  const anaCorners = (anaLap?.corners ?? []).map(toReportCorner);

  const corners: CornerComparison[] = [];
  for (const rc of refCorners) {
    const ac = anaCorners.find(c => c.id === rc.id);
    if (!ac) continue;
    const derived = computeDerived(rc, ac);
    corners.push({
      id: rc.id,
      name: rc.name ?? ac.name ?? `C${rc.id}`,
      direction: rc.direction ?? ac.direction ?? '?',
      ref: rc,
      ana: ac,
      ...derived,
    });
  }

  return {
    venue: data.metadata.venue,
    vehicle: data.metadata.vehicle,
    date: data.metadata.date,
    refLapIndex,
    anaLapIndex,
    refLapTime: refLap?.duration ?? 0,
    anaLapTime: anaLap?.duration ?? 0,
    timeDiff: (anaLap?.duration ?? 0) - (refLap?.duration ?? 0),
    refMetrics: refLap?.metrics,
    anaMetrics: anaLap?.metrics,
    corners,
    analysisPoints,
    cornerRanges,
  };
}

// ─── Prompt Builder (3-part structure) ───

function buildSystemInstruction(lang: 'ko' | 'en'): string {
  if (lang === 'en') {
    return `You are a world championship level (MotoGP, WSBK) professional motorcycle racing coach.
Your role is to analyze rider track telemetry data, pinpoint the causes of lap time differences, and provide practical, specific coaching points. The rider is a beginner, so avoid jargon and explain technical terms in simple language.

I will provide summary JSON data for two laps (reference lap and comparison lap).
The data includes braking (BRK), cornering (CRN), throttle (TPS), coasting (CST) time and percentages, plus per-corner detailed profiles (entry/min/exit speeds, braking profile SOB/COB/EOB based on cumulative deceleration, lean profile SOL/COL/EOL based on cumulative lean angle, throttle roll-on SOT/COT/EOT, etc.).

Each corner may also include a "curves" array — sampled time-series data through the corner with keys: d (distance km), rs/as (ref/ana speed kph), rlg/alg (ref/ana longitudinal G), rlag/alag (ref/ana lateral G), rgs/ags (ref/ana G-Sum). Use these curves to identify WHERE in the corner (by distance) speed diverges, where G-force transitions happen, and how smoothly the rider manages the friction circle through the corner. Reference the curves to support your analysis with specific distance-based observations.

Do NOT just list the numbers — explain what the values MEAN in practical terms and what actions the rider can take to improve.

When comparing braking, cornering, throttle, and coasting, prefer using distance (meters) over time. For example, if the rider braked too early, say "brake 5m later" rather than "brake 0.3s later."

Refer to G-Sum as "tire friction limit." Compare G-Sum max values — if G-Sum is low, explain that the rider has spare tire grip available. Teach the rider what G-Sum means.

Coasting means "a phase where the rider is not accelerating, braking, or cornering."

### [Analysis Rules and Guidelines]

1. Session Overview
- State the total lap time difference to three decimal places, and summarize in one sentence whether the comparison lap is slower or faster than the reference.

2. Lap Composition Analysis (Lap Metrics)
- Present BRK, CRN, TPS, CST seconds, percentages, and distance (m) in table format.
- Interpret how these ratio differences affected lap time from a coaching perspective.
  (e.g., "Braking time increased but braking G is low — the rider braked too softly and for too long.")

3. Corner-by-Corner Analysis (ordered by largest time delta)
- For each corner, compare and analyze all of the following:
  * Speed profile: entry, min (apex corner speed), exit speeds. (Where was speed lost?)
  * Braking technique: SOB(10%), COB(50%), EOB(90%) timing and total_brk_g_s (total deceleration), min_accel_x_g (peak braking force). COB close to EOB = "trail braking (late concentration)" pattern; close to SOB = "hard-early braking" pattern. Compare EOBs between laps and against apex distance to judge if braking ended too early. Decide whether the rider should delay the braking point or extend trail braking.
  * Lean profile: SOL, COL, EOL timing and max lean angle (max_lean_deg). If lean angle is excessive but lateral G (lat_g) is low, point out inefficient lean angle usage. Use G-Sum values to judge how lean angle should integrate with trail braking. Use lean angle to judge approach speed strategy.
  * Trail braking overlap: Analyze EOB and SOL overlap. Use G-Sum values to support the analysis.
  * Throttle roll-on: SOT(10%), COT(50%), EOT(90%) timing and total_tps_g_s (total acceleration), max_accel_x_g (peak acceleration G). Earlier SOT = faster corner exit acceleration.
  * G-Dip analysis: Entry phase G-Sum minimum (g_dip_value) and ratio (g_dip_ratio). Closer to 1.0 = smoother friction circle transition. Explain to the rider as "tire friction limit transition efficiency."
  * Coasting penalty: Coasting time (cst_total_time_s) and speed loss (cst_speed_loss_kph). More coasting = wasted time.
  * Brake jerk: Max jerk (max_brake_jerk_g_per_s) and initial mean jerk (mean_brake_jerk_g_per_s). Higher jerk = more aggressive braking. Explain to the rider as "how quickly/hard the brake is grabbed."
- Coaching points: At the end of each corner, provide 1-2 specific actionable corrections using distance (m) (e.g., "Delay braking onset by 5m and increase initial lever pressure to shorten the braking zone").

4. Top 3 Improvement Points
- Summarize the top 3 priorities that will most reduce lap time. Include root causes and specific action plans.

5. Positive Feedback
- If the comparison lap shows better metrics than the reference in any area (e.g., better exit acceleration, more concise turn-in), praise it and explain why to boost rider confidence.

### [Tone and Style]
- Maintain a professional, clear, and decisive tone while being encouraging.
- Cut unnecessary filler — focus on data-backed facts.
- Always **bold** key numbers.
- When using technical terms, always include a simple explanation for beginners.
- Write in English.`;
  }

  return `너는 월드 챔피언십(MotoGP, WSBK) 수준의 전문 모터사이클 레이싱 코치야.
라이더의 트랙 주행 데이터(텔레메트리 데이터)를 분석하여, 랩 타임 차이가 발생하는 원인을 정확히 짚어내고 실질적이고 구체적인 개선점(Coaching Point)을 제시하는 것이 너의 역할이야. 다만, 라이더는 초보이니, 최대한 전문용어 사용을 자제하고 쉽게 설명해줘.

내가 제공하는 데이터는 두 개의 랩(기준 랩과 비교 랩)에 대한 요약 JSON 데이터야.
데이터는 브레이킹(BRK), 코너링(CRN), 스로틀(TPS), 코스팅(CST) 시간과 비율, 그리고 코너별 상세 프로필(진입/최소/탈출 속도, 누적 감속량에 따른 브레이킹 프로파일 SOB/COB/EOB, 누적 기울기에 따른 린 프로파일 SOL/COL/EOL, 스로틀 전개 SOT/COT/EOT 등)을 포함하고 있어.

각 코너에는 "curves" 배열이 포함될 수 있어 — 코너 구간의 샘플링된 시계열 데이터로, 키는: d(거리 km), rs/as(기준/비교 속도 kph), rlg/alg(기준/비교 종방향 G), rlag/alag(기준/비교 횡방향 G), rgs/ags(기준/비교 G-Sum)이야. 이 커브 데이터를 활용해서 코너 내 어느 지점(거리)에서 속도 차이가 발생하는지, G-force 전환이 어떻게 이루어지는지, 라이더가 마찰원을 얼마나 매끄럽게 활용하는지를 분석해줘. 구체적인 거리 기반 관찰을 근거로 제시할 것.

해당 값들을 단순히 나열하는 게 아니라, 값이 의미하는 결과와, 어떤 행동으로 이를 극복할 수 있을지를 표현해야 해.

브레이킹, 코너링, 스로틀, 코스팅 시간을 비교할 땐 시간보다는 거리(m)를 알려줘. 예를 들면, 브레이크를 너무 일찍 잡았다면 "몇 m 뒤에서 잡으세요"라고 알려주면 돼.

G Sum 값은 "타이어 마찰 한계점"이라고 표기해줘. G Sum 최대값을 비교해주고, G Sum이 낮다면 타이어 그립력에 여유가 있다고 표현해. 그리고 그 값이 G Sum이라고 가르치고 G Sum 정보를 알려줘.

코스팅은 "가속도, 감속도, 코너링도 안 한 구간"이라고 표현해줘.

다음의 분석 규칙을 엄격하게 준수하여 마크다운(Markdown) 형식의 체계적인 보고서를 작성해줘.

### [분석 규칙 및 가이드라인]

1. 세션 개요
- 두 랩의 총 랩 타임 차이를 소수점 셋째 자리까지 명시하고, 비교 랩이 기준 랩보다 얼마나 느린지(또는 빠른지) 한 문장으로 핵심을 요약하라.

2. 랩 구성 분석 (Lap Metrics)
- BRK, CRN, TPS, CST의 초(s)와 비율(%), 거리(m) 차이를 표 형식으로 구성하라.
- 이 비율의 차이가 랩 타임에 어떤 영향을 미쳤는지 코치로서 직관적으로 해석하라.
  (예: "브레이킹 시간이 길어졌으나 브레이킹 G가 낮다면, 브레이크를 너무 약하고 길게 끌고 간 것이다.")

3. 코너별 상세 분석 (가장 많은 시간차가 발생한 코너 순)
- 각 코너마다 다음 항목을 반드시 비교 및 분석하라.
  * 속도 프로파일: 진입 속도, 최소 속도(Apex 코너스피드), 탈출 속도. (어디서 속도를 잃었는가?)
  * 브레이킹 기법: SOB(10%), COB(50%), EOB(90%) 시점 및 \`total_brk_g_s\`(총 감속량), \`min_accel_x_g\`(최대 제동력). COB가 EOB에 가까우면 "트레일 브레이킹(후반 집중)" 패턴, SOB에 가까우면 "하드-얼리 브레이킹(초반 집중)" 패턴으로 해석할 것. EOB끼리 비교하고, APEX 거리와도 비교해서 브레이킹이 너무 빨리 끝났는지를 판단. 브레이킹 포인트를 늦춰야 할지, 트레일 브레이킹을 더 가져가야 할지 판단해줘.
  * 린 프로파일: SOL, COL, EOL 시점 및 최대 린 각도(\`max_lean_deg\`). 린 각도가 과도한데 횡축 G(lat_g)가 낮다면 린 앵글을 비효율적으로 사용했다고 지적할 것. G Sum 값을 같이 활용해서, 트레일 브레이킹과 연동해서 기울기를 어떻게 가져가야 할지 판단. 린 앵글을 기반으로 어프로치 속도를 어떻게 가져갈지 판단해줘.
  * 트레일 브레이킹 오버랩: EOB와 SOL의 겹침 분석. G Sum 값을 기반으로 판단해줘.
  * 스로틀 전개: SOT(10%), COT(50%), EOT(90%) 시점 및 \`total_tps_g_s\`(총 가속량), \`max_accel_x_g\`(최대 가속 G). SOT가 빠를수록 코너 탈출 가속이 빠름.
  * G-Dip 분석: 진입 구간 G-Sum 최저점(\`g_dip_value\`)과 비율(\`g_dip_ratio\`). 1.0에 가까울수록 마찰원 전환이 매끄러움. 라이더에게는 "타이어 마찰 한계점 전환 효율"로 설명.
  * 코스팅 페널티: 코스팅 시간(\`cst_total_time_s\`)과 속도 손실(\`cst_speed_loss_kph\`). 코스팅이 길면 시간 낭비.
  * 브레이크 저크: 최대 저크(\`max_brake_jerk_g_per_s\`)와 초기 평균 저크(\`mean_brake_jerk_g_per_s\`). 저크가 높으면 공격적 브레이킹. 라이더에게는 "브레이크를 잡는 속도/세기"로 설명.
- 코칭 포인트: 각 코너 끝에 해당 라이더가 즉시 실험해볼 수 있는 구체적인 행동 교정 방법(예: "브레이킹 시작을 5m 늦추고, 초기 악력을 강하게 가져가 브레이킹 구간을 단축하세요")을 1-2개 제시하라. 거리(m) 기반으로 설명할 것.

4. 핵심 개선 포인트 (Top 3)
- 랩 타임을 가장 크게 단축할 수 있는 우선순위 3가지를 정리하라. 근본적인 원인과 구체적인 액션 플랜을 포함하라.

5. 잘한 점 (Positive Feedback)
- 비교 랩에서 기준 랩보다 더 나은 지표(예: 특정 코너의 탈출 가속이 더 좋음, 턴인이 더 간결함)를 보인 구간이 있다면 반드시 칭찬하고 그 이유를 설명해 라이더의 자신감을 높여라.

### [어조 및 스타일]
- 전문가다운 명확하고 단호한 어조를 유지하되, 라이더를 격려하는 긍정적인 태도를 취하라.
- 불필요한 미사여구를 빼고 데이터에 근거한 팩트에 집중하라.
- 수치는 반드시 굵은 글씨(**bold**)로 강조하라.
- 라이더가 초보임을 기억하고, 전문용어를 쓸 때 반드시 쉬운 설명을 병기하라.`;
}

// ─── Corner Time-Series Sampling ───

const SAMPLES_PER_CORNER = 20;

function sampleCornerCurves(
  points: AnalysisPoint[],
  startDist: number,
  endDist: number,
): object[] | null {
  const slice = points.filter(p => p.distance >= startDist && p.distance <= endDist);
  if (slice.length < 3) return null;

  // Evenly sample ~SAMPLES_PER_CORNER points
  const step = Math.max(1, Math.floor(slice.length / SAMPLES_PER_CORNER));
  const sampled: object[] = [];
  for (let i = 0; i < slice.length; i += step) {
    const p = slice[i];
    sampled.push({
      d: round3(p.distance)!,
      rs: round1(p.refSpeed),
      as: round1(p.anaSpeed),
      rlg: round2(p.refLonG),
      alg: round2(p.anaLonG),
      rlag: round2(p.refLatG),
      alag: round2(p.anaLatG),
      rgs: round2(p.refGSum),
      ags: round2(p.anaGSum),
    });
    if (sampled.length >= SAMPLES_PER_CORNER) break;
  }
  // Always include last point
  const last = slice[slice.length - 1];
  if (sampled.length > 0 && sampled[sampled.length - 1] !== last) {
    sampled.push({
      d: round3(last.distance)!,
      rs: round1(last.refSpeed),
      as: round1(last.anaSpeed),
      rlg: round2(last.refLonG),
      alg: round2(last.anaLonG),
      rlag: round2(last.refLatG),
      alag: round2(last.anaLatG),
      rgs: round2(last.refGSum),
      ags: round2(last.anaGSum),
    });
  }
  return sampled;
}

function buildDataPayload(rd: ReportData): object {
  // Build lap metrics comparison
  const lapMetrics = rd.refMetrics && rd.anaMetrics ? {
    ref: formatLapMetrics(rd.refMetrics),
    ana: formatLapMetrics(rd.anaMetrics),
  } : null;

  // Sort corners by |time_delta_s| descending (biggest time losses first)
  const sortedCorners = [...rd.corners].sort(
    (a, b) => Math.abs(b.time_delta_s) - Math.abs(a.time_delta_s),
  );

  // Build corner range lookup for chart sampling
  const rangeMap = new Map<number, CornerRange>();
  for (const cr of rd.cornerRanges ?? []) {
    rangeMap.set(cr.id, cr);
  }

  return {
    session: {
      venue: rd.venue,
      vehicle: rd.vehicle,
      date: rd.date,
      ref_lap: { index: rd.refLapIndex, time_s: round3(rd.refLapTime) },
      ana_lap: { index: rd.anaLapIndex, time_s: round3(rd.anaLapTime) },
      time_diff_s: round3(rd.timeDiff),
    },
    lap_metrics: lapMetrics,
    corners: sortedCorners.map(cc => {
      const entry: Record<string, unknown> = {
        name: cc.name,
        direction: cc.direction,
        time_delta_s: round3(cc.time_delta_s),
        ref_speed: formatSpeeds(cc.ref),
        ana_speed: formatSpeeds(cc.ana),
        ref_max_lat_g: round2(cc.ref.metrics.max_lat_g),
        ana_max_lat_g: round2(cc.ana.metrics.max_lat_g),
      };

      if (cc.ref.braking || cc.ana.braking) {
        entry.ref_braking = cc.ref.braking ?? null;
        entry.ana_braking = cc.ana.braking ?? null;
      }

      if (cc.ref.lean || cc.ana.lean) {
        entry.ref_lean = cc.ref.lean ?? null;
        entry.ana_lean = cc.ana.lean ?? null;
      }

      if (cc.ref.throttle || cc.ana.throttle) {
        entry.ref_throttle = cc.ref.throttle ?? null;
        entry.ana_throttle = cc.ana.throttle ?? null;
      }

      if (cc.ref.g_dip || cc.ana.g_dip) {
        entry.ref_g_dip = cc.ref.g_dip ?? null;
        entry.ana_g_dip = cc.ana.g_dip ?? null;
      }

      if (cc.ref.coasting || cc.ana.coasting) {
        entry.ref_coasting = cc.ref.coasting ?? null;
        entry.ana_coasting = cc.ana.coasting ?? null;
      }

      if (cc.ref.brake_jerk || cc.ana.brake_jerk) {
        entry.ref_brake_jerk = cc.ref.brake_jerk ?? null;
        entry.ana_brake_jerk = cc.ana.brake_jerk ?? null;
      }

      if (cc.braking_phase_duration_s != null)
        entry.braking_phase_s = round3(cc.braking_phase_duration_s);
      if (cc.lean_phase_duration_s != null)
        entry.lean_phase_s = round3(cc.lean_phase_duration_s);
      if (cc.trail_braking_overlap_s != null)
        entry.trail_braking_overlap_s = round3(cc.trail_braking_overlap_s);

      // Add sampled chart curves for this corner
      const range = rangeMap.get(cc.id);
      if (range && rd.analysisPoints?.length) {
        const curves = sampleCornerCurves(rd.analysisPoints, range.startDist, range.endDist);
        if (curves) entry.curves = curves;
      }

      return entry;
    }),
  };
}

function formatLapMetrics(m: LapMetrics) {
  return {
    brk: { time_s: round2(m.brk_time_s), pct: round1(m.brk_pct * 100), dist_m: round0(m.brk_dist_m) },
    crn: { time_s: round2(m.crn_time_s), pct: round1(m.crn_pct * 100), dist_m: round0(m.crn_dist_m) },
    tps: { time_s: round2(m.tps_time_s), pct: round1(m.tps_pct * 100), dist_m: round0(m.tps_dist_m) },
    cst: { time_s: round2(m.cst_time_s), pct: round1(m.cst_pct * 100), dist_m: round0(m.cst_dist_m) },
    max_g_sum: round2(m.max_g_sum),
    mean_g_sum: round2(m.mean_g_sum),
  };
}

function formatSpeeds(c: ReportCorner) {
  return {
    entry_kph: round1(c.metrics.entry_speed),
    min_kph: round1(c.metrics.min_speed),
    exit_kph: round1(c.metrics.exit_speed),
  };
}

function buildOutputInstructions(rd: ReportData, lang: 'ko' | 'en'): string {
  const cornerNames = rd.corners.map(c => c.name).join(', ');

  if (lang === 'en') {
    return `Analyze the JSON data above and write a systematic markdown report following the analysis rules in your system instructions.

Use the title: # ${rd.venue} Lap Comparison Analysis

Corners in this session: ${cornerNames}

Rules:
- Use corner names listed above.
- **Bold** important numbers.
- Mix comparison tables with narrative descriptions.
- If braking/lean data is null for a corner, omit those items.
- For corners without driving data, only compare speeds.`;
  }

  return `위 JSON 데이터를 분석하여 시스템 지시의 분석 규칙에 따라 체계적인 마크다운 리포트를 작성하세요.

제목: # ${rd.venue} 랩 비교 분석

이 세션의 코너들: ${cornerNames}

규칙:
- 위에 나열된 코너 이름을 사용합니다.
- 중요 수치는 **볼드**로 강조합니다.
- 비교 테이블과 서술을 적절히 혼합합니다.
- 코너 분석에서 braking/lean 데이터가 null이면 해당 항목은 생략합니다.
- driving 데이터가 없는 코너는 속도 비교만 합니다.`;
}

export function buildReportPrompt(
  rd: ReportData,
  lang: 'ko' | 'en' = 'ko',
): { system: string; user: string } {
  const system = buildSystemInstruction(lang);
  const data = buildDataPayload(rd);
  const instructions = buildOutputInstructions(rd, lang);

  const headerLabel = lang === 'en' ? 'Telemetry Data' : '텔레메트리 데이터';
  const requestLabel = lang === 'en' ? 'Analysis Request' : '분석 요청';

  const user = `## ${headerLabel}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\`

## ${requestLabel}

${instructions}`;

  return { system, user };
}

// ─── API Call ───

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export async function generateReport(
  prompt: { system: string; user: string } | string,
  signal?: AbortSignal,
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('VITE_GEMINI_API_KEY not configured in .env');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  // Support both old string prompt and new structured prompt
  const isStructured = typeof prompt !== 'string';
  const systemText = isStructured ? prompt.system : undefined;
  const userText = isStructured ? prompt.user : prompt;

  const body: Record<string, unknown> = {
    contents: [{ parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 65536 },
  };

  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err}`);
  }

  const result = await resp.json();
  const parts = result.candidates?.[0]?.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('Gemini returned empty response');
  }
  // Gemini 2.5 models may return thinking parts before the actual text.
  // Find the last non-thought part with text content.
  const textPart = [...parts].reverse().find((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
    ?? parts.find((p: { text?: string }) => p.text);
  if (!textPart?.text) {
    throw new Error('Gemini returned no text content');
  }
  return textPart.text;
}

// ─── Helpers ───

function round0(v: number | undefined | null): number | null {
  return v != null ? Math.round(v) : null;
}
function round1(v: number | undefined | null): number | null {
  return v != null ? Math.round(v * 10) / 10 : null;
}
function round2(v: number | undefined | null): number | null {
  return v != null ? Math.round(v * 100) / 100 : null;
}
function round3(v: number | undefined | null): number | null {
  return v != null ? Math.round(v * 1000) / 1000 : null;
}
