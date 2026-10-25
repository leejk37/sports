/* nav.js — 허브·현황판·종목 순위·인도어사이클 맨 위 공통 내비게이션 바 (2026-10-25)
 *  - 화면 맨 위에 늘 보이는 한 줄. 지금 화면은 노랗게
 *  - TV 돌려보기(tv/) 안의 액자(iframe)로 열렸을 때는 나오지 않음
 *  - 쓰는 법: 허브 <script src="nav.js" defer>, 다른 화면 <script src="../nav.js" defer>
 *    주소는 이 파일 위치를 기준으로 만들므로 어느 폴더에서 불러도 같음 */
(function () {
  if (window.top !== window.self) return;
  const me = document.currentScript || [...document.scripts].find(s => /nav\.js/.test(s.src));
  const base = new URL('.', me ? me.src : location.href);
  const cur = new URL('.', location.href).pathname;                 // 지금 화면의 폴더
  const items = [
    ['sports', '허브 · QR 로그인', ''],
    ['board', '현황판', 'board/'],
    ['rank', '종목 순위', 'rank/?ex=auto'],
    ['ride', '인도어사이클', 'ride/']
  ];
  const css = document.createElement('style');
  css.textContent = `
    :root{--navh:max(34px,2.2vw)}
    #spNav{flex:none;height:var(--navh);display:flex;align-items:center;gap:.5vw;padding:0 max(12px,1.6vw);
      background:#12305a;border-bottom:1px solid rgba(255,255,255,.12);font-family:Pretendard,system-ui,sans-serif;overflow-x:auto;scrollbar-width:none;position:relative;z-index:20}
    #spNav::-webkit-scrollbar{display:none}
    #spNav a{font-size:max(13px,.9vw);font-weight:800;padding:max(4px,.25vw) max(12px,.9vw);border-radius:999px;color:rgba(255,255,255,.8);text-decoration:none;white-space:nowrap}
    #spNav a:hover,#spNav a:focus-visible{background:rgba(255,255,255,.12);color:#fff;outline:none}
    #spNav a.on{background:#f5c518;color:#12305a}
    /* 화면 높이에 맞춘 페이지(허브·현황판·순위): 바 높이만큼 본문을 줄임 */
    html.spFit body{display:flex;flex-direction:column;height:100%;height:100dvh}
    html.spFit #app{flex:1;min-height:0;height:auto!important}
    .pageSwitch, #views{display:none!important}   /* 예전 화면별 바로 가기 단추는 이 바로 대신 */
  `;
  document.head.appendChild(css);
  const nav = document.createElement('nav');
  nav.id = 'spNav'; nav.setAttribute('aria-label', '화면 이동');
  nav.innerHTML = items.map(([k, t, path]) =>
    { const u = new URL(path, base); return `<a href="${u.href}"${u.pathname === cur ? ' class="on" aria-current="page"' : ''}>${t}</a>`; }).join('');
  if (document.getElementById('app')) document.documentElement.classList.add('spFit');
  document.body.insertBefore(nav, document.body.firstChild);
})();
