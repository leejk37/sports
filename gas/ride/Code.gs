/**
 * 스마트스포츠실 인도어라이딩 대시보드 (2026)
 * - 데이터 원본: '2026' 시트 (학생별 날짜 칸에 거리 입력)
 * - 순위 6종, 각 6위까지
 * - 우리 학교 기록(총·이번 달·이번 주·오늘 거리 합계)과 학급 순위(반 학생들이 탄 거리 합계)
 */
const CONFIG = {
  SHEET_NAME: '2026',
  YEAR: 2026,
  TOP_N: 6,
  TZ: 'Asia/Seoul'
};

function updateDailyData() {
  const tz = CONFIG.TZ;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) throw new Error("'" + CONFIG.SHEET_NAME + "' 시트를 찾을 수 없습니다.");
  const data = sheet.getDataRange().getValues();

  // 1. 헤더(이름이 있는 줄) 찾기
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(10, data.length); i++) {
    const rowStr = data[i].join('').replace(/\s/g, '');
    if (rowStr.includes('이름') || rowStr.includes('성명')) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) throw new Error("'이름' 헤더를 찾지 못했습니다.");
  const headers = data[headerRowIdx];

  // 2. 열 찾기: 학년/반/이름/공유학교 + 날짜 열(헤더 줄 또는 그 위 줄에 날짜가 있는 열)
  let gradeIdx = -1, classIdx = -1, nameIdx = -1, shareIdx = -1;
  const dateCols = []; // { idx, key: 'yyyy-MM-dd' }
  for (let j = 0; j < headers.length; j++) {
    const h = String(headers[j]).replace(/\s/g, '');
    if (h === '학년') { gradeIdx = j; continue; }
    if (h === '반') { classIdx = j; continue; }
    if (h === '이름' || h === '성명') { nameIdx = j; continue; }
    if (h.includes('공유학교')) { shareIdx = j; continue; }

    for (let r = headerRowIdx; r >= 0; r--) {
      const d = toDate_(data[r][j]);
      if (d && Utilities.formatDate(d, tz, 'yyyy') === String(CONFIG.YEAR)) {
        dateCols.push({ idx: j, key: Utilities.formatDate(d, tz, 'yyyy-MM-dd') });
        break;
      }
    }
  }
  if (nameIdx === -1) throw new Error("'이름' 열을 찾지 못했습니다.");

  // 3. 기간 계산 (이번 달 / 이번 주: 월~일)
  const now = new Date();
  const todayKey = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const monthPrefix = Utilities.formatDate(now, tz, 'yyyy-MM');
  const dow = Number(Utilities.formatDate(now, tz, 'u')); // 1=월 ... 7=일
  const weekStart = new Date(now.getTime() - (dow - 1) * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
  const weekStartKey = Utilities.formatDate(weekStart, tz, 'yyyy-MM-dd');
  const weekEndKey = Utilities.formatDate(weekEnd, tz, 'yyyy-MM-dd');

  const inMonth = key => key.startsWith(monthPrefix) && key <= todayKey;
  const inWeek = key => key >= weekStartKey && key <= weekEndKey && key <= todayKey;

  // 4. 학생별 집계 + 운영일(누구라도 기록이 있는 날) 집계
  const riders = [];
  const opMonth = new Set();
  const opWeek = new Set();
  const school = { total: 0, month: 0, week: 0, today: 0, todayRiders: 0 };

  for (let i = headerRowIdx + 1; i < data.length; i++) {
    const row = data[i];
    const name = String(row[nameIdx] || '').trim();
    if (!name) continue;

    const r = {
      grade: gradeIdx !== -1 ? String(row[gradeIdx]).trim() : '',
      className: classIdx !== -1 ? String(row[classIdx]).trim() : '',
      name: name,
      total: 0, days: 0,
      monthDist: 0, monthDays: 0,
      weekDist: 0, weekDays: 0
    };

    dateCols.forEach(c => {
      const v = toNum_(row[c.idx]);
      if (v <= 0) return;
      r.total += v;
      r.days++;
      if (inMonth(c.key)) { r.monthDist += v; r.monthDays++; opMonth.add(c.key); }
      if (inWeek(c.key)) { r.weekDist += v; r.weekDays++; opWeek.add(c.key); }
      if (c.key === todayKey) { school.today += v; school.todayRiders++; }
    });
    if (shareIdx !== -1) r.total += toNum_(row[shareIdx]); // 공유학교: 누적거리에만 포함

    riders.push(r);
    school.total += r.total; school.month += r.monthDist; school.week += r.weekDist;
  }

  // 학급 순위: 그 반 학생들이 탄 누적 거리 합계 (riders = 한 번이라도 탄 학생 수)
  const byClass = {};
  riders.filter(r => r.total > 0).forEach(r => {
    const k = r.grade + '|' + r.className;
    const c = byClass[k] || (byClass[k] = { grade: r.grade, className: r.className, riders: 0, total: 0 });
    c.riders++; c.total += r.total;
  });
  const classes = Object.keys(byClass).map(k => byClass[k])
    .map(c => ({ grade: c.grade, className: c.className, riders: c.riders, total: round1_(c.total) }))
    .sort((a, b) => b.total - a.total);
  classes.forEach((c, i) => { c.rank = i > 0 && c.total === classes[i - 1].total ? classes[i - 1].rank : i + 1; });

  const mOp = opMonth.size, wOp = opWeek.size;

  // 5. 순위 6종
  const rankings = {
    totalDistance: rank_(riders.filter(r => r.total > 0),
      r => [r.total], r => ({ value: round1_(r.total), unit: 'km' })),

    participation: rank_(riders.filter(r => r.days > 0),
      r => [r.days, r.total], r => ({ value: r.days, unit: '일', sub: round1_(r.total) + 'km' })),

    monthDistance: rank_(riders.filter(r => r.monthDist > 0),
      r => [r.monthDist], r => ({ value: round1_(r.monthDist), unit: 'km' })),

    weekDistance: rank_(riders.filter(r => r.weekDist > 0),
      r => [r.weekDist], r => ({ value: round1_(r.weekDist), unit: 'km' })),

    monthAttendance: rank_(riders.filter(r => r.monthDays > 0 && mOp > 0),
      r => [r.monthDays / mOp, r.monthDist],
      r => ({ value: Math.round(r.monthDays / mOp * 100), unit: '%', sub: r.monthDays + '/' + mOp + '일' })),

    weekAttendance: rank_(riders.filter(r => r.weekDays > 0 && wOp > 0),
      r => [r.weekDays / wOp, r.weekDist],
      r => ({ value: Math.round(r.weekDays / wOp * 100), unit: '%', sub: r.weekDays + '/' + wOp + '일' }))
  };

  const result = {
    updateTime: Utilities.formatDate(now, tz, 'yyyy년 MM월 dd일 HH:mm 업데이트'),
    year: CONFIG.YEAR,
    period: {
      monthLabel: Number(Utilities.formatDate(now, tz, 'M')) + '월',
      monthOpDays: mOp,
      weekLabel: Utilities.formatDate(weekStart, tz, 'M/d') + '~' + Utilities.formatDate(weekEnd, tz, 'M/d'),
      weekOpDays: wOp
    },
    rankings: rankings,
    school: { total: round1_(school.total), month: round1_(school.month), week: round1_(school.week),
              today: round1_(school.today), todayRiders: school.todayRiders,
              riders: riders.filter(r => r.total > 0).length },
    classes: classes
  };

  PropertiesService.getScriptProperties().setProperty('DAILY_BAKED_DATA', JSON.stringify(result));
}

/** 정렬 기준(keyFn 배열: 앞이 우선) 내림차순 → 동점은 같은 순위 → 상위 TOP_N위까지 */
function rank_(list, keyFn, fmtFn) {
  const sorted = list.slice().sort((a, b) => {
    const ka = keyFn(a), kb = keyFn(b);
    for (let i = 0; i < ka.length; i++) if (kb[i] !== ka[i]) return kb[i] - ka[i];
    return a.name.localeCompare(b.name, 'ko');
  });
  const out = [];
  let prevKey = null, prevRank = 0;
  for (let i = 0; i < sorted.length; i++) {
    const keyStr = keyFn(sorted[i]).join('|');
    const rank = keyStr === prevKey ? prevRank : i + 1;
    if (rank > CONFIG.TOP_N) break;
    const r = sorted[i];
    out.push(Object.assign({ rank: rank, grade: r.grade, className: r.className, name: r.name }, fmtFn(r)));
    prevKey = keyStr; prevRank = rank;
  }
  return out;
}

function toDate_(v) {
  if (v instanceof Date && !isNaN(v)) return v;
  const m = String(v || '').trim().match(/^(\d{1,2})\s*[\/.\-월]\s*(\d{1,2})\s*일?$/);
  return m ? new Date(CONFIG.YEAR, Number(m[1]) - 1, Number(m[2])) : null;
}

function toNum_(v) {
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
}

function round1_(n) { return Math.round(n * 10) / 10; }

/**
 * 웹앱 진입점
 *  - 기본: 순위 화면(Index.html) → 구글 사이트 임베드용
 *  - ?format=json : JSON 데이터만
 *  - ?refresh=1   : 시트에서 즉시 다시 집계
 *  - ?format=json&callback=함수이름 : JSONP (GitHub 현황판 …/sports/ride/ 이 씀)
 */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.refresh === '1') updateDailyData();

  if (p.format === 'json' && p.callback) {
    const cb = /^[\w.]{1,60}$/.test(p.callback) ? p.callback : 'callback';
    return ContentService.createTextOutput(cb + '(' + getDashboardData() + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  if (p.format === 'json') {
    return ContentService.createTextOutput(getDashboardData())
      .setMimeType(ContentService.MimeType.JSON);
  }

  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('인도어라이딩 기록판')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // 구글 사이트 임베드 허용
}

/** 화면(Index.html)에서 google.script.run 으로 호출 */
function getDashboardData() {
  let savedData = PropertiesService.getScriptProperties().getProperty('DAILY_BAKED_DATA');
  if (!savedData) {
    updateDailyData();
    savedData = PropertiesService.getScriptProperties().getProperty('DAILY_BAKED_DATA');
  }
  return savedData;
}