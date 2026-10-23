/**
 * Dashboard.gs — 스마트스포츠실 큰 화면 현황판용 요약
 *  현황판(GitHub Pages …/sports/board/)이 JSONP로 action=dash 를 부르면 hubJsonp_(Hub.gs)가 dashSummary_()를 돌려줍니다.
 *  시트를 매번 다 읽지 않도록 60초 동안 캐시합니다.
 *
 *  보여 주는 것
 *   - 지금 운동 중 · 오늘 다녀간 인원 ('입퇴실' 탭 + 운동 기록)
 *     허브 공용 모드를 거치지 않은 학생(이 기기 모드, 운동 앱 직접 실행)도 빠지지 않도록
 *     오늘 운동 기록이 있으면 '다녀감', 최근 NOW_MIN분 안에 기록을 저장했으면 '지금 운동 중'으로 함께 셈
 *   - 종목별 오늘 누적 (운동별 탭 + 체력 기록장 '기록' 탭의 줄넘기·실내자전거)
 *   - 반별 이번 주 참여율 (이번 주 입실했거나 운동 기록이 있는 학생 수 ÷ 반 인원, '학생명단'의 학생만)
 *   - 학교 누적 거리 도전 (실내자전거 km만, START_DATE부터 — 트레드밀·로잉머신은 각자 카드에)
 *
 *  실내자전거는 '2026_인도어라이딩' 스프레드시트의 '2026' 시트에서 읽음
 *   스크립트 속성 RIDE_SHEET_ID 에 그 시트 주소의 /d/ 와 /edit 사이 글자를 넣어 둠 (저장소에는 올리지 않음)
 *   3번째 줄: 학년 | 반 | 번 | 이름 | 3 / 9 | 3 / 10 | … (날짜 칸), 4번째 줄부터 학생, 칸 값 = km
 *   RIDE_SHEET_ID가 없으면 체력 기록장 '기록' 탭의 실내자전거를 대신 씀
 *   - 축하 소식 (오늘 개인 최고 기록 · 처음 해 본 종목) — 이름은 SHOW_NAMES가 true일 때만
 *
 *  지난 날짜 보기: action=dash&date=2026-10-15 처럼 날짜를 주면 그날 기준으로 계산
 *   - 오늘(또는 date 없음): 60초 캐시, '지금 운동 중' 포함
 *   - 지난 날짜: 기록이 더 바뀌지 않으므로 6시간 캐시, '지금 운동 중'은 없음(null)
 *   - 반별 참여율은 그 주 월요일 ~ 그날, 거리 도전은 START_DATE ~ 그날
 *   - 오늘보다 뒤 날짜나 형식이 틀린 날짜는 오늘로 봄
 *
 *  다녀간 친구 명단(이름): 선생님 기기에서만
 *   - 스크립트 속성 DASH_KEY 에 비밀 열쇠를 넣어 둠 (저장소에는 올리지 않음)
 *   - 현황판 주소에 ?key=열쇠 를 한 번 붙여 열면 그 기기에 기억 → 요청에 key 가 붙으면 visitors 를 함께 보냄
 *   - 열쇠가 없거나 틀리면 이름은 절대 보내지 않음 (TV·학생 태블릿은 지금처럼 숫자만)
 */
const DASH = {
  TZ: 'Asia/Seoul',
  CACHE_SEC: 60,
  NOW_MIN: 15,                          // 운동 기록을 이 시간(분) 안에 저장했으면 '지금 운동 중'으로 봄 (이 기기 모드 대비)
  PAST_CACHE_SEC: 21600,                // 지난 날짜 캐시(6시간, CacheService 최대)
  SHOW_NAMES: false,                    // true면 축하 소식에 이름(성 빼고)을 보여 줌
  START_DATE: '2026-10-01',             // 누적 거리 도전을 세기 시작한 날
  DISTANCE_GOAL_KM: 100,                // 누적 거리 목표 (스크립트 속성 GOAL_KM 이 있으면 그 값)
  DISTANCE_GOAL_NAME: '',               // 제목 (스크립트 속성 GOAL_NAME 이 있으면 그 값, 없으면 '학교 전체 ○km 도전')
  FEED_MAX: 8,
  RIDE_TABS: ['2026', '2026_저학년'],   // 인도어라이딩 시트에서 읽을 탭들 (없는 탭은 건너뜀)
  RIDE_HEAD_ROW: 3,                     // 날짜가 적힌 줄
  RIDE_YEAR: 2026
};

/* 운동별 탭 읽는 법: 날짜·이메일·값이 몇 번째 칸인지 (0부터) */
const DASH_EX = [
  { key: 'squat',       name: '스쿼트',         sheet: '스쿼트',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'lunge',       name: '런지',           sheet: '런지',           email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'jumpingjack', name: '점핑잭',         sheet: '점핑잭',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'highknee',    name: '하이니',         sheet: '하이니',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'curlup',      name: '윗몸말아올리기', sheet: '윗몸말아올리기', email: 5, value: 7, unit: '회', sum: true, pbBy: 6 },
  { key: 'pushup',      name: '팔굽혀펴기',     sheet: '팔굽혀펴기',     email: 5, value: 8, unit: '회', sum: true, pbBy: 7 },
  { key: 'plank',       name: '플랭크',         sheet: '플랭크',         email: 5, value: 8, unit: '초', sum: true, pbBy: null, decimals: 1 },
  { key: 'hanging',     name: '행잉',           sheet: '행잉',           email: 5, value: 9, unit: '초', sum: true, pbBy: null, decimals: 1 },
  { key: 'treadmill',   name: '트레드밀',       sheet: '트레드밀',       email: 5, value: 8, unit: 'km', sum: true, pbBy: null, decimals: 2, distance: true, noPb: true },
  { key: 'jumprope',    name: '줄넘기',         sheet: '줄넘기',         email: 5, value: 7, unit: '회', sum: true, pbBy: 6, mergeInto: 'rope' },
  { key: 'rowing',      name: '로잉머신',       sheet: '로잉머신',       email: 5, value: 9, unit: 'km', sum: true, pbBy: null, decimals: 2, distance: true, noPb: true }
];
/* 체력 기록장 '기록' 탭: 기록시각 | 날짜 | 이메일 | 이름 | 영역 | 항목코드 | 항목 | 값 | 단위 | 힘든정도 */
const DASH_LOG = [
  { key: 'rope', name: '줄넘기',     code: 'rope', unit: '회', decimals: 0 },
  { key: 'bike', name: '실내자전거', code: 'bike', unit: 'km', decimals: 1, distance: true }
];

function dashSummary_(dateParam, key) {
  const realToday = Utilities.formatDate(new Date(), DASH.TZ, 'yyyy-MM-dd');
  let target = String(dateParam || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target) || target > realToday) target = realToday;
  const past = target < realToday;

  const cache = CacheService.getScriptCache();
  const cacheKey = past ? 'dash_d3_' + target : 'dash_v3';
  let out = null;
  const hit = cache.get(cacheKey);
  if (hit) { try { out = JSON.parse(hit); } catch (e) {} }
  if (!out && past) out = dashArchiveGet_(target);       // 지난 날: 한 번 계산한 결과를 '현황판보관' 탭에서 바로 꺼냄
  if (!out) {
    out = dashBuild_(past ? target : null);
    if (past) dashArchivePut_(target, out, realToday);
  }
  if (!hit) { try { cache.put(cacheKey, JSON.stringify(out), past ? DASH.PAST_CACHE_SEC : DASH.CACHE_SEC); } catch (e) {} }
  // 이름 명단은 열쇠가 맞을 때만 내보냄
  const visitors = out.visitors;
  delete out.visitors;
  if (key) {
    const real = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
    out.keyOk = !!real && String(key) === real;
    if (out.keyOk) out.visitors = visitors || [];
  }
  return out;
}

/** pastDay: 'yyyy-MM-dd'(지난 날짜) 또는 null(오늘·실시간) */
function dashBuild_(pastDay) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const day = d => Utilities.formatDate(d, DASH.TZ, 'yyyy-MM-dd');
  const past = !!pastDay;
  const base = past ? new Date(pastDay + 'T12:00:00+09:00') : now;   // 기준 날짜(지난 날은 그날 정오)
  const today = day(base);                                            // 아래 코드에서 '오늘' = 기준 날짜
  const dow = Number(Utilities.formatDate(base, DASH.TZ, 'u'));      // 1=월 … 7=일
  const monday = day(new Date(base.getTime() - (dow - 1) * 864e5));
  const asDay = v => v instanceof Date ? day(v) : String(v).trim().slice(0, 10);
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const roster = rosterMap_(ss);                                        // Main.gs: 아이디 → {grade, cls, no, name}
  const idOf = e => String(e || '').trim().toLowerCase().split('@')[0];
  const label = st => st && st.grade ? `${st.grade}학년 ${st.cls}반` : '교직원';
  const who = st => DASH.SHOW_NAMES && st && st.name ? ` ${String(st.name).slice(1)}` : '';

  // ---- 입퇴실: 지금 운동 중, 오늘 입실, 이번 주 반별 참여 ----
  const inNow = new Set(), inToday = new Set(), weekByClass = {};
  const visit = {};                                      // 아이디 → {첫 입실, 마지막 퇴실, 횟수, 지금 이용 중}
  const hm = v => v instanceof Date ? Utilities.formatDate(v, DASH.TZ, 'HH:mm') : String(v || '').trim().slice(0, 5).replace(/^(\d):/, '0$1:');
  const ck = ss.getSheetByName('입퇴실');
  if (ck) {
    ck.getDataRange().getValues().slice(1).forEach(r => {
      const d = asDay(r[0]), id = idOf(r[5]);
      if (!id) return;
      if (d === today) {
        inToday.add(id);
        const using = !past && r[10] === '이용 중';
        if (using) inNow.add(id);
        const v = visit[id] || (visit[id] = { id, name: String(r[4] || '').trim(), first: '', last: '', n: 0, now: false });
        const a = hm(r[6]), b = hm(r[7]);
        v.n++; v.now = v.now || using;
        if (a && (!v.first || a < v.first)) v.first = a;
        if (b && /^\d\d:\d\d$/.test(b) && b > v.last) v.last = b;
      }
      if (d >= monday && d <= today) {
        const st = roster[id];
        if (st && st.grade) { const c = label(st); if (!weekByClass[c]) weekByClass[c] = new Set(); weekByClass[c].add(id); }
      }
    });
  }
  // 운동 기록으로 본 활동: 아이디 → { first, last (ms) } — 아래 종목 탭을 읽으면서 채움
  const act = {};
  const addAct = (id, d, t) => {
    if (d >= monday && d <= today) {
      const st = roster[id];
      if (st && st.grade) { const c = label(st); if (!weekByClass[c]) weekByClass[c] = new Set(); weekByClass[c].add(id); }
    }
    if (d !== today || !t) return;
    const a = act[id] || (act[id] = { first: t, last: t });
    if (t < a.first) a.first = t;
    if (t > a.last) a.last = t;
  };

  // ---- 종목별 오늘 누적 · 누적 거리 · 축하 소식 ----
  const totals = [], feed = [], exSets = {};
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
        addAct(id, d, r[0] instanceof Date ? r[0].getTime() : 0);
        if (d === today) { total += v; people.add(id); }
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
    exSets[ex.key] = { total, people };
    if (!ex.mergeInto) totals.push({ key: ex.key, name: ex.name, unit: ex.unit, value: dashRound_(total, ex.decimals), people: people.size });
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
      if (id) addAct(id, d, r[0] instanceof Date ? r[0].getTime() : 0);
      if (d === today) { logTotals[it.key].total += v; logTotals[it.key].people.add(id); }
      if (it.distance && d >= DASH.START_DATE && d <= today) distanceKm += v;
    });
  }
  if (ride) {
    logTotals.bike.total = ride.todayKm;
    logTotals.bike.people = { size: ride.todayPeople };
    distanceKm += ride.sinceKm;
  }
  // 카메라 줄넘기 앱('줄넘기' 탭) 기록을 체력 기록장 줄넘기와 합침
  DASH_EX.filter(ex => ex.mergeInto && exSets[ex.key]).forEach(ex => {
    const t = logTotals[ex.mergeInto]; if (!t) return;
    t.total += exSets[ex.key].total;
    exSets[ex.key].people.forEach(id => t.people.add(id));
  });
  DASH_LOG.forEach(it => totals.push({
    key: it.key, name: it.name, unit: it.unit,
    value: dashRound_(logTotals[it.key].total, it.decimals), people: logTotals[it.key].people.size
  }));

  // ---- 입퇴실 + 운동 기록 합치기 ----
  const nowMs = now.getTime(), hmMs = t => Utilities.formatDate(new Date(t), DASH.TZ, 'HH:mm');
  Object.keys(act).forEach(id => {
    const a = act[id], st = roster[id] || {};
    inToday.add(id);
    const recent = !past && nowMs - a.last <= DASH.NOW_MIN * 60000;
    if (recent) inNow.add(id);
    const v = visit[id] || (visit[id] = { id, name: st.name || '', first: '', last: '', n: 1, now: false });
    const f = hmMs(a.first), l = hmMs(a.last);
    if (!v.first || f < v.first) v.first = f;
    if (l > v.last) v.last = l;
    v.now = v.now || recent;
  });
  const classSize = {};
  Object.values(roster).forEach(st => { if (st.grade) classSize[label(st)] = (classSize[label(st)] || 0) + 1; });
  const classes = Object.keys(classSize).map(c => ({
    cls: c, size: classSize[c], came: weekByClass[c] ? weekByClass[c].size : 0
  })).map(x => Object.assign(x, { rate: x.size ? Math.round(x.came / x.size * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate || a.cls.localeCompare(b.cls, 'ko'));

  feed.sort((a, b) => b.t - a.t);
  return {
    ok: true,
    updated: Utilities.formatDate(now, DASH.TZ, 'HH:mm'),
    past, today, weekFrom: monday,
    now: past ? null : inNow.size, todayIn: inToday.size,
    totals, classes,
    distance: dashGoal_(dashRound_(distanceKm, 1)),
    feed: feed.slice(0, DASH.FEED_MAX).map(f => f.text),
    visitors: Object.values(visit).map(v => {             // dashSummary_가 열쇠 확인 후에만 내보냄
      const st = roster[v.id] || {};
      return {
        grade: st.grade || '', cls: st.cls || '', no: st.no || '',
        name: st.name || v.name || v.id,
        first: v.first, last: v.now ? '' : v.last, n: v.n, now: v.now
      };
    }).sort((a, b) => (a.grade === '') - (b.grade === '') || String(a.grade).localeCompare(String(b.grade), 'ko', { numeric: true })
      || String(a.cls).localeCompare(String(b.cls), 'ko', { numeric: true }) || (Number(a.no) || 0) - (Number(b.no) || 0))
  };
}

/** 인도어라이딩 '2026' 탭 → { todayKm, todayPeople, sinceKm(START_DATE부터) } 또는 null */
function dashRide_(today) {
  const id = PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID');
  if (!id) return null;
  try {
    const book = SpreadsheetApp.openById(id);
    const out = { todayKm: 0, todayPeople: 0, sinceKm: 0 };
    let found = false;
    DASH.RIDE_TABS.forEach(name => {
      const sh = book.getSheetByName(name); if (!sh) return;
      found = true;
      const rows = sh.getDataRange().getValues();
      const cols = rideDateCols_(rows[DASH.RIDE_HEAD_ROW - 1] || [], DASH.TZ, DASH.RIDE_YEAR);   // Stamp.gs
      rows.slice(DASH.RIDE_HEAD_ROW).forEach(r => {
        if (!String(r[3] || '').trim()) return;             // 이름 없는 줄(합계 등)은 건너뜀
        cols.forEach(({ c, d }) => {
          const v = Number(r[c]);
          if (!isFinite(v) || v <= 0) return;
          if (d === today) { out.todayKm += v; out.todayPeople++; }
          if (d >= DASH.START_DATE && d <= today) out.sinceKm += v;
        });
      });
    });
    return found ? out : null;
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
  CacheService.getScriptCache().remove('dash_v3');
  Logger.log(JSON.stringify(dashSummary_(), null, 2));
}

/** 지난 날짜 확인: 어제 기준 결과 (캐시 지우고 새로 계산) */
function diagDashboardYesterday() {
  const y = Utilities.formatDate(new Date(Date.now() - 864e5), DASH.TZ, 'yyyy-MM-dd');
  CacheService.getScriptCache().remove('dash_d3_' + y);
  Logger.log(JSON.stringify(dashSummary_(y), null, 2));
}

/* ===== 지난 날 보관 =====
 * 지난 날짜 현황판은 계산에 약 8초(탭 13개 + 인도어라이딩 시트)가 걸리지만 결과는 더 바뀌지 않음.
 * 그래서 한 번 계산하면 숨긴 탭 '현황판보관'(A 날짜 · B 결과 JSON · C 만든 시각)에 남겨 두고 다음부터는 그 한 줄만 읽음.
 * 이틀 이상 지난 날만 보관(어제 기록은 자전거 입력·18시 퇴실 정리 등으로 아직 바뀔 수 있음).
 * 지난 기록을 시트에서 고쳤다면 편집기에서 clearDashArchive() 실행(또는 그 날짜 줄을 지움). */
const DASH_ARCHIVE = '현황판보관';

function dashArchiveSheet_(create) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(DASH_ARCHIVE);
  if (!sh && create) {
    sh = ss.insertSheet(DASH_ARCHIVE);
    sh.appendRow(['날짜', '결과(JSON) — 현황판 지난 날 보관, 지워도 다시 만들어짐', '만든 시각']);
    sh.setFrozenRows(1);
    try { sh.hideSheet(); } catch (e) {}
  }
  return sh;
}
function dashArchiveGet_(day) {
  try {
    const sh = dashArchiveSheet_(false); if (!sh || sh.getLastRow() < 2) return null;
    const days = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues();
    for (let i = days.length - 1; i >= 0; i--) {
      if (days[i][0] === day) return JSON.parse(sh.getRange(i + 2, 2).getValue());
    }
  } catch (e) {}
  return null;
}
function dashArchivePut_(day, out, today) {
  const twoDaysAgo = Utilities.formatDate(new Date(new Date(today + 'T12:00:00+09:00').getTime() - 2 * 864e5), DASH.TZ, 'yyyy-MM-dd');
  if (day > twoDaysAgo) return;                          // 어제·그제(아직 바뀔 수 있음)는 캐시(6시간)만
  try {
    const j = JSON.stringify(out); if (j.length > 49000) return;   // 칸 하나 최대 5만 자
    const lock = LockService.getDocumentLock(); if (!lock.tryLock(5000)) return;
    try {
      if (dashArchiveGet_(day)) return;
      const sh = dashArchiveSheet_(true);
      const r = sh.getLastRow() + 1;
      sh.getRange(r, 1, 1, 3).setNumberFormat('@').setValues([[day, j, Utilities.formatDate(new Date(), DASH.TZ, 'yyyy-MM-dd HH:mm')]]);
    } finally { lock.releaseLock(); }
  } catch (e) {}
}
/** 편집기에서 한 번: START_DATE부터 이틀 전까지 비어 있는 날을 미리 채움(4분 넘으면 멈춤, 다시 실행하면 이어서) */
function fillDashArchive() {
  const t0 = Date.now(), today = Utilities.formatDate(new Date(), DASH.TZ, 'yyyy-MM-dd');
  let n = 0;
  for (let d = new Date(DASH.START_DATE + 'T12:00:00+09:00'); ; d = new Date(d.getTime() + 864e5)) {
    const day = Utilities.formatDate(d, DASH.TZ, 'yyyy-MM-dd');
    if (day >= today || Date.now() - t0 > 240000) break;
    if (dashArchiveGet_(day)) continue;
    dashArchivePut_(day, dashBuild_(day), today); n++;
  }
  Logger.log('보관한 날: ' + n + '일 · ' + Math.round((Date.now() - t0) / 1000) + '초');
}
/** 지난 기록을 고쳤을 때: 보관 탭을 비움(다음에 볼 때 다시 계산) */
function clearDashArchive() {
  const sh = dashArchiveSheet_(false);
  if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  Logger.log('현황판 보관을 비웠어요');
}
/** 한 번 실행: 매일 새벽 1시에 이틀 전 날을 미리 보관 */
function setupDashArchive() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'fillDashArchive').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('fillDashArchive').timeBased().atHour(1).everyDays(1).inTimezone(DASH.TZ).create();
  Logger.log('매일 1시 fillDashArchive 트리거를 만들었어요');
}

