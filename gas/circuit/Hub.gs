/**
 * 허브(초기화면) — 서킷트레이닝 GAS 프로젝트의 Hub.gs를 이 내용으로 "전체 교체"
 * 허브가 JSONP(GET + callback)로 요청하면 답합니다.
 * Code.gs의 doGet 첫 줄:  if (e && e.parameter && e.parameter.callback) return hubJsonp_(e);
 *
 * 공용 모드(방 이름 있음)에서는 로그인 = 입실, 로그아웃 = 퇴실로 '입퇴실' 시트에도 기록 (Checkin.gs)
 *
 * 요청 종류(action)
 *   student   : 학생 이름 확인 (이 기기 모드)
 *   list      : 방(room)의 로그인 목록
 *   login     : 로그인(이미 있으면 시간만 연장)
 *   logout    : 한 명 로그아웃
 *   logoutAll : 방 전체 로그아웃
 *   dash      : 큰 화면 현황판 요약 (Dashboard.gs). date=yyyy-MM-dd 를 주면 그날 기록
 *   stamp     : 개인별 하루 도장·이번 달 달력·우리 모둠 (Stamp.gs). email, month=yyyy-MM
 *   team      : 반 전체 모둠 도장 (Stamp.gs). email 또는 grade·cls, month
 *   rank      : 종목별 순위 (Rank.gs). ex, period, key(선생님 열쇠면 이름 그대로)
 *   points    : 선생님 포인트 화면 (Points.gs). key 필수, id 있으면 한 학생 자세히
 *   gift      : 선물 주기 → 선물교환 탭 (Points.gs). key, id, gift
 */
const HUB_SHEET = '허브로그인';
const HUB_HEADERS = ['방', '이메일', '이름', '학년', '반', '번호', '로그인시각'];

function hubJsonp_(e) {
  const p = e.parameter;
  const cb = String(p.callback || '');
  if (!/^[\w.]{1,60}$/.test(cb)) return ContentService.createTextOutput('잘못된 요청');

  let out;
  try {
    if (p.token !== SQUAT_CONFIG.TOKEN) {
      out = { ok: false, error: '인증 실패' };
    } else if (p.action === 'student') {
      out = hubStudent_(p.email);
    } else if (p.action === 'dash') {
      out = dashSummary_(p.date, p.key);    // Dashboard.gs — 큰 화면 현황판 (date 없으면 오늘, key 맞으면 명단)
    } else if (p.action === 'stamp') {
      out = stampSummary_(p.email, p.month); // Stamp.gs — 개인별 하루 도장 (month=yyyy-MM, 없으면 이번 달)
    } else if (p.action === 'team') {
      out = stampTeam_(p);                   // Stamp.gs — 반 전체 모둠 도장 (email 또는 grade·cls, month)
    } else if (p.action === 'rank') {
      out = rankSummary_(p.ex, p.period, p.key); // Rank.gs — 종목별 순위 화면 (ex, period=today|week|month)
    } else if (p.action === 'points') {
      out = pointsTeacher_(p);               // Points.gs — 선생님 포인트 화면 (key, id 있으면 한 학생)
    } else if (p.action === 'rules') {
      out = pointRulesInfo_();               // Points.gs — 규칙 안내·포인트 계산기 화면(rules/), 로그인 없이
    } else if (p.action === 'gift') {
      out = pointsGive_(p);                  // Points.gs — 선물 주기 (key, id, gift)
    } else {
      const room = String(p.room || '');
      if (!/^[\w-]{1,20}$/.test(room)) throw new Error('방 이름이 잘못됐어요');
      const hours = Math.min(48, Math.max(0.25, Number(p.hours) || 3));
      if (p.action === 'list')           out = { ok: true, list: hubList_(room, hours) };
      else if (p.action === 'login')     out = hubLogin_(room, p.email, hours);
      else if (p.action === 'logout')    out = hubLogout_(room, p.email, hours);
      else if (p.action === 'logoutAll') out = hubLogout_(room, null, hours);
      else out = { ok: false, error: '알 수 없는 요청' };
    }
  } catch (err) {
    out = { ok: false, error: String(err.message || err) };
  }
  return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

/** 명단에서 학생 찾기 (Main.gs의 lookupStudent_ 재사용) */
function hubStudent_(emailRaw) {
  const email = String(emailRaw || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return { ok: false, error: '학교 계정이 아니에요' };
  const st = lookupStudent_(SpreadsheetApp.getActiveSpreadsheet(), email);
  if (!st.name) return { ok: false, error: '명단에 없는 학생이에요' };
  return { ok: true, email: email, name: st.name, grade: st.grade, cls: st.cls, no: st.no };
}

function hubSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(HUB_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HUB_SHEET);
    sh.appendRow(HUB_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HUB_HEADERS.length).setFontWeight('bold');
  }
  return sh;
}

/** 방의 로그인 목록 (유지 시간 안의 학생만, 번호순) */
function hubList_(room, hours) {
  const limit = Date.now() - hours * 3600e3;
  return hubSheet_().getDataRange().getValues().slice(1)
    .filter(r => r[0] === room && r[6] && new Date(r[6]).getTime() > limit)
    .map(r => ({ email: r[1], name: r[2], no: r[5], at: new Date(r[6]).getTime() }))
    .sort((a, b) => (+a.no || 99) - (+b.no || 99));
}

function hubLogin_(room, emailRaw, hours) {
  const st = hubStudent_(emailRaw);
  if (!st.ok) return st;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = hubSheet_();
    const v = sh.getDataRange().getValues();
    const limit = Date.now() - hours * 3600e3;
    let row = -1, already = false;
    for (let i = 1; i < v.length; i++) {
      if (v[i][0] === room && v[i][1] === st.email) {
        row = i + 1;
        already = v[i][6] && new Date(v[i][6]).getTime() > limit;
        break;
      }
    }
    if (row > 0) sh.getRange(row, 7).setValue(new Date());          // 시간 연장
    else sh.appendRow([room, st.email, st.name, st.grade, st.cls, st.no, new Date()]);
    hubCleanup_(sh);
    // 스포츠실(공용 모드) 로그인 = 입실 (이미 '이용 중'이면 그대로) — Checkin.gs
    try { checkinIn_(st.email, st); } catch (e) { console.error('입실 기록 실패: ' + e); }
    return { ok: true, name: st.name, already: already, list: hubList_(room, hours) };
  } finally {
    lock.releaseLock();
  }
}

/** email이 없으면 방 전체 로그아웃 */
function hubLogout_(room, emailRaw, hours) {
  const email = emailRaw ? String(emailRaw).trim().toLowerCase() : null;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = hubSheet_();
    const v = sh.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) {              // 아래에서부터 지워야 줄 번호가 안 꼬임
      if (v[i][0] === room && (!email || v[i][1] === email)) {
        // 로그아웃 = 퇴실 — Checkin.gs
        try { checkinOut_(String(v[i][1]).toLowerCase()); } catch (e) { console.error('퇴실 기록 실패: ' + e); }
        sh.deleteRow(i + 1);
      }
    }
    return { ok: true, list: hubList_(room, hours) };
  } finally {
    lock.releaseLock();
  }
}

/** 이틀 지난 줄은 정리 (시트가 계속 길어지지 않게) */
function hubCleanup_(sh) {
  const v = sh.getDataRange().getValues();
  const old = Date.now() - 48 * 3600e3;
  for (let i = v.length - 1; i >= 1; i--) {
    if (!v[i][6] || new Date(v[i][6]).getTime() < old) sh.deleteRow(i + 1);
  }
}

/** 편집기 진단: 로그인 → 목록 → 로그아웃 순서로 시험
 *  TEST_ID에 명단에 있는 아이디를 넣고 실행하세요. 저장소에는 실제 아이디를 올리지 않습니다. */
function diagHub() {
  const TEST_ID = '여기에_테스트용_아이디';
  const call = params => hubJsonp_({ parameter: Object.assign({
    callback: 'test', token: SQUAT_CONFIG.TOKEN, room: 'test', hours: 3
  }, params) }).getContent();
  const email = TEST_ID + SQUAT_CONFIG.DOMAIN;
  Logger.log('학생 확인: ' + call({ action: 'student', email: email }));
  Logger.log('로그인:   ' + call({ action: 'login', email: email }));
  Logger.log('목록:     ' + call({ action: 'list' }));
  Logger.log('로그아웃: ' + call({ action: 'logout', email: email }));
}