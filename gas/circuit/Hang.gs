/*************************************************************
 * 행잉 측정 기록 받기 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * '행잉' 시트에 기록 (매달리기: 초 / 손 바꿔 잡기: 회)
 *
 * doPost 안의 다른 운동 분기 옆에 한 줄 추가:
 *   if (data.type === 'hang') return handleHang_(data);
 *************************************************************/
const HANG_CONFIG = {
  SHEET_NAME: '행잉',
  DOMAIN: '@cpe.es.kr'
};

function handleHang_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return hangJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(HANG_CONFIG.DOMAIN)) return hangJson_({ ok: false, error: '학교 계정이 아니에요' });
  const method = d.method === 'switch' ? 'switch' : 'hang';

  // 같은 측정을 두 번 보내도 한 번만 기록 (화면의 '다시 저장' 대비)
  const cache = CacheService.getScriptCache();
  const key = d.clientId ? 'hang_' + String(d.clientId).slice(0, 80) : '';
  if (key && cache.get(key) !== null) return hangJson_({ ok: true, name: cache.get(key), duplicate: true });

  const sec = Math.max(0, Math.min(600, Math.round((parseFloat(d.seconds) || 0) * 10) / 10));
  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SQUAT_CONFIG.SS_ID
      ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(HANG_CONFIG.SHEET_NAME) || createHangSheet_(ss);
    let st = { grade: '', cls: '', no: '', name: '' };
    try { st = lookupStudent_(ss, email) || st; } catch (e) {}

    const isHang = method === 'hang';
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name,
      isHang ? '매달리기' : '손 바꿔 잡기',
      isHang ? sec : n(d.count),          // 기록
      isHang ? '초' : '회',               // 단위
      sec,                                 // 매달린 시간(초)
      isHang ? '' : n(d.shortHolds),       // 너무 짧게 뗀 손
      email
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
  sh.appendRow(['측정일시', '학년', '반', '번호', '이름', '방법', '기록', '단위', '매달린 시간(초)', '짧게 뗀 손', '이메일']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 11).setFontWeight('bold');
  return sh;
}

function hangJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 실행: '행잉' 시트에 두 줄(매달리기, 손 바꿔 잡기)이 써지는지 확인
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function testHang() {
  const TEST_ID = '여기에_테스트용_아이디';
  const base = { type: 'hang', token: SQUAT_CONFIG.TOKEN, email: TEST_ID + HANG_CONFIG.DOMAIN };
  Logger.log(handleHang_(Object.assign({}, base, { method: 'hang', seconds: 23.4, clientId: 'test-a-' + Date.now() })).getContent());
  Logger.log(handleHang_(Object.assign({}, base, { method: 'switch', seconds: 18.2, count: 5, shortHolds: 1, clientId: 'test-b-' + Date.now() })).getContent());
}
