export function injectHudStyles() {
  if (document.getElementById('hud-css')) return;
  const s = document.createElement('style');
  s.id = 'hud-css';
  s.textContent = `
  #hud { position: fixed; inset: 0; pointer-events: none; z-index: 10; font-family: var(--font-body); color: #e8ecf2; user-select: none; }
  #hud.hidden { display: none; }
  #hud .hidden { display: none !important; }
  #hud.in-offer #h-cross, #hud.in-offer #h-hit, #hud.in-offer #h-dirs, #hud.in-offer #h-scope, #hud.in-offer #h-dmgnums { display: none; }
  .panel-glass { background: linear-gradient(180deg, rgba(14,18,26,.55), rgba(8,10,15,.7)); border: 1px solid rgba(255,255,255,.07); border-radius: 10px; backdrop-filter: blur(4px); }

  /* vitals */
  #h-vitals { position: absolute; left: 28px; bottom: 26px; width: 330px; }
  #h-status { display: flex; gap: 6px; margin-bottom: 6px; flex-wrap: wrap; }
  .st { font: 700 11px var(--font-head); letter-spacing: .14em; padding: 3px 7px; border-radius: 4px; background: rgba(0,0,0,.55); }
  .st.berserk { color: #ff5555; box-shadow: 0 0 12px #ff333366; } .st.surge { color: #ffb347; } .st.adren { color: #7cff9a; }
  .st.oc { color: #ffd36b; } .st.mut { color: #c084fc; }
  #h-armor { display: flex; gap: 4px; margin-bottom: 5px; }
  #h-armor .seg { flex: 1; height: 6px; border-radius: 2px; background: rgba(79,168,255,.14); border: 1px solid rgba(79,168,255,.25); }
  #h-armor .seg.on { background: linear-gradient(90deg, #4fa8ff, #9fd8ff); box-shadow: 0 0 10px #4fa8ff88; }
  #h-hp-row { display: flex; align-items: center; gap: 12px; }
  #h-hp-num { font: 700 44px/1 var(--font-head); min-width: 88px; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
  #h-hp-bar { position: relative; flex: 1; height: 14px; background: rgba(0,0,0,.5); border: 1px solid rgba(255,255,255,.12); border-radius: 3px; overflow: hidden; transform: skewX(-12deg); }
  #h-hp-fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(90deg, #2fd27a, #8ff0b3); z-index: 2; transition: width .08s; }
  #h-hp-fill.low { background: linear-gradient(90deg, #e03232, #ff7a7a); animation: hpflash .6s infinite alternate; }
  #h-hp-fill.over { background: linear-gradient(90deg, #38bdf8, #a6ecff); }
  #h-hp-ghost { position: absolute; inset: 0 auto 0 0; background: #fff6; z-index: 1; }
  @keyframes hpflash { to { filter: brightness(1.4); } }
  #h-fuel { margin-top: 6px; height: 4px; width: 60%; margin-left: 100px; background: rgba(255,170,60,.15); border-radius: 2px; overflow: hidden; }
  #h-fuel-fill { height: 100%; background: linear-gradient(90deg, #ff9a2e, #ffd36b); }

  /* abilities */
  #h-abilities { position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%); display: flex; gap: 10px; }
  .h-ab { position: relative; width: 58px; height: 58px; border-radius: 12px; background: rgba(10,13,20,.7); border: 1px solid rgba(255,255,255,.15); display: grid; place-items: center; overflow: hidden; }
  .h-ab-icon { font-size: 26px; z-index: 2; }
  .h-ab-key { position: absolute; left: 5px; top: 3px; font: 700 11px var(--font-head); color: #9aa5b8; z-index: 3; }
  .h-ab-t { position: absolute; right: 6px; bottom: 3px; font: 700 15px var(--font-head); z-index: 3; }
  .h-ab-cd { position: absolute; inset: 0; background: conic-gradient(rgba(0,0,0,.72) var(--p, 0%), transparent 0); z-index: 2; }
  .h-ab.cooling .h-ab-icon { opacity: .5; }
  .h-ab:not(.cooling):not(.empty) { border-color: #7fd8ff99; box-shadow: 0 0 14px #7fd8ff33; }
  .h-ab.empty { opacity: .3; }
  .h-nade { width: 50px; }
  #h-nade-charge { position: absolute; left: 0; bottom: 0; height: 4px; background: #ffd36b; width: 0; z-index: 4; display: none; }
  #h-nade-charge.on { display: block; }

  /* weapon */
  #h-weapon { position: absolute; right: 30px; bottom: 26px; text-align: right; min-width: 240px; }
  #h-ammo { font: 700 56px/1 var(--font-head); text-shadow: 0 2px 14px rgba(0,0,0,.6); }
  #h-ammo-cur.low { color: #ff6a5a; }
  #h-ammo-max { font-size: 22px; color: #8a94a6; margin-left: 4px; }
  #h-wname { font: 700 14px var(--font-head); letter-spacing: .24em; color: #cfd6e2; margin-top: 2px; }
  #h-reload { height: 4px; background: rgba(255,255,255,.1); margin: 6px 0 0 auto; width: 160px; border-radius: 2px; overflow: hidden; }
  #h-reload-fill { height: 100%; background: #ffd36b; }
  #h-slots { display: flex; gap: 6px; justify-content: flex-end; margin-top: 8px; }
  .slot { font: 600 11px var(--font-head); letter-spacing: .1em; color: #6d7788; padding: 3px 7px; border: 1px solid #2a3140; border-radius: 5px; background: rgba(0,0,0,.35); }
  .slot b { color: #9aa5b8; margin-right: 5px; }
  .slot.cur { color: #fff; border-color: #ffd36b88; }
  .slot .rl { color: #ffd36b; font-style: normal; }
  #h-rail { position: absolute; left: 50%; top: calc(50% + 34px); width: 90px; height: 4px; transform: translateX(-50%); background: rgba(159,123,255,.2); border-radius: 2px; overflow: hidden; }
  #h-rail-fill { height: 100%; background: #b49bff; box-shadow: 0 0 10px #9f7bff; }

  /* top */
  #h-top { position: absolute; top: 18px; left: 50%; transform: translateX(-50%); text-align: center; }
  #h-wave { font: 700 26px/1 var(--font-head); letter-spacing: .2em; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
  #h-wave-sub { font: 700 12px var(--font-head); letter-spacing: .22em; color: #dfe5ee; margin-top: 5px; text-shadow: 0 1px 2px #000, 0 0 10px rgba(0,0,0,.8); }
  #h-boss { margin-top: 12px; width: min(620px, 70vw); }
  #h-boss-name { font: 700 14px var(--font-head); letter-spacing: .3em; color: #ff6a5a; margin-bottom: 6px; text-shadow: 0 0 12px #ff333366; }
  #h-boss-bar { position: relative; height: 12px; background: rgba(0,0,0,.6); border: 1px solid #ff5a4a66; border-radius: 3px; overflow: hidden; }
  #h-boss-fill { height: 100%; background: linear-gradient(90deg, #b3121f, #ff5a4a); transition: width .1s; }
  #h-boss.p2 #h-boss-fill { background: linear-gradient(90deg, #ff2a2a, #ffb347); animation: hpflash .4s infinite alternate; }
  #h-boss-mark { position: absolute; left: 50%; top: 0; bottom: 0; width: 2px; background: #fff8; }

  /* score */
  #h-score { position: absolute; left: 28px; top: 20px; }
  #h-score-num { font: 700 30px/1 var(--font-head); letter-spacing: .04em; text-shadow: 0 2px 12px rgba(0,0,0,.6); }
  #h-combo { display: flex; align-items: center; gap: 8px; margin-top: 6px; opacity: .6; text-shadow: 0 1px 3px #000; }
  #h-combo.hot { opacity: 1; }
  #h-combo-x { font: 700 22px var(--font-head); color: hsl(calc(50 - var(--lv, 1) * 9), 100%, 62%); text-shadow: 0 0 calc(var(--lv, 1) * 4px) currentColor; }
  #h-combo-bar { width: 110px; height: 4px; background: rgba(255,255,255,.1); border-radius: 2px; overflow: hidden; }
  #h-combo-fill { height: 100%; background: #ffd36b; }
  #h-scrap { margin-top: 8px; font: 700 20px var(--font-head); color: #ffd36b; text-shadow: 0 0 12px rgba(255,211,107,.35); }
  #h-scrap-gain { font-size: 15px; color: #fff3c4; }
  #h-scrap-gain.pop { animation: gain .4s ease; }
  @keyframes gain { from { transform: translateY(-6px); opacity: .2; } }

  /* feed */
  #h-feed { position: absolute; right: 28px; top: 20px; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
  .feed-line { font: 600 14px var(--font-body); background: rgba(8,10,15,.55); padding: 3px 10px; border-radius: 5px; border-right: 2px solid #ffd36b55; animation: feedin .25s ease; transition: opacity .6s, transform .6s; }
  .feed-line.out { opacity: 0; transform: translateX(20px); }
  @keyframes feedin { from { transform: translateX(30px); opacity: 0; } }
  .kf-name { font-weight: 700; } .kf-name.boss { color: #ff6a5a; } .kf-name.elite { color: #ffd36b; }
  .kf-pts { color: #ffd36b; font-family: var(--font-head); } .kf-x { color: #ff9a4a; font-family: var(--font-head); }
  .kf-tags { color: #7fd8ff; font-size: 11px; letter-spacing: .1em; font-family: var(--font-head); }

  /* bounty */
  #h-bounty { position: absolute; right: 28px; top: 42%; width: 230px; padding: 10px 12px; background: rgba(28,22,8,.72); border: 1px solid #ffd36b44; border-left: 3px solid #ffd36b; border-radius: 8px; }
  .hb-title { font: 700 10px var(--font-head); letter-spacing: .3em; color: #ffd36b; }
  #h-bounty-text { font: 600 15px var(--font-body); margin: 4px 0 2px; }
  #h-bounty-prog { font: 700 13px var(--font-head); color: #cfd6e2; }
  #h-bounty.done { border-left-color: #4ade80; } #h-bounty.done #h-bounty-prog { color: #4ade80; }
  #h-bounty.failed { opacity: .45; } #h-bounty.failed #h-bounty-prog { color: #ff6a5a; }

  /* crosshair */
  #h-cross { position: absolute; left: 50%; top: 50%; width: 0; height: 0; --gap: 8px; }
  #h-cross i { position: absolute; background: #fff; box-shadow: 0 0 2px #000, 0 0 1px #000; border-radius: 1px; transition: transform .05s; }
  #h-cross .c-t, #h-cross .c-b { width: 2px; height: 9px; left: -1px; }
  #h-cross .c-l, #h-cross .c-r { height: 2px; width: 9px; top: -1px; }
  #h-cross .c-t { bottom: var(--gap); } #h-cross .c-b { top: var(--gap); }
  #h-cross .c-l { right: var(--gap); } #h-cross .c-r { left: var(--gap); }
  #h-cross .c-dot { width: 3px; height: 3px; left: -1.5px; top: -1.5px; border-radius: 50%; }
  #h-cross.ads i:not(.c-dot) { opacity: 0; }
  #h-hit { position: absolute; left: 50%; top: 50%; width: 0; height: 0; opacity: 0; }
  #h-hit.on { animation: hit .16s ease-out; opacity: 1; }
  #h-hit i { position: absolute; width: 2px; height: 10px; background: #fff; left: -1px; top: -5px; box-shadow: 0 0 3px #000; }
  #h-hit i:nth-child(1) { transform: rotate(45deg) translateY(-12px); } #h-hit i:nth-child(2) { transform: rotate(135deg) translateY(-12px); }
  #h-hit i:nth-child(3) { transform: rotate(225deg) translateY(-12px); } #h-hit i:nth-child(4) { transform: rotate(315deg) translateY(-12px); }
  #h-hit.head i { background: #ffd36b; height: 12px; } #h-hit.kill i { background: #ff4a3a; height: 15px; width: 3px; }
  @keyframes hit { from { transform: scale(1.5); } to { transform: scale(1); } }
  #h-dirs .dmg-dir { position: absolute; left: 50%; top: 50%; width: 300px; height: 300px; border-radius: 50%;
    background: conic-gradient(from -18deg, rgba(255,40,30,.85) 0deg, rgba(255,40,30,0) 36deg, transparent 0);
    -webkit-mask: radial-gradient(circle, transparent 60%, #000 62%, #000 70%, transparent 72%); mask: radial-gradient(circle, transparent 60%, #000 62%, #000 70%, transparent 72%); }

  /* center texts */
  #h-banner { position: absolute; top: 24%; left: 50%; transform: translateX(-50%); text-align: center; opacity: 0; white-space: nowrap; }
  #h-banner.show { animation: banner 2.8s ease forwards; }
  #h-banner.big.show { animation-duration: 4.2s; }
  .bn-title { font: 700 44px/1 var(--font-head); letter-spacing: .14em; text-shadow: 0 4px 30px rgba(0,0,0,.8), 0 0 30px currentColor; }
  #h-banner.big .bn-title { font-size: 56px; }
  .bn-sub { font: 600 16px var(--font-head); letter-spacing: .3em; color: #cfd6e2; margin-top: 10px; text-shadow: 0 2px 10px #000; }
  @keyframes banner { 0% { opacity: 0; transform: translateX(-50%) scale(1.4); letter-spacing: .5em; } 12% { opacity: 1; transform: translateX(-50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-10px); } }
  #h-callout { position: absolute; top: 34%; left: 50%; transform: translateX(-50%); font: 700 30px var(--font-head); letter-spacing: .18em; opacity: 0; color: #ffd36b; text-shadow: 0 0 20px currentColor; }
  #h-callout[data-level="3"] { color: #ffa94d; } #h-callout[data-level="4"] { color: #ff7a3a; } #h-callout[data-level="5"] { color: #ff4a4a; font-size: 36px; }
  #h-callout[data-level="6"], #h-callout[data-level="7"], #h-callout[data-level="8"] { color: #e070ff; font-size: 42px; }
  #h-callout.show { animation: callout 1.3s ease forwards; }
  @keyframes callout { 0% { opacity: 0; transform: translateX(-50%) scale(2); } 15% { opacity: 1; transform: translateX(-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; } }
  #h-popup { position: absolute; top: 58%; left: 50%; transform: translateX(-50%); font: 700 20px var(--font-head); letter-spacing: .12em; color: #ffd36b; opacity: 0; }
  #h-popup.show { animation: popup 1.6s ease forwards; }
  @keyframes popup { 0% { opacity: 0; } 15% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-30px); } }
  #h-warn { position: absolute; top: 62%; left: 50%; transform: translateX(-50%); font: 700 16px var(--font-head); letter-spacing: .2em; color: #ff5a4a; opacity: 0; }
  #h-warn.show { animation: popup 1.8s ease forwards; }

  #h-hints { position: absolute; left: 50%; bottom: 104px; transform: translateX(-50%); display: flex; gap: 14px; padding: 8px 14px;
    background: rgba(8,10,15,.6); border: 1px solid rgba(255,255,255,.08); border-radius: 10px; font: 600 13px var(--font-body); color: #cfd6e2; white-space: nowrap; }
  #h-hints kbd { font: 700 11px var(--font-head); padding: 2px 6px; margin-right: 4px; border: 1px solid #3b4557; border-bottom-width: 2px; border-radius: 4px; background: #1b212c; }
  #h-marks .mark { position: absolute; left: 0; top: 0; width: 0; height: 0; border-left: 12px solid transparent; border-right: 12px solid transparent;
    border-top: 18px solid #ff4a3a; filter: drop-shadow(0 0 6px rgba(255,60,40,.9)); animation: markpulse .8s ease-in-out infinite alternate; }
  #h-marks .mark.edge { border-top: none; border-bottom: 22px solid #ff4a3a; }
  @keyframes markpulse { to { opacity: .55; } }
  /* damage numbers */
  #h-dmgnums .dnum { position: absolute; left: 0; top: 0; font: 700 17px var(--font-head); color: #fff; text-shadow: 0 1px 3px #000, 0 0 6px rgba(0,0,0,.6); will-change: transform; }
  #h-dmgnums .dnum.crit { color: #ffd36b; font-size: 22px; }

  /* scope + cockpit */
  #h-scope { position: absolute; inset: 0; opacity: 0; transition: opacity .1s; background: radial-gradient(circle at 50% 50%, transparent 0, transparent min(34vh, 34vw), #000 calc(min(34vh, 34vw) + 2px)); }
  #h-scope.on { opacity: 1; }
  .scope-ring { position: absolute; left: 50%; top: 50%; width: min(68vh, 68vw); height: min(68vh, 68vw); transform: translate(-50%,-50%); border-radius: 50%; box-shadow: inset 0 0 60px rgba(0,0,0,.9), 0 0 0 3px #111; }
  .scope-h, .scope-v { position: absolute; background: #000; left: 50%; top: 50%; }
  .scope-h { width: min(68vh, 68vw); height: 1.5px; transform: translate(-50%,-50%); }
  .scope-v { height: min(68vh, 68vw); width: 1.5px; transform: translate(-50%,-50%); }
  .scope-dot { position: absolute; left: 50%; top: 50%; width: 4px; height: 4px; transform: translate(-50%,-50%); background: #ff2a2a; border-radius: 50%; box-shadow: 0 0 6px #f00; }
  #h-cockpit { position: absolute; inset: 0; display: none; }
  #h-cockpit.on { display: block; }
  .ck-frame { position: absolute; inset: 0; border: 26px solid rgba(20,26,34,.85); border-radius: 60px; box-shadow: inset 0 0 90px rgba(127,216,255,.18); clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%); }
  #h-mech-hp { position: absolute; left: 50%; bottom: 100px; transform: translateX(-50%); width: 360px; text-align: center; font: 700 11px var(--font-head); letter-spacing: .3em; color: #7fd8ff; }
  #h-mech-bar { height: 8px; margin-top: 5px; background: rgba(0,0,0,.6); border: 1px solid #7fd8ff66; border-radius: 3px; overflow: hidden; }
  #h-mech-fill { height: 100%; background: linear-gradient(90deg, #3aa0d8, #9fe6ff); }
  `;
  document.head.appendChild(s);
}
