/*************************************************************
 * Points.gs — 운동 포인트 · 뱃지 · 선물 교환 (보상 시스템)
 *
 *  흐름
 *   ① 매일 밤(1시) pointsNightly 트리거가 최근 7일 기록을 다시 판정해 '포인트' 탭(원장)에 하루 한 줄씩 씀
 *      (7일을 다시 보는 까닭: 선생님이 자전거·마이후쉬 기록을 며칠 뒤에 넣어도 완벽 도장 포인트가 들어가게)
 *   ② 선생님이 '선물교환' 탭에 학년·반·번호·선물만 적으면 → 이름·이메일·포인트를 채우고 남은 포인트에서 뺌
 *   ③ 화면(내 도장·우리 모둠)은 원장을 더하기만 함 → 느려지지 않음. 오늘 것은 '예정'으로 보여 주고 밤에 확정
 *
 *  포인트 = 누적(+만 더함, 줄지 않음 → 뱃지 기준) / 남은 포인트 = (체력 누적 − 선물로 쓴 것) + 수학 남은  (2026-11-13 지갑 하나로)
 *  숫자는 '포인트규칙' 탭에서 고침(없으면 처음 부를 때 기본값으로 만듦). 고친 뒤 rebuildPoints() 한 번 실행하면 지난 것도 새 규칙으로 다시 계산
 *  시작일 2026-10-19 (스마트스포츠 시스템을 쓰기 시작한 무렵)
 *
 *  탭 (setupPoints()가 만듦)
 *   포인트     : A 날짜 · B 학년 · C 반 · D 번호 · E 이름 · F 이메일 · G 종목P · H 도장P · I 모둠P · J 연속P · K 경신P · L 자세P · M 합계
 *                · N 도장(0/90/100) · O 모둠도장 · P 연속일수 · Q 경신수 · R 자세수 · S 내용
 *   포인트규칙 : A 항목 · B 포인트 · C 설명
 *   선물목록   : A 선물 · B 필요 포인트 · C 메모 · D 모둠 선물(O) — O면 모둠원 모두의 남은 포인트에서 똑같이 나눠 뺌
 *   선물교환   : A 날짜 · B 학년 · C 반 · D 번호 · E 이름 · F 이메일 · G 선물 · H 포인트  (선생님만 적음)
 *   포인트현황 : 학생별 누적·사용·남은 포인트·뱃지 수 (밤마다 새로 씀, 선생님 확인용)
 *************************************************************/
const POINT = {
  FROM: '2026-10-19',          // 이날 기록부터 포인트 (시스템을 쓰기 시작한 날)
  REDO_DAYS: 7,                // 밤마다 다시 계산하는 최근 날 수
  LEDGER: '포인트', RULES: '포인트규칙', GIFTS: '선물목록', TRADE: '선물교환', REPORT: '포인트현황',
  ACC_MIN_COUNT: 20,           // 바른 자세 포인트: 그날 그 종목을 이만큼 이상 했을 때만 (횟수 종목)
  ACC_MIN_SEC: 60,             //   플랭크는 전체 시간(초)
  BIKE_FROM: '2026-11-01',     // '자전거 추가 1km' 포인트를 주기 시작하는 날
  BIKE_ALL_FROM: '2026-11-22', // 이날부터 실내자전거는 통과 거리(7km) 이상이면 '탄 거리 전체' × '자전거 1km'(0.5) = 7km 3점 (종목 통과 1P·자전거 추가 1km 대신, 2026-11-22 선생님 결정)
  ROPE_FROM: '2026-11-01',     // 줄넘기: 이날부터 '종목 통과' 대신 '줄넘기 100회' (그 전 날은 통과 1P 그대로)
  COUNT_FROM: '2026-11-16',    // 이날부터 횟수 종목은 '그날 횟수 합 ≥ 기준'이면 종목 통과 + 기준만큼 더 할 때마다 '추가 횟수' (Stamp.gs STAMP_COUNT_FROM). 스쿼트 20회·줄넘기 100회 규칙은 그 전 날만
  ROPE_PER: 100,               // 줄넘기: 그날 줄넘기 앱('줄넘기' 탭 H열) 횟수 합 이만큼마다 '줄넘기 100회' 포인트
  CARDIO_FROM: '2026-11-10',   // 트레드밀·로잉머신: 이날부터 통과 시간(통과기준 탭, 2분)을 넘은 1분마다 '트레드밀·로잉 추가 1분' 포인트
  SQUAT_PER: 20,               // 스쿼트: 그날 정확한 횟수(H열) 합 이만큼마다 '스쿼트 20회' 포인트. 스쿼트는 '종목 통과' 포인트 없음 (2026-10-29)
  GROUP_FROM: '2026-11-01',    // 이날부터 모둠 도장·완벽 모둠 도장은 '포인트규칙' 탭 숫자(10·20), 그 전 날은 아래 옛 점수
  GROUP_OLD: 5, GROUP_PERFECT_OLD: 5,
  MRUN_FROM: '2026-11-02',     // 아침달리기 포인트를 주기 시작하는 날 (기록 시작일)
  MRUN_CYCLE: 5,               // 아침달리기 연속: 5일째 다음 날은 다시 1일째 (3·4·5일째에 포인트)
  CACHE_SEC: 600               // 화면용 합계 캐시 (선물 교환은 10분 안에 화면에 반영)
};
/* 기본 규칙 [항목, 포인트, 설명] — 탭에서 숫자만 고치면 됨. 항목 이름은 바꾸지 않음 */
const POINT_RULES = [
  ['종목 통과', 1, '통과기준 이상 한 종목마다 (하루 종목당 한 번, 스쿼트는 빼고 아래 20회 규칙으로)'],
  ['스쿼트 20회', 1, '스쿼트 정확한 횟수를 하루 합해 20회마다 (예: 20회×3세트 = 3점, 종목P에 더함)'],
  ['추가 횟수', 1, '횟수 종목에서 통과 기준만큼 더 할 때마다 (예: 스쿼트 기준 10회 → 35회 = 통과 1 + 추가 2, 11월 16일부터)'],
  ['줄넘기 100회', 1, '줄넘기 앱으로 뛴 횟수를 하루 합해 100회마다 (예: 1분 120회 + 30초 60회 = 1점, 종목P에 더함, 11월 1일부터)'],
  ['자전거 1km', 0.5, '실내자전거 그날 통과 거리(7km = 완벽 도장 조건, 1·2학년 1km) 이상이면 탄 거리 1km마다, 소수점 버림, 최소 1점, 11월 22일부터 (예: 7km = 3점, 10km = 5점, 20km = 10점, 종목P에 더함)'],
  ['자전거 추가 1km', 0.5, '(11월 21일까지) 실내자전거 그날 통과 거리(7km, 11월 8일까지 5km, 1·2학년 1km)를 넘은 1km마다 + 통과 1점(11월 16일부터)'],
  ['트레드밀·로잉 추가 1분', 1, '트레드밀·로잉머신 각각 그날 가장 긴 기록이 통과 시간(2분)을 넘은 1분마다 (예: 5분 = 3점, 종목P에 더함, 11월 10일부터)'],
  ['하루 도장', 10, '그날 해야 할 종목을 모두 통과'],
  ['완벽 도장', 5, '하루 도장 + 실내자전거, 휴일은 하루 도장만으로 (하루 도장에 더해서)'],
  ['모둠 도장', 10, '모둠원 모두 도장 (모둠원 각자에게)'],
  ['완벽 모둠 도장', 20, '모둠원 모두 완벽 도장 (모둠 도장에 더해서)'],
  ['연속 3일', 5, '도장 연속 3일째 되는 날'],
  ['연속 5일마다', 10, '도장 연속 5·10·15…일째 되는 날 (2026-11-09, 예전 연속 7일마다 15점)'],
  ['기록 경신', 2, '전날까지의 내 최고 기록을 넘은 종목마다 (처음 한 종목은 제외)'],
  ['기록 경신 하루 최대', 3, '하루에 경신 포인트를 받는 종목 수'],
  ['바른 자세', 1, '그날 정확도가 기준 이상인 카메라 종목마다 (20회·60초 이상 했을 때)'],
  ['바른 자세 기준(%)', 80, ''],
  // 아침달리기(운동장 NFC 기록대, MorningRun.gs) — 2026-11-03 선생님 결정. 도장과는 따로
  ['아침달리기 참여', 5, '아침달리기(운동장 5바퀴)를 한 날 (하루 한 번)'],
  ['아침달리기 기록 경신', 5, '전날까지 내 가장 빠른 기록보다 빨리 달린 날 (첫 기록은 빼고, 하루 최대 개수와 따로)'],
  ['아침달리기 연속 3일', 5, '아침달리기 연속 3일째 (주말·휴일은 건너뛰고 셈, 5일째 다음 날은 다시 1일째)'],
  ['아침달리기 연속 4일', 7, '아침달리기 연속 4일째'],
  ['아침달리기 연속 5일', 10, '아침달리기 연속 5일째']
];
/* 뱃지: 원장 숫자로 자동. what = 무엇을 세는지 */
const POINT_BADGES = [
  { id: 'st1',  icon: '🌱', name: '첫 도장',      what: 'stamp',   n: 1 },
  { id: 'st10', icon: '🥉', name: '도장 10개',    what: 'stamp',   n: 10 },
  { id: 'st30', icon: '🥈', name: '도장 30개',    what: 'stamp',   n: 30 },
  { id: 'st50', icon: '🥇', name: '도장 50개',    what: 'stamp',   n: 50 },
  { id: 'pf1',  icon: '⭐', name: '첫 완벽 도장', what: 'perfect', n: 1 },
  { id: 'pf10', icon: '🌟', name: '완벽 도장 10개', what: 'perfect', n: 10 },
  { id: 'sk3',  icon: '🔥', name: '3일 연속',     what: 'streak',  n: 3 },
  { id: 'sk7',  icon: '🔥', name: '7일 연속',     what: 'streak',  n: 7 },
  { id: 'sk14', icon: '💪', name: '14일 연속',    what: 'streak',  n: 14 },
  { id: 'sk30', icon: '🏆', name: '30일 연속',    what: 'streak',  n: 30 },
  { id: 'gp1',  icon: '🤝', name: '첫 모둠 도장', what: 'group',   n: 1 },
  { id: 'gp10', icon: '👑', name: '모둠 도장 10개', what: 'group', n: 10 },
  { id: 'pb10', icon: '📈', name: '기록 경신 10번', what: 'pb',    n: 10 },
  { id: 'pb50', icon: '🚀', name: '기록 경신 50번', what: 'pb',    n: 50 },
  { id: 'ac30', icon: '🎯', name: '바른 자세 30번', what: 'acc',   n: 30 },
  { id: 'ac100', icon: '🏹', name: '바른 자세 100번', what: 'acc', n: 100 },
  { id: 'pt100', icon: '💎', name: '100포인트',   what: 'earned',  n: 100 },
  { id: 'pt500', icon: '💠', name: '500포인트',   what: 'earned',  n: 500 },
  { id: 'pt1000', icon: '🌈', name: '1000포인트', what: 'earned',  n: 1000 }
];
const POINT_HEAD = ['날짜', '학년', '반', '번호', '이름', '이메일', '종목P', '도장P', '모둠P', '연속P', '경신P', '자세P', '합계',
  '도장', '모둠도장', '연속일수', '경신수', '자세수', '내용'];

/* ===== 규칙 읽기 ===== */
function pointRules_(ss) {
  const c = CacheService.getScriptCache(), hit = c.get('prule6');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const out = {}; POINT_RULES.forEach(r => out[r[0]] = r[1]);
  let sh = ss.getSheetByName(POINT.RULES);
  if (!sh) {
    try {
      sh = ss.insertSheet(POINT.RULES);
      sh.getRange(1, 1, 1, 3).setValues([['항목', '포인트', '설명']]).setFontWeight('bold');
      sh.getRange(2, 1, POINT_RULES.length, 3).setValues(POINT_RULES);
      sh.setFrozenRows(1); sh.setColumnWidth(1, 160); sh.setColumnWidth(3, 420);
    } catch (e) {}
  } else {
    const seen = new Set();
    sh.getDataRange().getValues().slice(1).forEach(r => {
      const k = String(r[0]).trim(), v = Number(r[1]); seen.add(k);
      if (k in out && String(r[1]).trim() !== '' && isFinite(v) && v >= 0) out[k] = v;
    });
    POINT_RULES.filter(r => !seen.has(r[0])).forEach(r => { try { sh.appendRow(r); } catch (e) {} });   // 새로 생긴 규칙은 탭 아래에 추가
  }
  try { c.put('prule6', JSON.stringify(out), 60); } catch (e) {}
  return out;
}

/* ===== 계산: 모든 학생 × 날짜 → 원장 줄 ===== */
/** from~to(yyyy-MM-dd) 원장 줄을 계산해 돌려줌. 연속·기록 경신 판정을 위해 기록은 2026-09-01부터 모두 읽음
 *  only(Set): 이 아이디들만 계산 (내 도장 '오늘 예정'을 바로 셀 때 = 학생 + 모둠원, 2026-11-15) */
function pointCompute_(ss, from, to, only) {
  const R = pointRules_(ss);
  const roster = only ? stampRoster_(ss) : stampRosterRead_(ss);   // 밤 계산은 캐시 말고 시트에서 새로
  const staff = pointStaffIds_(ss);
  const today = stampFmt_(new Date(), 'yyyy-MM-dd');
  const dayOf = v => v instanceof Date ? stampFmt_(v, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const timeCol = {}; STAMP_EX.forEach(ex => timeCol[ex.key] = ex.time);
  const countCol = {}; STAMP_EX.forEach(ex => { if (ex.count != null) countCol[ex.key] = ex.count; });

  // 1) 종목 탭을 한 번씩 읽기: 측정시간 최고(도장) · 날짜별 최고 기록(경신) · 정확도 합(자세)
  const best = {};          // id → 날짜 → 종목 → 최고 측정시간
  const val = {};           // id|종목|조건 → 날짜 → 그날 최고 기록
  const acc = {};           // id → 날짜 → 종목 → { g, t }
  const sq = {};            // id → 날짜 → 스쿼트 정확한 횟수 합
  const rp = {};            // id → 날짜 → 줄넘기 앱 횟수 합
  DASH_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet); if (!sh) return;
    const n = sh.getLastRow() - 1; if (n < 1) return;
    sh.getRange(2, 1, n, sh.getLastColumn()).getValues().forEach(r => {
      const id = stampIdOf_(r[ex.email]); if (!id || !roster.byId[id] || staff.has(id) || (only && !only.has(id))) return;
      const d = dayOf(r[0]); if (!d || d < '2026-09-01' || d > to) return;
      if (timeCol[ex.key] != null) {
        const b = ((best[id] = best[id] || {})[d] = (best[id][d] || {}));
        b[ex.key] = Math.max(b[ex.key] || 0, num(r[timeCol[ex.key]]));
        if (countCol[ex.key] != null) b[ex.key + '#n'] = (b[ex.key + '#n'] || 0) + num(r[countCol[ex.key]]);   // 횟수 종목: 그날 횟수 합 (Stamp.gs와 같게)
      }
      if (!ex.noPb) {
        const k = id + '|' + ex.key + '|' + (ex.pbBy == null ? '' : r[ex.pbBy]), v = num(r[ex.value]);
        if (v > 0) { const m = val[k] = val[k] || {}; m[d] = Math.max(m[d] || 0, v); }
      }
      if (ex.key === 'jumprope') { const q = rp[id] = rp[id] || {}; q[d] = (q[d] || 0) + num(r[7]); }
      if (ex.key === 'squat') {
        const q = sq[id] = sq[id] || {}; q[d] = (q[d] || 0) + num(r[7]);
      }
      if (ex.acc) {
        const g = num(r[ex.acc.good]);
        const t = ex.acc.total != null ? num(r[ex.acc.total]) : g + ex.acc.bad.reduce((s, c) => s + num(r[c]), 0);
        const a = ((acc[id] = acc[id] || {})[d] = (acc[id][d] || {}));
        const x = a[ex.key] = a[ex.key] || { g: 0, t: 0, sec: ex.acc.total != null };
        x.g += g; x.t += t;
      }
    });
  });

  // 1-2) 아침달리기: id → 날짜 → 그날 가장 빠른 기록(초)
  const mr = {};
  morningRunRows_().forEach(r => {                            // MorningRun.gs
    if (!roster.byId[r.id] || staff.has(r.id) || (only && !only.has(r.id)) || r.d < POINT.MRUN_FROM || r.d > to) return;
    const m = mr[r.id] = mr[r.id] || {};
    m[r.d] = m[r.d] ? Math.min(m[r.d], r.sec) : r.sec;
  });

  // 2) 기록 경신: 조건(측정시간·방식)별로 날짜 순서대로 '전날까지 최고'와 비교
  const pbs = {};           // id → 날짜 → [종목 이름…]
  const exName = {}; DASH_EX.forEach(ex => exName[ex.key] = ex.name);
  Object.keys(val).forEach(k => {
    const [id, key] = k.split('|'), m = val[k];
    let top = null;
    Object.keys(m).sort().forEach(d => {
      if (top != null && m[d] > top) {
        const list = ((pbs[id] = pbs[id] || {})[d] = (pbs[id][d] || []));
        if (!list.includes(exName[key])) list.push(exName[key]);
      }
      top = top == null ? m[d] : Math.max(top, m[d]);
    });
  });

  // 3) 도장 판정 (Stamp.gs 엔진 그대로) · 모둠 도장 · 연속
  const ctx = { now: new Date(), today, hour: 23, crit: stampCriteria_(ss), holi: stampHolidays_(ss), absent: stampAbsent_(ss, roster), best, bike: stampReadAllRide_(roster), grade: {} };
  roster.list.forEach(st => ctx.grade[st.id] = st.grade);
  const days = [];
  for (let t = new Date('2026-09-01T12:00:00+09:00'); ; t = new Date(t.getTime() + 864e5)) {
    const d = stampFmt_(t, 'yyyy-MM-dd'); if (d > to) break; days.push(d);
  }
  const active = roster.list.filter(st => !staff.has(st.id) && (!only || only.has(st.id)) && (best[st.id] || ctx.bike[st.id] || mr[st.id]));
  const stampOf = {};       // id → 날짜 → 0/90/100
  const passOf = {};        // id → 날짜 → 통과 종목 수(주말 제외 없이 모든 종목, 스쿼트는 20회 규칙으로 따로)
  active.forEach(st => {
    const s = stampOf[st.id] = {}, p = passOf[st.id] = {};
    days.forEach(d => {
      if (!(best[st.id] && best[st.id][d]) && !(ctx.bike[st.id] && ctx.bike[st.id][d])) { s[d] = 0; p[d] = 0; return; }
      s[d] = stampJudge_(ctx, st.id, d).stamp;
      const b = (best[st.id] || {})[d] || {};
      p[d] = d >= POINT.COUNT_FROM                           // 11/16~: 모든 종목 통과(횟수 종목은 그날 횟수 합 ≥ 기준)
        ? STAMP_EX.filter(ex => !ex.bonus && stampExOn_(ex, d) && (stampByCount_(ex, d, ctx.crit) ? (b[ex.key + '#n'] || 0) >= ctx.crit[ex.key].countMin : (b[ex.key] || 0) >= ctx.crit[ex.key].min)).length
        : STAMP_EX.filter(ex => ex.key !== 'squat' && !ex.bonus && !(ex.key === 'jumprope' && d >= POINT.ROPE_FROM) && stampExOn_(ex, d) && (b[ex.key] || 0) >= ctx.crit[ex.key].min).length;
    });
  });
  const groupOf = {};       // gkey → 날짜 → 0/90/100
  const byG = {};
  roster.list.filter(st => st.gkey && !staff.has(st.id)).forEach(st => (byG[st.gkey] = byG[st.gkey] || []).push(st.id));
  if (only) Object.keys(byG).forEach(g => { if (!byG[g].some(id => only.has(id))) delete byG[g]; });   // 필요한 모둠만
  Object.keys(byG).forEach(g => {
    groupOf[g] = {};
    days.forEach(d => groupOf[g][d] = stampGroupFor_(byG[g], byG[g].map(id => (stampOf[id] || {})[d] || 0), d, ctx.absent));   // 결석 탭의 모둠원은 빼고
  });

  // 4) 줄 만들기
  const rows = [];
  const pbMax = R['기록 경신 하루 최대'], accPct = R['바른 자세 기준(%)'];
  active.forEach(st => {
    let streak = 0;
    let mrStreak = 0, mrBest = null;                          // 아침달리기 연속(학교 가는 날만) · 전날까지 가장 빠른 기록
    days.forEach(d => {
      const s = stampOf[st.id][d];
      if (s) streak++; else streak = 0;                       // 주말·휴일도 도장이 없으면 끊김 (Stamp.gs와 같게)
      // 아침달리기: 참여 · 경신(더 빨리) · 연속(주말·휴일은 건너뜀, 5일째 다음은 1일째)
      const mrSec = (mr[st.id] || {})[d] || 0;
      const off = Number(stampFmt_(new Date(d + 'T12:00:00+09:00'), 'u')) >= 6 || !!(ctx.holi || {})[d];
      if (mrSec) mrStreak = mrStreak % POINT.MRUN_CYCLE + 1; else if (!off) mrStreak = 0;
      const mrPb = !!mrSec && mrBest != null && mrSec < mrBest;
      if (mrSec) mrBest = mrBest == null ? mrSec : Math.min(mrBest, mrSec);
      if (d < from) return;
      const mrP = mrSec ? R['아침달리기 참여'] : 0;
      const mrPbP = mrPb ? R['아침달리기 기록 경신'] : 0;
      const mrSkP = !mrSec ? 0 : mrStreak === 3 ? R['아침달리기 연속 3일'] : mrStreak === 4 ? R['아침달리기 연속 4일'] : mrStreak === 5 ? R['아침달리기 연속 5일'] : 0;
      const pass = passOf[st.id][d];
      const g = st.gkey && !((ctx.absent || {})[d] || {})[st.id] ? groupOf[st.gkey][d] : 0;   // 결석한 날은 모둠 도장 포인트 없음
      const pbList = ((pbs[st.id] || {})[d] || []).slice(0, Math.max(0, pbMax));
      const accList = [];
      const a = (acc[st.id] || {})[d] || {};
      Object.keys(a).forEach(k => {
        const x = a[k];
        if (x.t >= (x.sec ? POINT.ACC_MIN_SEC : POINT.ACC_MIN_COUNT) && x.g / x.t * 100 >= accPct) accList.push(exName[k]);
      });
      const newCount = d >= POINT.COUNT_FROM;
      const sqN = (sq[st.id] || {})[d] || 0, sqP = newCount ? 0 : Math.floor(sqN / POINT.SQUAT_PER) * R['스쿼트 20회'];
      const rpN = (rp[st.id] || {})[d] || 0, rpP = newCount || d < POINT.ROPE_FROM ? 0 : Math.floor(rpN / POINT.ROPE_PER) * R['줄넘기 100회'];
      // 11/16~ 추가 횟수: 횟수 종목마다 기준만큼 더 한 번 수 × '추가 횟수'
      const exList = [];
      let exP = 0;
      if (newCount) STAMP_EX.filter(ex => !ex.bonus && stampByCount_(ex, d, ctx.crit) && stampExOn_(ex, d)).forEach(ex => {
        const n = (((best[st.id] || {})[d] || {})[ex.key + '#n']) || 0, cmin = ctx.crit[ex.key].countMin;
        const extra = cmin > 0 && n >= cmin ? Math.floor((n - cmin) / cmin + 1e-9) : 0;
        if (extra) { exP += extra * R['추가 횟수']; exList.push(`${ex.name} ${n}회 +${extra}`); }
      });
      const km = (ctx.bike[st.id] || {})[d] || 0;
      const bkP = pointBikeP_(km, stampBikeKm_(st.grade, d), d, R);   // 11/22~ 통과하면 탄 거리 전체 × 0.5 (그 전은 넘은 만큼)
      // 트레드밀·로잉머신(11/10~): 그날 가장 긴 기록이 통과 시간을 넘은 1분마다 (3분 = 1점, 5분 = 3점)
      const cdList = [];
      let cdP = 0;
      if (d >= POINT.CARDIO_FROM) ['treadmill', 'rowing'].forEach(k => {
        const sec = ((best[st.id] || {})[d] || {})[k] || 0, min = ctx.crit[k] ? ctx.crit[k].min : 120;
        const extra = sec >= min ? Math.floor((sec - min) / 60 + 1e-9) : 0;
        if (extra) { cdP += extra * R['트레드밀·로잉 추가 1분']; cdList.push(`${exName[k]} +${extra}분`); }
      });
      const bkPass = d >= POINT.COUNT_FROM && d < POINT.BIKE_ALL_FROM && km > 0 && km >= stampBikeKm_(st.grade, d) ? 1 : 0;   // 11/16~11/21 실내자전거 통과 1P (11/22부터는 bkP에 거리로 들어감)
      const pEx = (pass + bkPass) * R['종목 통과'] + sqP + rpP + exP + bkP + mrP + cdP;
      const pSt = s ? R['하루 도장'] + (s === 100 ? R['완벽 도장'] : 0) : 0;
      const gOld = d < POINT.GROUP_FROM;                        // 2026-11-01부터 모둠 도장 10·완벽 +20
      const pG = g ? (gOld ? POINT.GROUP_OLD : R['모둠 도장']) + (g === 100 ? (gOld ? POINT.GROUP_PERFECT_OLD : R['완벽 모둠 도장']) : 0) : 0;
      const pSk = (s ? (streak === 3 ? R['연속 3일'] : 0) + (streak % 5 === 0 ? R['연속 5일마다'] : 0) : 0) + mrSkP;
      const pPb = pbList.length * R['기록 경신'] + mrPbP;
      const pAc = accList.length * R['바른 자세'];
      const total = pEx + pSt + pG + pSk + pPb + pAc;
      if (!total) return;
      const memo = [pass + bkPass ? `종목 ${pass + bkPass}` : '', sqP ? `스쿼트 ${sqN}회 ${sqP}P` : '', rpP ? `줄넘기 ${rpN}회 ${rpP}P` : '', exP ? `추가: ${exList.join(' · ')} ${exP}P` : '', bkP ? `자전거 ${Math.round(km * 10) / 10}km ${bkP}P` : '', cdP ? `${cdList.join(' · ')} ${cdP}P` : '',
        mrSec ? `아침달리기 ${mrunFmt_(mrSec)}` + (mrPb ? ' 경신' : '') + (mrSkP ? ` 연속 ${mrStreak}일` : '') + ` ${mrP + mrPbP + mrSkP}P` : '', s === 100 ? '완벽 도장' : s ? '도장' : '', g === 100 ? '완벽 모둠 도장' : g ? '모둠 도장' : '',
        pSk - mrSkP ? `연속 ${streak}일` : '', pbList.length ? '경신: ' + pbList.join(', ') : '', accList.length ? '자세: ' + accList.join(', ') : '']
        .filter(Boolean).join(' · ');
      rows.push([d, st.grade, st.cls, st.no, st.name, st.id + SQUAT_CONFIG.DOMAIN, pEx, pSt, pG, pSk, pPb, pAc, total,
        s, g, s ? streak : 0, pbList.length + (mrPb ? 1 : 0), accList.length, memo]);
    });
  });
  rows.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  return rows;
}

/** 실내자전거 거리 포인트
 *  11/22~ : 통과 거리(7km, 1·2학년 1km) 이상이면 탄 거리 전체 × '자전거 1km'(0.5), 소수점 버림, 최소 1점 → 7km 3점 · 20km 10점
 *  11/1~11/21 : 통과 거리를 넘은 만큼 × '자전거 추가 1km' (통과 1점은 bkPass로 따로) */
function pointBikeP_(km, passKm, d, R) {
  if (d < POINT.BIKE_FROM || !(km > 0)) return 0;
  if (d >= POINT.BIKE_ALL_FROM) return km >= passKm ? Math.max(1, Math.floor(km * R['자전거 1km'] + 1e-9)) : 0;
  return Math.floor(Math.max(0, km - passKm) * R['자전거 추가 1km'] + 1e-9);
}

/** 학생명단 F열(구분)이 '교직원'인 아이디 → 포인트에서 뺌 */
function pointStaffIds_(ss) {
  const sh = ss.getSheetByName(SQUAT_CONFIG.ROSTER_SHEET), out = new Set();
  if (!sh) return out;
  sh.getDataRange().getDisplayValues().slice(1).forEach(r => {
    if (/교직원|교사/.test(String(r[5]))) out.add(stampIdOf_(r[SQUAT_CONFIG.ROSTER_EMAIL_COL - 1]));
  });
  return out;
}

/* ===== 원장 쓰기 ===== */
function pointLedger_(ss) {
  let sh = ss.getSheetByName(POINT.LEDGER);
  if (!sh) {
    sh = ss.insertSheet(POINT.LEDGER);
    sh.getRange(1, 1, 1, POINT_HEAD.length).setValues([POINT_HEAD]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');                  // 날짜를 글자로 (yyyy-MM-dd)
    sh.setColumnWidth(19, 420);
  }
  return sh;
}

/** from 이후 원장 줄을 지우고 새로 계산해 씀 (to = 어제) */
function pointWrite_(ss, from, to) {
  const sh = pointLedger_(ss);
  const rows = pointCompute_(ss, from, to);
  const last = sh.getLastRow();
  if (last > 1) {
    const ds = sh.getRange(2, 1, last - 1, 1).getValues().map(r => r[0] instanceof Date ? stampFmt_(r[0], 'yyyy-MM-dd') : String(r[0]).slice(0, 10));
    const keep = ds.filter(d => d && d < from).length;         // 날짜 순서로 쌓이므로 앞쪽만 남김
    if (last - 1 > keep) sh.deleteRows(2 + keep, last - 1 - keep);
  }
  if (rows.length) {
    const start = sh.getLastRow() + 1;
    sh.getRange(start, 1, rows.length, 1).setNumberFormat('@');
    sh.getRange(start, 1, rows.length, POINT_HEAD.length).setValues(rows);
  }
  return rows.length;
}

/** 밤마다 (트리거): 최근 7일 다시 계산 → 선물교환 정리 → 포인트현황 → 화면 캐시 비움 */
function pointsNightly() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getDocumentLock(); if (!lock.tryLock(30000)) return;
  try {
    const now = new Date(), yest = stampFmt_(new Date(now.getTime() - 864e5), 'yyyy-MM-dd');
    let from = stampFmt_(new Date(now.getTime() - POINT.REDO_DAYS * 864e5), 'yyyy-MM-dd');
    if (from < POINT.FROM) from = POINT.FROM;
    const n = pointWrite_(ss, from, yest);
    pointsReport_(ss);
    console.log(`포인트 ${from}~${yest}: ${n}줄`);
  } finally { lock.releaseLock(); }
}

/** 처음 한 번, 또는 규칙 숫자를 고친 뒤: 시작일(POINT.FROM)부터 어제까지 모두 다시 계산 (편집기에서 실행) */
function rebuildPoints() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), t0 = Date.now();
  CacheService.getScriptCache().remove('prule3');
  const yest = stampFmt_(new Date(Date.now() - 864e5), 'yyyy-MM-dd');
  const sh = pointLedger_(ss);
  if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);   // 시작일 전 줄까지 모두 지우고 새로
  const n = pointWrite_(ss, POINT.FROM, yest);
  pointsReport_(ss);
  Logger.log(`${POINT.FROM}~${yest} 다시 계산: ${n}줄, ${Math.round((Date.now() - t0) / 1000)}초`);
}

/** 한 번만 실행: 탭 만들기 + 밤 1시 트리거 + 10월부터 계산 */
function setupPoints() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  pointRules_(ss); pointLedger_(ss); pointGiftSheet_(ss); pointTradeSheet_(ss);
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pointsNightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pointsNightly').timeBased().atHour(1).everyDays(1).inTimezone(STAMP.TZ).create();
  rebuildPoints();
  Logger.log('포인트 탭과 밤 1시 트리거를 만들었어요. 선물목록 탭에 선물을 적어 주세요.');
}

/* ===== 선물 ===== */
function pointGiftSheet_(ss) {
  let sh = ss.getSheetByName(POINT.GIFTS);
  if (!sh) {
    sh = ss.insertSheet(POINT.GIFTS);
    sh.getRange(1, 1, 1, 4).setValues([['선물', '필요 포인트', '메모', '모둠 선물(O)']]).setFontWeight('bold');
    sh.getRange(2, 1, 3, 4).setValues([['(예) 칭찬 쿠폰', 50, '이 줄은 예시예요. 고치거나 지워 주세요', ''], ['(예) 자리 바꾸기', 150, '', ''], ['(예) 피자', 400, '모둠원이 나눠 냄', 'O']]);
    sh.setFrozenRows(1); sh.setColumnWidth(1, 200);
  } else if (!String(sh.getRange(1, 4).getValue()).trim()) {
    sh.getRange(1, 4).setValue('모둠 선물(O)').setFontWeight('bold');   // 예전 탭에 제목만 더함
  }
  return sh;
}
function pointTradeSheet_(ss) {
  let sh = ss.getSheetByName(POINT.TRADE);
  if (!sh) {
    sh = ss.insertSheet(POINT.TRADE);
    sh.getRange(1, 1, 1, 8).setValues([['날짜', '학년', '반', '번호', '이름', '이메일', '선물', '포인트']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@');
    sh.getRange(1, 10).setValue('← 학년·반·번호·선물만 적으면 이름·이메일·포인트는 밤에(또는 pointsReport 실행 시) 채워져요');
  }
  // 선물 칸: 선물목록에서 고르기
  try {
    const g = ss.getSheetByName(POINT.GIFTS);
    const rule = SpreadsheetApp.newDataValidation().requireValueInRange(g.getRange('A2:A200'), true).setAllowInvalid(true).build();
    sh.getRange('G2:G1000').setDataValidation(rule);
  } catch (e) {}
  return sh;
}
function pointGifts_(ss) {
  const sh = ss.getSheetByName(POINT.GIFTS); if (!sh) return [];
  return sh.getDataRange().getValues().slice(1)
    .filter(r => String(r[0]).trim() && isFinite(Number(r[1])) && Number(r[1]) > 0)
    .map(r => ({ name: String(r[0]).trim(), cost: Number(r[1]), memo: String(r[2] || '').trim(),
      group: /^(o|ㅇ|y|예|true|모둠)$/i.test(String(r[3] || '').trim()) }));
}

/** 선물교환 탭 → [{ id, d, gift, p }]. fill=true면 빈 이름·이메일·포인트·날짜를 채워 씀 */
function pointTrades_(ss, roster, fill) {
  const sh = ss.getSheetByName(POINT.TRADE); if (!sh) return [];
  const last = sh.getLastRow(); if (last < 2) return [];
  const rows = sh.getRange(2, 1, last - 1, 8).getValues();
  const price = {}; pointGifts_(ss).forEach(g => price[g.name] = g.cost);
  const s = v => String(v == null ? '' : v).trim();
  const out = []; let changed = false;
  rows.forEach(r => {
    if (!s(r[6]) && !s(r[7])) return;
    let st = s(r[5]) ? roster.byId[stampIdOf_(r[5])] : null;
    if (!st && s(r[1]) && s(r[2]) && s(r[3])) st = roster.list.find(x => s(x.grade) === s(r[1]) && s(x.cls) === s(r[2]) && s(x.no) === s(r[3]));
    const p = s(r[7]) !== '' && isFinite(Number(r[7])) ? Number(r[7]) : price[s(r[6])];
    if (!st || !p) return;
    if (fill) {
      if (!s(r[0])) { r[0] = stampFmt_(new Date(), 'yyyy-MM-dd'); changed = true; }
      if (!s(r[1])) { r[1] = st.grade; r[2] = st.cls; r[3] = st.no; changed = true; }
      if (s(r[4]) !== st.name) { r[4] = st.name; changed = true; }
      if (!s(r[5])) { r[5] = st.id + SQUAT_CONFIG.DOMAIN; changed = true; }
      if (s(r[7]) === '') { r[7] = p; changed = true; }
    }
    out.push({ id: st.id, d: r[0] instanceof Date ? stampFmt_(r[0], 'yyyy-MM-dd') : s(r[0]), gift: s(r[6]), p });
  });
  if (fill && changed) sh.getRange(2, 1, rows.length, 8).setValues(rows);
  return out;
}

/* ===== 합계 · 뱃지 (화면용) ===== */
/** 원장 + 선물교환 → 학생별 요약 { id: {...} }, 모둠 'g_학년|반|모둠' 합계, '__gifts' 선물 목록 */
function pointBuildAll_(ss) {
  const roster = stampRoster_(ss);
  const sh = ss.getSheetByName(POINT.LEDGER);
  const rows = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, POINT_HEAD.length).getValues() : [];
  const month = stampFmt_(new Date(), 'yyyy-MM');
  const per = {};
  const blank = () => ({ earned: 0, spent: 0, month: 0, last: '', days: {}, c: { stamp: 0, perfect: 0, group: 0, streak: 0, pb: 0, acc: 0, earned: 0 }, got: {}, recent: [], trades: [] });
  rows.forEach(r => {
    const id = stampIdOf_(r[5]); if (!id) return;
    const d = r[0] instanceof Date ? stampFmt_(r[0], 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
    const x = per[id] = per[id] || blank();
    const p = Number(r[12]) || 0;
    x.earned += p; if (d.slice(0, 7) === month) x.month += p; x.last = d;
    x.days[d] = (x.days[d] || 0) + p;                           // 날짜별 포인트 (내 도장 달력, 2026-11-15)
    const c = x.c;
    if (Number(r[13])) c.stamp++;
    if (Number(r[13]) === 100) c.perfect++;
    if (Number(r[14])) c.group++;
    c.streak = Math.max(c.streak, Number(r[15]) || 0);
    c.pb += Number(r[16]) || 0; c.acc += Number(r[17]) || 0; c.earned = x.earned;
    POINT_BADGES.forEach(b => { if (!x.got[b.id] && c[b.what] >= b.n) x.got[b.id] = d; });   // 처음 넘은 날 = 받은 날
    x.recent.push({ d, p, t: String(r[18] || '') });
    if (x.recent.length > 30) x.recent.shift();                // 내 도장 날짜별 포인트(스크롤)용 30일
  });
  pointTrades_(ss, roster, false).forEach(t => {
    const x = per[t.id] = per[t.id] || blank();
    x.spent += t.p; x.trades.push({ d: t.d, gift: t.gift, p: t.p });
  });
  const out = {};
  Object.keys(per).forEach(id => { const x = per[id]; x.bal = x.earned - x.spent; x.recent.reverse(); x.trades = x.trades.slice(-10).reverse(); out[id] = x; });
  const gs = {};
  roster.list.filter(st => st.gkey).forEach(st => {
    const g = gs['g_' + st.gkey] = gs['g_' + st.gkey] || { earned: 0, month: 0 };
    const x = per[st.id]; if (x) { g.earned += x.earned; g.month += x.month; }
  });
  Object.assign(out, gs);
  out.__gifts = pointGifts_(ss);
  return out;
}

/** 공유 캐시에서 필요한 것만 (Stamp.gs stampShared_ 재사용) */
function pointGet_(ss, keys) {
  return stampShared_(ss, 'pt1', POINT.CACHE_SEC, keys.concat('__gifts'), () => pointBuildAll_(ss));
}

/** 규칙 안내·계산기 화면(rules/)용: 포인트규칙·통과기준·자전거 기준·뱃지·선물. 학생 정보 없음 */
function pointRulesInfo_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(), crit = stampCriteria_(ss);
  const today = stampFmt_(new Date(), 'yyyy-MM-dd');
  return {
    ok: true, today,
    rules: pointRules_(ss),
    exercises: STAMP_EX.filter(ex => !ex.bonus).map(ex => stampByCount_(ex, today, crit)
      ? { key: ex.key, name: ex.name, min: crit[ex.key].countMin, unit: '회', weekendOff: crit[ex.key].weekendOff, from: ex.from || '' }
      : { key: ex.key, name: ex.name, min: crit[ex.key].min, weekendOff: crit[ex.key].weekendOff, from: ex.from || '' }),
    bikeKm: STAMP.BIKE_KM, bikeKmByGrade: STAMP.BIKE_KM_BY_GRADE, bikeFromHour: STAMP.BIKE_FROM_HOUR,
    countFrom: POINT.COUNT_FROM, bikeFrom: POINT.BIKE_FROM, bikeAllFrom: POINT.BIKE_ALL_FROM, squatPer: POINT.SQUAT_PER, ropePer: POINT.ROPE_PER, ropeFrom: POINT.ROPE_FROM, accMinCount: POINT.ACC_MIN_COUNT, accMinSec: POINT.ACC_MIN_SEC,
    badges: POINT_BADGES.map(b => ({ icon: b.icon, name: b.name, what: b.what, n: b.n })),
    gifts: pointGifts_(ss).map(g => ({ name: g.name, cost: g.cost, group: g.group }))
  };
}

/** 뱃지 목록 (받은 것 + 아직 못 받은 것과 진행도) */
function pointBadgeList_(x) {
  const c = x ? x.c : { stamp: 0, perfect: 0, group: 0, streak: 0, pb: 0, acc: 0, earned: 0 };
  return POINT_BADGES.map(b => ({ id: b.id, icon: b.icon, name: b.name, n: b.n, have: Math.min(c[b.what] || 0, b.n), got: x && x.got[b.id] || '' }));
}

/** stampSummary_ 결과에 붙일 포인트 (오늘 것은 도장 화면 데이터로 '예정' 계산) */
function pointsForStamp_(ss, st, sum) {
  const all = pointGet_(ss, [st.id].concat(st.gkey ? ['g_' + st.gkey] : []));
  const x = all[st.id] || null, R = pointRules_(ss);
  const t = sum.todayStatus;
  let today = 0, todayMemo = '';
  let live = null;
  if (!x || x.last < sum.today) { try { live = pointTodayLive_(ss, st, sum.today); } catch (e) { console.warn('오늘 포인트: ' + e); } }
  if (live) { today = live.p; todayMemo = live.t; }             // 스쿼트·줄넘기·자전거·경신·자세까지 밤 계산과 똑같이 (2026-11-15)
  else if (!x || x.last < sum.today) {                          // 실패하면 예전처럼 통과·도장만
    today += t.items.filter(i => i.ok && (sum.today >= POINT.COUNT_FROM || (i.key !== 'squat' && !(i.key === 'jumprope' && sum.today >= POINT.ROPE_FROM)))).length * R['종목 통과']
      + (sum.today >= POINT.COUNT_FROM ? t.items.reduce((a, i) => a + (i.extra || 0), 0) * R['추가 횟수'] : 0);   // (즉시 계산이 실패했을 때만 쓰는 대략값)
    if (t.stamp) today += R['하루 도장'] + (t.stamp === 100 ? R['완벽 도장'] : 0);
    const g = sum.group && sum.group.days[sum.today] ? sum.group.days[sum.today].stamp : 0;
    if (g) today += R['모둠 도장'] + (g === 100 ? R['완벽 모둠 도장'] : 0);
    if (t.stamp && sum.streak === 3) today += R['연속 3일'];
    if (t.stamp && sum.streak && sum.streak % 5 === 0) today += R['연속 5일마다'];
  }
  const n = st.gkey ? stampRoster_(ss).list.filter(m => m.gkey === st.gkey).length : 0;
  const gifts = pointGifts_(ss).filter(   // 선물목록은 작아서 매번 새로 읽음 (고치면 바로 반영)
    g => !g.group || n)            // 모둠이 없으면 모둠 선물은 안 보임
    .map(g => g.group ? Object.assign({}, g, { members: n, share: Math.ceil(g.cost / n) }) : g)
    .sort((a, b) => (a.share || a.cost) - (b.share || b.cost));
  const m = pointMathGet_(ss, [st.id])[st.id];                 // 수학 포인트 (통합포인트현황 탭)
  const groupBal = st.gkey ? pointMates_(ss, stampRoster_(ss), pointStaffIds_(ss), st).reduce((t, mt) => t + Math.max(0, mt.bal), 0) : 0;   // 모둠 선물은 모둠원 남은 합으로 (2026-11-15)
  return {
    earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: pointBal_(x, m), month: x ? x.month : 0, today, todayMemo,
    math: m ? m.all : 0, mathMonth: m ? m.month : 0,            // 학생 '내 도장'에 🧠 수학 P (2026-11-13)
    groupBal,
    days: pointDaysOf_(x, sum.month, sum.today, today),        // 달력 칸에 그날 포인트 (2026-11-15)
    badges: pointBadgeList_(x), recent: x ? x.recent.slice(0, 30) : [], trades: x ? x.trades : [], gifts,
    group: st.gkey && all['g_' + st.gkey] ? all['g_' + st.gkey] : null,
    rules: R
  };
}

/** 오늘 포인트를 지금 바로 (내 도장 '오늘 +○P 예정', 2026-11-15)
 *  밤 계산(pointCompute_)을 이 학생과 모둠원(모둠 도장 판정용)만 오늘 하루로 돌림 → 스쿼트 20회·줄넘기 100회·자전거 더 탄 거리·
 *  트레드밀·로잉 추가·아침달리기·기록 경신·바른 자세까지 밤에 확정될 값과 같음. 학생마다 2분 캐시 */
function pointTodayLive_(ss, st, today) {
  const cache = CacheService.getScriptCache(), ck = 'pd1_' + st.id + '_' + today;
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const staff = pointStaffIds_(ss);
  const ids = new Set([st.id]);
  if (st.gkey) stampRoster_(ss).list.forEach(m => { if (m.gkey === st.gkey && !staff.has(m.id)) ids.add(m.id); });
  const row = pointCompute_(ss, today, today, ids).find(r => stampIdOf_(r[5]) === st.id);
  const out = row ? { p: Number(row[12]) || 0, t: String(row[18] || '') } : { p: 0, t: '' };
  try { cache.put(ck, JSON.stringify(out), 120); } catch (e) {}
  return out;
}

/** 달력용: 그 달의 날짜별 포인트. 오늘(아직 원장에 없으면)은 '예정' 값 */
function pointDaysOf_(x, month, today, todayP) {
  const out = {};
  Object.keys((x && x.days) || {}).forEach(d => { if (d.slice(0, 7) === month) out[d] = x.days[d]; });
  if (todayP && today.slice(0, 7) === month && !out[today]) out[today] = todayP;
  return out;
}

/** stampTeam_ 결과의 각 모둠에 포인트 합계를 붙임 */
function pointsForTeam_(ss, out) {
  const keys = out.groups.map(g => 'g_' + [out.grade, out.cls, g.no].join('|'));
  const ids = [].concat(...out.groups.map(g => g._ids || []));
  const all = pointGet_(ss, keys.concat(ids));
  out.groups.forEach((g, i) => { const p = all[keys[i]]; g.points = p ? { earned: p.earned, month: p.month } : { earned: 0, month: 0 }; });
  // 날짜별 모둠원 포인트 (2026-11-15): 지난날은 원장, 오늘은 반 전체를 한 번에 바로 계산(2분 캐시)
  const today = out.today;
  let live = {};
  if (today.slice(0, 7) === out.month && ids.length) {
    try { live = pointTodayClass_(ss, out.grade, out.cls, ids, today); } catch (e) { console.warn('오늘 모둠 포인트: ' + e); }
  }
  out.groups.forEach(g => {
    Object.keys(g.days).forEach(d => {
      const p = (g._ids || []).map(id => d === today && !(all[id] && all[id].days && all[id].days[today])
        ? (live[id] || 0) : Math.round((((all[id] || {}).days || {})[d] || 0) * 10) / 10);
      g.days[d].p = p;
      g.days[d].pt = Math.round(p.reduce((a, b) => a + b, 0) * 10) / 10;
    });
  });
}
/** 반 전체의 오늘 포인트(밤 계산과 같게) → { id: P }. 학생마다 부르지 않고 반을 한 번에, 2분 캐시 */
function pointTodayClass_(ss, grade, cls, ids, today) {
  const cache = CacheService.getScriptCache(), ck = 'pdc1_' + grade + '_' + cls + '_' + today;
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const out = {};
  pointCompute_(ss, today, today, new Set(ids)).forEach(r => out[stampIdOf_(r[5])] = Number(r[12]) || 0);
  try { cache.put(ck, JSON.stringify(out), 120); } catch (e) {}
  return out;
}

/* ===== 선생님용 포인트현황 탭 ===== */
function pointsReport_(ss) {
  const roster = stampRosterRead_(ss);
  pointTrades_(ss, roster, true);                              // 선물교환 빈칸 채우기
  CacheService.getScriptCache().remove('pt1__at');             // 화면 캐시 새로
  const all = pointBuildAll_(ss);
  const mts = pointMathAll_(ss);
  let sh = ss.getSheetByName(POINT.REPORT);
  if (!sh) sh = ss.insertSheet(POINT.REPORT);
  sh.clear();
  // H '남은 포인트'는 체력만 (연산진단 통합포인트.gs가 이 열을 '체력 남은'으로 읽음). 선물에 쓰는 합친 값은 맨 끝 N열 (2026-11-13)
  const head = ['학년', '반', '번호', '이름', '모둠', '누적 포인트', '사용', '남은 포인트', '이달 포인트', '뱃지 수', '도장', '완벽 도장', '최고 연속', '선물용 남은(체력+수학)'];
  const rows = roster.list.filter(st => all[st.id]).map(st => {
    const x = all[st.id];
    return [st.grade, st.cls, st.no, st.name, st.group, x.earned, x.spent, x.bal, x.month, Object.keys(x.got).length, x.c.stamp, x.c.perfect, x.c.streak, pointBal_(x, mts[st.id])];
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.getRange(1, head.length + 2).setValue('만든 시각 ' + stampFmt_(new Date(), 'yyyy-MM-dd HH:mm') + ' · 선물을 바꾼 뒤 바로 보려면 pointsReport 실행');
  sh.setFrozenRows(1);
}
/** 편집기에서 실행: 선물교환 정리 + 포인트현황 새로 (선물을 바꿔 준 직후 확인용) */
function pointsReport() { pointsReport_(SpreadsheetApp.getActiveSpreadsheet()); }

/* ===== 운동 시간 (2026-10-27) =====
 *  종목 탭의 측정시간 열을 학생별로 더함 → 누적(10월 19일부터)·이달·오늘
 *  포인트 원장과 따로, 실시간(2분 캐시). 실내자전거(km만 있음)는 아직 빠짐 → 나중에 보완
 *  열 위치는 Stamp.gs STAMP_EX의 time */
const POINT_TIME_EX = STAMP_EX.filter(ex => ex.sheet).map(ex => ({ sheet: ex.sheet, time: ex.time }));
const POINT_TIME_MAX = 3600;     // 한 기록이 1시간을 넘으면 잘못 누른 것으로 보고 1시간까지만

function pointTimeAll_(ss) {
  const out = {};
  const dayOf = v => v instanceof Date ? stampFmt_(v, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
  const now = new Date(), today = stampFmt_(now, 'yyyy-MM-dd'), month = today.slice(0, 7);
  POINT_TIME_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet); if (!sh) return;
    const n = sh.getLastRow() - 1; if (n < 1) return;
    sh.getRange(2, 1, n, ex.time + 1).getValues().forEach(r => {
      const id = stampIdOf_(r[5]); if (!id) return;
      const d = dayOf(r[0]); if (!d || d < POINT.FROM) return;
      let s = Number(r[ex.time]); if (!isFinite(s) || s <= 0) return;
      s = Math.min(s, POINT_TIME_MAX);
      const x = out[id] = out[id] || { all: 0, month: 0, today: 0 };
      x.all += s; if (d.slice(0, 7) === month) x.month += s; if (d === today) x.today += s;
    });
  });
  Object.keys(out).forEach(id => { const x = out[id]; x.all = Math.round(x.all); x.month = Math.round(x.month); x.today = Math.round(x.today); });
  return out;
}
function pointTimeGet_(ss, ids) {
  return stampShared_(ss, 'tm1', 120, ids, () => pointTimeAll_(ss));
}

/* ===== 수학 포인트 (2026-11-12, 체력과 지력의 병진) =====
 *  연산진단시스템(평가데이터 시트의 GAS, 통합포인트.gs)이 10분마다(2026-11-13, 전에는 아침 6시) 이 시트의 '통합포인트현황' 탭을 통째로 다시 씀.
 *  여기서는 그 탭의 '수학 누적'·'수학 남은'·'이달 수학'을 이메일로 읽기만 함 (5분 캐시).
 *  지갑은 하나(2026-11-13 선생님 결정): 선물에 쓰는 남은 포인트 = 체력 남은(모은 − 선물교환) + 수학 남은. 선물은 이 화면에서만 줌
 *  (연산진단 ⭐ 화면에서도 수학 선물을 주면 그쪽은 이 차감을 몰라 같은 포인트를 두 번 쓸 수 있음)
 *  병진 = 체력(모은 포인트)과 수학(누적) 중 작은 값 → 둘 다 해야 올라감 */
const POINT_MATH_SHEET = '통합포인트현황';
function pointMathAll_(ss) {
  const out = {}, sh = ss.getSheetByName(POINT_MATH_SHEET);
  if (!sh || sh.getLastRow() < 2) return out;
  const v = sh.getDataRange().getValues(), h = v[0].map(x => String(x).trim());
  const iE = h.indexOf('이메일'), iA = h.indexOf('수학 누적'), iL = h.indexOf('수학 남은'), iM = h.indexOf('이달 수학');
  if (iE < 0 || iA < 0) return out;
  v.slice(1).forEach(r => {
    const id = stampIdOf_(r[iE]); if (!id) return;
    out[id] = { all: Number(r[iA]) || 0, left: iL < 0 ? 0 : Number(r[iL]) || 0, month: iM < 0 ? 0 : Number(r[iM]) || 0 };
  });
  return out;
}
function pointMathGet_(ss, ids) {
  return stampShared_(ss, 'mt1', 300, ids, () => pointMathAll_(ss));
}
/** 학생 한 명의 체력·수학 합친 값 (earned = 체력 모은 포인트) */
function pointMix_(earned, m) {
  const math = m ? m.all : 0;
  return { math, mathLeft: m ? m.left : 0, mathMonth: m ? m.month : 0, total: earned + math, balance: Math.min(earned, math) };
}
/** 선물에 쓸 수 있는 남은 포인트 = 체력 남은(모은 − 선물교환) + 수학 남은 (2026-11-13 지갑 하나로) */
function pointBal_(x, m) { return (x ? x.bal : 0) + (m ? m.left : 0); }

/* ===== 선생님 화면 (…/sports/points/) — 열쇠(스크립트 속성 DASH_KEY)가 맞을 때만 ===== */
function pointKeyOk_(key) {
  const real = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
  return !!real && !!key && String(key) === real;
}

/** action=points&key=      → 전교생 포인트 목록 (반 고르기·정렬은 화면에서)
 *  action=points&key=&id=  → 한 학생 자세히 (뱃지·최근 내역·선물 내역) */
function pointsTeacher_(p) {
  if (!pointKeyOk_(p.key)) return { ok: false, error: '선생님 열쇠가 맞지 않아요', needKey: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const staff = pointStaffIds_(ss);
  if (p.id) {
    const id = stampIdOf_(p.id), st = roster.byId[id];
    if (!st) return { ok: false, error: '명단에 없는 학생이에요' };
    const x = pointGet_(ss, [id])[id] || null;
    const tm = pointTimeGet_(ss, [id])[id] || { all: 0, month: 0, today: 0 };
    const mx = pointMix_(x ? x.earned : 0, pointMathGet_(ss, [id])[id]);
    return Object.assign({
      ok: true, id, name: st.name, grade: st.grade, cls: st.cls, no: st.no, group: st.group,
      earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: pointBal_(x, pointMathGet_(ss, [id])[id]), month: x ? x.month : 0,
      time: tm.all, timeMonth: tm.month, timeToday: tm.today,
      badges: pointBadgeList_(x), recent: x ? x.recent : [], trades: x ? x.trades : [],
      mates: pointMates_(ss, roster, staff, st)
    }, mx);
  }
  try { pointGiftSheet_(ss); } catch (e) {}                    // 선물목록에 '모둠 선물' 제목 칸 챙기기
  const list = roster.list.filter(st => !staff.has(st.id));
  const all = pointGet_(ss, list.map(st => st.id));
  const tms = pointTimeGet_(ss, list.map(st => st.id));
  const mts = pointMathGet_(ss, list.map(st => st.id));
  return {
    ok: true, updated: stampFmt_(new Date(), 'HH:mm'), gifts: pointGifts_(ss),   // 선물목록은 매번 새로
    students: list.map(st => {
      const x = all[st.id], tm = tms[st.id] || { all: 0, month: 0, today: 0 };
      return Object.assign({
        id: st.id, grade: st.grade, cls: st.cls, no: st.no, name: st.name, group: st.group,
        time: tm.all, timeMonth: tm.month, timeToday: tm.today,
        earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: pointBal_(x, mts[st.id]), month: x ? x.month : 0,
        badges: x ? Object.keys(x.got).length : 0, stamp: x ? x.c.stamp : 0, perfect: x ? x.c.perfect : 0, streak: x ? x.c.streak : 0
      }, pointMix_(x ? x.earned : 0, mts[st.id]));
    })
  };
}

/** action=pointsPub — 학생용 포인트 순위 (2026-10-31 결정: 개인 순위도 공개). 이름은 가림(김*서), 아이디·이메일·남은 포인트는 보내지 않음 */
function pointsPublic_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const staff = pointStaffIds_(ss);
  const list = roster.list.filter(st => !staff.has(st.id) && st.grade);
  const all = pointGet_(ss, list.map(st => st.id));
  const mts = pointMathGet_(ss, list.map(st => st.id));
  return {
    ok: true, updated: stampFmt_(new Date(), 'HH:mm'),
    students: list.map(st => {
      const x = all[st.id], mx = pointMix_(x ? x.earned : 0, mts[st.id]);
      return {
        grade: st.grade, cls: st.cls, group: st.group || '', name: rankMask_(st.name),
        math: mx.math, mathMonth: mx.mathMonth, total: mx.total, balance: mx.balance,
        earned: x ? x.earned : 0, month: x ? x.month : 0, badges: x ? Object.keys(x.got).length : 0,
        stamp: x ? x.c.stamp : 0, perfect: x ? x.c.perfect : 0, streak: x ? x.c.streak : 0
      };
    })
  };
}

/** action=gift&key=&id=&gift=선물이름  → 선물교환 탭에 한 줄 (남은 포인트가 모자라면 거절, force=1이면 그래도) */
function pointsGive_(p) {
  if (!pointKeyOk_(p.key)) return { ok: false, error: '선생님 열쇠가 맞지 않아요', needKey: true };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const id = stampIdOf_(p.id), st = roster.byId[id];
  if (!st) return { ok: false, error: '명단에 없는 학생이에요' };
  const gift = pointGifts_(ss).find(g => g.name === String(p.gift || '').trim());
  if (!gift) return { ok: false, error: '선물목록에 없는 선물이에요' };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return { ok: false, error: '잠시 뒤 다시 눌러 주세요' };
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('pt1__at');                                   // 최신 남은 포인트로 확인
    if (gift.group) return pointsGiveGroup_(ss, roster, st, gift, String(p.force) === '1');
    const x = pointGet_(ss, [id])[id];
    const bal = pointBal_(x, pointMathGet_(ss, [id])[id]);   // 체력 남은 + 수학 남은
    if (bal < gift.cost && String(p.force) !== '1') return { ok: false, short: true, bal, cost: gift.cost, error: `남은 포인트(${bal}P)가 모자라요` };
    const sh = pointTradeSheet_(ss);
    const row = sh.getLastRow() + 1;
    sh.getRange(row, 1).setNumberFormat('@');
    sh.getRange(row, 1, 1, 8).setValues([[stampFmt_(new Date(), 'yyyy-MM-dd'), st.grade, st.cls, st.no, st.name, st.id + SQUAT_CONFIG.DOMAIN, gift.name, gift.cost]]);
    SpreadsheetApp.flush();
    cache.remove('pt1__at');                                   // 다음 요청(학생 화면 포함)부터 바로 반영
    return { ok: true, gift: gift.name, cost: gift.cost, bal: bal - gift.cost };
  } finally { lock.releaseLock(); }
}

/** 모둠원 목록과 남은 포인트 (선생님 화면에서 모둠 선물 나눠 내기 미리 보기) */
function pointMates_(ss, roster, staff, st) {
  if (!st.gkey) return [];
  const mates = roster.list.filter(m => m.gkey === st.gkey && !staff.has(m.id)).sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
  const all = pointGet_(ss, mates.map(m => m.id));
  const mts = pointMathGet_(ss, mates.map(m => m.id));
  return mates.map(m => ({ id: m.id, name: m.name, no: m.no, bal: pointBal_(all[m.id], mts[m.id]) }));
}

/** 모둠 선물 나눠 내기 (2026-11-15 선생님 결정: 개인은 모자라도 모둠원 남은 포인트 합이 넉넉하면 교환)
 *  똑같이 나누되(나머지 1P씩은 앞 번호부터) 내 몫보다 적게 가진 친구는 가진 만큼만 내고, 모자란 만큼은 다른 모둠원이 똑같이 나눠 냄.
 *  화면 points/index.html의 groupSplit과 같은 계산 */
function pointGroupSplit_(mates, cost) {
  const out = mates.map(m => Object.assign({}, m, { share: 0 }));
  const have = m => Math.max(0, Number(m.bal) || 0);
  const equal = (list, rest) => { const n = list.length, base = Math.floor(rest / n), extra = rest - base * n; list.forEach((m, i) => m.share = base + (i < extra ? 1 : 0)); };
  if (!out.length) return out;
  if (out.reduce((t, m) => t + have(m), 0) < cost) { equal(out, cost); return out; }   // 합계도 모자라면(억지로 줄 때) 똑같이
  let open = out, rest = cost;
  for (;;) {
    equal(open, rest);
    const poor = open.filter(m => have(m) < m.share);
    if (!poor.length) return out;
    poor.forEach(m => { m.share = have(m); rest -= m.share; });                       // 모자란 친구는 가진 만큼
    open = open.filter(m => poor.indexOf(m) < 0);                                      // 나머지는 다른 모둠원이 똑같이
  }
}

/** 모둠 선물: pointGroupSplit_으로 나눠 각자의 남은 포인트에서 뺌.
 *  모둠원 남은 포인트 합이 모자라면 거절(force면 그래도 똑같이). 선물교환 탭에 모둠원마다 한 줄(낸 것이 0P인 친구는 빼고), 선물 이름은 '피자 (모둠 4명)' */
function pointsGiveGroup_(ss, roster, st, gift, force) {
  if (!st.gkey) return { ok: false, error: '모둠이 정해지지 않은 학생이에요 (학생명단 모둠 열)' };
  const staff = pointStaffIds_(ss);
  const mates = pointMates_(ss, roster, staff, st);
  const n = mates.length;
  const sum = mates.reduce((t, m) => t + Math.max(0, m.bal), 0);
  if (sum < gift.cost && !force) return { ok: false, short: true, group: true, mates, error: `모둠 남은 포인트 합(${sum}P)이 모자라요` };
  const split = pointGroupSplit_(mates, gift.cost);
  const pay = split.filter(m => m.share > 0);
  const sh = pointTradeSheet_(ss);
  const today = stampFmt_(new Date(), 'yyyy-MM-dd'), label = `${gift.name} (모둠 ${n}명)`;
  const row = sh.getLastRow() + 1;
  sh.getRange(row, 1, pay.length, 1).setNumberFormat('@');
  sh.getRange(row, 1, pay.length, 8).setValues(pay.map(m => {
    const r = roster.byId[m.id];
    return [today, r.grade, r.cls, r.no, r.name, r.id + SQUAT_CONFIG.DOMAIN, label, m.share];
  }));
  SpreadsheetApp.flush();
  CacheService.getScriptCache().remove('pt1__at');
  return { ok: true, group: true, gift: label, cost: gift.cost, mates: split.map(m => ({ id: m.id, name: m.name, share: m.share, bal: m.bal - m.share })) };
}
