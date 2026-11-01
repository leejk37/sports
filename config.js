/* ============================================================
 * 학교별 설정 — 다른 학교에서 쓸 때는 이 파일만 고칩니다.
 * 모든 화면(허브·운동 앱·현황판·순위·포인트 등)이 이 값을 읽습니다.
 * 고친 뒤에는 각 폴더 sw.js의 VERSION을 올릴 필요가 없습니다
 * (화면들이 이 파일을 인터넷에서 먼저 받아 옵니다).
 * ============================================================ */
window.SITE = Object.freeze({
  // 학교 이름(화면 제목에 붙음)
  SCHOOL_NAME: '청평',

  // 학생 구글 계정 도메인. QR 이름표의 아이디 뒤에 붙입니다. 앞의 @ 포함
  DOMAIN: '@cpe.es.kr',

  // 운동 기록 GAS 웹앱 주소 (gas/circuit 을 배포한 …/exec 주소)
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzZIU-UeiWcXuN47lW4XSSwvD9EgP06NdJYrX5NKDf96oqEnfsqaI0B2B3YrvZ6Yw0eVw/exec',

  // 운동 앱과 GAS가 함께 쓰는 확인값. GAS '설정' 시트의 토큰과 같게. 비밀값이 아닙니다
  TOKEN: 'cpe_smart_sports',

  // 인도어라이딩 기록판 GAS 웹앱 주소 (gas/ride 를 배포한 …/exec). 쓰지 않으면 ''
  RIDE_GAS_URL: 'https://script.google.com/macros/s/AKfycbwbHFh2YXxqtg5d99KSq32ioD1fMbCXOs9PVDrSCmJwwPq32qHURyBz85zLLIN9iPa8/exec',

  // Firebase 설정(실시간 화면용: 심박 현황판 등). 쓰지 않으면 null
  // Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → SDK 설정 및 구성 → '구성'의 값.
  // apiKey는 비밀이 아닙니다. 실제 보호는 Realtime Database 보안 규칙(학교 도메인만)입니다
  FIREBASE: {
    apiKey: 'AIzaSyAzDmRPiO_ohQphOCveGIVnVquXuLYv00U',
    authDomain: 'smart-sports-live.firebaseapp.com',
    databaseURL: 'https://smart-sports-live-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'smart-sports-live',
    storageBucket: 'smart-sports-live.firebasestorage.app',
    messagingSenderId: '52998599232',
    appId: '1:52998599232:web:5afd16ebb022e1bda925a5'
  }
});

/* data-school 이 붙은 제목 앞에 학교 이름을 붙입니다 (예: <h1 data-school>스마트스포츠</h1> → 청평 스마트스포츠) */
(function () {
  function apply() {
    var name = window.SITE.SCHOOL_NAME;
    if (!name) return;
    document.querySelectorAll('[data-school]').forEach(function (el) {
      if (el.dataset.schoolDone) return;
      el.dataset.schoolDone = '1';
      if (el.tagName === 'TITLE') document.title = name + ' ' + document.title;
      else el.textContent = name + ' ' + el.textContent.trim();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
