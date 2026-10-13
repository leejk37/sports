/**
 * 체력 기록장 (줄넘기 · 실내자전거 · 달리기·근력)
 * 구글시트에 연결된 Apps Script 웹앱
 *
 * 배포 설정: 실행 계정 = 나(교사) / 액세스 권한 = 도메인 내 모든 사용자
 */

// ───────────── 설정 (필요하면 여기만 고치면 됩니다) ─────────────
const CONFIG = {
  // 교사 화면을 볼 수 있는 계정. 웹앱을 배포한 계정은 자동으로 포함됩니다.
  TEACHER_EMAILS: [],
  TIMEZONE: 'Asia/Seoul',
  SHEET_RECORDS: '기록',
  SHEET_ROSTER: '학생명단',
};

// 운동 영역 (홈 화면 버튼 순서)
const AREAS = [
  { id: 'rope', name: '줄넘기',     icon: '🪢', color: '#F0522F', items: ['rope'] },
  { id: 'bike', name: '실내자전거', icon: '🚴', color: '#2F6BFF', items: ['bike'] },
  { id: 'fit',  name: '달리기·근력', icon: '🏃', color: '#0B9467', items: ['tread', 'box', 'pushup', 'curlup', 'hang'] },
];

// 기록 항목. goal을 넣으면 학생 피드백에 목표 막대가 나타납니다.
// groupAgg: 'sum'이면 선생님 화면 모둠 통계에서 총합으로, 없으면 평균으로 보여줍니다.
const ITEMS = {
  rope:   { name: '10분 줄넘기',       short: '10분 횟수',      unit: '회',   min: 0, max: 2000, decimals: 0, steps: [10, 1], goal: 700, groupAgg: 'sum' },
  bike:   { name: '10분 달린 거리',     short: '10분 거리',      unit: 'km',   min: 0, max: 15,   decimals: 1, steps: [1, 0.1], goal: 5.1, groupAgg: 'sum' },
  tread:  { name: '트레드밀 최고속력',   short: '최고속력',       unit: 'km/h', min: 0, max: 25,   decimals: 1, steps: [1, 0.1],
            hint: '안전하게 달릴 수 있었던 속도까지만 적어요.' },
  box:    { name: '박스점프 완료 세트',  short: '박스점프',       unit: '세트', min: 0, max: 2,    decimals: 0, choices: [0, 1, 2] },
  pushup: { name: '팔굽혀펴기',         short: '팔굽혀펴기',     unit: '회',   min: 0, max: 100,  decimals: 0, steps: [1] },
  curlup: { name: '윗몸말아올리기',      short: '윗몸말아올리기', unit: '회',   min: 0, max: 100,  decimals: 0, steps: [1] },
  hang:   { name: '매달리기',           short: '매달리기',       unit: '초',   min: 0, max: 300,  decimals: 0, steps: [5, 1] },
};

// 힘든 정도(자각운동강도) 1~5단계
const RPE = ['', '쉬웠어요', '할 만했어요', '조금 힘들었어요', '힘들었어요', '너무 힘들었어요'];

const RECORD_HEADERS = ['기록시각', '날짜', '이메일', '이름', '영역', '항목코드', '항목', '값', '단위', '힘든정도'];
const ROSTER_HEADERS = ['학년', '반', '번호', '이름', '이메일', '구분'];

// ───────────── 웹앱 진입 ─────────────
function doGet(e) {
  if (e && e.parameter && e.parameter.page === 'qr') return qrPrintPage_();
  if (e && e.parameter && e.parameter.callback) return hubJsonp_(e);
  const email = currentEmail_();
  const wantsTeacher = e && e.parameter && e.parameter.page === 'teacher';
  const file = wantsTeacher && isTeacher_(email) ? 'Teacher' : 'Index';
  return HtmlService.createTemplateFromFile(file)
    .evaluate()
    .setTitle('체력 기록장')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

// 처음 한 번 실행하면 시트 두 개가 만들어집니다 (실행하지 않아도 자동 생성됨)
function setup() {
  getSheet_(CONFIG.SHEET_RECORDS);
  getSheet_(CONFIG.SHEET_ROSTER);
}

// ───────────── 학생용 API ─────────────
function getInitData() {
  const user = getUser_();
  const today = today_();
  const mine = readRecords_().filter(r => r.email === user.email);

  const stats = {};
  Object.keys(ITEMS).forEach(k => {
    stats[k] = summarize_(mine.filter(r => r.item === k), today);
  });
  const doneAreas = AREAS
    .filter(a => mine.some(r => r.date === today && r.area === a.id))
    .map(a => a.id);

  return {
    user, today, stats, doneAreas,
    areas: AREAS, items: ITEMS, rpe: RPE,
    isTeacher: isTeacher_(user.email),
    url: ScriptApp.getService().getUrl(),
  };
}

function saveRecord(payload) {
  const user = getUser_();
  const area = AREAS.find(a => a.id === payload.area);
  if (!area) throw new Error('운동 영역을 다시 골라 주세요.');

  const rpe = Number(payload.rpe);
  if (!(rpe >= 1 && rpe <= 5)) throw new Error('힘든 정도를 골라 주세요.');

  const now = new Date();
  const today = today_();
  const rows = area.items.map(k => {
    const it = ITEMS[k];
    const raw = payload.values ? payload.values[k] : null;
    if (raw === '' || raw === null || raw === undefined || isNaN(Number(raw))) {
      throw new Error(it.name + ' 기록을 입력해 주세요.');
    }
    const v = round_(Number(raw), it.decimals);
    if (v < it.min || v > it.max) {
      throw new Error(`${it.name}은(는) ${it.min}~${it.max}${it.unit} 사이로 입력해 주세요.`);
    }
    return [now, today, user.email, user.name, area.id, k, it.name, v, it.unit, rpe];
  });

  // 저장 전 기록으로 비교값 계산
  const mine = readRecords_().filter(r => r.email === user.email);

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = getSheet_(CONFIG.SHEET_RECORDS);
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, RECORD_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }

  const results = rows.map(row => {
    const k = row[5];
    const v = row[7];
    const s = summarize_(mine.filter(r => r.item === k), today);
    return {
      key: k,
      value: v,
      prev: s.prev,
      best: s.best,
      first: s.prev === null,
      diff: s.prev === null ? null : round_(v - s.prev, ITEMS[k].decimals),
      isBest: s.best !== null && v > s.best,
    };
  });

  const prevArea = mine.filter(r => r.area === area.id && r.date < today);
  const prevRpe = prevArea.length ? prevArea[prevArea.length - 1].rpe : null;

  return { area: area.id, rpe, prevRpe, results };
}

// ───────────── 교사용 API ─────────────
function getTeacherData(date) {
  const user = getUser_();
  if (!isTeacher_(user.email)) throw new Error('선생님 계정으로만 볼 수 있어요.');

  const recs = readRecords_();
  const dates = Array.from(new Set(recs.map(r => r.date))).sort().reverse();
  const d = date || dates[0] || today_();

  const roster = getRoster_();
  const students = Object.values(roster).sort((a, b) =>
    String(a.cls).localeCompare(String(b.cls)) || (Number(a.no) || 999) - (Number(b.no) || 999));
  // 명단에 없지만 기록이 있는 계정도 표시
  const extra = Array.from(new Set(recs.map(r => r.email)))
    .filter(em => !roster[em])
    .map(em => ({ email: em, name: (recs.find(r => r.email === em) || {}).name || em.split('@')[0], cls: '', no: '', group: '' }));

  const rows = students.concat(extra).map(s => {
    const mine = recs.filter(r => r.email === s.email);
    const cells = {};
    Object.keys(ITEMS).forEach(k => {
      const onDay = mine.filter(r => r.item === k && r.date === d);
      const before = mine.filter(r => r.item === k && r.date < d);
      cells[k] = onDay.length
        ? { v: onDay[onDay.length - 1].value, prev: before.length ? before[before.length - 1].value : null }
        : null;
    });
    const rpe = {};
    AREAS.forEach(a => {
      const x = mine.filter(r => r.area === a.id && r.date === d);
      rpe[a.id] = x.length ? x[x.length - 1].rpe : null;
    });
    return { email: s.email, name: s.name, cls: s.cls, no: String(s.no), group: s.group || '', cells, rpe };
  });

  return { date: d, dates, areas: AREAS, items: ITEMS, rpe: RPE, rows, url: ScriptApp.getService().getUrl() };
}

// ───────────── 내부 함수 ─────────────
function currentEmail_() {
  return (Session.getActiveUser().getEmail() || '').toLowerCase();
}

function getUser_() {
  const email = currentEmail_();
  if (!email) throw new Error('구글 계정을 확인할 수 없어요. 학교 계정으로 로그인했는지 확인해 주세요.');
  const r = getRoster_()[email];
  return {
    email,
    name: r ? r.name : email.split('@')[0],
    cls: r ? String(r.cls) : '',
    no: r ? String(r.no) : '',
    inRoster: !!r,
  };
}

function isTeacher_(email) {
  if (!email) return false;
  const owner = (Session.getEffectiveUser().getEmail() || '').toLowerCase();
  const list = CONFIG.TEACHER_EMAILS.map(x => String(x).toLowerCase());
  return email === owner || list.indexOf(email) > -1;
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const headers = name === CONFIG.SHEET_RECORDS ? RECORD_HEADERS : ROSTER_HEADERS;
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (name === CONFIG.SHEET_RECORDS) sh.getRange('B:B').setNumberFormat('@');
  }
  return sh;
}

function getRoster_() {
  // '학생명단' 열 순서 (운동 앱 SQUAT_CONFIG·QR 인쇄와 같음)
  //   A학년 B반 C번호 D이름 E이메일(또는 아이디) F구분(학생/교직원)
  const sh = getSheet_(CONFIG.SHEET_ROSTER);
  const n = sh.getLastRow();
  const map = {};
  if (n < 2) return map;
  const cols = Math.max(6, sh.getLastColumn());
  sh.getRange(2, 1, n - 1, cols).getDisplayValues().forEach(r => {
    let email = String(r[4]).trim().toLowerCase();
    if (!email) return;
    if (email.indexOf('@') < 0) email += '@cpe.es.kr';      // 아이디만 적혀 있어도 찾기
    const grade = String(r[0]).trim(), cls = String(r[1]).trim();
    const staff = String(r[5]).trim() === '교직원' || !grade;
    map[email] = {
      email,
      name: String(r[3]).trim() || email.split('@')[0],
      cls: staff ? '교직원' : grade + '학년 ' + cls + '반',   // 선생님 화면의 '반' 칸
      no: staff ? '' : String(r[2]).trim(),
      group: '',                                              // 모둠 열은 더 이상 없음
    };
  });
  return map;
}

function readRecords_() {
  const sh = getSheet_(CONFIG.SHEET_RECORDS);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, RECORD_HEADERS.length).getValues()
    .filter(r => r[2] !== '')
    .map(r => ({
      date: normDate_(r[1]),
      email: String(r[2]).toLowerCase(),
      name: String(r[3]),
      area: String(r[4]),
      item: String(r[5]),
      value: Number(r[7]),
      rpe: Number(r[9]) || null,
    }));
}

// 한 항목의 기록 목록 → 지난 기록, 최고 기록, 오늘 기록
function summarize_(list, today) {
  const before = list.filter(r => r.date < today && !isNaN(r.value));
  const todays = list.filter(r => r.date === today);
  return {
    prev: before.length ? before[before.length - 1].value : null,
    best: before.length ? Math.max.apply(null, before.map(r => r.value)) : null,
    today: todays.length ? todays[todays.length - 1].value : null,
  };
}

function today_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd');
}

function normDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.TIMEZONE, 'yyyy-MM-dd');
  return String(v).trim();
}

function round_(v, d) {
  const f = Math.pow(10, d || 0);
  return Math.round(v * f) / f;
}