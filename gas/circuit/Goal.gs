/*************************************************************
 * Goal.gs — 측정 앱의 '🎯 오늘 도장 목표' (2026-11-16)
 *  허브 JSONP action=goal&email= (Hub.gs) → 화면 goal.js
 *  통과 기준이 '그날 정확한 횟수 합'으로 바뀌어(11/16~), 측정 화면에서 오늘 몇 회 했고 몇 회 남았는지 보여 줌
 *  Stamp.gs 의 stampCtx_·stampJudge_ 를 그대로 씀 (공유 캐시라 가벼움)
 *************************************************************/
/** action=goal&email=  → 측정 앱 '오늘 도장 목표' 칸(goal.js, 2026-11-16): 오늘 종목별 통과 기준과 지금까지 한 양
 *  공유 캐시(sb5, 90초)만 읽어 가벼움. 방금 한 측정은 화면이 결과 숫자를 더해 보여 줌 */
function stampGoal_(p) {
  const email = String(p.email || '').trim().toLowerCase();
  if (!email.endsWith(SQUAT_CONFIG.DOMAIN)) return { ok: false, error: '학교 계정이 아니에요' };
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const roster = stampRoster_(ss);
  const id = stampIdOf_(email), st = roster.byId[id];
  if (!st) return { ok: false, error: '명단에 없는 학생이에요' };
  const ctx = stampCtx_(ss, new Set([id]), roster);
  const j = stampJudge_(ctx, id, ctx.today);
  const items = {};
  j.items.forEach(i => items[i.key] = { name: i.name, n: i.sec, min: i.min, unit: i.unit || '초', ok: i.ok, extra: i.extra || 0 });
  return { ok: true, today: ctx.today, name: st.name, done: j.done, need: j.need, stamp: j.stamp, items };
}
