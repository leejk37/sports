/* goal.js — 측정 앱의 '🎯 오늘 도장 목표' 칸 (2026-11-16, 통과 기준이 '그날 정확한 횟수 합'으로 바뀜)
 *  - 측정 화면은 핵심만(2026-11-16 선생님): 고르는 화면에 '오늘 12 / 30회 · 18회 남음' 막대 + [🎯 남은 18회 하기], 결과 화면에 오늘 합계 한 줄. 통과 기준 설명은 도장·규칙 화면에서
 *  - (예전) 측정 방식 고르는 화면(data-target)에: "오늘 30회 중 12회 · 18회 남음" + [🎯 남은 18회 하기] 단추
 *    단추는 앱의 첫 [data-reps] 단추를 남은 횟수로 잠깐 바꿔 눌러 줌(앱 코드는 그대로)
 *  - 결과 화면(data-result)에: 방금 한 횟수를 더해 "오늘 합계 34회 · 통과! 추가 +1P까지 26회"
 *  - 학생은 window.SPORT_EMAIL(앱이 QR·허브에서 학생을 정하면 넣음) 또는 주소의 ?email=
 *  - GAS: 허브 JSONP action=goal (Stamp.gs stampGoal_) — 오늘 종목별 기준·지금까지 한 양. 서버 기록은 1~2분 늦을 수 있어
 *    이 화면에서 본 결과는 화면이 직접 더해 둠
 *  - 쓰는 법: <script src="../goal.js" data-ex="highknee" data-target="s-time" data-result="s-result" data-count="resGood" defer></script>
 *    data-quick="off"면 단추 없이 칸만(스쿼트처럼 세트를 고르는 앱) */
(function () {
  const me = document.currentScript;
  const EX = me && me.dataset.ex, TARGET = me && me.dataset.target, RESULT = me && me.dataset.result, COUNT = me && me.dataset.count;
  const QUICK = !(me && me.dataset.quick === 'off');
  if (!EX || !TARGET || !window.SITE || !SITE.GAS_URL) return;

  const css = document.createElement('style');
  css.textContent = `
    .spGoal{background:rgba(159,240,176,.12);border:2px solid rgba(159,240,176,.55);border-radius:14px;padding:11px 14px;margin:4px 0 8px;text-align:left;color:#fff;font-family:Pretendard,system-ui,sans-serif}
    .spGoal.done{background:rgba(245,197,24,.14);border-color:rgba(245,197,24,.6)}
    .spGoal b.t{display:block;font-size:15px;font-weight:900;color:#9ff0b0;margin-bottom:4px}
    .spGoal.done b.t{color:#f5c518}
    .spGoal .n{font-size:20px;font-weight:900;line-height:1.3}
    .spGoal .n small{font-size:15px;font-weight:700;opacity:.8}
    .spGoal .r{font-size:17px;font-weight:700;line-height:1.45}
    .spGoal .r b{color:#9ff0b0}
    .spGoal .r2{font-size:14px;font-weight:600;opacity:.8;line-height:1.4;margin:1px 0 6px 26px}
    .spGoal .today{display:flex;justify-content:space-between;gap:8px;font-size:18px;font-weight:800;margin-top:8px}
    .spGoal .r1{font-size:16px;font-weight:700;line-height:1.4}
    .spGoal .r1 b{color:#9ff0b0}
    .spGoal .today b{font-size:20px}
    .spGoal .today.wait{opacity:.55}
    .spGoal .bar{height:9px;border-radius:999px;background:rgba(255,255,255,.15);margin:7px 0 2px;overflow:hidden}
    .spGoal .bar i{display:block;height:100%;background:#9ff0b0;border-radius:999px;transition:width .4s}
    .spGoal.done .bar i{background:#f5c518}
    .spGoal .s{font-size:14px;font-weight:700;opacity:.85;line-height:1.4}
    .spGoalBtn{display:block;width:100%;margin:10px 0 0;font:inherit;font-size:26px;font-weight:900;padding:18px;border:0;border-radius:12px;background:#9ff0b0;color:#12305a;cursor:pointer}`;
  document.head.appendChild(css);

  const st = { email: '', data: null, added: 0, seenResult: false, busy: false };
  const who = () => (window.SPORT_EMAIL || new URLSearchParams(location.search).get('email') || '').trim().toLowerCase();
  const visible = id => { const el = document.getElementById(id); return !!(el && el.offsetParent !== null && !el.hidden); };
  const item = () => st.data && st.data.items && st.data.items[EX];

  function fetchGoal() {
    if (st.busy || !st.email) return;
    st.busy = true;
    const cb = 'goalcb_' + Date.now() + '_' + Math.floor(Math.random() * 1e4), s = document.createElement('script');
    const done = () => { st.busy = false; delete window[cb]; s.remove(); };
    window[cb] = d => {
      done();
      if (!d || !d.ok) return;
      const prev = item(), shown = prev ? prev.n + st.added : 0;
      st.data = d;
      const w = document.getElementById('who');                 // 제목 옆 이름: QR로 들어오면 아이디만 보이므로 이름으로
      if (w && d.name && !/학생$/.test(w.textContent)) w.textContent = d.name + ' 학생';
      const it = item();
      if (it) { st.added = Math.max(0, shown - it.n); }   // 서버가 아직 방금 기록을 모르면 화면에서 더한 만큼 유지
      render();
    };
    s.onerror = done;
    setTimeout(() => { if (window[cb]) done(); }, 25000);
    s.src = SITE.GAS_URL + '?' + new URLSearchParams({ action: 'goal', email: st.email, token: SITE.TOKEN, callback: cb });
    document.head.appendChild(s);
  }

  function box(hostId) {
    const host = document.getElementById(hostId); if (!host) return null;
    let b = host.querySelector('.spGoal');
    if (!b) {
      b = document.createElement('div'); b.className = 'spGoal';
      const cnt = hostId === RESULT && COUNT && document.getElementById(COUNT);   // 결과 화면: 큰 숫자 바로 아래, 고르는 화면: 맨 위
      const after = cnt && (cnt.closest('.count') || cnt);
      if (after && after.parentNode === host) after.after(b); else host.prepend(b);
    }
    return b;
  }

  /* 서버를 못 읽었을 때 쓰는 기본 기준 (통과기준 탭과 같게) */
  const DEF = { squat: 10, lunge: 10, jumpingjack: 30, curlup: 10, highknee: 30, pushup: 10, legraise: 10, burpee: 5, jumprope: 100 };
  const NAME = { squat: '스쿼트', lunge: '런지', jumpingjack: '점핑잭', curlup: '윗몸말아올리기', highknee: '하이니', pushup: '팔굽혀펴기', legraise: '레그레이즈', burpee: '버피테스트', jumprope: '줄넘기' };

  function render() {
    const it = item();
    const t = document.getElementById(TARGET) && box(TARGET); if (!t) return;
    const pick = document.querySelector(`#${TARGET} [data-reps]`)?.parentElement;
    const showPick = on => { if (pick) pick.style.display = on ? '' : 'none'; };
    if (it && it.unit !== '회') {                       // 시간 기준이면 앱의 횟수 단추를 다시 보여 줌
      showPick(true);                       // 시간 기준(통과기준 탭에서 '초'로 바꾼 경우)
      t.className = 'spGoal' + (it.ok ? ' done' : '');
      if (!it.ok) { t.remove(); return; }
      t.innerHTML = '<div class="today">✅ 오늘 통과</div>';
      return;
    }
    const min = it ? it.min : DEF[EX], name = (it && it.name) || NAME[EX] || '';
    if (!min) { t.remove(); showPick(true); return; }
    if (QUICK) showPick(false);
    let html = `<div class="r1">✅ 통과 <b>하루 ${min}회</b> · ➕ 통과 뒤 <b>${min}회마다 +1P</b></div>`;
    let want = 0, ok = false;
    const reps = document.querySelector(`#${TARGET} [data-reps]`);
    if (!it) {                                          // 불러오는 동안 같은 자리·같은 높이로 (화면이 한꺼번에 바뀌게)
      if (st.email) html += `<div class="today wait"><span>오늘 <b>·</b> / ${min}회</span><span></span></div><div class="bar"><i style="width:0"></i></div>`;
      t.className = 'spGoal'; t.innerHTML = html; addStart(t, reps, min, false); return;
    }
    {
      const n = Math.round((it.n + st.added) * 10) / 10;
      ok = n >= min;
      const left = Math.max(0, min - n), extra = ok ? Math.floor((n - min) / min + 1e-9) : 0, toNext = ok ? min * (extra + 2) - n : 0;
      want = Math.ceil(ok ? toNext : left);
      html += `<div class="today"><span>오늘 <b>${n}</b> / ${min}회</span><span>${ok ? `✅ 통과${extra ? ` +${extra}P` : ''}` : `${Math.ceil(left)}회 남음`}</span></div>
        <div class="bar"><i style="width:${Math.min(100, n / min * 100)}%"></i></div>`;
    }
    t.className = 'spGoal' + (ok ? ' done' : '');
    t.innerHTML = html;
    addStart(t, reps, want || min, ok);
  }
  /* [▶ 시작 · N회] 단추 하나: 앱의 (숨긴) 첫 횟수 단추를 N회로 잠깐 바꿔 누름. 통과 전 N = 남은 횟수, 통과 뒤 N = 다음 +1P까지 */
  function addStart(t, reps, n, ok) {
    if (!QUICK || !reps || !(n > 0)) return;
    const btn = document.createElement('button'); btn.className = 'spGoalBtn'; btn.type = 'button';
    btn.textContent = `▶ 시작 · ${n}회${ok ? ' (+1P)' : ''}`;
    btn.onclick = () => { const was = reps.dataset.reps; reps.dataset.reps = String(n); reps.click(); reps.dataset.reps = was; };
    t.appendChild(btn);
  }

  function renderResult(add) {
    const it = item(); if (!it || it.unit !== '회' || !RESULT) return;
    const before = it.n + st.added - add, n = Math.round((before + add) * 10) / 10, min = it.min;
    const ok = n >= min, wasOk = before >= min, extra = ok ? Math.floor((n - min) / min + 1e-9) : 0, toNext = ok ? min * (extra + 1) + min - n : min - n;
    const b = box(RESULT); if (!b) return;
    b.className = 'spGoal' + (ok ? ' done' : '');
    const pct = Math.min(100, n / min * 100);
    b.innerHTML = `<div class="today" style="margin:0;padding:0;border:0"><span>오늘 <b>${n}</b> / ${min}회</span><span>${ok ? `✅ 통과${extra ? ` +${extra}P` : ''}` : `${Math.ceil(min - n)}회 남음`}</span></div><div class="bar"><i style="width:${pct}%"></i></div>`;
  }

  let wasTarget = false, wasResult = false;
  setInterval(() => {
    const e = who();
    if (e !== st.email) { st.email = e; st.data = null; st.added = 0; render(); if (e) fetchGoal(); }   // 학생이 정해지면 화면이 나오기 전에 미리 그려 두고 불러옴
    if (!document.querySelector(`#${TARGET} .spGoal`)) render();
    if (!st.email) return;
    const vt = visible(TARGET), vr = RESULT && visible(RESULT);
    if (vt && !wasTarget) fetchGoal();                  // 고르는 화면에 올 때마다 새로
    if (vr && !wasResult) st.seenResult = false;
    if (vr && !st.seenResult) {                         // 결과 화면: 방금 횟수 더하기 (한 번만)
      const el = COUNT && document.getElementById(COUNT);
      const v = el ? Number(String(el.textContent).replace(/[^\d.]/g, '')) : NaN;
      if (isFinite(v) && item()) { st.seenResult = true; if (v > 0) { st.added += v; } renderResult(v); render(); }
      else if (!item() && !st.busy) fetchGoal();
    }
    wasTarget = vt; wasResult = vr;
  }, 150);
})();
