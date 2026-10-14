/*************************************************************
 * Main.gs — 서킷트레이닝 GAS 프로젝트의 공통 부분
 *  (스프레드시트 26_청평_스마트스포츠실)
 *  - 공통 설정(SQUAT_CONFIG): 토큰·도메인·학생명단 열 위치
 *  - 받는 창구(doPost): 운동 앱이 보낸 type을 보고 각 파일로 나눠 줌
 *  - 명단 찾기(lookupStudent_), 응답(squatJson_)
 *  새 운동을 추가할 때는 doPost에 한 줄만 넣으면 됩니다.
 *  ※ SQUAT_CONFIG·squatJson_ 이름은 다른 파일들이 함께 쓰므로 그대로 둡니다.
 *************************************************************/
const SQUAT_CONFIG = {
  TOKEN: '26cp4s_squat',       // 운동 앱 index.html 의 TOKEN 과 똑같이
  SS_ID: '',                   // 시트에 연결된 스크립트면 '' 그대로
  SHEET_NAME: '스쿼트',
  DOMAIN: '@cpe.es.kr',
  // 학생명단 시트의 열 번호 (A=1, B=2, C=3 ...)
  ROSTER_SHEET: '학생명단',
  ROSTER_GRADE_COL: 1,         // 학년
  ROSTER_CLASS_COL: 2,         // 반
  ROSTER_NO_COL: 3,            // 번호
  ROSTER_NAME_COL: 4,          // 이름
  ROSTER_EMAIL_COL: 5,         // 이메일 또는 아이디
  ROSTER_CACHE_SEC: 600        // 명단을 10분 동안 기억해 두고 빠르게 찾기
};

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return squatJson_({ ok: false, error: '요청 형식이 잘못됐어요' });
  }
  if (data.type === 'squat') return handleSquat_(data);         // Squat.gs
  if (data.type === 'curlup') return saveCurlUp_(data);
  if (data.type === 'jumpingjack') return saveJumpingJack_(data);
  if (data.type === 'hang') return handleHang_(data);
  if (data.type === 'treadmill') return handleTreadmill_(data);
  if (data.type === 'lunge') return saveLunge_(data);
  if (data.type === 'rowing') return saveRowing_(data);     // Rowing.gs
  if (data.type === 'pushup') return savePushup_(data);     // Pushup.gs
  if (data.type === 'plank') return savePlank_(data);       // Plank.gs
  if (data.type === 'jumprope') return saveJumpRope_(data); // JumpRope.gs (줄넘기)
  if (data.type === 'checkin') return checkin_(data);       // Checkin.gs (입퇴실)

  return squatJson_({ ok: false, error: '알 수 없는 요청' });
}

/** 이메일(또는 아이디)로 학생명단에서 학년·반·번호·이름 찾기
 *  전교생 명단을 매번 읽으면 느려서, 아이디 → 학생 정보 표를 10분 동안 캐시에 둡니다.
 *  명단을 고친 직후 바로 반영하려면 편집기에서 clearRosterCache()를 실행하세요. */
function lookupStudent_(ss, email) {
  const empty = { grade: '', cls: '', no: '', name: '' };
  const id = String(email || '').trim().toLowerCase().split('@')[0];
  if (!id) return empty;
  const map = rosterMap_(ss);
  return map[id] || empty;
}

function rosterMap_(ss) {
  const cache = CacheService.getScriptCache();
  const hit = cache.get('roster_v1');
  if (hit) { try { return JSON.parse(hit); } catch (e) {} }

  const C = SQUAT_CONFIG, map = {};
  const roster = (ss || SpreadsheetApp.getActiveSpreadsheet()).getSheetByName(C.ROSTER_SHEET);
  if (!roster) return map;
  roster.getDataRange().getDisplayValues().slice(1).forEach(r => {
    const id = String(r[C.ROSTER_EMAIL_COL - 1]).trim().toLowerCase().split('@')[0];
    if (!id) return;
    map[id] = {
      grade: r[C.ROSTER_GRADE_COL - 1],
      cls: r[C.ROSTER_CLASS_COL - 1],
      no: r[C.ROSTER_NO_COL - 1],
      name: String(r[C.ROSTER_NAME_COL - 1]).trim()
    };
  });
  const json = JSON.stringify(map);
  if (json.length < 95000) cache.put('roster_v1', json, C.ROSTER_CACHE_SEC);   // 캐시 한 칸은 약 100KB까지
  return map;
}

/** 명단을 고친 뒤 바로 반영하고 싶을 때 편집기에서 실행 */
function clearRosterCache() {
  CacheService.getScriptCache().remove('roster_v1');
  Logger.log('명단 캐시를 비웠어요. 다음 요청부터 새 명단을 읽습니다.');
}

function squatJson_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** 명단 찾기 확인용: TEST_ID에 명단에 있는 아이디를 넣고 실행 (저장소에는 실제 아이디를 올리지 않음) */
function checkName() {
  const TEST_ID = '여기에_테스트용_아이디';
  const ss = SQUAT_CONFIG.SS_ID ? SpreadsheetApp.openById(SQUAT_CONFIG.SS_ID) : SpreadsheetApp.getActiveSpreadsheet();
  const roster = ss.getSheetByName(SQUAT_CONFIG.ROSTER_SHEET);
  if (!roster) { Logger.log('명단 시트를 못 찾음: "' + SQUAT_CONFIG.ROSTER_SHEET + '"'); return; }
  Logger.log('명단 2행: ' + JSON.stringify(roster.getRange(2, 1, 1, roster.getLastColumn()).getValues()[0]));
  Logger.log('찾은 학생: ' + JSON.stringify(lookupStudent_(ss, TEST_ID + SQUAT_CONFIG.DOMAIN)));
}
