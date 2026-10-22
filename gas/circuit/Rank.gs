/*************************************************************
 * Rank.gs — 종목별 순위 화면(rank/) 데이터
 *  허브 JSONP: action=rank&ex=squat&period=today|week|month[&key=열쇠]
 *    Hub.gs hubJsonp_ 에 한 줄:  else if (p.action === 'rank') out = rankSummary_(p.ex, p.period, p.key);
 *
 *  돌려주는 모양 (rank/index.html 주석과 같음)
 *   total·people·avgPer : 기간 합계 · 참여 인원 · 1인 평균
 *   allTime             : 2026-10-01부터 학교 전체 누적 (목표 막대)
 *   best   : 기간 안 1회 최고 기록 (학생 × 측정 조건마다 1개, cond = 측정시간·방식)
 *   growth : 기간 최고가 '기간 전 최고'(없으면 기간 첫 기록)보다 늘어난 양 value(회·초·km), pct도 함께 (같은 조건끼리)
 *   streak : 기간 안에 이 종목을 한 날 수
 *   classes: 반별 참여 인원 · 1인 평균
 *   pbs    : 기간 안에 개인 최고를 새로 세운 기록 (최근 순 20개)
 *  학생 이름은 선생님 열쇠(스크립트 속성 DASH_KEY)가 맞을 때만 그대로, 아니면 가운데를 가림(김*서)
 *  열 위치는 CLAUDE.md '시트 데이터 구조' 표 (0부터)
 *************************************************************/
const RANK = {
  TZ: 'Asia/Seoul',
  ALL_FROM: '2026-10-01',
  CACHE_SEC: 60,
  GROWTH_CAP: 300
};
/* id는 rank/index.html EX의 id와 같게. value: 대표 기록 열, cond: 측정 조건 열(같은 조건끼리만 최고 기록 비교) */
const RANK_EX = {
  squat:       { sheet: '스쿼트',         value: 7, cond: 6 },
  lunge:       { sheet: '런지',           value: 7, cond: 6 },
  jumpingjack: { sheet: '점핑잭',         value: 7, cond: 6 },
  curlup:      { sheet: '윗몸말아올리기', value: 7, cond: 6 },
  highknee:    { sheet: '하이니',         value: 7, cond: 6 },
  pushup:      { sheet: '팔굽혀펴기',     value: 8, cond: 7 },
  plank:       { sheet: '플랭크',         value: 8 },               // 버틴 시간(초)
  hanging:     { sheet: '행잉',           value: 9 },               // 매달린 시간(초)
  rope:        { sheet: '줄넘기',         value: 7, cond: 6 },      // 횟수, 방식(30초·1분·50회…)
  treadmill:   { sheet: '트레드밀',       value: 8 },               // 거리(km)
  rowing:      { sheet: '로잉머신',       value: 9 },               // 거리(km)
  bike:        { ride: true }                                       // 인도어라이딩 시트(날짜별 km)
};

function rankSummary_(exRaw, periodRaw, key) {
  const exId = String(exRaw || '');
  const cfg = RANK_EX[exId];
  if (!cfg) return { ok: false, error: '알 수 없는 종목' };
  const period = ['today', 'week', 'month'].includes(periodRaw) ? periodRaw : 'week';
  const real = PropertiesService.getScriptProperties().getProperty('DASH_KEY');
  const keyOk = !!real && !!key && String(key) === real;

  // 결과를 6시간 보관하고 CACHE_SEC(60초)가 지나면 새로 만듦. 새로 만들다 실패하면(시간 초과·동시 실행 한도 등) 옛 결과로 답함
  const cache = CacheService.getScriptCache();
  const ck = 'rank3_' + exId + '_' + period + (keyOk ? '_k' : '');
  let old = null;
  const hit = cache.get(ck);
  if (hit) { try { old = JSON.parse(hit); } catch (e) {} }
  if (old && Date.now() - (old._at || 0) < RANK.CACHE_SEC * 1000) return old;
  try {
    const out = rankBuild_(exId, cfg, period, keyOk);
    out._at = Date.now();
    try { const j = JSON.stringify(out); if (j.length < 95000) cache.put(ck, j, 21600); } catch (e) {}
    return out;
  } catch (err) {
    if (old) return old;
    throw err;
  }
}

function rankBuild_(exId, cfg, period, keyOk) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const fmt = (d, p) => Utilities.formatDate(d, RANK.TZ, p);
  const now = new Date(), today = fmt(now, 'yyyy-MM-dd');
  const dow = Number(fmt(now, 'u'));                                   // 1=월 … 7=일
  const from = period === 'today' ? today
    : period === 'week' ? fmt(new Date(now.getTime() - (dow - 1) * 864e5), 'yyyy-MM-dd')
    : today.slice(0, 8) + '01';
  const roster = stampRoster_(ss);                                     // Stamp.gs (5분 캐시)
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };

  // 기록 모으기: [{ id, d(날짜), t(시각 ms), v(값), c(조건) }] — 시간순
  let recs = [];
  if (cfg.ride) {
    const all = stampReadAllRide_(roster);                             // Stamp.gs: { id: { 날짜: km } }
    Object.keys(all).forEach(id => Object.keys(all[id]).forEach(d =>
      recs.push({ id, d, t: new Date(d + 'T12:00:00+09:00').getTime(), v: all[id][d], c: '' })));
  } else {
    const sh = ss.getSheetByName(cfg.sheet);
    if (sh && sh.getLastRow() > 1) {
      const width = Math.max(6, cfg.value + 1, (cfg.cond || 0) + 1);
      sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues().forEach(r => {
        if (!(r[0] instanceof Date)) return;
        const id = stampIdOf_(r[5]); if (!id) return;
        const v = num(r[cfg.value]); if (v <= 0) return;
        recs.push({ id, d: fmt(r[0], 'yyyy-MM-dd'), t: r[0].getTime(), v, c: cfg.cond == null ? '' : String(r[cfg.cond]).trim() });
      });
    }
  }
  recs.sort((a, b) => a.t - b.t);

  const who = id => {
    const st = roster.byId[id] || {};
    const name = String(st.name || id);
    return { name: keyOk ? name : rankMask_(name), grade: st.grade || '', cls: st.cls || '' };
  };
  const round = v => Math.round(v * 100) / 100;

  // 기간 안 / 전 나누기
  const inP = recs.filter(r => r.d >= from && r.d <= today);
  const total = inP.reduce((s, r) => s + r.v, 0);
  const ppl = new Set(inP.map(r => r.id));
  const allTime = recs.filter(r => r.d >= RANK.ALL_FROM && r.d <= today).reduce((s, r) => s + r.v, 0);

  // 최고 기록: 학생 × 조건
  const bestMap = {};
  inP.forEach(r => { const k = r.id + '\u0001' + r.c; if (!bestMap[k] || r.v > bestMap[k].v) bestMap[k] = r; });
  const best = Object.values(bestMap).map(r => Object.assign(who(r.id), { value: round(r.v), cond: r.c }));

  // 성장: 같은 조건끼리. 기준 = 기간 전 최고, 없으면 기간 첫 기록. 학생마다 가장 많이 는 조건 하나
  const prevBest = {}, firstIn = {};
  recs.forEach(r => {
    const k = r.id + '\u0001' + r.c;
    if (r.d < from) { if (!prevBest[k] || r.v > prevBest[k]) prevBest[k] = r.v; }
    else if (r.d <= today && !(k in firstIn)) firstIn[k] = r.v;
  });
  const growMap = {};
  Object.keys(bestMap).forEach(k => {
    const to = bestMap[k].v, base = k in prevBest ? prevBest[k] : firstIn[k];
    if (!base || to <= base) return;
    const pct = (to - base) / base * 100, diff = to - base;
    const id = bestMap[k].id;
    if (!growMap[id] || diff > growMap[id].diff) growMap[id] = { pct, diff, from: base, to };   // 학생마다 가장 많이 는 조건
  });
  const growth = Object.keys(growMap).map(id => {
    const g = growMap[id];
    return Object.assign(who(id), { value: round(g.diff), pct: Math.round(Math.min(g.pct, RANK.GROWTH_CAP)), from: round(g.from), to: round(g.to) });
  });

  // 꾸준함: 기간 안에 한 날 수
  const days = {};
  inP.forEach(r => (days[r.id] = days[r.id] || new Set()).add(r.d));
  const streak = Object.keys(days).map(id => Object.assign(who(id), { value: days[id].size }));

  // 반별
  const cls = {};
  inP.forEach(r => {
    const st = roster.byId[r.id]; if (!st || !st.grade) return;
    const k = st.grade + '|' + st.cls, c = cls[k] || (cls[k] = { grade: st.grade, cls: st.cls, ids: new Set(), sum: 0 });
    c.ids.add(r.id); c.sum += r.v;
  });
  const classes = Object.values(cls).map(c => ({ grade: c.grade, cls: c.cls, people: c.ids.size, avg: round(c.sum / c.ids.size) }));

  // 개인 최고 갱신: 그때까지의 같은 조건 최고보다 크면 (처음 기록은 제외)
  const run = {}, pbs = [];
  recs.forEach(r => {
    const k = r.id + '\u0001' + r.c, prev = run[k];
    if (prev != null && r.v > prev && r.d >= from && r.d <= today) pbs.push({ id: r.id, t: r.t, value: round(r.v), prev: round(prev) });
    if (prev == null || r.v > prev) run[k] = r.v;
  });
  const lastPb = {};
  pbs.forEach(p => { lastPb[p.id] = p; });                              // 학생마다 가장 최근 것
  const pbList = Object.values(lastPb).sort((a, b) => b.t - a.t).slice(0, 20)
    .map(p => Object.assign(who(p.id), { value: p.value, prev: p.prev }));

  return {
    ok: true, updated: fmt(now, 'HH:mm'), ex: exId, period, from, keyOk,
    total: round(total), people: ppl.size, avgPer: ppl.size ? round(total / ppl.size) : 0,
    allTime: round(allTime), best, growth, streak, classes, pbs: pbList
  };
}

/** 이름 가운데 가리기: 김응서 → 김*서, 이준 → 이*, 남궁태윤 → 남**윤 */
function rankMask_(n) {
  n = String(n || '');
  if (n.length < 2) return n;
  return n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

/** 편집기에서 확인: 스쿼트 이번 주 순위 요약과 걸린 시간 */
function diagRank() {
  CacheService.getScriptCache().remove('rank3_squat_week');
  const t = Date.now(), r = rankSummary_('squat', 'week');
  Logger.log((Date.now() - t) + 'ms · 합계 ' + r.total + ' · ' + r.people + '명 · 최고 ' + r.best.length + '줄 · 성장 ' + r.growth.length + ' · 갱신 ' + r.pbs.length);
  Logger.log(JSON.stringify(r).slice(0, 800));
}
