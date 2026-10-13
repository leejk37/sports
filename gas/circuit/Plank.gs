/**
 * 플랭크 기록 저장 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 * Main.gs의 doPost에 아래 한 줄이 있어야 작동함
 *   if (data.type === 'plank') return savePlank_(data);
 * kind: 'full'(일반) | 'knee'(무릎 대고), goal: 0(최대한 오래) | 목표 초
 * hold: 바른 자세로 버틴 시간(초), total: 전체 시간(초), sag/pike: 엉덩이 처짐/솟음 횟수
 */
const PL_SHEET_NAME = '플랭크';
const PL_HEADERS = ['측정일시', '학년', '반', '번호', '이름', '이메일', '자세', '방식',
                    '버틴 시간(초)', '전체 시간(초)', '엉덩이 처짐', '엉덩이 솟음', '유지율'];

function savePlank_(d) {
  if (d.token !== SQUAT_CONFIG.TOKEN) return squatJson_({ ok: false, error: '인증 실패' });

  const email = String(d.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return squatJson_({ ok: false, error: '학교 계정이 아니에요' });

  const sec = v => Math.max(0, Math.min(600, Math.round((parseFloat(v) || 0) * 10) / 10));
  const n = v => Math.max(0, Math.min(999, parseInt(v, 10) || 0));
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = d.clientId ? 'pl_' + String(d.clientId).slice(0, 80) : '';
    if (key && cache.get(key) !== null) return squatJson_({ ok: true, duplicate: true, name: cache.get(key) });

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const st = lookupStudent_(ss, email);
    if (!st.name) return squatJson_({ ok: false, error: '명단에 없는 학생: ' + email });

    const total = sec(d.total), hold = Math.min(sec(d.hold), total || 600);
    const goal = n(d.goal);
    const sh = plGetSheet_(ss);
    sh.appendRow([
      new Date(), st.grade, st.cls, st.no, st.name, email,
      d.kind === 'knee' ? '무릎 대고' : '일반',
      goal ? goal + '초 목표' : '최대한 오래',
      hold, total, n(d.sag), n(d.pike), total ? hold / total : 0
    ]);
    sh.getRange(sh.getLastRow(), 13).setNumberFormat('0%');

    if (key) cache.put(key, st.name, 21600);
    return squatJson_({ ok: true, name: st.name });
  } catch (err) {
    return squatJson_({ ok: false, error: String(err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function plGetSheet_(ss) {
  let sh = ss.getSheetByName(PL_SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(PL_SHEET_NAME);
    sh.appendRow(PL_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PL_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 태블릿과 같은 요청을 doPost에 넣어 보는 진단 (확인 후 테스트 행 삭제)
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagPlank() {
  const TEST_ID = '여기에_테스트용_아이디';
  const fake = {
    postData: {
      contents: JSON.stringify({
        type: 'plank', token: SQUAT_CONFIG.TOKEN, kind: 'full', goal: 0,
        email: TEST_ID + SQUAT_CONFIG.DOMAIN, hold: 42.3, total: 46.1, sag: 1, pike: 0,
        clientId: 'diag-' + Date.now()
      })
    }
  };
  Logger.log(doPost(fake).getContent());
}
