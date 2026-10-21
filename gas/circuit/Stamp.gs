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
 *  허브 JSONP: action=stamp&email=…&month=yyyy-MM  → stampSummary_()
 *    Hub.gs 의 hubJsonp_ 에 한 줄:  else if (p.action === 'stamp') out = stampSummary_(p.email, p.month);
 *  화면: …/sports/stamp/  (허브 '내 도장' 카드)
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

/** 한 학생의 오늘 진행 상황 + 한 달 도장 달력 */
function stampSummary_(emailRaw, monthRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return { ok: false, error: '학교 계정이 아니에요' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const st = lookupStudent_(ss, email);
  if (!st.name) return { ok: false, error: '명단에 없는 학생이에요' };

  const now = new Date();
  const fmt = (d, p) => Utilities.formatDate(d, STAMP.TZ, p);
  const today = fmt(now, 'yyyy-MM-dd');
  const month = /^\d{4}-\d{2}$/.test(String(monthRaw || '')) && String(monthRaw) <= today.slice(0, 7)
    ? String(monthRaw) : today.slice(0, 7);

  const cache = CacheService.getScriptCache();
  const ck = 'stamp_' + email.split('@')[0] + '_' + month;
  const hit = cache.get(ck);
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  const id = email.split('@')[0];
  const crit = stampCriteria_(ss);
  const idOf = e => String(e || '').trim().toLowerCase().split('@')[0];
  const dayOf = v => v instanceof Date ? fmt(v, 'yyyy-MM-dd') : String(v).trim().slice(0, 10);
  const sec = v => { const x = Number(v); return isFinite(x) ? x : 0; };

  // best[날짜][종목] = 그날 가장 긴 측정시간(초), cnt[날짜] = 그날 기록 수
  const best = {};
  STAMP_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet); if (!sh) return;
    sh.getDataRange().getValues().slice(1).forEach(r => {
      if (idOf(r[5]) !== id) return;
      const d = dayOf(r[0]); if (!d) return;
      const b = best[d] || (best[d] = {});
      b[ex.key] = Math.max(b[ex.key] || 0, sec(r[ex.time]));
    });
  });
  const bike = stampBike_(st);                       // { 'yyyy-MM-dd': km } 또는 {}
  const hour = Number(fmt(now, 'H'));

  const judge = d => {
    const w = Number(fmt(new Date(d + 'T12:00:00+09:00'), 'u'));   // 1=월 … 7=일
    const weekend = w >= 6;
    const need = STAMP_EX.filter(ex => !(weekend && crit[ex.key].weekendOff));
    const b = best[d] || {};
    const items = need.map(ex => {
      const s = b[ex.key] || 0, min = crit[ex.key].min;
      return { key: ex.key, name: ex.name, sec: Math.round(s * 10) / 10, min, ok: s >= min, tried: ex.key in b };
    });
    const done = items.filter(i => i.ok).length;
    const km = Math.round((bike[d] || 0) * 10) / 10;
    const bikeOpen = d < today || hour >= STAMP.BIKE_FROM_HOUR;
    const bikeOk = bikeOpen && km >= STAMP.BIKE_KM;
    const all = done === items.length;
    return { weekend, items, done, need: items.length, km, bikeOpen, bikeOk, stamp: all ? (bikeOk ? 100 : 90) : 0 };
  };

  // 달력: 그 달 1일 ~ 말일(오늘 이후는 비움)
  const [Y, M] = month.split('-').map(Number);
  const last = new Date(Y, M, 0).getDate();
  const days = {};
  for (let i = 1; i <= last; i++) {
    const d = month + '-' + ('0' + i).slice(-2);
    if (d > today) break;
    const j = judge(d);
    days[d] = { stamp: j.stamp, done: j.done, need: j.need };
  }

  // 연속 도장: 오늘(도장 없으면 어제)부터 거꾸로. 도장 없는 주말은 건너뛰고 끊지 않음
  let streak = 0;
  for (let t = new Date(today + 'T12:00:00+09:00'), first = true; streak < 400; t = new Date(t.getTime() - 864e5), first = false) {
    const d = fmt(t, 'yyyy-MM-dd'), j = judge(d);
    if (j.stamp) { streak++; continue; }
    if (first || j.weekend) continue;                  // 오늘은 아직 진행 중일 수 있음
    break;
  }

  const t = judge(today);
  const out = {
    ok: true, updated: fmt(now, 'HH:mm'), today, month,
    student: { name: st.name, grade: st.grade, cls: st.cls, no: st.no },
    rule: { bikeKm: STAMP.BIKE_KM, bikeFromHour: STAMP.BIKE_FROM_HOUR },
    todayStatus: t, days, streak,
    monthCount: Object.values(days).filter(x => x.stamp).length,
    monthPerfect: Object.values(days).filter(x => x.stamp === 100).length
  };
  try { cache.put(ck, JSON.stringify(out), STAMP.CACHE_SEC); } catch (e) {}
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

/** 인도어라이딩 시트에서 이 학생의 날짜별 km. 학년·반·번호(없으면 이름)로 찾음 */
function stampBike_(st) {
  const id = PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID');
  if (!id) return {};
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(STAMP.RIDE_TAB);
    if (!sh) return {};
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
    const row = rows.slice(STAMP.RIDE_HEAD_ROW).find(r => s(r[0]) === s(st.grade) && s(r[1]) === s(st.cls) && s(r[2]) === s(st.no))
             || rows.slice(STAMP.RIDE_HEAD_ROW).find(r => s(r[3]) === s(st.name));
    if (!row) return {};
    const out = {};
    cols.forEach(({ c, d }) => { const v = Number(row[c]); if (isFinite(v) && v > 0) out[d] = (out[d] || 0) + v; });
    return out;
  } catch (e) {
    return {};
  }
}

/** 편집기에서 확인: TEST_ID에 명단에 있는 아이디를 넣고 실행 → 실행 로그 (저장소에는 실제 아이디를 올리지 않음) */
function diagStamp() {
  const TEST_ID = '여기에_테스트용_아이디';
  CacheService.getScriptCache().remove('stamp_' + TEST_ID + '_' + Utilities.formatDate(new Date(), STAMP.TZ, 'yyyy-MM'));
  Logger.log(JSON.stringify(stampSummary_(TEST_ID + SQUAT_CONFIG.DOMAIN), null, 2));
}
