/*************************************************************
 * Stamp.gs — 개인별 하루 도장 (개인 대시보드 1단계)
 *
 *  규칙 (2026-10-22 결정)
 *   - 90% 도장: 그날 해야 할 종목을 '모두' 통과
 *       평일: 아래 STAMP_EX 11종목 전부
 *       주말(토·일): 스포츠실 전용(트레드밀·로잉머신·행잉)은 빼고 8종목
 *       통과 = 그날 그 종목 기록 중 측정시간이 '통과기준' 탭의 최소시간(기본 30초) 이상인 기록이 하나라도 있음
 *   - 100% 완벽 도장: 90% + 실내자전거 그날 5km 이상 (5km = 10분으로 간주)
 *       자전거는 인도어라이딩 시트에 모아서 입력하므로 오늘 도장에는 17시부터 반영
 *       (지난 날짜는 언제나 반영)
 *
 *   - 모둠 도장 (규칙 ①): 모둠원 '모두' 개인 도장 → 모둠 도장, 모두 완벽 도장 → 완벽 모둠 도장
 *       모둠은 학생명단의 제목 '모둠' 열(숫자). 모둠 키 = 학년|반|모둠 (반 안에서만 쓰는 번호)
 *
 *  허브 JSONP (Hub.gs hubJsonp_)
 *    action=stamp&email=…&month=yyyy-MM           → stampSummary_()  개인 + 우리 모둠
 *    action=team&email=… (또는 grade=&cls=)&month= → stampTeam_()     반 전체 모둠
 *  화면: …/sports/stamp/ (허브 '내 도장'), …/sports/team/ (허브 '우리 모둠')
 *
 *  통과기준 탭(없으면 처음 부를 때 자동으로 만듦) — 선생님이 숫자만 고치면 1분 안에 반영
 *    A 종목 | B 최소시간(초) | C 주말 제외(O)
 *  열 위치는 CLAUDE.md '시트 데이터 구조' 표를 따름 (0부터 셈)
 *************************************************************/
const STAMP = {
  TZ: 'Asia/Seoul',
  CRITERIA_SHEET: '통과기준',
  DEFAULT_SEC: 30,
  BIKE_KM: 5,                 // 실내자전거 그날 이만큼 이상이면 통과 (5km = 10분)
  BIKE_FROM_HOUR: 17,         // 오늘 도장에 자전거를 반영하기 시작하는 시각
  RIDE_TAB: '2026',           // 인도어라이딩 시트 탭 (Dashboard.gs 와 같음, 스크립트 속성 RIDE_SHEET_ID)
  RIDE_HEAD_ROW: 3,
  RIDE_YEAR: 2026,
  CACHE_SEC: 60
};
/* key는 허브 EXERCISES의 id와 같게 (도장 화면에서 '하러 가기'로 바로 연결) */
const STAMP_EX = [
  { key: 'squat',       name: '스쿼트',         sheet: '스쿼트',         time: 6 },
  { key: 'lunge',       name: '런지',           sheet: '런지',           time: 6 },
  { key: 'jumpingjack', name: '점핑잭',         sheet: '점핑잭',         time: 6 },
  { key: 'curlup',      name: '윗몸말아올리기', sheet: '윗몸말아올리기', time: 6 },
  { key: 'highknee',    name: '하이니',         sheet: '하이니',         time: 6 },
  { key: 'pushup',      name: '팔굽혀펴기',     sheet: '팔굽혀펴기',     time: 7 },
  { key: 'plank',       name: '플랭크',         sheet: '플랭크',         time: 8 },   // 버틴 시간(초)
  { key: 'jumprope',    name: '줄넘기',         sheet: '줄넘기',         time: 8 },
  { key: 'hanging',     name: '행잉',           sheet: '행잉',           time: 9, room: true },
  { key: 'treadmill',   name: '트레드밀',       sheet: '트레드밀',       time: 6, room: true },
  { key: 'rowing',      name: '로잉머신',       sheet: '로잉머신',       time: 7, room: true }
];

/* ===== 공통 엔진: 여러 학생을 한 번에 판정 (시트는 종목당 한 번만 읽음) ===== */
const stampFmt_ = (d, p) => Utilities.formatDate(d, STAMP.TZ, p);
const stampIdOf_ = e => String(e || '').trim().toLowerCase().split('@')[0];

/** ids(아이디 Set)의 기록을 모아 판정 준비. roster: stampRoster_() 결과 */
function stampCtx_(ss, ids, roster) {
  const now = new Date();
  const ctx = {
    now, today: stampFmt_(now, 'yyyy-MM-dd'), hour: Number(stampFmt_(now, 'H')),
    crit: stampCriteria_(ss), best: {}, bike: {}
  };
  const dayOf = v => v instanceof Date ? stampFmt_(v, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
  const sec = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  // best[아이디][날짜][종목] = 그날 가장 긴 측정시간(초)
  STAMP_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet); if (!sh) return;
    sh.getDataRange().getValues().slice(1).forEach(r => {
      const id = stampIdOf_(r[5]); if (!ids.has(id)) return;
      const d = dayOf(r[0]); if (!d) return;
      const byDay = ctx.best[id] || (ctx.best[id] = {});
      const b = byDay[d] || (byDay[d] = {});
      b[ex.key] = Math.max(b[ex.key] || 0, sec(r[ex.time]));
    });
  });
  const ride = stampRide_();                          // 인도어라이딩 시트 한 번만 읽음
  ids.forEach(id => { const st = roster.byId[id]; if (st) ctx.bike[id] = ride(st); });
  return ctx;
}

/** 한 학생의 하루 판정 */
function stampJudge_(ctx, id, d) {
  const w = Number(stampFmt_(new Date(d + 'T12:00:00+09:00'), 'u'));   // 1=월 … 7=일
  const weekend = w >= 6;
  const need = STAMP_EX.filter(ex => !(weekend && ctx.crit[ex.key].weekendOff));
  const b = ((ctx.best[id] || {})[d]) || {};
  const items = need.map(ex => {
    const s = b[ex.key] || 0, min = ctx.crit[ex.key].min;
    return { key: ex.key, name: ex.name, sec: Math.round(s * 10) / 10, min, ok: s >= min, tried: ex.key in b };
  });
  const done = items.filter(i => i.ok).length;
  const km = Math.round((((ctx.bike[id] || {})[d]) || 0) * 10) / 10;
  const bikeOpen = d < ctx.today || ctx.hour >= STAMP.BIKE_FROM_HOUR;
  const bikeOk = bikeOpen && km >= STAMP.BIKE_KM;
  const all = done === items.length;
  return { weekend, items, done, need: items.length, km, bikeOpen, bikeOk, stamp: all ? (bikeOk ? 100 : 90) : 0 };
}

/** 그 달 1일 ~ 오늘(또는 말일)의 날짜 목록 */
function stampMonthDays_(month, today) {
  const [Y, M] = month.split('-').map(Number);
  const last = new Date(Y, M, 0).getDate(), out = [];
  for (let i = 1; i <= last; i++) { const d = month + '-' + ('0' + i).slice(-2); if (d > today) break; out.push(d); }
  return out;
}

/** 연속 일수: 오늘(도장 없으면 어제)부터 거꾸로. 도장 없는 주말은 건너뛰고 끊지 않음. stampOf(d) → 0/90/100 */
function stampStreak_(today, stampOf) {
  let streak = 0;
  for (let t = new Date(today + 'T12:00:00+09:00'), first = true, n = 0; n < 400; t = new Date(t.getTime() - 864e5), first = false, n++) {
    const d = stampFmt_(t, 'yyyy-MM-dd');
    if (d < '2026-09-01') break;
    if (stampOf(d)) { streak++; continue; }
    const w = Number(stampFmt_(t, 'u'));
    if (first || w >= 6) continue;
    break;
  }
  return streak;
}

/** 모둠 도장 (규칙 ①): 모둠원 '모두' 개인 도장 → 90, 모두 완벽 도장 → 100 */
function stampGroupOf_(stamps) {
  if (!stamps.length || stamps.some(s => !s)) return 0;
  return stamps.every(s => s === 100) ? 100 : 90;
}

const stampMonthOf_ = (monthRaw, today) =>
  /^\d{4}-\d{2}$/.test(String(monthRaw || '')) && String(monthRaw) <= today.slice(0, 7) ? String(monthRaw) : today.slice(0, 7);

/** 한 학생의 오늘 진행 상황 + 한 달 도장 달력 + 우리 모둠 */
function stampSummary_(emailRaw, monthRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return { ok: false, error: '학교 계정이 아니에요' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const id = stampIdOf_(email), st = roster.byId[id];
  if (!st) return { ok: false, error: '명단에 없는 학생이에요' };

  const today = stampFmt_(new Date(), 'yyyy-MM-dd');
  const month = stampMonthOf_(monthRaw, today);
  const cache = CacheService.getScriptCache();
  const ck = 'stamp3_' + id + '_' + month;
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  const mates = st.group ? roster.list.filter(x => x.gkey === st.gkey) : [st];
  const ctx = stampCtx_(ss, new Set(mates.map(x => x.id)), roster);
  const days = {};
  stampMonthDays_(month, ctx.today).forEach(d => days[d] = stampJudge_(ctx, id, d));

  let group = null;
  if (st.group) {
    const gdays = {};
    stampMonthDays_(month, ctx.today).forEach(d => {
      const m = mates.map(x => x.id === id ? days[d].stamp : stampJudge_(ctx, x.id, d).stamp);
      gdays[d] = { stamp: stampGroupOf_(m), m };
    });
    const gOf = d => stampGroupOf_(mates.map(x => stampJudge_(ctx, x.id, d).stamp));
    group = {
      no: st.group,
      members: mates.map(x => ({ name: x.name, no: x.no, me: x.id === id })),
      days: gdays,
      monthCount: Object.values(gdays).filter(x => x.stamp).length,
      monthPerfect: Object.values(gdays).filter(x => x.stamp === 100).length,
      streak: stampStreak_(ctx.today, gOf)
    };
  }

  const out = {
    ok: true, updated: stampFmt_(ctx.now, 'HH:mm'), today: ctx.today, month,
    student: { name: st.name, grade: st.grade, cls: st.cls, no: st.no, group: st.group },
    rule: { bikeKm: STAMP.BIKE_KM, bikeFromHour: STAMP.BIKE_FROM_HOUR },
    todayStatus: stampJudge_(ctx, id, ctx.today), days,
    streak: stampStreak_(ctx.today, d => days[d] ? days[d].stamp : stampJudge_(ctx, id, d).stamp),
    monthCount: Object.values(days).filter(x => x.stamp).length,
    monthPerfect: Object.values(days).filter(x => x.stamp === 100).length,
    group
  };
  try { cache.put(ck, JSON.stringify(out), STAMP.CACHE_SEC); } catch (e) {}
  return out;
}

/** 반 전체 모둠 도장 (반별 모둠 화면). email(그 학생의 반) 또는 grade·cls 로 반을 정함
 *  반환: { classLabel, groups: [{ no, members:[{name,no}], days: { 날짜: { stamp, m:[{s,d,n}] } }, monthCount, monthPerfect, streak }] } */
function stampTeam_(p) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  let grade = String(p.grade || '').trim(), cls = String(p.cls || '').trim();
  if (p.email) {
    const st = roster.byId[stampIdOf_(p.email)];
    if (!st) return { ok: false, error: '명단에 없는 학생이에요' };
    grade = String(st.grade); cls = String(st.cls);
  }
  if (!grade || !cls) return { ok: false, error: '반을 알 수 없어요' };
  const today = stampFmt_(new Date(), 'yyyy-MM-dd');
  const month = stampMonthOf_(p.month, today);
  const cache = CacheService.getScriptCache();
  const ck = 'team1_' + grade + '_' + cls + '_' + month;
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  const inClass = roster.list.filter(x => String(x.grade) === grade && String(x.cls) === cls && x.group);
  if (!roster.hasGroupCol) return { ok: false, error: "학생명단에 '모둠' 열이 없어요" };
  const ctx = stampCtx_(ss, new Set(inClass.map(x => x.id)), roster);
  const dayList = stampMonthDays_(month, ctx.today);
  const byGroup = {};
  inClass.forEach(x => (byGroup[x.group] = byGroup[x.group] || []).push(x));
  const groups = Object.keys(byGroup).sort((a, b) => (Number(a) || 0) - (Number(b) || 0) || a.localeCompare(b)).map(g => {
    const mates = byGroup[g].sort((a, b) => (Number(a.no) || 0) - (Number(b.no) || 0));
    const cacheJ = {};
    const J = (x, d) => cacheJ[x.id + d] || (cacheJ[x.id + d] = stampJudge_(ctx, x.id, d));
    const days = {};
    dayList.forEach(d => {
      const m = mates.map(x => { const j = J(x, d); return { s: j.stamp, d: j.done, n: j.need }; });
      days[d] = { stamp: stampGroupOf_(m.map(x => x.s)), m };
    });
    return {
      no: g, members: mates.map(x => ({ name: x.name, no: x.no })), days,
      monthCount: Object.values(days).filter(x => x.stamp).length,
      monthPerfect: Object.values(days).filter(x => x.stamp === 100).length,
      streak: stampStreak_(ctx.today, d => stampGroupOf_(mates.map(x => J(x, d).stamp)))
    };
  });
  const out = {
    ok: true, updated: stampFmt_(ctx.now, 'HH:mm'), today: ctx.today, month,
    grade, cls, classLabel: `${grade}학년 ${cls}반`, groups,
    noGroup: roster.list.filter(x => String(x.grade) === grade && String(x.cls) === cls && !x.group).length
  };
  try { cache.put(ck, JSON.stringify(out), STAMP.CACHE_SEC); } catch (e) {}
  return out;
}

/** 학생명단 → { list:[{id,name,grade,cls,no,group,gkey}], byId, hasGroupCol }
 *  모둠은 제목이 '모둠'인 열에서 읽음(위치가 바뀌어도 됨). 기록 시트에는 모둠을 저장하지 않음 */
function stampRoster_(ss) {
  const C = SQUAT_CONFIG;
  const sh = ss.getSheetByName(C.ROSTER_SHEET);
  const out = { list: [], byId: {}, hasGroupCol: false };
  if (!sh) return out;
  const rows = sh.getDataRange().getDisplayValues();
  const gcol = (rows[0] || []).findIndex(h => String(h).trim() === '모둠');
  out.hasGroupCol = gcol >= 0;
  rows.slice(1).forEach(r => {
    const id = stampIdOf_(r[C.ROSTER_EMAIL_COL - 1]); if (!id) return;
    const st = {
      id, name: String(r[C.ROSTER_NAME_COL - 1]).trim(), grade: r[C.ROSTER_GRADE_COL - 1], cls: r[C.ROSTER_CLASS_COL - 1],
      no: r[C.ROSTER_NO_COL - 1], group: gcol >= 0 ? String(r[gcol]).trim() : ''
    };
    st.gkey = st.group ? [st.grade, st.cls, st.group].join('|') : '';
    out.list.push(st); out.byId[id] = st;
  });
  return out;
}

/** 통과기준 탭 → { key: { min, weekendOff } }. 탭이 없으면 기본값으로 만들어 둠 */
function stampCriteria_(ss) {
  const out = {};
  STAMP_EX.forEach(ex => out[ex.key] = { min: STAMP.DEFAULT_SEC, weekendOff: !!ex.room });
  let sh = ss.getSheetByName(STAMP.CRITERIA_SHEET);
  if (!sh) {
    try {
      sh = ss.insertSheet(STAMP.CRITERIA_SHEET);
      sh.appendRow(['종목', '최소시간(초)', '주말 제외(O)']);
      STAMP_EX.forEach(ex => sh.appendRow([ex.name, STAMP.DEFAULT_SEC, ex.room ? 'O' : '']));
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, 3).setFontWeight('bold');
    } catch (e) {}
    return out;
  }
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const ex = STAMP_EX.find(x => x.name === String(r[0]).trim()); if (!ex) return;
    const m = Number(r[1]);
    if (String(r[1]).trim() !== '' && isFinite(m) && m >= 0) out[ex.key].min = m;
    out[ex.key].weekendOff = /^(o|ㅇ|y|예|true)$/i.test(String(r[2]).trim());
  });
  return out;
}

/** 인도어라이딩 시트를 한 번 읽어, 학생 → { 날짜: km } 를 돌려주는 함수를 만듦.
 *  학년·반·번호(없으면 이름)로 찾음. 시트가 없거나 권한이 없으면 늘 {} */
function stampRide_() {
  const none = () => ({});
  const id = PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID');
  if (!id) return none;
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(STAMP.RIDE_TAB);
    if (!sh) return none;
    const rows = sh.getDataRange().getValues();
    const head = rows[STAMP.RIDE_HEAD_ROW - 1] || [];
    const cols = [];
    head.forEach((h, c) => {
      let m, d = '';
      if (h instanceof Date) d = Utilities.formatDate(h, STAMP.TZ, 'yyyy-MM-dd');
      else if ((m = String(h).match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/)))
        d = STAMP.RIDE_YEAR + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
      if (d) cols.push({ c, d });
    });
    const s = v => String(v == null ? '' : v).trim();
    const body = rows.slice(STAMP.RIDE_HEAD_ROW);
    return st => {
      const row = body.find(r => s(r[0]) === s(st.grade) && s(r[1]) === s(st.cls) && s(r[2]) === s(st.no))
               || body.find(r => s(r[3]) === s(st.name));
      if (!row) return {};
      const out = {};
      cols.forEach(({ c, d }) => { const v = Number(row[c]); if (isFinite(v) && v > 0) out[d] = (out[d] || 0) + v; });
      return out;
    };
  } catch (e) {
    return none;
  }
}

/** 편집기에서 확인: TEST_ID에 명단에 있는 아이디를 넣고 실행 → 실행 로그 (저장소에는 실제 아이디를 올리지 않음) */
function diagStamp() {
  const TEST_ID = '여기에_테스트용_아이디';
  CacheService.getScriptCache().remove('stamp3_' + TEST_ID + '_' + Utilities.formatDate(new Date(), STAMP.TZ, 'yyyy-MM'));
  Logger.log(JSON.stringify(stampSummary_(TEST_ID + SQUAT_CONFIG.DOMAIN), null, 2));
}
