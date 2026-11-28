/*************************************************************
 * 행잉 측정 기록 받기 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * '행잉' 시트에 기록 (매달리기: 초)
 * 열 구조는 그대로 둠: 방법=매달리기, 단위=초, 짧게 뗀 손=빈칸 (예전 기록·현황판 호환)
 * 2026-11-28 어드밴스트: 방법 '무릎 들기'·'좌우 무릎 들기' → H 기록 = 정확한 횟수, I 단위 = 회, J 매달린 시간(초),
 *   L 덜 올림 · M 반동 · N 왼쪽 · O 오른쪽 · P 같은 쪽 (매달리기 줄은 L~P 빈칸)
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
  const KNEE = { knee: '무릎 들기', oblique: '좌우 무릎 들기' };
  const kneeName = KNEE[d.method] || '';
  const n = v => Math.max(0, Math.min(999, Math.round(parseFloat(v) || 0)));
  const swing = d.swing == null ? '' : Math.max(0, Math.min(600, Math.round((parseFloat(d.swing) || 0) * 10) / 10));   // 2026-11-01 흔들려서 멈춘 시간

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ss = SQUAT_CONFIG.SS_ID
      ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(HANG_CONFIG.SHEET_NAME) || createHangSheet_(ss);
    if (String(sh.getRange(1, 11).getValue()).trim() !== '흔들린 시간(초)') sh.getRange(1, 11).setValue('흔들린 시간(초)');   // 예전 '짧게 뗀 손'(안 씀) 칸을 바꿔 씀
    if (kneeName && String(sh.getRange(1, 12).getValue()).trim() !== HANG_KNEE_HEAD[0]) sh.getRange(1, 12, 1, HANG_KNEE_HEAD.length).setValues([HANG_KNEE_HEAD]).setFontWeight('bold');
    let st = { grade: '', cls: '', no: '', name: '' };
    try { st = lookupStudent_(ss, email) || st; } catch (e) {}

    if (kneeName) {
      sh.appendRow([
        new Date(), st.grade, st.cls, st.no, st.name, email,
        kneeName,                          // 방법
        n(d.reps),                         // 기록 = 정확한 횟수
        '회',                              // 단위
        sec,                               // 매달린 시간(초)
        swing,                             // 흔들린 시간(초)
        n(d.short), n(d.bounce),           // 덜 올림 · 반동
        d.method === 'oblique' ? n(d.left) : '', d.method === 'oblique' ? n(d.right) : '',
        d.method === 'oblique' ? n(d.same) : ''
      ]);
      if (key) cache.put(key, st.name || '', 21600);
      return hangJson_({ ok: true, name: st.name });
    }
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      '매달리기',                          // 방법
      sec,                                 // 기록
      '초',                                // 단위
      sec,                                 // 매달린 시간(초)
      swing                                // 흔들린 시간(초) — 이 동안은 기록에서 뺌 (예전 줄은 빈칸)
    ]);
    if (key) cache.put(key, st.name || '', 21600);   // 6시간 동안 중복 방지
    return hangJson_({ ok: true, name: st.name });
  } catch (err) {
    return hangJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

const HANG_KNEE_HEAD = ['덜 올림', '반동', '왼쪽', '오른쪽', '같은 쪽'];   // L~P (2026-11-28 무릎 들기)

function createHangSheet_(ss) {
  const sh = ss.insertSheet(HANG_CONFIG.SHEET_NAME);
  sh.appendRow(['측정일시', '학년', '반', '번호', '이름', '이메일', '방법', '기록', '단위', '매달린 시간(초)', '흔들린 시간(초)']);
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
  Logger.log(handleHang_(Object.assign({}, base, { method: 'oblique', reps: 6, seconds: 25.1, swing: 1.2, short: 1, bounce: 1, left: 3, right: 3, same: 0, clientId: 'test-b-' + Date.now() })).getContent());
}
