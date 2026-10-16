/**
 * Markup and CSS of the "Championship Editorial" look, kept apart from the data logic in miracle-v3.ts.
 * Everything is inline: the certificate renders offline under a CSP that only allows data: fonts and images.
 * Only Montserrat 800 is embedded, so heavier or lighter looks come from size, tracking and opacity.
 */

/** Decorative layer: cream diagonal header, light beams, micro grid, recipient card and frame. Holds no text. */
export const EDITORIAL_DECORATION = `<div class="deco" aria-hidden="true"><i class="cream"></i><i class="stripe"></i><i class="beam"></i><i class="beam two"></i><i class="grid"></i><i class="card"></i><i class="edge"></i></div>`;

export function editorialStyles(fontBase64: string): string {
  return `@font-face{font-family:Montserrat;src:url(data:font/woff2;base64,${fontBase64}) format('woff2');font-weight:800;font-style:normal;font-display:block}
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1920px}body{font-family:Montserrat,sans-serif;color:#f6dfb1;background:#071421;font-weight:800;font-synthesis:none}
main{position:relative;overflow:hidden;background:#071421}
.deco{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none}.deco i{position:absolute;display:block}
.cream{inset:0 0 auto;height:372px;background:#e9e8df;clip-path:polygon(0 0,100% 0,100% 222px,0 372px)}
.stripe{left:-378px;top:341px;width:1620px;height:120px;background:rgba(73,209,236,.18);transform:rotate(-46deg)}
.beam{width:42%;height:125%;right:-21%;top:-12%;background:rgba(170,139,255,.22);transform:rotate(37deg);transform-origin:center}.beam.two{right:-8%;background:rgba(73,209,236,.17)}
.grid{inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 2px,transparent 2px),linear-gradient(90deg,rgba(255,255,255,.025) 2px,transparent 2px);background-size:50px 50px;-webkit-mask-image:linear-gradient(transparent 18%,#000 55%);mask-image:linear-gradient(transparent 18%,#000 55%);opacity:.5}
.card{left:8px;right:8px;top:1396px;height:244px;background:#e9e8df}
.edge{inset:0;border:2px solid rgba(246,223,177,.45)}
section{z-index:1;overflow-wrap:anywhere}h1,h2,p{margin:0}
.clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden;overflow-wrap:anywhere}
[data-zone=identity],[data-zone=award],[data-zone=recipient],[data-zone=issueDate],[data-zone=certificateId]{padding-inline:12px}
[data-zone=identity]{color:#09111e;display:flex;justify-content:space-between;align-items:flex-start}.brand{width:300px;flex:none}.brand img{display:block;width:300px;height:auto}
.lockup{width:380px;text-align:right}.monogram{width:84px;height:84px;margin-left:auto;border:2px solid rgba(9,17,30,.3);border-radius:50%;display:grid;place-items:center;font-size:24px;letter-spacing:.08em;padding-left:.08em;overflow:hidden}
.event{margin-top:10px;font-size:15px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;-webkit-line-clamp:2}.game{margin-top:4px;font-size:14px;line-height:1.3;letter-spacing:.12em;text-transform:uppercase;color:rgba(9,17,30,.62);-webkit-line-clamp:1}
.eyebrow{font-size:18px;line-height:1.25;letter-spacing:.22em;text-transform:uppercase;color:#49d1ec;-webkit-line-clamp:1}
.mega{margin:8px 0 0;font-size:92px;line-height:.84;letter-spacing:-.065em;text-transform:uppercase;color:#fff;text-shadow:0 7px 41px rgba(0,0,0,.48)}.mega span{display:block;color:#f6dfb1;text-shadow:0 7px 41px rgba(0,0,0,.55)}
.motto{margin-top:16px;width:max-content;max-width:100%;padding:8px 22px;border:2px solid rgba(246,223,177,.2);border-radius:999px;background:rgba(246,223,177,.08);font-size:15px;line-height:1.25;letter-spacing:.16em;text-transform:uppercase;-webkit-line-clamp:1}
[data-zone=hero]{display:flex;align-items:center;justify-content:center}[data-zone=hero] img,[data-zone=hero] svg{width:90%;height:90%;object-fit:contain}
[data-zone=hero] [data-role=hero-frame]{position:absolute;border:4px solid rgba(73,209,236,.32);background:linear-gradient(145deg,rgba(73,209,236,.12),rgba(170,139,255,.12));box-shadow:0 0 0 37px rgba(170,139,255,.035)}
[data-zone=secondaryBadge]{color:#f6dfb1}[data-zone=secondaryBadge] img{display:block;width:152px;height:152px;object-fit:contain;background:#e9e8df;padding:14px;border:2px solid rgba(246,223,177,.35);border-radius:28px}
.initials-tile{display:grid;place-items:center;width:152px;height:152px;background:#0b1e31;border:2px solid rgba(246,223,177,.35);border-radius:28px;color:#49d1ec;font-size:48px;letter-spacing:.04em}
.team-line{position:absolute;left:0;right:0;bottom:0;color:#fff}.team-line small{display:block;margin-bottom:6px;font-size:14px;line-height:1.2;letter-spacing:.16em;text-transform:uppercase;color:#aab7c9}.team{font-size:24px;line-height:1.15;-webkit-line-clamp:3}
[data-zone=recipient]{color:#09111e;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:40px}
.label{font-size:18px;line-height:1.25;letter-spacing:.16em;text-transform:uppercase}.recipient{margin-top:10px;line-height:1.08;-webkit-line-clamp:2}
.rank{text-align:right}.rank b{display:block;font-size:80px;line-height:1}.rank span{display:block;margin-top:8px;font-size:16px;line-height:1.2;letter-spacing:.12em;text-transform:uppercase}
.foot-label{font-size:16px;line-height:1.25;letter-spacing:.14em;text-transform:uppercase;color:#aab7c9}.meta{margin-top:6px;font-size:22px;line-height:1.25;letter-spacing:.06em;color:#f6dfb1;-webkit-line-clamp:2}.issued{-webkit-line-clamp:1}
[data-zone=qrVerification]{text-align:center}[data-zone=qrVerification] img{display:block;width:200px;height:200px;margin:auto;border-radius:14px}[data-zone=qrVerification] a{color:#f6dfb1;font-size:14px;text-decoration:none;letter-spacing:.08em}`;
}
