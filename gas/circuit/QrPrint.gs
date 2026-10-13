/**
 * QR 이름표 인쇄 — 서킷트레이닝 GAS 프로젝트에 새 파일로 추가
 *  - 명단 시트에서 학생을 읽어 QR 이름표 인쇄 화면(QrPrint.html)을 보여 줍니다.
 *  - QR 안에는 구글 아이디만(@ 앞부분) 넣습니다. 입퇴실·허브 로그인과 같은 이름표를 씁니다.
 *  - 열기: 웹앱 주소(…/exec) 뒤에 ?page=qr
 */
const QR_CONFIG = {
  SPREADSHEET_ID: '',            // 시트에 붙은(바운드) 스크립트면 비워 두세요
  ROSTER_SHEET: '학생명단',       // 바인딩 시트의 명단 탭 (A학년 B반 C번호 D이름 E이메일 F구분)
  ID_HEADERS: ['구글계정', '아이디', '이메일', '계정'],
};

/* doGet 맨 앞에서 호출: if (e && e.parameter.page === 'qr') return qrPrintPage_(); */
function qrPrintPage_() {
  if (!isOwner_()) {
    return HtmlService.createHtmlOutput('<p style="font:18px sans-serif;padding:24px">선생님 계정으로 로그인해야 열 수 있어요.</p>');
  }
  return HtmlService.createHtmlOutputFromFile('QrPrint')
    .setTitle('QR 이름표')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* 인쇄 화면이 google.script.run으로 부르는 함수 */
function getQrStudents() {
  if (!isOwner_()) throw new Error('선생님만 볼 수 있어요');
  const ss = QR_CONFIG.SPREADSHEET_ID
    ? SpreadsheetApp.openById(QR_CONFIG.SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(QR_CONFIG.ROSTER_SHEET);
  if (!sh) throw new Error(`'${QR_CONFIG.ROSTER_SHEET}' 시트를 찾을 수 없어요`);

  const [head, ...rows] = sh.getDataRange().getDisplayValues();
  const col = names => head.findIndex(h => names.includes(String(h).trim()));
  const c = { id: col(QR_CONFIG.ID_HEADERS), grade: col(['학년']), cls: col(['반']), no: col(['번호']), name: col(['이름']) };
  if (c.id < 0 || c.name < 0) throw new Error('명단 첫 줄에 구글계정(또는 아이디)과 이름 열이 필요해요');

  const val = (r, i) => (i >= 0 ? String(r[i]).trim() : '');
  return rows
    .map(r => ({
      id: val(r, c.id).toLowerCase().split('@')[0],   // 이메일로 적혀 있어도 아이디만
      name: val(r, c.name),
      cls: val(r, c.cls),
      label: [val(r, c.grade) && val(r, c.grade) + '학년',
              val(r, c.cls) && val(r, c.cls) + '반',
              val(r, c.no) && val(r, c.no) + '번'].filter(Boolean).join(' '),
    }))
    .filter(s => s.id && s.name);
}

/* 지금 접속한 사람이 스크립트 주인(교사)인지 확인 — 명단이 밖으로 새지 않게 */
function isOwner_() {
  const me = Session.getActiveUser().getEmail();
  return !!me && me === Session.getEffectiveUser().getEmail();
}
