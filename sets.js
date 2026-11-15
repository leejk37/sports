/* 횟수 × 세트 고르기 (2026-11-16) — 스쿼트처럼 '한 세트 횟수'와 '세트'를 같이 고름
 * <script src="../sets.js" data-target="s-time" data-result="s-result" data-count="resGood"
 *         data-attr="reps" data-values="10,20,30,40,50" data-unit="회" data-sets="1,2,3" data-rest="10" defer></script>
 * - 앱의 숨긴 [data-reps](플랭크는 [data-goal]) 단추 값을 고른 횟수로 바꿔 누름 → 앱이 그대로 한 세트를 잼
 * - 결과 화면이 나오면 (마지막 세트가 아니면) 쉬는 화면 data-rest초 → '한 번 더'(#again) → 다음 세트 자동 시작
 * - 기록은 세트마다 한 줄씩 저장됨(도장·포인트는 그날 합계라 같음). 마지막 결과 화면에 세트 합계 */
(function () {
  const S = document.currentScript, D = S.dataset;
  const TARGET = D.target || 's-time', RESULT = D.result || 's-result', COUNT = D.count || 'resGood';
  const ATTR = D.attr || 'reps', UNIT = D.unit || '회', REST = +(D.rest || 10);
  const VALUES = (D.values || '10,20,30').split(',').map(Number), SETS = (D.sets || '1,2,3').split(',').map(Number);
  const [EXTRA_LABEL, EXTRA_ID] = (D.extra || '').split(':');          // 예: data-extra="최대한 많이:freeMode" → 그 단추를 누름(세트 없이 한 번)
  if (EXTRA_ID) VALUES.push(0);
  const $ = id => document.getElementById(id);
  const visible = id => { const el = $(id); return !!(el && el.offsetParent !== null && !el.hidden); };
  const label = v => v === 0 && EXTRA_ID ? EXTRA_LABEL : UNIT === '초' && v >= 60 ? (v % 60 ? `${Math.floor(v / 60)}분 ${v % 60}초` : `${v / 60}분`) : v + UNIT;
  let key = 'spSets_' + location.pathname.split('/').filter(Boolean).slice(-1)[0];
  let pick = { v: VALUES[0], n: 1 };
  try { const m = JSON.parse(localStorage.getItem(key) || 'null'); if (m && VALUES.includes(m.v) && SETS.includes(m.n)) pick = m; } catch (e) {}
  const run = { on: false, set: 0, total: 0, sums: [], seen: false, rest: 0 };

  const css = document.createElement('style');
  css.textContent = `
    .spSets{margin:10px 0 0}
    .spSets .lab{font-size:14px;opacity:.8;margin:10px 0 6px}
    .spSets .seg{display:flex;gap:8px}
    .spSets .seg button{flex:1;font:inherit;font-size:18px;font-weight:700;padding:12px 0;border-radius:12px;border:2px solid rgba(255,255,255,.55);background:transparent;color:#fff;cursor:pointer}
    .spSets .seg button[aria-pressed="true"]{background:#fff;color:#12305a;border-color:#fff}
    .spSets .plan{font-size:14px;opacity:.85;margin:10px 0 0}
    .spSets .go{display:block;width:100%;margin:12px 0 0;font:inherit;font-size:26px;font-weight:900;padding:18px;border:0;border-radius:12px;background:#ffd23f;color:#12305a;cursor:pointer;box-shadow:0 5px 0 #c99a00}
    #spRest{position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:rgba(12,30,60,.92);color:#fff;text-align:center;font-family:inherit}
    #spRest .t{font-size:30px;font-weight:900} #spRest .n{font-size:120px;font-weight:900;line-height:1;color:#ffd23f}
    #spRest .s{font-size:20px;opacity:.85}
    #spRest button{font:inherit;font-size:18px;padding:10px 26px;border-radius:12px;border:2px solid rgba(255,255,255,.6);background:transparent;color:#fff;cursor:pointer;margin:0 6px}
    #spSetTag{position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:9998;display:none;background:#ffd23f;color:#12305a;font-weight:900;font-size:20px;padding:6px 18px;border-radius:99px}
    .spSetSum{margin:8px 0;padding:10px 12px;border-radius:12px;background:rgba(159,240,176,.15);border:2px solid rgba(159,240,176,.6);font-size:17px;font-weight:700}`;
  document.head.appendChild(css);

  function trigger() {
    if (pick.v === 0 && EXTRA_ID) { const x = $(EXTRA_ID); if (!x) return false; x.click(); return true; }
    const b = document.querySelector(`#${TARGET} [data-${ATTR}]`); if (!b) return false;
    const was = b.dataset[ATTR]; b.dataset[ATTR] = String(pick.v); b.click(); b.dataset[ATTR] = was; return true;
  }
  function plan() {
    if (pick.v === 0 && EXTRA_ID) return '멈출 때까지 세요 · 3초 멈추면 끝나요';
    return pick.n > 1 ? `${label(pick.v)} × ${pick.n}세트${UNIT === '회' ? ` = ${pick.v * pick.n}회` : ''} · 세트 사이 ${REST}초 쉬고 저절로 다시 시작해요` : `${label(pick.v)} 한 번`;
  }
  function seg(list, cur, fmt, on) {
    const d = document.createElement('div'); d.className = 'seg';
    list.forEach(v => { const b = document.createElement('button'); b.type = 'button'; b.textContent = fmt(v); b.setAttribute('aria-pressed', String(v === cur));
      b.onclick = () => { d.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); on(v); }; d.appendChild(b); });
    return d;
  }
  function build() {
    const host = $(TARGET); if (!host || host.querySelector('.spSets')) return;
    const box = document.createElement('div'); box.className = 'spSets';
    const p = document.createElement('p'); p.className = 'plan';
    const save = () => { p.textContent = plan(); try { localStorage.setItem(key, JSON.stringify(pick)); } catch (e) {} };
    box.innerHTML = `<p class="lab">한 세트 ${UNIT === '초' ? '시간' : '횟수'}</p>`;
    box.appendChild(seg(VALUES, pick.v, label, v => { pick.v = v; save(); }));
    let setRow = null;
    if (SETS.length > 1) { setRow = document.createElement('div'); setRow.innerHTML = '<p class="lab">세트</p>'; setRow.appendChild(seg(SETS, pick.n, v => v + '세트', v => { pick.n = v; save(); })); box.appendChild(setRow); }
    const extraOn = () => { if (setRow) setRow.style.display = pick.v === 0 && EXTRA_ID ? 'none' : ''; };
    box.firstElementChild.nextElementSibling.addEventListener('click', () => setTimeout(extraOn));
    box.appendChild(p); save(); extraOn();
    const go = document.createElement('button'); go.type = 'button'; go.className = 'go'; go.textContent = '▶ 시작';
    go.onclick = () => { if (pick.v === 0) pick.n = 1; Object.assign(run, { on: true, set: 1, total: 0, sums: [], seen: false }); tag(); trigger(); };
    box.appendChild(go);
    const rescan = $('rescan');
    if (rescan && rescan.parentNode === host) host.insertBefore(box, rescan); else host.appendChild(box);
  }
  const ov = document.createElement('div'); ov.id = 'spRest';
  ov.innerHTML = '<div class="t"></div><div class="n"></div><div class="s"></div><div><button type="button" data-k="now">바로 시작</button><button type="button" data-k="stop">그만하기</button></div>';
  const tg = document.createElement('div'); tg.id = 'spSetTag';
  function tag() { tg.textContent = `${run.set}/${pick.n}세트`; tg.style.display = run.on && pick.n > 1 && !run.rest ? 'block' : 'none'; }
  function next() {
    clearInterval(run.timer); run.rest = 0; ov.style.display = 'none';
    run.set++; run.seen = false; tag();
    const again = $('again'); if (again) again.click();
    setTimeout(() => { if (!trigger()) stop(); }, 60);
  }
  function stop() { clearInterval(run.timer); run.on = false; run.rest = 0; ov.style.display = 'none'; tag(); summary(); }
  ov.addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.k; if (k === 'now') next(); if (k === 'stop') stop(); });
  function rest() {
    run.rest = REST; tag();
    ov.querySelector('.t').textContent = `${run.set}세트 끝! 숨 고르기`;
    ov.querySelector('.s').textContent = `이번 ${run.sums[run.sums.length - 1]}${UNIT} · 다음은 ${run.set + 1}/${pick.n}세트`;
    ov.querySelector('.n').textContent = run.rest; ov.style.display = 'flex';
    run.timer = setInterval(() => { run.rest--; ov.querySelector('.n').textContent = run.rest; if (run.rest <= 0) next(); }, 1000);
  }
  function summary() {
    const host = $(RESULT); if (!host || run.sums.length < 2) return;
    let el = host.querySelector('.spSetSum'); if (!el) { el = document.createElement('div'); el.className = 'spSetSum'; const c = $(COUNT); const a = c && (c.closest('.count') || c); if (a && a.parentNode === host) a.after(el); else host.prepend(el); }
    el.textContent = `🏁 ${run.sums.length}세트 합계 ${run.total}${UNIT} (${run.sums.join(' + ')})`;
  }
  function init() {
    document.body.appendChild(ov); document.body.appendChild(tg); build();
    setInterval(() => {
      build();
      if (!run.on) return;
      if (visible(RESULT) && !run.seen) {
        const el = $(COUNT), v = el ? Number(String(el.textContent).replace(/[^\d.]/g, '')) : NaN;
        if (!isFinite(v)) return;
        run.seen = true; run.sums.push(v); run.total = Math.round((run.total + v) * 10) / 10;
        if (run.set < pick.n) rest(); else { run.on = false; tag(); summary(); }
      }
      if (!visible(RESULT) && !run.rest && visible(TARGET) && run.seen) stop();   // 허브로·다른 화면으로 가면 멈춤
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
