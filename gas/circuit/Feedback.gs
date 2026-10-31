/*************************************************************
 * Feedback.gs — 종목별 개인 자세 피드백 화면(feedback/) 데이터 (2026-11-01)
 *
 *  허브 JSONP (Hub.gs hubJsonp_)
 *    action=fbRoster&key=열쇠                     → 선생님: 학생 명단(반 고르기·학생 고르기용)
 *    action=feedback&ex=curlup&email=…(&key=)     → 한 학생의 그 종목 기록 전체(시간순) + 반 평균 정확도
 *  학생은 허브 '내 자세 피드백' 카드로 자기 기록만(email), 선생님은 열쇠로 누구나
 *  열 위치는 CLAUDE.md '시트 데이터 구조' 표 (0부터)
 *************************************************************/
/* time: 측정시간 열, good: 정확한 횟수(플랭크는 버틴 시간), bad: 자세 오류 열, total: 전체 시간 열(플랭크), mode: 방식·자세 열 */
const FB_EX = {
  squat:       { name: '스쿼트',         sheet: '스쿼트',         time: 6, good: 7, bad: [[8, '깊이 부족'], [9, '허리 숙임']], mode: 11, unit: '회' },
  curlup:      { name: '윗몸말아올리기', sheet: '윗몸말아올리기', time: 6, good: 7, bad: [[8, '덜 올라옴'], [9, '무릎 펴짐']], unit: '회' },
  jumpingjack: { name: '점핑잭',         sheet: '점핑잭',         time: 6, good: 7, bad: [[8, '팔 덜 올림'], [9, '다리 덜 벌림']], unit: '회' },
  lunge:       { name: '런지',           sheet: '런지',           time: 6, good: 7, bad: [[8, '깊이 부족'], [9, '상체 숙임']], unit: '회' },
  highknee:    { name: '하이니',         sheet: '하이니',         time: 6, good: 7, bad: [[8, '무릎 덜 올림']], unit: '회' },
  pushup:      { name: '팔굽혀펴기',     sheet: '팔굽혀펴기',     time: 7, good: 8, bad: [[9, '덜 내려감'], [10, '몸이 꺾임']], mode: 6, unit: '회' },
  legraise:    { name: '레그레이즈',     sheet: '레그레이즈',     time: 6, good: 7, bad: [[8, '덜 올림'], [9, '무릎 굽힘']], unit: '회' },
  burpee:      { name: '버피테스트',     sheet: '버피테스트',     time: 6, good: 7, bad: [[8, '다리 덜 뻗음'], [9, '점프 없음']], unit: '회' },
  plank:       { name: '플랭크',         sheet: '플랭크',         time: 9, good: 8, total: 9, bad: [[10, '엉덩이 처짐'], [11, '엉덩이 솟음']], mode: 6, unit: '초' }
};

/** 선생님: 학생 명단 (교직원 포함, 아이디는 화면에서 다시 요청할 때만 씀) */
function fbRoster_(p) {
  if (!pointKeyOk_(p.key)) return { ok: false, error: '선생님 열쇠가 맞지 않아요', needKey: true };
  const roster = stampRoster_(SpreadsheetApp.getActiveSpreadsheet());
  return { ok: true, students: roster.list.map(st => ({ id: st.id, grade: st.grade, cls: st.cls, no: st.no, name: st.name })) };
}

/** 한 학생의 한 종목 기록 */
function fbStudent_(p) {
  const cfg = FB_EX[p.ex];
  if (!cfg) return { ok: false, error: '자세 피드백이 없는 종목이에요' };
  const keyOk = pointKeyOk_(p.key);
  let email = String(p.email || '').trim().toLowerCase();
  if (keyOk && email && email.indexOf('@') < 0) email += SQUAT_CONFIG.DOMAIN;   // 선생님은 아이디만 보내도 됨
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return { ok: false, error: '학교 계정이 아니에요' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const id = stampIdOf_(email), st = roster.byId[id];
  if (!st) return { ok: false, error: '명단에 없는 학생이에요' };

  const sh = ss.getSheetByName(cfg.sheet);
  const num = v => { const x = Number(v); return isFinite(x) ? x : 0; };
  const recs = [], cls = {};                                   // cls: 같은 반 학생별 정확 합·전체 합 (반 평균용)
  if (sh && sh.getLastRow() > 1) {
    const width = Math.max(cfg.time, cfg.good, cfg.total || 0, cfg.mode || 0, ...cfg.bad.map(b => b[0])) + 1;
    sh.getRange(2, 1, sh.getLastRow() - 1, width).getValues().forEach(r => {
      if (!(r[0] instanceof Date)) return;
      const rid = stampIdOf_(r[5]); if (!rid) return;
      const good = num(r[cfg.good]), bad = cfg.bad.map(b => num(r[b[0]]));
      const all = cfg.total != null ? num(r[cfg.total]) : good + bad.reduce((s, x) => s + x, 0);
      if (all <= 0) return;
      const rs = roster.byId[rid];
      if (rs && rs.grade === st.grade && rs.cls === st.cls) { const c = cls[rid] = cls[rid] || { g: 0, t: 0 }; c.g += good; c.t += all; }
      if (rid !== id) return;
      recs.push({
        t: r[0].getTime(), at: Utilities.formatDate(r[0], STAMP.TZ, 'yyyy-MM-dd HH:mm'),
        sec: Math.round(num(r[cfg.time]) * 10) / 10, good: Math.round(good * 10) / 10, bad,
        acc: Math.round(Math.min(good, all) / all * 100), mode: cfg.mode != null ? String(r[cfg.mode] || '').trim() : ''
      });
    });
  }
  recs.sort((a, b) => a.t - b.t);
  const accs = Object.values(cls).filter(c => c.t > 0).map(c => c.g / c.t * 100).sort((a, b) => a - b);
  const median = accs.length ? Math.round(accs.length % 2 ? accs[(accs.length - 1) / 2] : (accs[accs.length / 2 - 1] + accs[accs.length / 2]) / 2) : null;
  return {
    ok: true, keyOk, ex: p.ex, exName: cfg.name, unit: cfg.unit, time: cfg.total != null,
    badNames: cfg.bad.map(b => b[1]), hasMode: cfg.mode != null,
    student: { grade: st.grade, cls: st.cls, no: st.no, name: st.name },
    classMedian: median, classPeople: accs.length,
    recs: recs.map(r => { delete r.t; return r; })
  };
}
