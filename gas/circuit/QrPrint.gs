/**
 * QR 이름표 인쇄 — 서킷트레이닝(26_청평_스마트스포츠실) GAS 프로젝트에 새 파일로 추가
 *  - '학생명단' 탭을 읽어 학년·반별(또는 교직원) QR 이름표 인쇄 화면(QrPrintPage.html)을 보여 줍니다.
 *  - QR 안에는 구글 아이디만(@ 앞부분) 넣습니다. 입퇴실·허브 로그인과 같은 이름표를 씁니다.
 *  - 열기: 웹앱 주소(…/exec) 뒤에 ?page=qr  (선생님 계정으로 로그인한 상태)
 *  - Code.gs의 doGet 맨 첫 줄에 추가:
 *      if (e && e.parameter && e.parameter.page === 'qr') return qrPrintPage_();
 */
const QR_CONFIG = {
  ROSTER_SHEET: '학생명단',   // A학년 B반 C번호 D이름 E이메일 F구분(학생/교직원) — 1행은 제목
  COL: { grade: 1, cls: 2, no: 3, name: 4, email: 5, kind: 6 },
  WEBAPP_URL: ''              // 비워 두면 자동. 메뉴가 엉뚱한 주소를 열면 …/exec 주소를 직접 적기
};

/* ===== 시트 메뉴: 스마트스포츠실 → QR 이름표 인쇄 =====
 * 시트를 열 때 자동으로 메뉴가 생깁니다.
 * 다른 .gs 파일에 이미 function onOpen이 있으면, 이 onOpen을 지우고
 * 그 onOpen 안에 addQrMenu_(); 한 줄만 넣으세요(onOpen은 프로젝트에 하나만 있어야 함). */
function onOpen() {
  addQrMenu_();
}
function addQrMenu_() {
  SpreadsheetApp.getUi()
    .createMenu('스마트스포츠실')
    .addItem('QR 이름표 인쇄', 'openQrPrint')
    .addToUi();
}
function openQrPrint() {
  const url = (QR_CONFIG.WEBAPP_URL || ScriptApp.getService().getUrl()).replace(/\/dev$/, '/exec') + '?page=qr';
  const html = HtmlService.createHtmlOutput(
    `<div style="font:16px sans-serif;text-align:center;padding:8px">
       <p>새 탭에서 인쇄 화면을 엽니다.</p>
       <a href="${url}" target="_blank" onclick="setTimeout(()=>google.script.host.close(),300)"
          style="display:inline-block;padding:12px 24px;background:#1f4e8c;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold">
          QR 이름표 인쇄 화면 열기</a>
     </div>`).setWidth(360).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, 'QR 이름표');
}

function qrPrintPage_() {
  if (!qrIsOwner_()) {
    return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;padding:24px">선생님 계정으로 로그인해야 열 수 있어요.</p>');
  }
  return HtmlService.createHtmlOutputFromFile('QrPrintPage')
    .setTitle('QR 이름표')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* 인쇄 화면이 google.script.run으로 부르는 함수 */
function getQrStudents() {
  if (!qrIsOwner_()) throw new Error('선생님만 볼 수 있어요');
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(QR_CONFIG.ROSTER_SHEET);
  if (!sh) throw new Error(`'${QR_CONFIG.ROSTER_SHEET}' 탭을 찾을 수 없어요`);

  const C = QR_CONFIG.COL;
  const rows = sh.getDataRange().getDisplayValues().slice(1);   // 1행 제목 제외
  const v = (r, c) => String(r[c - 1] || '').trim();

  return rows
    .map(r => {
      const staff = v(r, C.kind) === '교직원' || !v(r, C.grade);
      const grade = v(r, C.grade), cls = v(r, C.cls), no = v(r, C.no);
      return {
        id: v(r, C.email).toLowerCase().split('@')[0],         // 이메일로 적혀 있어도 아이디만
        name: v(r, C.name),
        group: staff ? '교직원' : `${grade}학년 ${cls}반`,     // 인쇄 화면의 선택 목록
        label: staff ? '교직원' : [grade && grade + '학년', cls && cls + '반', no && no + '번'].filter(Boolean).join(' '),
        sort: staff ? 99999 : (+grade || 0) * 10000 + (parseInt(cls, 10) || 0) * 100 + (+no || 0)
      };
    })
    .filter(s => s.id && s.name)
    .sort((a, b) => a.sort - b.sort);
}

/* 지금 접속한 사람이 스크립트 주인(교사)인지 확인 — 명단이 밖으로 새지 않게 */
function qrIsOwner_() {
  const me = Session.getActiveUser().getEmail();
  return !!me && me === Session.getEffectiveUser().getEmail();
}
