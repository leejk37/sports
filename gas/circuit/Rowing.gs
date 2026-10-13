/**
 * 로잉머신 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Squat.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *   if (data.type === 'rowing') return saveRowing_(data);
 * 토큰·명단 찾기·응답은 Squat.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 */
const ROW_SHEET_NAME = '로잉머신';
const ROW_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                     '방식', '시간(초)', '시간', '거리(km)', '평균 SPM'];

/* 로잉머신이 정한 시간·거리에서 스스로 멈추므로, 앱은 끝난 뒤 화면 숫자만 받습니다.
 *  mode: 'time'(시간 정해서 타기) | 'distance'(거리 정해서 타기)
 *  seconds: 시간(초), distanceKm: 거리(km, 소수점 셋째 자리), spm: 평균 SPM(빈칸 가능) */
function saveRowing_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const sec = Math.round(Number(d.seconds));
  const km = Math.round(Number(d.distanceKm) * 1000) / 1000;
  const spm = (d.spm === '' || d.spm == null) ? '' : Math.round(Number(d.spm));
  if (!(sec > 0 && sec <= 3600)) return squatJson_({ ok: false, error: '시간이 올바르지 않아요' });
  if (!(km > 0 && km <= 20)) return squatJson_({ ok: false, error: '거리가 올바르지 않아요' });
  if (spm !== '' && !(spm >= 0 && spm <= 60)) return squatJson_({ ok: false, error: 'SPM이 올바르지 않아요' });
  const modeLabel = d.mode === 'distance' ? '거리 정해서' : '시간 정해서';

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

    const sh = rowGetSheet_(ss);
    const mmss = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
    sh.appendRow([new Date(), st.grade, st.cls, st.no, st.name, email, modeLabel, sec, mmss, km, spm]);
    const r = sh.getLastRow();
    sh.getRange(r, 9).setNumberFormat('@');        // '5:30'이 시각으로 바뀌지 않게
    sh.getRange(r, 10).setNumberFormat('0.000');   // 거리 소수점 셋째 자리

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
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, mode: 'time',
        seconds: 300, distanceKm: 1.25, spm: 24,
        clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
