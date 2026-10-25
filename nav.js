/* nav.js — 현황판·종목 순위·인도어사이클 화면에 공통 바로 가기 (허브·현황판·순위·인도어사이클)
 *  TV에 띄워 두는 화면이라 평소엔 숨어 있고, 마우스를 움직이거나 화면을 누르거나 키를 누르면 5초 동안 보임.
 *  TV 돌려보기(tv/) 안의 액자(iframe)로 열렸을 때는 나오지 않음. 쓰는 법: <script src="../nav.js" defer></script> */
(function () {
  if (window.top !== window.self) return;
  const here = location.pathname.replace(/\/index\.html$/, '/').split('/').filter(Boolean).pop() || '';
  const items = [
    ['', '허브 · 입실', '../'],
    ['board', '현황판', '../board/'],
    ['rank', '종목 순위', '../rank/?ex=auto'],
    ['ride', '인도어사이클', '../ride/']
  ];
  const css = document.createElement('style');
  css.textContent = `
    #spNav{position:fixed;left:max(14px,env(safe-area-inset-left,0px));bottom:max(14px,env(safe-area-inset-bottom,0px));z-index:9999;
      display:flex;gap:6px;flex-wrap:wrap;padding:6px;border-radius:999px;background:rgba(18,48,90,.92);box-shadow:0 6px 20px rgba(0,0,0,.3);
      font-family:Pretendard,system-ui,sans-serif;transition:opacity .4s ease,transform .4s ease}
    #spNav.hide{opacity:0;transform:translateY(12px);pointer-events:none}
    #spNav a{font-size:15px;font-weight:800;padding:8px 14px;border-radius:999px;color:#fff;text-decoration:none;white-space:nowrap}
    #spNav a:hover,#spNav a:focus-visible{background:rgba(255,255,255,.15);outline:none}
    #spNav a.on{background:#f5c518;color:#12305a}
    @media (prefers-reduced-motion:reduce){#spNav{transition:none}}`;
  document.head.appendChild(css);
  const nav = document.createElement('nav');
  nav.id = 'spNav'; nav.setAttribute('aria-label', '바로 가기');
  nav.innerHTML = items.map(([k, t, href]) => `<a href="${href}"${k === here ? ' class="on" aria-current="page"' : ''}>${t}</a>`).join('');
  document.body.appendChild(nav);
  let timer;
  const show = () => { nav.classList.remove('hide'); clearTimeout(timer); timer = setTimeout(() => { if (!nav.matches(':hover,:focus-within')) nav.classList.add('hide'); }, 5000); };
  ['mousemove', 'touchstart', 'keydown', 'pointerdown'].forEach(ev => addEventListener(ev, show, { passive: true }));
  nav.addEventListener('mouseleave', show);
  show();
})();
