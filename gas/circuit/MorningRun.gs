/**
 * MorningRun.gs — 아침달리기(운동장 NFC 기록대) 기록을 현황판에 붙이기
 *
 *  아침달리기 스프레드시트는 읽기만 합니다. NFC 기록대 쪽은 아무것도 바뀌지 않습니다.
 *  '설정' 시트에 한 줄: 항목 '아침달리기시트ID' · 값 = 아침달리기 시트 주소의 /d/ 와 /edit 사이 글자
 *   (비어 있으면 현황판의 아침달리기 칸은 0으로만 나옴)
 *
 *  학생 연결: 아침달리기 명단에는 구글 계정이 없으므로
 *   학년|반|번호가 같고 이름까지 같을 때만 우리 '학생명단'의 학생으로 봄 (동명이인·전학 대비)
 *   맞지 않는 줄은 현황판에서 빠짐 → 편집기에서 checkMorningRun() 실행해 확인
 *
 *  '달리기기록' 탭: A 날짜 · B 학년 · C 반 · D 번호 · E 성명 · F 파일번호 · G 출발 · H 도착 · I 기록(분:초) · J 저장시각
 *  1회 = 운동장 5바퀴 = 0.5km. 걸린 시간은 G 출발 ~ H 도착으로 계산(안 되면 I 기록)
 */
const MRUN = {
  CONFIG_ITEM: '아침달리기시트ID',
  LOG_SHEET: '달리기기록',
  ROSTER_SHEET: '학생명단',
  KM: 0.5,
  TZ: 'Asia/Seoul'
};

/** 현황판용: [{ d:'yyyy-MM-dd', id(구글 아이디), sec(걸린 초), t(저장 시각 ms) }] — 명단과 맞는 줄만 */
function morningRunRows_() {
  const sid = getConfig(MRUN.CONFIG_ITEM);   // Setup.gs
  if (!sid) return [];
  try {
    const sh = SpreadsheetApp.openById(sid).getSheetByName(MRUN.LOG_SHEET);
    if (!sh || sh.getLastRow() < 2) return [];
    const rng = sh.getRange(2, 1, sh.getLastRow() - 1, 10);
    const vals = rng.getValues(), disp = rng.getDisplayValues();
    const byKey = morningRunKeyMap_();
    const out = [];
    vals.forEach((r, i) => {
      const s = disp[i];
      const d = r[0] instanceof Date ? Utilities.formatDate(r[0], MRUN.TZ, 'yyyy-MM-dd') : String(s[0]).trim().slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      const st = byKey[mrunKey_(s[1], s[2], s[3])];
      if (!st || st.name !== String(s[4]).trim()) return;
      const sec = mrunElapsed_(s[6], s[7], s[8]);
      if (!sec) return;
      out.push({ d, id: st.id, sec, t: r[9] instanceof Date ? r[9].getTime() : 0 });
    });
    return out;
  } catch (e) {
    return [];                                // 권한·ID 문제면 아침달리기 없이 현황판 계산
  }
}

/** 우리 학생명단: '학년|반|번호' → { id, name } (교직원 제외) */
function morningRunKeyMap_() {
  const map = {}, roster = rosterMap_();     // Main.gs: 아이디 → {grade, cls, no, name}
  Object.keys(roster).forEach(id => {
    const st = roster[id];
    if (!st.grade) return;
    map[mrunKey_(st.grade, st.cls, st.no)] = { id, name: String(st.name).trim() };
  });
  return map;
}

function mrunKey_(g, c, n) {
  return [g, c, n].map(x => String(x).trim()).join('|');
}

/** 'h:mm:ss' 또는 'm:ss' → 초 */
function mrunSec_(s) {
  const p = String(s || '').trim().split(':');
  if (p.length < 2 || p.some(x => x === '' || isNaN(Number(x)))) return 0;
  return p.map(Number).reduce((t, x) => t * 60 + x, 0);
}

/** 걸린 시간(초): 출발·도착 시각의 차이 → 안 되면 기록 칸(분:초) */
function mrunElapsed_(start, end, rec) {
  const a = mrunSec_(start), b = mrunSec_(end);
  if (String(start).split(':').length === 3 && String(end).split(':').length === 3 && b > a) return b - a;
  const p = String(rec || '').trim().split(':');
  if (p.length === 2) return mrunSec_(rec);  // 6:25 = 6분 25초
  return 0;
}

/** 385 → '6분 25초' */
function mrunFmt_(sec) {
  sec = Math.round(sec);
  return Math.floor(sec / 60) + '분 ' + (sec % 60) + '초';
}

/** 편집기에서 실행: 두 명단이 맞는지, 현황판에 들어가는 기록이 몇 줄인지 (결과는 실행 로그) */
function checkMorningRun() {
  const sid = getConfig(MRUN.CONFIG_ITEM);
  if (!sid) { Logger.log(`'설정' 시트에 "${MRUN.CONFIG_ITEM}" 줄이 없거나 값이 비어 있어요.`); return; }
  const book = SpreadsheetApp.openById(sid);
  const byKey = morningRunKeyMap_();
  const sh = book.getSheetByName(MRUN.ROSTER_SHEET);
  const v = sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 4).getDisplayValues() : [];
  const bad = [];
  v.forEach(r => {
    if (!String(r[0]).trim()) return;
    const st = byKey[mrunKey_(r[0], r[1], r[2])];
    if (!st) bad.push(`${r[0]}학년 ${r[1]}반 ${r[2]}번 ${r[3]} → 우리 학생명단에 이 번호가 없음`);
    else if (st.name !== String(r[3]).trim()) bad.push(`${r[0]}학년 ${r[1]}반 ${r[2]}번 ${r[3]} → 우리 명단은 '${st.name}'`);
  });
  const rows = morningRunRows_();
  const log = book.getSheetByName(MRUN.LOG_SHEET);
  const all = log ? Math.max(0, log.getLastRow() - 1) : 0;
  Logger.log([
    `아침달리기 명단 ${v.length}명 중 맞지 않음 ${bad.length}명`,
    ...bad,
    `달리기기록 ${all}줄 중 현황판에 들어가는 줄 ${rows.length}줄`,
    rows.length ? `예: ${JSON.stringify(rows[rows.length - 1])}` : ''
  ].join('\n'));
}
