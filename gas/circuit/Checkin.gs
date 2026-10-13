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
 * 규칙: 이용 중이 아니면 입실, 이용 중이면 퇴실(하루 여러 번 가능)
 *       아침 시간(MORNING_END 전) 입실은 '아침활동', 그 외는 '자율이용'
 */
const CHECKIN = {
  SHEET: '입퇴실',
  HEADERS: ['날짜', '학년', '반', '번호', '이름', '이메일', '입실', '퇴실', '이용(분)', '구분', '상태'],
  TZ: 'Asia/Seoul',
  MORNING_END: '08:50',
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
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ status: 'unknown' });

    const now = new Date();
    const fmt = p => Utilities.formatDate(now, CHECKIN.TZ, p);
    const today = fmt('yyyy-MM-dd'), time = fmt('HH:mm:ss');
    const sh = checkinSheet_(ss);
    const rows = sh.getDataRange().getDisplayValues();

    // 오늘 이 학생의 '이용 중' 기록을 아래에서부터 찾기
    let open = -1;
    for (let i = rows.length - 1; i > 0; i--) {
      if (rows[i][0] !== today) break;
      if (rows[i][5] === email && rows[i][10] === '이용 중') { open = i; break; }
    }

    if (open < 0) {
      const kind = time.slice(0, 5) < CHECKIN.MORNING_END ? (st.group || '아침활동') : '자율이용';
      sh.appendRow([today, st.grade, st.cls, st.no, st.name, email, time, '', '', kind, '이용 중']);
      return squatJson_({ status: 'in', name: st.name, kind: kind });
    }

    const sec = Math.round((now - new Date(`${today}T${rows[open][6]}+09:00`)) / 1000);
    if (sec < CHECKIN.MIN_STAY_SEC) return squatJson_({ status: 'tooSoon', name: st.name });

    const min = Math.round(sec / 60);
    sh.getRange(open + 1, 8, 1, 4).setValues([[time, min, rows[open][9], '완료']]);
    return squatJson_({ status: 'out', name: st.name, min: min });
  } catch (err) {
    return squatJson_({ status: 'error', message: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
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
