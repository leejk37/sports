/* camfit.js — 카메라가 볼 수 있는 화면을 최대한 넓게 (2026-11-16)
 *  - 카메라(태블릿·웹캠)의 원래 센서 비율(예: 태블릿 4:3, 노트북 웹캠 16:9)로 다시 요청 → 16:9로 잘라 받던 위·아래(또는 옆)가 살아남
 *  - 줌이 되는 카메라는 가장 넓게(줌 최소)
 *  - 쓰는 법: 측정 앱의 startCamera()에서 getUserMedia 다음에  await window.spWiden?.(stream, 세로면 true)
 *    영상 크기가 바뀌면 video 'resize' 이벤트로 캔버스를 다시 맞춤(각 앱)
 *  - 실패해도 아무 일 없이 원래 화면 그대로 */
window.spWiden = async function (stream, portrait) {
  try {
    const tr = stream && stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!tr || !tr.getCapabilities) return;
    const c = tr.getCapabilities() || {}, s = tr.getSettings() || {};
    if (c.width && c.height && c.width.max && c.height.max) {
      const a = c.width.max / c.height.max, land = a >= 1 ? a : 1 / a;          // 센서의 긴 변 : 짧은 변
      const long = Math.min(1280, Math.max(c.width.max, c.height.max)), short = Math.round(long / land);
      const w = portrait ? short : long, h = portrait ? long : short;
      if (s.width && s.height && Math.abs(s.width / s.height - w / h) > 0.04) {
        await tr.applyConstraints({ width: { ideal: w }, height: { ideal: h } });
      }
    }
    const z = tr.getSettings().zoom;
    if (c.zoom && typeof c.zoom.min === 'number' && typeof z === 'number' && z > c.zoom.min) {
      await tr.applyConstraints({ advanced: [{ zoom: c.zoom.min }] });
    }
  } catch (e) { /* 지원 안 하는 기기는 그대로 */ }
};
