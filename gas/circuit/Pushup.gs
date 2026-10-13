/**
 * 팔굽혀펴기 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Main.gs의 doPost에 아래 한 줄이 있어야 작동함
 *   if (data.type === 'pushup') return savePushup_(data);
 * kind: 'full'(일반) | 'knee'(무릎 대고)
 */
const PU_SHEET_NAME = '팔굽혀펴기';
const PU_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일', '자세',
                    '측정시간(초)', '정확한 횟수', '덜 내려감', '몸이 꺾임', '정확도'];

function savePushup_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우 → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'pu_' + String(d.clientId).slice(0, 80) : '';
    if (key && cache.get(key) !== null) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const good = n(d.good), badD = n(d.badDepth), badB = n(d.badBody);
    const total = good + badD + badB;
    const sh = puGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      d.kind === 'knee' ? '무릎 대고' : '일반',
      n(d.duration), good, badD, badB, total ? good / total : 0
    ]);
    sh.getRange(sh.getLastRow(), 12).setNumberFormat('0%');

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function puGetSheet_(ss) {
  let sh = ss.getSheetByName(PU_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PU_SHEET_NAME);
    sh.appendRow(PU_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PU_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagPushup() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'pushup', token: SQUAT_CONFIG.TOKEN, kind: 'knee',
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, duration: 30,
        good: 10, badDepth: 2, badBody: 1, clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
