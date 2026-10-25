/* nav.js — 허브·현황판·종목 순위·인도어사이클 공통 내비게이션 (2026-10-25)
 *  - 각 화면 머리줄의 제목 옆에 들어감(지금 화면은 노랗게). 머리줄이 없으면 맨 위에 한 줄 바로
 *  - TV 돌려보기(tv/) 안의 액자(iframe)로 열렸을 때는 나오지 않음
 *  - 쓰는 법: 허브 <script src="nav.js" defer>, 다른 화면 <script src="../nav.js" defer>
 *    주소는 이 파일 위치를 기준으로 만들므로 어느 폴더에서 불러도 같음 */
(function () {
  if (window.top !== window.self) return;
  const me = document.currentScript || [...document.scripts].find(s => /nav\.js/.test(s.src));
  const base = new URL('.', me ? me.src : location.href);
  const cur = new URL('.', location.href).pathname;                 // 지금 화면의 폴더
  const items = [
    ['허브 · QR 로그인', ''],
    ['현황판', 'board/'],
    ['종목 순위', 'rank/?ex=auto'],
    ['인도어사이클', 'ride/']
  ];
  const css = document.createElement('style');
  css.textContent = `
    #spNav{display:flex;align-items:center;gap:max(5px,.4vw);flex:1 1 auto;min-width:0;align-self:center;margin-left:max(6px,.6vw);
      font-family:Pretendard,system-ui,sans-serif;overflow-x:auto;scrollbar-width:none}
    #spNav::-webkit-scrollbar{display:none}
    #spNav a{font-size:max(13px,.85vw);font-weight:800;padding:max(4px,.25vw) max(10px,.8vw);border-radius:999px;
      color:rgba(255,255,255,.85);background:rgba(255,255,255,.1);text-decoration:none;white-space:nowrap;line-height:1.3}
    #spNav a:hover,#spNav a:focus-visible{background:rgba(255,255,255,.2);color:#fff;outline:none}
    #spNav a.on{background:#f5c518;color:#12305a}
    header h1{flex:none!important}                    /* 제목은 제 크기만, 남는 자리는 내비게이션이 */
    /* 네 화면 머리줄을 같은 모양으로: 제목 글자 크기·위아래 여백 통일 (큰 화면만, 좁은 화면은 각 화면 설정대로) */
    @media (min-width:861px){
      header{padding-top:max(8px,.7vw)!important;padding-bottom:max(7px,.6vw)!important;padding-left:max(16px,2vw)!important;padding-right:max(16px,2vw)!important;align-items:center!important;box-sizing:border-box;min-height:max(60px,4.65vw);border-bottom-width:max(4px,.35vw)!important}   /* 머리줄 높이도 같게 */
      header h1{font-size:max(22px,2.1vw)!important;line-height:1.2!important}
    }
    header .grow{flex:0 0 0!important}
    #spNav.bar{flex:none;height:max(34px,2.2vw);margin:0;padding:0 max(12px,1.6vw);background:#12305a}
    .pageSwitch, #views{display:none!important}   /* 예전 화면별 바로 가기 단추는 이 내비게이션으로 대신 */
    @media (max-width:860px) and (orientation:portrait){
      header{flex-wrap:wrap}
      #spNav:not(.bar){order:5;flex-basis:100%;margin-left:0}
      header h1{flex:1 1 auto!important}             /* 세로 화면: 내비게이션은 둘째 줄, 제목 줄은 예전처럼 */
    }
  `;
  document.head.appendChild(css);
  const nav = document.createElement('nav');
  nav.id = 'spNav'; nav.setAttribute('aria-label', '화면 이동');
  nav.innerHTML = items.map(([t, path]) => {
    const u = new URL(path, base);
    return `<a href="${u.href}"${u.pathname === cur ? ' class="on" aria-current="page"' : ''}>${t}</a>`;
  }).join('');
  const h1 = document.querySelector('header h1');
  if (h1) {
    const after = document.getElementById('exTag') || h1;          // 종목 순위는 종목 이름표 뒤에
    after.insertAdjacentElement('afterend', nav);
  } else {
    nav.classList.add('bar');
    document.body.insertBefore(nav, document.body.firstChild);
  }
})();
