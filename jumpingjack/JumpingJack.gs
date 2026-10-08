/**
 * 점핑잭 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Squat.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *   if (data.type === 'jumpingjack') return saveJumpingJack_(data);
 * 토큰·명단 찾기·응답은 Squat.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 */
const JJ_SHEET_NAME = '점핑잭';
const JJ_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                    '측정시간(초)', '정확한 횟수', '팔 덜 올림', '다리 덜 벌림', '정확도'];

function saveJumpingJack_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우 → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'jj_' + d.clientId : '';
    if (key && cache.get(key)) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const good = n(d.good), badA = n(d.badArms), badL = n(d.badLegs);
    const total = good + badA + badL;
    const sh = jjGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email, n(d.duration),
      good, badA, badL, total ? good / total : 0
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

function jjGetSheet_(ss) {
  let sh = ss.getSheetByName(JJ_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(JJ_SHEET_NAME);
    sh.appendRow(JJ_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, JJ_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제) */
function diagJumpingJack() {
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'jumpingjack', token: SQUAT_CONFIG.TOKEN,
        email: '1623kgb50' + SQUAT_CONFIG.DOMAIN, duration: 30,
        good: 20, badArms: 2, badLegs: 1, clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
