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

/** 오늘 이 사람의 '이용 중' 줄 → { row(시트 줄 번호), inTime, kind, sec(입실 후 지난 초) } 또는 null */
function checkinFindOpen_(email) {
  const sh = checkinSheet_(SpreadsheetApp.getActiveSpreadsheet());
  const rows = sh.getDataRange().getDisplayValues();
  const t = checkinNow_();
  for (let i = rows.length - 1; i > 0; i--) {
    if (rows[i][0] !== t.today) break;
    if (rows[i][5] === email && rows[i][10] === '이용 중') {
      const sec = Math.round((t.now - new Date(`${t.today}T${rows[i][6]}+09:00`)) / 1000);
      return { row: i + 1, inTime: rows[i][6], kind: rows[i][9], sec };
    }
  }
  return null;
}

/** 입실 기록 (이미 '이용 중'이면 새로 쓰지 않음). 구분(아침활동/자율이용)을 돌려줌 */
function checkinIn_(email, st) {
  const open = checkinFindOpen_(email);
  if (open) return open.kind;
  const t = checkinNow_();
  const kind = t.time.slice(0, 5) < CHECKIN.MORNING_END ? (st.group || '아침활동') : '자율이용';
  checkinSheet_(SpreadsheetApp.getActiveSpreadsheet())
    .appendRow([t.today, st.grade, st.cls, st.no, st.name, email, t.time, '', '', kind, '이용 중']);
  return kind;
}

/** 퇴실 기록. 이용 시간(분)을 돌려줌, '이용 중' 줄이 없으면 null */
function checkinOut_(email) {
  const open = checkinFindOpen_(email);
  if (!open) return null;
  const t = checkinNow_();
  const min = Math.max(0, Math.round(open.sec / 60));
  checkinSheet_(SpreadsheetApp.getActiveSpreadsheet())
    .getRange(open.row, 8, 1, 4).setValues([[t.time, min, open.kind, '완료']]);
  return min;
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
