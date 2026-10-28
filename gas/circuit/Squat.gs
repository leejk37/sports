/*************************************************************
 * Squat.gs — 스쿼트 기록 저장 ('스쿼트' 시트)
 *  doPost(Main.gs)에서 data.type === 'squat'이면 호출됨
 *  설정·명단 찾기·응답은 Main.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 *************************************************************/
function handleSquat_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우(다시 저장 버튼) → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'sq_' + String(d.clientId).slice(0, 80) : '';
    if (key && cache.get(key) !== null) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SQUAT_CONFIG.SS_ID
      ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SQUAT_CONFIG.SHEET_NAME) || createSquatSheet_(ss);
    const st = lookupStudent_(ss, email);
    const good = n(d.good), badDepth = n(d.badDepth), badBack = n(d.badBack);
    const total = good + badDepth + badBack;

    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email, n(d.duration),
      good, badDepth, badBack, total ? good / total : 0,
      String(d.mode || '').slice(0, 20)                     // L 방식 (예: 20회×3세트) — 같은 방식끼리 기록 비교
    ]);
    if (sh.getRange(1, 12).getValue() === '') sh.getRange(1, 12).setValue('방식');
    sh.getRange(sh.getLastRow(), 11).setNumberFormat('0%');
    if (key) cache.put(key, st.name || '', 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function createSquatSheet_(ss) {
  const sh = ss.insertSheet(SQUAT_CONFIG.SHEET_NAME);
  sh.appendRow(['측정일시', '학년', '반', '번호', '이름', '이메일', '측정시간(초)', '정확한 횟수', '깊이 부족', '허리 숙임', '정확도', '방식']);
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, 11).setFontWeight('bold');
  return sh;
}

/** 시트 기록 확인용 테스트 (TEST_ID를 채워서 실행) */
function testSquat() {
  const TEST_ID = '여기에_테스트용_아이디';
  const res = handleSquat_({
    type: 'squat', token: SQUAT_CONFIG.TOKEN,
    email: TEST_ID + SQUAT_CONFIG.DOMAIN, duration: 30, good: 12, badDepth: 2, badBack: 1
  });
  Logger.log(res.getContent());
}


/** 한 번만 실행: 예전 스쿼트 줄(L열 방식 빈칸)에 방식을 채움 — 30초·1분 측정, 그 밖(예전 횟수 모드)은 '예전 횟수'
 *  기록 경신·순위가 L열 방식끼리 비교하므로, 예전 30초 기록과 1분 기록이 섞이지 않게 함 */
function fillSquatMode() {
  const ss = SQUAT_CONFIG.SS_ID ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SQUAT_CONFIG.SHEET_NAME); if (!sh) return;
  const n = sh.getLastRow() - 1; if (n < 1) return;
  sh.getRange(1, 12).setValue('방식');
  const g = sh.getRange(2, 7, n, 1).getValues(), l = sh.getRange(2, 12, n, 1).getValues();
  let c = 0;
  const out = l.map((r, i) => {
    if (String(r[0]).trim()) return r;
    c++; const t = Number(g[i][0]);
    return [t === 30 ? '30초' : t === 60 ? '1분' : '예전 횟수'];
  });
  sh.getRange(2, 12, n, 1).setValues(out);
  Logger.log(`스쿼트 방식 채움: ${c}줄`);
}
