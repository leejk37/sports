/**
 * 줄넘기(카메라로 센 횟수) 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Main.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *   if (data.type === 'jumprope') return saveJumpRope_(data);
 * 토큰·명단 찾기·응답은 Main.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 * 체력 기록장 '기록' 탭의 줄넘기(직접 입력)와는 별개. 현황판은 둘을 더해서 보여 줌
 */
const ROPE_SHEET_NAME = '줄넘기';
const ROPE_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                      '방식', '횟수', '측정시간(초)', '1분 빠르기(회)', '끊김', '최장 연속'];   // K·L열 2026-11-01

function saveJumpRope_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = (v, max) => Math.max(0, Math.min(max, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'rope_' + d.clientId : '';
    if (key && cache.get(key)) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const mode = String(d.mode || '').slice(0, 10);          // 30초 · 1분 · 50회 · 100회 · 최대한 많이
    const sh = ropeGetSheet_(ss);
    // 어제의 나와 비교(2026-11-01): 저장 전 같은 방식 내 최고 횟수(H)와 내 최장 연속(L)
    let prevBest = null, prevRun = null;
    if (sh.getLastRow() > 1) {
      const id = email.split('@')[0];
      sh.getRange(2, 1, sh.getLastRow() - 1, 12).getValues().forEach(r => {
        if (String(r[5] || '').trim().toLowerCase().split('@')[0] !== id) return;
        if (String(r[6]).trim() === mode) { const c = Number(r[7]) || 0; if (prevBest == null || c > prevBest) prevBest = c; }
        if (r[11] !== '' && r[11] != null) { const m = Number(r[11]) || 0; if (prevRun == null || m > prevRun) prevRun = m; }
      });
    }
    sh.appendRow([new Date(), st.grade, st.cls, st.no, st.name, email,
                  mode, n(d.count, 9999), n(d.duration, 3600), n(d.pace, 999),
                  d.breaks == null ? '' : n(d.breaks, 9999), d.maxRun == null ? '' : n(d.maxRun, 9999)]);   // 끊김 기능 전 앱은 빈칸

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name, prevBest, prevRun });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function ropeGetSheet_(ss) {
  let sh = ss.getSheetByName(ROPE_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROPE_SHEET_NAME);
    sh.appendRow(ROPE_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ROPE_HEADERS.length).setFontWeight('bold');
  } else if (!String(sh.getRange(1, 11).getValue()).trim()) {
    sh.getRange(1, 11, 1, 2).setValues([['끊김', '최장 연속']]).setFontWeight('bold');   // 예전 탭에 K·L 제목만 더함
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagJumpRope() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = { postData: { contents: JSON.stringify({
    type: 'jumprope', token: SQUAT_CONFIG.TOKEN, email: TEST_ID + SQUAT_CONFIG.DOMAIN,
    mode: '1분', count: 98, duration: 60, pace: 98, clientId: 'diag-' + Date.now()
  }) } };
  Logger.log(doPost(fake).getContent());
}
