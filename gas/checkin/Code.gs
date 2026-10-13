/**
 * 스마트스포츠실 입실·퇴실 기록 (QR + 구글계정)
 *  - 학생 : 구글계정 | 학년 | 반 | 번호 | 이름 | 소속
 *  - 기록 : 날짜 | 구글계정 | 이름 | 입실 | 퇴실 | 이용시간 | 이용(분) | 구분 | 상태
 * 규칙
 *  - 이용 중이 아니면 → 입실,  이용 중이면 → 퇴실 (하루 여러 번 가능)
 *  - 아침 시간(MORNING_END 이전) 입실은 학생의 '소속', 그 외는 '자율이용'
 */
const TZ = 'Asia/Seoul';
const MORNING_END = '08:50';
const MIN_STAY_SEC = 30;   // 입실 직후 재인식은 무시

// 외부 카메라 화면이 보낼 비밀키. 원하는 값으로 바꾸세요.
const KEY = PropertiesService.getScriptProperties().getProperty('CHECKIN_KEY');  // 프로젝트 설정 → 스크립트 속성에 CHECKIN_KEY로 저장

/* 외부 카메라 화면(GitHub Pages)에서 오는 요청 */
function doPost(e) {
  let res;
  try {
    const body = JSON.parse(e.postData.contents);
    res = (body.key === KEY) ? scan(body.code) : { status: 'denied' };
  } catch (err) {
    res = { status: 'error', message: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  const page = (e.parameter.page === 'print') ? 'Print' : 'Index';
  return HtmlService.createHtmlOutputFromFile(page)
    .setTitle('스마트스포츠실')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* 최초 1회 실행 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const make = (name, head) => {
    const sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange('A:Z').setNumberFormat('@');
      sh.appendRow(head);
      sh.setFrozenRows(1);
    }
  };
  make('학생', ['구글계정', '학년', '반', '번호', '이름', '소속']);
  make('기록', ['날짜', '구글계정', '이름', '입실', '퇴실', '이용시간', '이용(분)', '구분', '상태']);

  // 매일 18시 퇴실 누락 정리
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('closeOpenSessions').timeBased().atHour(18).everyDays(1).create();
}

/* 입실·퇴실 처리 */
function scan(code) {
  const email = String(code || '').trim().toLowerCase().split('@')[0];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const stu = sheet('학생').getDataRange().getDisplayValues()
.find(r => r[0].trim().toLowerCase().split('@')[0] === email);
    if (!stu) return { status: 'unknown' };

    const now = new Date();
    const today = fmt(now, 'yyyy-MM-dd'), time = fmt(now, 'HH:mm:ss');
    const log = sheet('기록');
    const rows = log.getDataRange().getDisplayValues();

    // 오늘 이 학생의 '이용 중' 기록 찾기
    let open = -1;
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i][0] !== today) break;
      if (rows[i][1] === email && rows[i][8] === '이용 중') { open = i; break; }
    }

    if (open < 0) {
      const kind = time.slice(0, 5) < MORNING_END ? (stu[5] || '아침활동') : '자율이용';
      log.appendRow([today, email, stu[4], time, '', '', '', kind, '이용 중']);
      return { status: 'in', name: stu[4], kind: kind };
    }

    const sec = Math.round((now - new Date(`${today}T${rows[open][3]}+09:00`)) / 1000);
    if (sec < MIN_STAY_SEC) return { status: 'tooSoon', name: stu[4] };

    const min = Math.round(sec / 60);
    log.getRange(open + 1, 5, 1, 5).setValues([[time, `${min}분`, min, rows[open][7], '완료']]);
    return { status: 'out', name: stu[4], min: min };
  } finally {
    lock.releaseLock();
  }
}

/* 퇴실 안 찍은 기록 정리 (트리거) */
function closeOpenSessions() {
  const log = sheet('기록');
  const rows = log.getDataRange().getDisplayValues();
  rows.forEach((r, i) => { if (i > 0 && r[8] === '이용 중') log.getRange(i + 1, 9).setValue('퇴실 누락'); });
}

/* QR 인쇄 화면용 명단 */
function getStudents() {
  return sheet('학생').getDataRange().getDisplayValues().slice(1)
    .filter(r => r[0] && r[4])
    .map(r => ({ email: r[0].trim().toLowerCase(), label: `${r[1]}학년 ${r[2]}반 ${r[3]}번`, name: r[4] }));
}

function sheet(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function fmt(d, p) { return Utilities.formatDate(d, TZ, p); }