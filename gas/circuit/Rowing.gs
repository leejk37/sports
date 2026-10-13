/**
 * 로잉머신 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Squat.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *   if (data.type === 'rowing') return saveRowing_(data);
 * 토큰·명단 찾기·응답은 Squat.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 */
const ROW_SHEET_NAME = '로잉머신';
const ROW_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                     '운동시간(초)', '운동시간', '거리(m)', '500m 기록', '스트로크', '칼로리(kcal)'];

function saveRowing_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  // 빈칸은 빈칸으로, 숫자는 범위 안에서만
  const num = (v, max) => {
    if (v === '' || v === null || v === undefined) return '';
    const x = Math.round(Number(v));
    return isFinite(x) && x >= 0 && x <= max ? x : '';
  };
  const mmss = s => s === '' ? '' : Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우 → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'row_' + d.clientId : '';
    if (key && cache.get(key)) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const sec = num(d.seconds, 3600);
    const split = num(d.split500, 900);
    const sh = rowGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      sec, mmss(sec), num(d.distance, 20000), mmss(split), num(d.strokes, 5000), num(d.calories, 2000)
    ]);
    // '2:05' 같은 글자가 시각으로 바뀌지 않게 글자 형식으로 고정
    sh.getRange(sh.getLastRow(), 8).setNumberFormat('@');
    sh.getRange(sh.getLastRow(), 10).setNumberFormat('@');

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function rowGetSheet_(ss) {
  let sh = ss.getSheetByName(ROW_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(ROW_SHEET_NAME);
    sh.appendRow(ROW_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, ROW_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagRowing() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'rowing', token: SQUAT_CONFIG.TOKEN,
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, seconds: 300,
        distance: 1000, split500: 150, strokes: 120, calories: 40,
        clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
