/*************************************************************
 * Points.gs — 운동 포인트 · 뱃지 · 선물 교환 (보상 시스템)
 *
 *  흐름
 *   ① 매일 밤(1시) pointsNightly 트리거가 최근 7일 기록을 다시 판정해 '포인트' 탭(원장)에 하루 한 줄씩 씀
 *      (7일을 다시 보는 까닭: 선생님이 자전거·마이후쉬 기록을 며칠 뒤에 넣어도 완벽 도장 포인트가 들어가게)
 *   ② 선생님이 '선물교환' 탭에 학년·반·번호·선물만 적으면 → 이름·이메일·포인트를 채우고 남은 포인트에서 뺌
 *   ③ 화면(내 도장·우리 모둠)은 원장을 더하기만 함 → 느려지지 않음. 오늘 것은 '예정'으로 보여 주고 밤에 확정
 *
 *  포인트 = 누적(+만 더함, 줄지 않음 → 뱃지 기준) / 남은 포인트 = 누적 − 선물로 쓴 것
 *  숫자는 '포인트규칙' 탭에서 고침(없으면 처음 부를 때 기본값으로 만듦). 고친 뒤 rebuildPoints() 한 번 실행하면 지난 것도 새 규칙으로 다시 계산
 *  시작일 2026-10-19 (스마트스포츠 시스템을 쓰기 시작한 무렵)
 *
 *  탭 (setupPoints()가 만듦)
 *   포인트     : A 날짜 · B 학년 · C 반 · D 번호 · E 이름 · F 이메일 · G 종목P · H 도장P · I 모둠P · J 연속P · K 경신P · L 자세P · M 합계
 *                · N 도장(0/90/100) · O 모둠도장 · P 연속일수 · Q 경신수 · R 자세수 · S 내용
 *   포인트규칙 : A 항목 · B 포인트 · C 설명
 *   선물목록   : A 선물 · B 필요 포인트 · C 메모
 *   선물교환   : A 날짜 · B 학년 · C 반 · D 번호 · E 이름 · F 이메일 · G 선물 · H 포인트  (선생님만 적음)
 *   포인트현황 : 학생별 누적·사용·남은 포인트·뱃지 수 (밤마다 새로 씀, 선생님 확인용)
 *************************************************************/
const POINT = {
  FROM: '2026-10-19',          // 이날 기록부터 포인트 (시스템을 쓰기 시작한 날)
  REDO_DAYS: 7,                // 밤마다 다시 계산하는 최근 날 수
  LEDGER: '포인트', RULES: '포인트규칙', GIFTS: '선물목록', TRADE: '선물교환', REPORT: '포인트현황',
  ACC_MIN_COUNT: 20,           // 바른 자세 포인트: 그날 그 종목을 이만큼 이상 했을 때만 (횟수 종목)
  ACC_MIN_SEC: 60,             //   플랭크는 전체 시간(초)
  CACHE_SEC: 600               // 화면용 합계 캐시 (선물 교환은 10분 안에 화면에 반영)
};
/* 기본 규칙 [항목, 포인트, 설명] — 탭에서 숫자만 고치면 됨. 항목 이름은 바꾸지 않음 */
const POINT_RULES = [
  ['종목 통과', 1, '통과기준 이상 한 종목마다 (하루 종목당 한 번)'],
  ['하루 도장', 10, '그날 해야 할 종목을 모두 통과'],
  ['완벽 도장', 5, '하루 도장 + 실내자전거, 휴일은 하루 도장만으로 (하루 도장에 더해서)'],
  ['모둠 도장', 5, '모둠원 모두 도장 (모둠원 각자에게)'],
  ['완벽 모둠 도장', 5, '모둠원 모두 완벽 도장 (모둠 도장에 더해서)'],
  ['연속 3일', 5, '도장 연속 3일째 되는 날'],
  ['연속 7일마다', 15, '도장 연속 7·14·21…일째 되는 날'],
  ['기록 경신', 2, '전날까지의 내 최고 기록을 넘은 종목마다 (처음 한 종목은 제외)'],
  ['기록 경신 하루 최대', 3, '하루에 경신 포인트를 받는 종목 수'],
  ['바른 자세', 1, '그날 정확도가 기준 이상인 카메라 종목마다 (20회·60초 이상 했을 때)'],
  ['바른 자세 기준(%)', 80, '']
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
  const c = CacheService.getScriptCache(), hit = c.get('prule1');
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
    sh.getDataRange().getValues().slice(1).forEach(r => {
      const k = String(r[0]).trim(), v = Number(r[1]);
      if (k in out && String(r[1]).trim() !== '' && isFinite(v) && v >= 0) out[k] = v;
    });
  }
  try { c.put('prule1', JSON.stringify(out), 60); } catch (e) {}
  return out;
}

/* ===== 계산: 모든 학생 × 날짜 → 원장 줄 ===== */
/** from~to(yyyy-MM-dd) 원장 줄을 계산해 돌려줌. 연속·기록 경신 판정을 위해 기록은 2026-09-01부터 모두 읽음 */
function pointCompute_(ss, from, to) {
  const R = pointRules_(ss);
  const roster = stampRosterRead_(ss);                       // 캐시 말고 시트에서 새로
  const staff = pointStaffIds_(ss);
  const today = stampFmt_(new Date(), 'yyyy-MM-dd');
  const dayOf = v => v instanceof Date ? stampFmt_(v, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const timeCol = {}; STAMP_EX.forEach(ex => timeCol[ex.key] = ex.time);

  // 1) 종목 탭을 한 번씩 읽기: 측정시간 최고(도장) · 날짜별 최고 기록(경신) · 정확도 합(자세)
  const best = {};          // id → 날짜 → 종목 → 최고 측정시간
  const val = {};           // id|종목|조건 → 날짜 → 그날 최고 기록
  const acc = {};           // id → 날짜 → 종목 → { g, t }
  DASH_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet); if (!sh) return;
    const n = sh.getLastRow() - 1; if (n < 1) return;
    sh.getRange(2, 1, n, sh.getLastColumn()).getValues().forEach(r => {
      const id = stampIdOf_(r[ex.email]); if (!id || !roster.byId[id] || staff.has(id)) return;
      const d = dayOf(r[0]); if (!d || d < '2026-09-01' || d > to) return;
      if (timeCol[ex.key] != null) {
        const b = ((best[id] = best[id] || {})[d] = (best[id][d] || {}));
        b[ex.key] = Math.max(b[ex.key] || 0, num(r[timeCol[ex.key]]));
      }
      if (!ex.noPb) {
        const k = id + '|' + ex.key + '|' + (ex.pbBy == null ? '' : r[ex.pbBy]), v = num(r[ex.value]);
        if (v > 0) { const m = val[k] = val[k] || {}; m[d] = Math.max(m[d] || 0, v); }
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
  const ctx = { now: new Date(), today, hour: 23, crit: stampCriteria_(ss), holi: stampHolidays_(ss), best, bike: stampReadAllRide_(roster), grade: {} };
  roster.list.forEach(st => ctx.grade[st.id] = st.grade);
  const days = [];
  for (let t = new Date('2026-09-01T12:00:00+09:00'); ; t = new Date(t.getTime() + 864e5)) {
    const d = stampFmt_(t, 'yyyy-MM-dd'); if (d > to) break; days.push(d);
  }
  const active = roster.list.filter(st => !staff.has(st.id) && (best[st.id] || ctx.bike[st.id]));
  const stampOf = {};       // id → 날짜 → 0/90/100
  const passOf = {};        // id → 날짜 → 통과 종목 수(주말 제외 없이 모든 종목)
  active.forEach(st => {
    const s = stampOf[st.id] = {}, p = passOf[st.id] = {};
    days.forEach(d => {
      if (!(best[st.id] && best[st.id][d]) && !(ctx.bike[st.id] && ctx.bike[st.id][d])) { s[d] = 0; p[d] = 0; return; }
      s[d] = stampJudge_(ctx, st.id, d).stamp;
      const b = (best[st.id] || {})[d] || {};
      p[d] = STAMP_EX.filter(ex => (b[ex.key] || 0) >= ctx.crit[ex.key].min).length;
    });
  });
  const groupOf = {};       // gkey → 날짜 → 0/90/100
  const byG = {};
  roster.list.filter(st => st.gkey && !staff.has(st.id)).forEach(st => (byG[st.gkey] = byG[st.gkey] || []).push(st.id));
  Object.keys(byG).forEach(g => {
    groupOf[g] = {};
    days.forEach(d => groupOf[g][d] = stampGroupOf_(byG[g].map(id => (stampOf[id] || {})[d] || 0)));
  });

  // 4) 줄 만들기
  const rows = [];
  const pbMax = R['기록 경신 하루 최대'], accPct = R['바른 자세 기준(%)'];
  active.forEach(st => {
    let streak = 0;
    days.forEach(d => {
      const s = stampOf[st.id][d];
      if (s) streak++; else streak = 0;                       // 주말·휴일도 도장이 없으면 끊김 (Stamp.gs와 같게)
      if (d < from) return;
      const pass = passOf[st.id][d];
      const g = st.gkey ? groupOf[st.gkey][d] : 0;
      const pbList = ((pbs[st.id] || {})[d] || []).slice(0, Math.max(0, pbMax));
      const accList = [];
      const a = (acc[st.id] || {})[d] || {};
      Object.keys(a).forEach(k => {
        const x = a[k];
        if (x.t >= (x.sec ? POINT.ACC_MIN_SEC : POINT.ACC_MIN_COUNT) && x.g / x.t * 100 >= accPct) accList.push(exName[k]);
      });
      const pEx = pass * R['종목 통과'];
      const pSt = s ? R['하루 도장'] + (s === 100 ? R['완벽 도장'] : 0) : 0;
      const pG = g ? R['모둠 도장'] + (g === 100 ? R['완벽 모둠 도장'] : 0) : 0;
      const pSk = s ? (streak === 3 ? R['연속 3일'] : 0) + (streak % 7 === 0 ? R['연속 7일마다'] : 0) : 0;
      const pPb = pbList.length * R['기록 경신'];
      const pAc = accList.length * R['바른 자세'];
      const total = pEx + pSt + pG + pSk + pPb + pAc;
      if (!total) return;
      const memo = [pass ? `종목 ${pass}` : '', s === 100 ? '완벽 도장' : s ? '도장' : '', g === 100 ? '완벽 모둠 도장' : g ? '모둠 도장' : '',
        pSk ? `연속 ${streak}일` : '', pbList.length ? '경신: ' + pbList.join(', ') : '', accList.length ? '자세: ' + accList.join(', ') : '']
        .filter(Boolean).join(' · ');
      rows.push([d, st.grade, st.cls, st.no, st.name, st.id + SQUAT_CONFIG.DOMAIN, pEx, pSt, pG, pSk, pPb, pAc, total,
        s, g, s ? streak : 0, pbList.length, accList.length, memo]);
    });
  });
  rows.sort((x, y) => x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0);
  return rows;
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
  CacheService.getScriptCache().remove('prule1');
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
    sh.getRange(1, 1, 1, 3).setValues([['선물', '필요 포인트', '메모']]).setFontWeight('bold');
    sh.getRange(2, 1, 3, 3).setValues([['(예) 칭찬 쿠폰', 50, '이 줄은 예시예요. 고치거나 지워 주세요'], ['(예) 자리 바꾸기', 150, ''], ['(예) 학용품', 300, '']]);
    sh.setFrozenRows(1); sh.setColumnWidth(1, 200);
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
    .map(r => ({ name: String(r[0]).trim(), cost: Number(r[1]), memo: String(r[2] || '').trim() }));
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
  const blank = () => ({ earned: 0, spent: 0, month: 0, last: '', c: { stamp: 0, perfect: 0, group: 0, streak: 0, pb: 0, acc: 0, earned: 0 }, got: {}, recent: [], trades: [] });
  rows.forEach(r => {
    const id = stampIdOf_(r[5]); if (!id) return;
    const d = r[0] instanceof Date ? stampFmt_(r[0], 'yyyy-MM-dd') : String(r[0]).slice(0, 10);
    const x = per[id] = per[id] || blank();
    const p = Number(r[12]) || 0;
    x.earned += p; if (d.slice(0, 7) === month) x.month += p; x.last = d;
    const c = x.c;
    if (Number(r[13])) c.stamp++;
    if (Number(r[13]) === 100) c.perfect++;
    if (Number(r[14])) c.group++;
    c.streak = Math.max(c.streak, Number(r[15]) || 0);
    c.pb += Number(r[16]) || 0; c.acc += Number(r[17]) || 0; c.earned = x.earned;
    POINT_BADGES.forEach(b => { if (!x.got[b.id] && c[b.what] >= b.n) x.got[b.id] = d; });   // 처음 넘은 날 = 받은 날
    x.recent.push({ d, p, t: String(r[18] || '') });
    if (x.recent.length > 10) x.recent.shift();
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
  let today = 0;
  if (!x || x.last < sum.today) {
    today += t.items.filter(i => i.ok).length * R['종목 통과'];
    if (t.stamp) today += R['하루 도장'] + (t.stamp === 100 ? R['완벽 도장'] : 0);
    const g = sum.group && sum.group.days[sum.today] ? sum.group.days[sum.today].stamp : 0;
    if (g) today += R['모둠 도장'] + (g === 100 ? R['완벽 모둠 도장'] : 0);
    if (t.stamp && sum.streak === 3) today += R['연속 3일'];
    if (t.stamp && sum.streak && sum.streak % 7 === 0) today += R['연속 7일마다'];
  }
  const gifts = (all.__gifts || []).slice().sort((a, b) => a.cost - b.cost);
  return {
    earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: x ? x.bal : 0, month: x ? x.month : 0, today,
    badges: pointBadgeList_(x), recent: x ? x.recent.slice(0, 7) : [], trades: x ? x.trades : [], gifts,
    group: st.gkey && all['g_' + st.gkey] ? all['g_' + st.gkey] : null,
    rules: R
  };
}

/** stampTeam_ 결과의 각 모둠에 포인트 합계를 붙임 */
function pointsForTeam_(ss, out) {
  const keys = out.groups.map(g => 'g_' + [out.grade, out.cls, g.no].join('|'));
  const all = pointGet_(ss, keys);
  out.groups.forEach((g, i) => { const p = all[keys[i]]; g.points = p ? { earned: p.earned, month: p.month } : { earned: 0, month: 0 }; });
}

/* ===== 선생님용 포인트현황 탭 ===== */
function pointsReport_(ss) {
  const roster = stampRosterRead_(ss);
  pointTrades_(ss, roster, true);                              // 선물교환 빈칸 채우기
  CacheService.getScriptCache().remove('pt1__at');             // 화면 캐시 새로
  const all = pointBuildAll_(ss);
  let sh = ss.getSheetByName(POINT.REPORT);
  if (!sh) sh = ss.insertSheet(POINT.REPORT);
  sh.clear();
  const head = ['학년', '반', '번호', '이름', '모둠', '누적 포인트', '사용', '남은 포인트', '이달 포인트', '뱃지 수', '도장', '완벽 도장', '최고 연속'];
  const rows = roster.list.filter(st => all[st.id]).map(st => {
    const x = all[st.id];
    return [st.grade, st.cls, st.no, st.name, st.group, x.earned, x.spent, x.bal, x.month, Object.keys(x.got).length, x.c.stamp, x.c.perfect, x.c.streak];
  });
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.getRange(1, head.length + 2).setValue('만든 시각 ' + stampFmt_(new Date(), 'yyyy-MM-dd HH:mm') + ' · 선물을 바꾼 뒤 바로 보려면 pointsReport 실행');
  sh.setFrozenRows(1);
}
/** 편집기에서 실행: 선물교환 정리 + 포인트현황 새로 (선물을 바꿔 준 직후 확인용) */
function pointsReport() { pointsReport_(SpreadsheetApp.getActiveSpreadsheet()); }

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
    return {
      ok: true, id, name: st.name, grade: st.grade, cls: st.cls, no: st.no, group: st.group,
      earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: x ? x.bal : 0, month: x ? x.month : 0,
      badges: pointBadgeList_(x), recent: x ? x.recent : [], trades: x ? x.trades : []
    };
  }
  const list = roster.list.filter(st => !staff.has(st.id));
  const all = pointGet_(ss, list.map(st => st.id));
  return {
    ok: true, updated: stampFmt_(new Date(), 'HH:mm'), gifts: all.__gifts || [],
    students: list.map(st => {
      const x = all[st.id];
      return {
        id: st.id, grade: st.grade, cls: st.cls, no: st.no, name: st.name, group: st.group,
        earned: x ? x.earned : 0, spent: x ? x.spent : 0, bal: x ? x.bal : 0, month: x ? x.month : 0,
        badges: x ? Object.keys(x.got).length : 0, stamp: x ? x.c.stamp : 0, perfect: x ? x.c.perfect : 0, streak: x ? x.c.streak : 0
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
    const x = pointGet_(ss, [id])[id];
    const bal = x ? x.bal : 0;
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
