/*************************************************************
 * 행잉 측정 기록 받기 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * '행잉' 시트에 기록 (매달리기: 초)
 * 열 구조는 그대로 둠: 방법=매달리기, 단위=초, 짧게 뗀 손=빈칸 (예전 기록·현황판 호환)
 *
 * doPost 안의 다른 운동 분기 옆에 한 줄 추가:
 *   if (data.type === 'hang') return handleHang_(data);
 *************************************************************/
const HANG_CONFIG = {
  SHEET_NAME: '행잉',
  get DOMAIN() { return SQUAT_CONFIG.DOMAIN; }   // '설정' 시트의 학교도메인
};

function handleHang_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return hangJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(HANG_CONFIG.DOMAIN)) return hangJson_({ ok: false, error: '학교 계정이 아니에요' });

  // 같은 측정을 두 번 보내도 한 번만 기록 (화면의 '다시 저장' 대비)
  const cache = CacheService.getScriptCache();
  const key = d.clientId ? 'hang_' + String(d.clientId).slice(0, 80) : '';
  if (key && cache.get(key) !== null) return hangJson_({ ok: true, name: cache.get(key), duplicate: true });

  const sec = Math.max(0, Math.min(600, Math.round((parseFloat(d.seconds) || 0) * 10) / 10));

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SQUAT_CONFIG.SS_ID
      ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(HANG_CONFIG.SHEET_NAME) || createHangSheet_(ss);
    let st = { grade: '', cls: '', no: '', name: '' };
    try { st = lookupStudent_(ss, email) || st; } catch (e) {}

    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      '매달리기',                          // 방법
      sec,                                 // 기록
      '초',                                // 단위
      sec,                                 // 매달린 시간(초)
      ''                                   // 짧게 뗀 손 (사용 안 함)
    ]);
    if (key) cache.put(key, st.name || '', 21600);   // 6시간 동안 중복 방지
    return hangJson_({ ok: true, name: st.name });
  } catch (err) {
    return hangJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function createHangSheet_(ss) {
  const sh = ss.insertSheet(HANG_CONFIG.SHEET_NAME);
  sh.appendRow(['측정일시', '학년', '반', '번호', '이름', '이메일', '방법', '기록', '단위', '매달린 시간(초)', '짧게 뗀 손']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 11).setFontWeight('bold');
  return sh;
}

function hangJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 실행: '행잉' 시트에 한 줄(매달리기)이 써지는지 확인
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function testHang() {
  const TEST_ID = '여기에_테스트용_아이디';
  const base = { type: 'hang', token: SQUAT_CONFIG.TOKEN, email: TEST_ID + HANG_CONFIG.DOMAIN };
  Logger.log(handleHang_(Object.assign({}, base, { method: 'hang', seconds: 23.4, clientId: 'test-a-' + Date.now() })).getContent());
}
