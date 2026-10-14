/**
 * 스마트스포츠실 입실·퇴실 기록 — 입퇴실 GAS를 서킷트레이닝 GAS로 옮긴 것
 * Main.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *   if (data.type === 'checkin') return checkin_(data);
 * 명단은 서킷트레이닝 명단(lookupStudent_)을 함께 씀
 *
 * 처음 한 번: 프로젝트 설정 → 스크립트 속성에 CHECKIN_KEY(입퇴실 태블릿 비밀키) 추가,
 *             편집기에서 setupCheckin() 실행(매일 18시 퇴실 누락 정리 트리거)
 *
 * 기록 시트 '입퇴실': 날짜 | 학년 | 반 | 번호 | 이름 | 이메일 | 입실 | 퇴실 | 이용(분) | 구분 | 상태
 * 입실·퇴실은 두 곳에서 기록됨
 *   ① 허브(공용 모드 ?room=gym): QR 로그인 = 입실, 로그아웃·모두 로그아웃 = 퇴실  ← 기본
 *   ② 입퇴실 전용 화면(qr/): 이용 중이 아니면 입실, 이용 중이면 퇴실 (선택)
 * 하루 여러 번 가능
 * 구분: 입실 시각으로 정함(CHECKIN.PERIODS) — 아침활동·수업·점심활동·방과후
 */
const CHECKIN = {
  SHEET: '입퇴실',
  HEADERS: ['날짜', '학년', '반', '번호', '이름', '이메일', '입실', '퇴실', '이용(분)', '구분', '상태'],
  TZ: 'Asia/Seoul',
  // 입실 시각으로 '구분'을 정함 (위에서부터 차례로, 이 시각 '전'이면 해당 구분)
  //   08:50 전 아침활동 · 08:50~12:10 수업 · 12:10~13:10 점심활동 · 13:10~13:50 수업 · 13:50 이후 방과후
  PERIODS: [
    { until: '08:50', label: '아침활동' },
    { until: '12:10', label: '수업' },
    { until: '13:10', label: '점심활동' },
    { until: '13:50', label: '수업' },
    { until: '24:00', label: '방과후' }
  ],
  MIN_STAY_SEC: 30          // 입실 직후 같은 QR을 다시 찍으면 무시
};

function checkin_(d) {
  const key = PropertiesService.getScriptProperties().getProperty('CHECKIN_KEY');
  if (!key || d.key !== key) return squatJson_({ status: 'denied' });

  const id = String(d.code || '').trim().toLowerCase().split('@')[0];
  if (!/^[\w.\-]+$/.test(id)) return squatJson_({ status: 'unknown' });
  const email = id + SQUAT_CONFIG.DOMAIN;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const st = lookupStudent_(SpreadsheetApp.getActiveSpreadsheet(), email);
    if (!st.name) return squatJson_({ status: 'unknown' });

    const open = checkinFindOpen_(email);
    if (!open) {
      const kind = checkinIn_(email, st);
      return squatJson_({ status: 'in', name: st.name, kind: kind });
    }
    if (open.sec < CHECKIN.MIN_STAY_SEC) return squatJson_({ status: 'tooSoon', name: st.name });
    const min = checkinOut_(email);
    return squatJson_({ status: 'out', name: st.name, min: min });
  } catch (err) {
    return squatJson_({ status: 'error', message: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

/* ===== 허브·입퇴실 화면이 함께 쓰는 기록 함수 (부르는 쪽에서 잠금을 잡은 상태로 호출) ===== */
const checkinNow_ = () => {
  const now = new Date(), f = p => Utilities.formatDate(now, CHECKIN.TZ, p);
  return { now, today: f('yyyy-MM-dd'), time: f('HH:mm:ss') };
};
/* 시트가 날짜·시각 칸을 자동으로 '날짜/시각 형식'으로 바꿔도 읽을 수 있게 맞춤 */
function checkinDate_(v) {
  return v instanceof Date ? Utilities.formatDate(v, CHECKIN.TZ, 'yyyy-MM-dd') : String(v).trim();
}
function checkinTime_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CHECKIN.TZ, 'HH:mm:ss');
  const m = String(v).trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m ? ('0' + m[1]).slice(-2) + ':' + m[2] + ':' + (m[3] || '00') : '';
}
const checkinSec_ = t => { const m = String(t).match(/^(\d{2}):(\d{2}):(\d{2})$/); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN; };
/* 시각을 '글자'로 고정해서 씀(06:56:30 그대로 보이게) */
function checkinWriteText_(sh, row, col, values) {
  sh.getRange(row, col, 1, values.length).setNumberFormat('@').setValues([values]);
}

/** 입실 시각('HH:mm:ss') → 구분 이름 */
function checkinPeriod_(time) {
  const hm = String(time).slice(0, 5);
  const p = CHECKIN.PERIODS.find(x => hm < x.until);
  return p ? p.label : CHECKIN.PERIODS[CHECKIN.PERIODS.length - 1].label;
}

/** 오늘 이 사람의 '이용 중' 줄 → { row(시트 줄 번호), inTime, kind, sec(입실 후 지난 초) } 또는 null */
function checkinFindOpen_(email) {
  const sh = checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  const rows = sh.getDataRange().getValues();
  const t = checkinNow_();
  for (let i = rows.length - 1; i > 0; i--) {
    if (checkinDate_(rows[i][0]) !== t.today) break;
    if (String(rows[i][5]).toLowerCase() === email && rows[i][10] === '이용 중') {
      const inTime = checkinTime_(rows[i][6]);
      const sec = checkinSec_(t.time) - checkinSec_(inTime);
      return { row: i + 1, inTime, kind: rows[i][9], sec: isFinite(sec) ? sec : 0 };
    }
  }
  return null;
}

/** 입실 기록 (이미 '이용 중'이면 새로 쓰지 않음). 구분(아침활동·수업·점심활동·방과후)을 돌려줌 */
function checkinIn_(email, st) {
  const open = checkinFindOpen_(email);
  if (open) return open.kind;
  const t = checkinNow_();
  const kind = checkinPeriod_(t.time);
  const sh = checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  sh.appendRow([t.today, st.grade, st.cls, st.no, st.name, email, t.time, '', '', kind, '이용 중']);
  const r = sh.getLastRow();
  checkinWriteText_(sh, r, 1, [t.today]);
  checkinWriteText_(sh, r, 7, [t.time]);
  return kind;
}

/** 퇴실 기록. 이용 시간(분)을 돌려줌, '이용 중' 줄이 없으면 null */
function checkinOut_(email) {
  const open = checkinFindOpen_(email);
  if (!open) return null;
  const t = checkinNow_();
  const min = Math.max(0, Math.round(open.sec / 60));
  const sh = checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  checkinWriteText_(sh, open.row, 7, [open.inTime, t.time]);
  sh.getRange(open.row, 9, 1, 3).setValues([[min, open.kind, '완료']]);
  return min;
}

/** 한 번만 실행: 이미 #NUM!·빈칸으로 남은 '이용(분)'을 입실·퇴실 시각으로 다시 계산 */
function fixCheckinMinutes() {
  const sh = checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  const rows = sh.getDataRange().getValues();
  let fixed = 0;
  for (let i = 1; i < rows.length; i++) {
    const inT = checkinTime_(rows[i][6]), outT = checkinTime_(rows[i][7]);
    if (!inT || !outT) continue;
    const min = Math.max(0, Math.round((checkinSec_(outT) - checkinSec_(inT)) / 60));
    checkinWriteText_(sh, i + 1, 7, [inT, outT]);
    sh.getRange(i + 1, 9).setValue(min);
    fixed++;
  }
  Logger.log('이용(분)을 다시 계산한 줄: ' + fixed);
}

function checkinSheet_(ss) {
  let sh = ss.getSheetByName(CHECKIN.SHEET);
  if (!sh) {
    sh = ss.insertSheet(CHECKIN.SHEET);
    sh.getRange('A:H').setNumberFormat('@');   // 날짜·시각이 자동 변환되지 않게 글자로
    sh.appendRow(CHECKIN.HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CHECKIN.HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 퇴실을 안 찍은 기록 정리 (매일 18시 트리거) */
function closeOpenCheckins() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CHECKIN.SHEET);
  if (!sh) return;
  const rows = sh.getDataRange().getDisplayValues();
  rows.forEach((r, i) => { if (i > 0 && r[10] === '이용 중') sh.getRange(i + 1, 11).setValue('퇴실 누락'); });
}

/** 처음 한 번 편집기에서 실행: 시트 만들기 + 18시 정리 트리거(이 함수의 트리거만 다시 만듦) */
function setupCheckin() {
  checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'closeOpenCheckins')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('closeOpenCheckins').timeBased().atHour(18).everyDays(1).inTimezone(CHECKIN.TZ).create();
}
