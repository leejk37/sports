/**
 * 윗몸말아올리기 기록 저장 — 서킷트레이닝 GAS 프로젝트
 * Squat.gs의 doPost에서 data.type === 'curlup'이면 호출됨
 * 토큰·명단 찾기는 Squat.gs의 SQUAT_CONFIG, lookupStudent_를 함께 사용
 */
const CU_SHEET_NAME = '윗몸말아올리기';
const CU_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                    '측정시간(초)', '정확한 횟수', '덜 올라옴', '무릎 펴짐', '정확도'];

function saveCurlUp_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return cuJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return cuJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우(다시 저장 버튼) → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'cu_' + d.clientId : '';
    if (key && cache.get(key)) return cuJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return cuJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const good = n(d.good), badH = n(d.badHeight), badK = n(d.badKnee);
    const total = good + badH + badK;
    const sh = cuGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email, n(d.duration),
      good, badH, badK, total ? good / total : 0
    ]);
    sh.getRange(sh.getLastRow(), 11).setNumberFormat('0%');

    if (key) cache.put(key, st.name, 21600);
    return cuJson_({ ok: true, name: st.name });
  } catch (err) {
    return cuJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function cuGetSheet_(ss) {
  let sh = ss.getSheetByName(CU_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(CU_SHEET_NAME);
    sh.appendRow(CU_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, CU_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

function cuJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagCurlUp() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'curlup', token: SQUAT_CONFIG.TOKEN,
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, duration: 30,
        good: 5, badHeight: 1, badKnee: 0, clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
