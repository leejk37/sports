/*************************************************************
 * Setup.gs — 학교별 설정('설정' 시트)과 설치()
 *
 *  다른 학교에서 쓸 때 코드는 고치지 않습니다.
 *   1) 시트 사본을 만들고  2) 편집기에서 설치() 실행
 *   3) '설정' 시트의 빈칸 채우기  4) 웹앱 배포  5) 화면 config.js 고치기
 *  자세한 순서는 저장소의 INSTALL.md
 *
 *  코드에서는 getConfig('항목') 하나로만 읽습니다.
 *  설정을 고치면 5분 안에 반영됩니다. 바로 반영하려면 clearConfigCache() 실행.
 *************************************************************/
const SETUP = {
  SHEET: '설정',
  CACHE_KEY: 'cfg_v1',
  CACHE_SEC: 300,
  // [항목, 설명, 꼭 필요한가]
  ITEMS: [
    ['학교명', '학교 이름 (예: 청평). 화면 제목은 config.js 의 SCHOOL_NAME 이 정함', false],
    ['학교도메인', '학생 구글 계정 도메인, @ 포함 (예: @school.es.kr). 비어 있으면 설치()가 이 스크립트 주인의 계정에서 채움', true],
    ['토큰', '화면 config.js 의 TOKEN 과 똑같이. 비밀값은 아니고 다른 앱의 잘못된 요청을 거르는 용도. 비어 있으면 설치()가 만들어 줌', true],
    ['웹앱주소', '이 프로젝트를 배포한 …/exec 주소. QR 이름표 인쇄 메뉴가 씀. 비워 두면 자동으로 찾음', false],
    ['인도어라이딩시트ID', '실내자전거 기록 시트의 ID(주소의 /d/ 와 /edit 사이). 없으면 비워 둠 → 자전거 없이 도장·현황판 계산', false]
  ]
};

/** 설정값 하나 읽기. 꼭 필요한 항목이 비어 있으면 무엇을 해야 하는지 알려 주는 오류 */
function getConfig(name) {
  const all = getConfigAll_();
  const v = all[name] == null ? '' : all[name];
  const item = SETUP.ITEMS.find(it => it[0] === name);
  if (!v && item && item[2]) {
    throw new Error(`'설정' 시트의 "${name}" 칸이 비어 있어요. 편집기에서 설치()를 실행해 주세요.`);
  }
  return v;
}

let CFG_MEMO_ = null;   // 한 번 실행하는 동안은 시트를 다시 읽지 않음
function getConfigAll_() {
  if (CFG_MEMO_) return CFG_MEMO_;
  const cache = CacheService.getScriptCache();
  const hit = cache.get(SETUP.CACHE_KEY);
  if (hit) { try { return (CFG_MEMO_ = JSON.parse(hit)); } catch (e) {} }

  const map = {};
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETUP.SHEET);
  if (sh && sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues().forEach(r => {
      const k = String(r[0]).trim();
      if (k) map[k] = String(r[1]).trim();
    });
  }
  if (map['학교도메인']) map['학교도메인'] = normalizeDomain_(map['학교도메인']);
  try { cache.put(SETUP.CACHE_KEY, JSON.stringify(map), SETUP.CACHE_SEC); } catch (e) {}
  return (CFG_MEMO_ = map);
}

/** 'school.es.kr', '@school.es.kr', 'a@school.es.kr' 모두 → '@school.es.kr' */
function normalizeDomain_(s) {
  s = String(s || '').trim().toLowerCase();
  if (!s) return '';
  return '@' + s.split('@').pop();
}

/** '설정' 시트를 고친 뒤 바로 반영하고 싶을 때 실행 */
function clearConfigCache() {
  CacheService.getScriptCache().remove(SETUP.CACHE_KEY);
  CFG_MEMO_ = null;
  Logger.log('설정 캐시를 비웠어요. 다음 요청부터 새 설정을 읽습니다.');
}

/** 인도어라이딩 시트 ID: '설정' 시트 → (예전 방식) 스크립트 속성 RIDE_SHEET_ID 순서로 찾음 */
function rideSheetId_() {
  return getConfig('인도어라이딩시트ID') ||
    PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID') || '';
}

/* ============================================================
 * 설치 — 여러 번 실행해도 괜찮습니다(이미 있는 것은 건너뜀).
 *  ① '설정' 시트 만들기·빈 항목 채우기
 *  ② 선생님 열쇠(DASH_KEY) 없으면 만들기
 *  ③ 입퇴실·포인트 탭 만들기
 *  ④ 자동 실행(트리거) 4개를 지우고 다시 등록
 *  ⑤ 결과와 남은 할 일을 알려 줌
 * ============================================================ */
function 설치() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const notes = [];

  // ① 설정 시트
  const sh = setupConfigSheet_(ss, notes);
  clearConfigCache();

  // ② 선생님 열쇠 (현황판 이름 보기·포인트 관리). 비밀값이라 시트가 아니라 스크립트 속성에 둠
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('DASH_KEY')) {
    const key = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    props.setProperty('DASH_KEY', key);
    notes.push(`선생님 열쇠(DASH_KEY)를 새로 만들었어요: ${key}  → 현황판·포인트 화면 주소 뒤에 ?key=${key} 로 한 번 열면 그 기기에 기억됩니다.`);
  }

  // ③ 탭
  checkinSheet_(ss);                                         // Checkin.gs
  pointRules_(ss); pointGiftSheet_(ss); pointTradeSheet_(ss); // Points.gs
  const ledger = pointLedger_(ss);

  // ④ 트리거 (각 함수가 자기 트리거만 지우고 다시 만듦 → 중복 없음)
  setupStampWarm();     // 1분마다 도장 미리 계산      (Stamp.gs)
  setupDashArchive();   // 매일 1시 현황판 지난 날 보관 (Dashboard.gs)
  setupCheckin();       // 매일 18시 퇴실 안 찍은 기록 정리 (Checkin.gs)
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'pointsNightly').forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('pointsNightly').timeBased().atHour(1).everyDays(1).inTimezone(STAMP.TZ).create();

  // 포인트 원장이 비어 있을 때만 처음부터 계산 (이미 운영 중이면 건너뜀)
  if (ledger && ledger.getLastRow() <= 1) {
    try { rebuildPoints(); } catch (e) { notes.push('포인트 처음 계산은 나중에 rebuildPoints()를 따로 실행해 주세요: ' + e.message); }
  }

  // ⑤ 점검
  const cfg = getConfigAll_();
  SETUP.ITEMS.filter(it => it[2] && !cfg[it[0]]).forEach(it => notes.push(`'설정' 시트의 "${it[0]}" 칸을 채워 주세요.`));
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  if (!url) notes.push('아직 웹앱으로 배포하지 않았어요: 배포 → 새 배포 → 웹 앱 (실행: 나, 액세스: 모든 사용자).');

  const msg = ['설치를 마쳤어요.',
    `학교도메인 ${cfg['학교도메인'] || '(비어 있음)'} · 토큰 ${cfg['토큰'] || '(비어 있음)'}`,
    '화면 저장소의 config.js 에 같은 도메인·토큰과 웹앱 주소를 적어 주세요.']
    .concat(notes).join('\n');
  Logger.log(msg);
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) {}   // 편집기에서 실행하면 알림창은 건너뜀
  ss.setActiveSheet(sh);
}
/** 영문 이름이 편한 경우를 위해 */
function setupAll() { 설치(); }

function setupConfigSheet_(ss, notes) {
  let sh = ss.getSheetByName(SETUP.SHEET);
  if (!sh) {
    sh = ss.insertSheet(SETUP.SHEET, 0);
    sh.getRange(1, 1, 1, 4).setValues([['항목', '값', '설명', '← 학교마다 다른 값은 여기에만 적어요. 고치면 5분 안에 반영']]);
    sh.setFrozenRows(1);
    sh.getRange('A1:C1').setFontWeight('bold');
    sh.setColumnWidth(1, 150); sh.setColumnWidth(2, 320); sh.setColumnWidth(3, 520);
    sh.getRange('B:B').setNumberFormat('@');
    notes.push("'설정' 시트를 새로 만들었어요.");
  }
  // 없는 항목만 아래에 추가
  const have = sh.getLastRow() > 1
    ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues().map(r => String(r[0]).trim()) : [];
  const add = SETUP.ITEMS.filter(it => have.indexOf(it[0]) < 0).map(it => [it[0], '', it[1]]);
  if (add.length) sh.getRange(sh.getLastRow() + 1, 1, add.length, 3).setValues(add);

  // 빈 값 자동 채우기: 학교도메인(스크립트 주인 계정), 토큰(무작위), 인도어라이딩시트ID(예전 스크립트 속성)
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getDisplayValues();
  const fill = (name, value, why) => {
    const i = rows.findIndex(r => String(r[0]).trim() === name);
    if (i < 0 || String(rows[i][1]).trim() || !value) return;
    sh.getRange(i + 2, 2).setValue(value);
    notes.push(`"${name}"을(를) ${why}: ${value}`);
  };
  let owner = '';
  try { owner = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (owner && !/@gmail\.com$/i.test(owner)) fill('학교도메인', normalizeDomain_(owner), '스크립트 주인 계정에서 채웠어요');
  fill('토큰', 'tk_' + Utilities.getUuid().replace(/-/g, '').slice(0, 10), '새로 만들었어요 (config.js 의 TOKEN 과 같게)');
  fill('인도어라이딩시트ID', PropertiesService.getScriptProperties().getProperty('RIDE_SHEET_ID') || '', '예전 스크립트 속성에서 옮겼어요');
  return sh;
}
