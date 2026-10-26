/**
 * 레그레이즈 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Main.gs의 doPost에 아래 한 줄이 있어야 작동함
 *   if (data.type === 'legraise') return saveLegRaise_(data);
 * 열: A~F 공통 · G 측정시간(초) · H 정확한 횟수 · I 덜 올림 · J 무릎 굽힘 · K 정확도
 */
const LR_SHEET_NAME = '레그레이즈';
const LR_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                    '측정시간(초)', '정확한 횟수', '덜 올림', '무릎 굽힘', '정확도'];

function saveLegRaise_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우 → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'lr_' + String(d.clientId).slice(0, 80) : '';
    if (key && cache.get(key) !== null) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const good = n(d.good), badD = n(d.badLow), badB = n(d.badKnee);
    const total = good + badD + badB;
    const sh = lrGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      n(d.duration), good, badD, badB, total ? good / total : 0
    ]);
    sh.getRange(sh.getLastRow(), 11).setNumberFormat('0%');

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function lrGetSheet_(ss) {
  let sh = ss.getSheetByName(LR_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(LR_SHEET_NAME);
    sh.appendRow(LR_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, LR_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagLegRaise() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'legraise', token: SQUAT_CONFIG.TOKEN,
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, duration: 30,
        good: 10, badLow: 2, badKnee: 1, clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
