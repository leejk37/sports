/* cues.js — 측정 앱 준비 화면의 '핵심 포인트' 카드 (2026-11-01)
 *  - 종목마다 지킬 것 2~3개(코칭 큐)를 준비 화면(카메라 앞에서 3-2-1을 기다리는 곳)에 크게 보여 줌
 *  - 허브에서 이름을 골라 들어온 학생(?email=)은 자세 피드백(Feedback.gs action=feedback)에서
 *    최근 10번 중 가장 많이 한 실수와 고치는 법을 맨 위에 한 줄로 (못 불러오면 그냥 안 보임)
 *  - 쓰는 법: 앱 맨 아래 <script src="../cues.js" data-ex="curlup" data-target="s-ready" defer></script>
 *    data-target = 카드를 넣을 화면(섹션) id. 그 안의 첫 설명(p) 뒤에 들어감
 *  - 실수별 고치는 법(TIP)은 feedback/index.html 의 TIP 과 같은 문장으로 맞춤 */
(function () {
  const me = document.currentScript;
  const EX = me && me.dataset.ex, TARGET = me && me.dataset.target;
  if (!EX || !TARGET) return;

  const CUES = {
    squat:       ['엉덩이를 뒤로', '가슴 펴고 앞 보기', '허벅지가 바닥과 수평까지'],
    curlup:      ['무릎 세우고 발바닥 붙이기', '어깨뼈가 뜰 때까지 올라오기', '천천히 내려오기'],
    jumpingjack: ['손은 머리 위에서 짝', '발은 어깨보다 넓게', '박자 맞춰 크게'],
    lunge:       ['상체는 곧게', '앞 무릎은 발끝 안쪽', '뒷무릎은 바닥 가까이'],
    highknee:    ['무릎은 허리 높이까지', '팔도 함께 흔들기', '빠르기보다 높이'],
    pushup:      ['머리부터 무릎까지 일직선', '가슴이 바닥 가까이', '배에 힘 꽉'],
    legraise:    ['무릎 쭉 펴기', '다리는 직각까지', '내릴 땐 천천히'],
    burpee:      ['다리를 뒤로 쭉 뻗어 플랭크', '일어서며 점프', '착지는 사뿐히'],
    plank:       ['머리-엉덩이-발꿈치 일직선', '배와 엉덩이에 힘', '숨 참지 않기'],
    jumprope:    ['팔꿈치는 옆구리에, 손목으로 돌리기', '낮게, 앞꿈치로 착지', '끊기지 않게 일정한 박자'],
    hanging:     ['철봉을 어깨보다 넓게 잡기', '발을 떼고, 몸 흔들지 않기', '⚠️ 내려올 땐 발부터 천천히'],
    treadmill:   ['손잡이 잡지 않고 바르게', '⚠️ 내릴 땐 양쪽 난간을 잡은 뒤 점프'],
    rowing:      ['다리 → 몸통 → 팔 순서로 당기기', '팔은 가슴 쪽으로, 팔꿈치가 예각이 되게', '돌아갈 땐 팔 → 몸통 → 다리']
  };
  const TIP = {
    '깊이 부족': '허벅지가 바닥과 나란해질 때까지 앉아요.',
    '허리 숙임': '가슴을 펴고 시선은 앞을 봐요.',
    '덜 올라옴': '어깨뼈가 바닥에서 떨어질 때까지 올라와요.',
    '무릎 펴짐': '무릎은 세운 채로, 발바닥을 바닥에 꼭 붙여요.',
    '팔 덜 올림': '손이 머리 위에서 만날 때까지 팔을 쭉 올려요.',
    '다리 덜 벌림': '발을 어깨보다 넓게 벌려요.',
    '상체 숙임': '상체는 곧게 세우고, 앞 무릎이 발끝을 넘지 않게.',
    '무릎 덜 올림': '무릎을 허리 높이까지 올려요.',
    '덜 내려감': '가슴이 바닥 가까이 갈 때까지 팔꿈치를 굽혀요.',
    '몸이 꺾임': '머리부터 무릎까지 일직선! 배에 힘을 꽉 줘요.',
    '덜 올림': '다리가 바닥과 직각이 될 때까지 올려요.',
    '무릎 굽힘': '무릎을 쭉 편 채로 천천히 올렸다 내려요.',
    '다리 덜 뻗음': '다리를 뒤로 쭉 뻗어 플랭크 자세를 꼭 만들어요.',
    '점프 없음': '일어서면서 가볍게 점프, 손은 머리 위로.',
    '엉덩이 처짐': '배와 엉덩이에 힘을 줘서 몸을 일직선으로.',
    '엉덩이 솟음': '엉덩이를 내려 머리-엉덩이-발꿈치를 일직선으로.'
  };
  const FB_EX = ['squat', 'curlup', 'jumpingjack', 'lunge', 'highknee', 'pushup', 'legraise', 'burpee', 'plank'];
  const cues = CUES[EX]; if (!cues) return;

  const css = document.createElement('style');
  css.textContent = `
    .spCues{background:rgba(255,255,255,.1);border:2px solid rgba(245,197,24,.55);border-radius:14px;padding:12px 14px;margin:2px 0;text-align:left;color:#fff;font-family:Pretendard,system-ui,sans-serif}
    .spCues h3{margin:0 0 8px;font-size:16px;font-weight:900;color:#f5c518;letter-spacing:-.3px}
    .spCues ol{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;counter-reset:c}
    .spCues li{counter-increment:c;display:flex;gap:9px;align-items:baseline;font-size:18px;font-weight:800;line-height:1.35}
    .spCues li::before{content:counter(c);flex:none;width:24px;height:24px;border-radius:50%;background:#f5c518;color:#12305a;font-size:14px;font-weight:900;display:grid;place-items:center;transform:translateY(-1px)}
    .spCues .me{margin:0 0 10px;padding:9px 11px;border-radius:10px;background:rgba(255,157,138,.2);font-size:16px;font-weight:700;line-height:1.45}
    .spCues .me b{color:#ffd0c7}
    .spCues .me:empty{display:none}`;
  document.head.appendChild(css);

  function place() {
    const host = document.getElementById(TARGET);
    if (!host || host.querySelector('.spCues')) return;
    const box = document.createElement('div');
    box.className = 'spCues';
    box.innerHTML = `<div class="me" id="spCuesMe"></div><h3>✅ 이것만 지켜요</h3><ol>${cues.map(c => `<li>${c}</li>`).join('')}</ol>`;
    const after = host.querySelector('p') || host.querySelector('h2');
    if (after && after.parentNode === host) after.after(box); else host.prepend(box);
  }

  /* 나에게 맞춘 한 줄: 최근 10번 중 가장 많이 한 실수 */
  function personal() {
    const email = (new URLSearchParams(location.search).get('email') || window.SPORT_EMAIL || '').trim().toLowerCase();
    if (!email || !FB_EX.includes(EX) || !window.SITE || !SITE.GAS_URL) return;
    const cb = 'cuescb_' + Date.now();
    const s = document.createElement('script');
    const done = () => { delete window[cb]; s.remove(); };
    window[cb] = d => {
      done();
      if (!d || !d.ok || !d.recs || !d.recs.length) return;
      const recent = d.recs.slice(-10), sum = d.badNames.map((_, i) => recent.reduce((a, r) => a + (r.bad[i] || 0), 0));
      const i = sum.indexOf(Math.max(...sum));
      const el = document.getElementById('spCuesMe');
      if (!el || !(sum[i] > 0)) return;
      const name = d.badNames[i];
      el.innerHTML = `👉 내가 가장 많이 한 실수: <b>${name}</b> (최근 ${recent.length}번에 ${sum[i]}번)<br>${TIP[name] || ''}`;
    };
    s.onerror = done;
    setTimeout(() => { if (window[cb]) done(); }, 20000);
    s.src = SITE.GAS_URL + '?' + new URLSearchParams({ action: 'feedback', ex: EX, email, token: SITE.TOKEN, callback: cb });
    document.head.appendChild(s);
  }

  const go = () => { place(); personal(); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
