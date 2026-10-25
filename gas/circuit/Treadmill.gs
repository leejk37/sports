/*************************************************************
 * 트레드밀 기록 받기 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * '트레드밀' 시트에 기록 (운동 시간 + 트레드밀 화면의 거리·최고 속도)
 *
 * doPost 안의 다른 운동 분기 옆에 한 줄 추가:
 *   if (data.type === 'treadmill') return handleTreadmill_(data);
 *************************************************************/
const TREADMILL_CONFIG = {
  SHEET_NAME: '트레드밀',
  get DOMAIN() { return SQUAT_CONFIG.DOMAIN; }   // '설정' 시트의 학교도메인
};

function handleTreadmill_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return treadmillJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(TREADMILL_CONFIG.DOMAIN)) return treadmillJson_({ ok: false, error: '학교 계정이 아니에요' });

  // 같은 기록을 두 번 보내도 한 번만 저장
  const cache = CacheService.getScriptCache();
  const key = d.clientId ? 'tm_' + String(d.clientId).slice(0, 80) : '';
  if (key && cache.get(key) !== null) return treadmillJson_({ ok: true, name: cache.get(key), duplicate: true });

  const sec = Math.max(0, Math.min(7200, parseInt(d.seconds, 10) || 0));
  const num = (v, max) => { const x = parseFloat(v); return isFinite(x) && x >= 0 && x <= max ? x : ''; };
  const dist = num(d.distance, 20), speed = num(d.maxSpeed, 25);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SQUAT_CONFIG.SS_ID
      ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(TREADMILL_CONFIG.SHEET_NAME) || createTreadmillSheet_(ss);
    let st = { grade: '', cls: '', no: '', name: '' };
    try { st = lookupStudent_(ss, email) || st; } catch (e) {}

    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      sec, sec / 86400,          // 운동 시간: 초, 그리고 분:초 표시용
      dist, speed
    ]);
    sh.getRange(sh.getLastRow(), 8).setNumberFormat('[m]:ss');
    if (key) cache.put(key, st.name || '', 21600);
    return treadmillJson_({ ok: true, name: st.name });
  } catch (err) {
    return treadmillJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function createTreadmillSheet_(ss) {
  const sh = ss.insertSheet(TREADMILL_CONFIG.SHEET_NAME);
  sh.appendRow(['측정일시', '학년', '반', '번호', '이름', '이메일', '운동 시간(초)', '운동 시간', '거리(km)', '최고 속도(km/h)']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 10).setFontWeight('bold');
  return sh;
}

function treadmillJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 실행: '트레드밀' 시트에 한 줄이 써지는지 확인
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function testTreadmill() {
  const TEST_ID = '여기에_테스트용_아이디';
  Logger.log(handleTreadmill_({
    type: 'treadmill', token: SQUAT_CONFIG.TOKEN, email: TEST_ID + TREADMILL_CONFIG.DOMAIN,
    seconds: 754, distance: 1.25, maxSpeed: 7.5, clientId: 'test-' + Date.now()
  }).getContent());
}
