/**
 * Dashboard.gs — 스마트스포츠실 큰 화면 현황판용 요약
 *  현황판(GitHub Pages …/sports/board/)이 JSONP로 action=dash 를 부르면 hubJsonp_(Hub.gs)가 dashSummary_()를 돌려줍니다.
 *  시트를 매번 다 읽지 않도록 60초 동안 캐시합니다.
 *
 *  보여 주는 것
 *   - 지금 운동 중 · 오늘 입실 인원 ('입퇴실' 탭)
 *   - 종목별 오늘 누적 (운동별 탭 + 체력 기록장 '기록' 탭의 줄넘기·실내자전거)
 *   - 반별 이번 주 참여율 (이번 주 입실한 학생 수 ÷ 반 인원, '학생명단'의 학생만)
 *   - 학교 누적 거리 도전 (트레드밀·로잉머신·실내자전거 km, START_DATE부터)
 *
 *  실내자전거는 '2026_인도어라이딩' 스프레드시트의 '2026' 시트에서 읽음
 *   스크립트 속성 RIDE_SHEET_ID 에 그 시트 주소의 /d/ 와 /edit 사이 글자를 넣어 둠 (저장소에는 올리지 않음)
 *   3번째 줄: 학년 | 반 | 번 | 이름 | 3 / 9 | 3 / 10 | … (날짜 칸), 4번째 줄부터 학생, 칸 값 = km
 *   RIDE_SHEET_ID가 없으면 체력 기록장 '기록' 탭의 실내자전거를 대신 씀
 *   - 축하 소식 (오늘 개인 최고 기록 · 처음 해 본 종목) — 이름은 SHOW_NAMES가 true일 때만
 */
const DASH = {
  TZ: 'Asia/Seoul',
  CACHE_SEC: 60,
  SHOW_NAMES: false,                    // true면 축하 소식에 이름(성 빼고)을 보여 줌
  START_DATE: '2026-10-01',             // 누적 거리 도전을 세기 시작한 날
  DISTANCE_GOAL_KM: 100,                // 누적 거리 목표 (스크립트 속성 GOAL_KM 이 있으면 그 값)
  DISTANCE_GOAL_NAME: '',               // 제목 (스크립트 속성 GOAL_NAME 이 있으면 그 값, 없으면 '학교 전체 ○km 도전')
  FEED_MAX: 8,
  RIDE_TAB: '2026',                     // 인도어라이딩 시트의 탭 이름
  RIDE_HEAD_ROW: 3,                     // 날짜가 적힌 줄
  RIDE_YEAR: 2026
};

/* 운동별 탭 읽는 법: 날짜·이메일·값이 몇 번째 칸인지 (0부터) */
const DASH_EX = [
  { key: 'squat',       name: '스쿼트',         sheet: '스쿼트',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'lunge',       name: '런지',           sheet: '런지',           email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'jumpingjack', name: '점핑잭',         sheet: '점핑잭',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'curlup',      name: '윗몸말아올리기', sheet: '윗몸말아올리기', email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'pushup',      name: '팔굽혀펴기',     sheet: '팔굽혀펴기',     email: 5, value: 8, unit: '회', sum: true, pbBy: 7 },
  { key: 'plank',       name: '플랭크',         sheet: '플랭크',         email: 5, value: 8, unit: '초', sum: true, pbBy: null, decimals: 1 },
  { key: 'hanging',     name: '행잉',           sheet: '행잉',           email: 10, value: 8, unit: '초', sum: true, pbBy: null, decimals: 1 },
  { key: 'treadmill',   name: '트레드밀',       sheet: '트레드밀',       email: 9, value: 7, unit: 'km', sum: true, pbBy: null, decimals: 2, distance: true, noPb: true },
  { key: 'rowing',      name: '로잉머신',       sheet: '로잉머신',       email: 5, value: 9, unit: 'km', sum: true, pbBy: null, decimals: 2, distance: true, noPb: true }
];
/* 체력 기록장 '기록' 탭: 기록시각 | 날짜 | 이메일 | 이름 | 영역 | 항목코드 | 항목 | 값 | 단위 | 힘든정도 */
const DASH_LOG = [
  { key: 'rope', name: '줄넘기',     code: 'rope', unit: '회', decimals: 0 },
  { key: 'bike', name: '실내자전거', code: 'bike', unit: 'km', decimals: 1, distance: true }
];

function dashSummary_() {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('dash_v1');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }
  const out = dashBuild_();
  try { cache.put('dash_v1', JSON.stringify(out), DASH.CACHE_SEC); } catch (e) {}
  return out;
}

function dashBuild_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const day = d => Utilities.formatDate(d, DASH.TZ, 'yyyy-MM-dd');
  const today = day(now);
  const dow = Number(Utilities.formatDate(now, DASH.TZ, 'u'));       // 1=월 … 7=일
  const monday = day(new Date(now.getTime() - (dow - 1) * 864e5));
  const asDay = v => v instanceof Date ? day(v) : String(v).trim().slice(0, 10);
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const roster = rosterMap_(ss);                                        // Main.gs: 아이디 → {grade, cls, no, name}
  const idOf = e => String(e || '').trim().toLowerCase().split('@')[0];
  const label = st => st && st.grade ? `${st.grade}학년 ${st.cls}반` : '교직원';
  const who = st => DASH.SHOW_NAMES && st && st.name ? ` ${String(st.name).slice(1)}` : '';

  // ---- 입퇴실: 지금 운동 중, 오늘 입실, 이번 주 반별 참여 ----
  const inNow = new Set(), inToday = new Set(), weekByClass = {};
  const ck = ss.getSheetByName('입퇴실');
  if (ck) {
    ck.getDataRange().getValues().slice(1).forEach(r => {
      const d = asDay(r[0]), id = idOf(r[5]);
      if (!id) return;
      if (d === today) { inToday.add(id); if (r[10] === '이용 중') inNow.add(id); }
      if (d >= monday && d <= today) {
        const st = roster[id];
        if (st && st.grade) { const c = label(st); if (!weekByClass[c]) weekByClass[c] = new Set(); weekByClass[c].add(id); }
      }
    });
  }
  const classSize = {};
  Object.values(roster).forEach(st => { if (st.grade) classSize[label(st)] = (classSize[label(st)] || 0) + 1; });
  const classes = Object.keys(classSize).map(c => ({
    cls: c, size: classSize[c], came: weekByClass[c] ? weekByClass[c].size : 0
  })).map(x => Object.assign(x, { rate: x.size ? Math.round(x.came / x.size * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate || a.cls.localeCompare(b.cls, 'ko'));

  // ---- 종목별 오늘 누적 · 누적 거리 · 축하 소식 ----
  const totals = [], feed = [];
  let distanceKm = 0;
  const feedPush = (time, text) => feed.push({ t: time, text });

  DASH_EX.forEach(ex => {
    const sh = ss.getSheetByName(ex.sheet);
    let total = 0, people = new Set();
    if (sh) {
      const rows = sh.getDataRange().getValues().slice(1);
      const best = {};                                   // 아이디|측정조건 → 오늘 전 최고
      const tried = new Set();                           // 오늘 전 해 본 아이디
      rows.forEach(r => {
        const d = asDay(r[0]); if (!d) return;
        const id = idOf(r[ex.email]); if (!id) return;
        const v = num(r[ex.value]);
        if (d === today) { total += v; people.add(id); }
        if (ex.distance && d >= DASH.START_DATE) distanceKm += v;
        if (d < today) {
          tried.add(id);
          const k = id + '|' + (ex.pbBy == null ? '' : r[ex.pbBy]);
          if (!(k in best) || v > best[k]) best[k] = v;
        }
      });
      // 오늘 기록 중 개인 최고 갱신 / 처음 해 본 종목
      const seenFirst = new Set();
      rows.forEach(r => {
        const d = asDay(r[0]); if (d !== today) return;
        const id = idOf(r[ex.email]); if (!id) return;
        const st = roster[id], v = num(r[ex.value]);
        const time = r[0] instanceof Date ? r[0].getTime() : 0;
        if (!tried.has(id) && !seenFirst.has(id)) {
          seenFirst.add(id);
          feedPush(time, `${label(st)}${who(st)} 친구가 ${ex.name}에 처음 도전했어요`);
          return;
        }
        const k = id + '|' + (ex.pbBy == null ? '' : r[ex.pbBy]);
        if (!ex.noPb && k in best && v > best[k] && v > 0) {
          best[k] = v;
          feedPush(time, `${label(st)}${who(st)} 친구가 ${ex.name} 개인 최고 ${dashFmt_(v, ex.decimals)}${ex.unit}!`);
        }
      });
    }
    totals.push({ key: ex.key, name: ex.name, unit: ex.unit, value: dashRound_(total, ex.decimals), people: people.size });
  });

  const log = ss.getSheetByName('기록');
  const logTotals = {};
  DASH_LOG.forEach(it => logTotals[it.key] = { total: 0, people: new Set() });
  const ride = dashRide_(today);                         // 인도어라이딩 시트 (없으면 null)
  if (log) {
    log.getDataRange().getValues().slice(1).forEach(r => {
      const it = DASH_LOG.find(x => x.code === String(r[5])); if (!it) return;
      if (it.key === 'bike' && ride) return;               // 실내자전거는 인도어라이딩 시트로
      const d = asDay(r[1]), v = num(r[7]), id = idOf(r[2]);
      if (d === today) { logTotals[it.key].total += v; logTotals[it.key].people.add(id); }
      if (it.distance && d >= DASH.START_DATE) distanceKm += v;
    });
  }
  if (ride) {
    logTotals.bike.total = ride.todayKm;
    logTotals.bike.people = { size: ride.todayPeople };
    distanceKm += ride.sinceKm;
  }
  DASH_LOG.forEach(it => totals.push({
    key: it.key, name: it.name, unit: it.unit,
    value: dashRound_(logTotals[it.key].total, it.decimals), people: logTotals[it.key].people.size
  }));

  feed.sort((a, b) => b.t - a.t);
  return {
    ok: true,
    updated: Utilities.formatDate(now, DASH.TZ, 'HH:mm'),
    today, weekFrom: monday,
    now: inNow.size, todayIn: inToday.size,
    totals, classes,
    distance: dashGoal_(dashRound_(distanceKm, 1)),
    feed: feed.slice(0, DASH.FEED_MAX).map(f => f.text)
  };
}

/** 인도어라이딩 '2026' 탭 → { todayKm, todayPeople, sinceKm(START_DATE부터) } 또는 null */
function dashRide_(today) {
  const id = PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID');
  if (!id) return null;
  try {
    const sh = SpreadsheetApp.openById(id).getSheetByName(DASH.RIDE_TAB);
    if (!sh) return null;
    const rows = sh.getDataRange().getValues();
    const head = rows[DASH.RIDE_HEAD_ROW - 1] || [];
    // 날짜 칸 찾기: '3 / 9' 같은 글자 또는 날짜 값
    const cols = [];
    head.forEach((h, c) => {
      let m, d = '';
      if (h instanceof Date) d = Utilities.formatDate(h, DASH.TZ, 'yyyy-MM-dd');
      else if ((m = String(h).match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/)))
        d = DASH.RIDE_YEAR + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
      if (d) cols.push({ c, d });
    });
    const out = { todayKm: 0, todayPeople: 0, sinceKm: 0 };
    rows.slice(DASH.RIDE_HEAD_ROW).forEach(r => {
      if (!String(r[3] || '').trim()) return;               // 이름 없는 줄(합계 등)은 건너뜀
      cols.forEach(({ c, d }) => {
        const v = Number(r[c]);
        if (!isFinite(v) || v <= 0) return;
        if (d === today) { out.todayKm += v; out.todayPeople++; }
        if (d >= DASH.START_DATE && d <= today) out.sinceKm += v;
      });
    });
    return out;
  } catch (e) {
    return null;                                           // 권한·주소 문제면 '기록' 탭으로 대신
  }
}

/** 거리 목표: 스크립트 속성 GOAL_KM · GOAL_NAME 으로 바꿀 수 있음 (배포 다시 안 해도 1분 뒤 반영) */
function dashGoal_(km) {
  const pr = PropertiesService.getScriptProperties();
  const goal = Number(pr.getProperty('GOAL_KM')) || DASH.DISTANCE_GOAL_KM;
  const name = pr.getProperty('GOAL_NAME') || DASH.DISTANCE_GOAL_NAME || `학교 전체 ${goal.toLocaleString()}km 도전`;
  return { km, goal, name, from: DASH.START_DATE };
}

function dashRound_(v, d) { const f = Math.pow(10, d || 0); return Math.round(v * f) / f; }
function dashFmt_(v, d) { return d ? Number(v).toFixed(d) : String(Math.round(v)); }

/** 편집기에서 실행해 결과 확인 */
function diagDashboard() {
  CacheService.getScriptCache().remove('dash_v1');
  Logger.log(JSON.stringify(dashSummary_(), null, 2));
}
