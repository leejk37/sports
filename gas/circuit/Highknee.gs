/**
 * HighKnee.gs — 하이니(제자리 무릎 높이 들기) 기록 저장
 *  서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 *  Main.gs의 doPost에 아래 한 줄을 추가해야 작동함
 *    if (data.type === 'highknee') return saveHighKnee_(data);   // HighKnee.gs (하이니)
 *  토큰·명단 찾기·응답은 Main.gs의 SQUAT_CONFIG, lookupStudent_, squatJson_을 함께 사용
 *
 *  시트 열(0부터): 0 측정일시 · 1 학년 · 2 반 · 3 번호 · 4 이름 · 5 이메일 · 6 측정시간(초) · 7 정확한 횟수 · 8 무릎 덜 올림 · 9 정확도
 *   → Dashboard.gs의 DASH_EX에 { email: 5, value: 7, pbBy: 6 } 으로 넣으면 현황판·순위 화면에 나옴
 */
const HK_SHEET_NAME = '하이니';
const HK_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일',
                    '측정시간(초)', '정확한 횟수', '무릎 덜 올림', '정확도'];

function saveHighKnee_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    // 같은 측정을 다시 보낸 경우 → 새로 쓰지 않음
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'hk_' + d.clientId : '';
    if (key && cache.get(key)) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const good = n(d.good), low = n(d.low);
    const total = good + low;
    const sh = hkGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email, n(d.duration),
      good, low, total ? good / total : 0
    ]);
    sh.getRange(sh.getLastRow(), 10).setNumberFormat('0%');

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function hkGetSheet_(ss) {
  let sh = ss.getSheetByName(HK_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(HK_SHEET_NAME);
    sh.appendRow(HK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HK_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행 → '하이니' 탭에 한 줄 생김 (확인 후 그 줄 삭제) */
function diagHighKnee() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'highknee', token: SQUAT_CONFIG.TOKEN,
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, duration: 30,
        good: 40, low: 3, clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
