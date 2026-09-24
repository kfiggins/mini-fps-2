export function injectMenuStyles() {
  if (document.getElementById('menu-css')) return;
  const s = document.createElement('style');
  s.id = 'menu-css';
  s.textContent = `
  #menu { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; font-family: var(--font-body); color: #e8ecf2; overflow-y: auto; padding: 24px 16px; }
  #menu.hidden { display: none; }
  #menu[data-screen="title"] { background: radial-gradient(ellipse at 50% 60%, rgba(5,8,14,.15), rgba(5,8,14,.72) 75%), linear-gradient(180deg, rgba(5,8,14,.1), rgba(5,8,14,.55)); }
  #menu[data-screen="pause"], #menu[data-screen="over"] { background: rgba(6,8,12,.78); backdrop-filter: blur(6px); }
  .t-wrap, .p-wrap, .o-wrap { display: flex; flex-direction: column; align-items: center; gap: 18px; text-align: center; max-width: 980px; width: 100%; }
  .t-logo { font: 800 clamp(64px, 11vw, 132px)/.9 var(--font-head); letter-spacing: -.02em; display: flex; align-items: flex-start; gap: .12em; text-shadow: 0 10px 50px rgba(0,0,0,.7); }
  .t-mini { font-size: .36em; letter-spacing: .3em; writing-mode: vertical-rl; transform: rotate(180deg); color: #ffd36b; margin-top: .15em; }
  .t-fps { background: linear-gradient(180deg, #fff 30%, #9aa5b8); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .t-two { color: #ffd36b; text-shadow: 0 0 40px rgba(255,211,107,.6); animation: glow 2.8s ease-in-out infinite; }
  @keyframes glow { 50% { text-shadow: 0 0 70px rgba(255,211,107,.9); } }
  .t-tag { font: 600 14px var(--font-head); letter-spacing: .4em; color: #9aa5b8; }
  .t-play { font: 800 30px var(--font-head); letter-spacing: .3em; padding: 16px 64px 16px 72px; color: #121212; cursor: pointer;
    background: linear-gradient(180deg, #ffe39a, #ffc24a); border: none; clip-path: polygon(14px 0, 100% 0, calc(100% - 14px) 100%, 0 100%);
    box-shadow: 0 10px 40px rgba(255,190,60,.35); transition: transform .15s, filter .15s; margin-top: 8px; }
  .t-play:hover { transform: scale(1.05); filter: brightness(1.1); }
  .t-play.small { font-size: 20px; padding: 12px 40px 12px 48px; }
  .t-play.endless { background: linear-gradient(180deg, #e0b0ff, #a855f7); box-shadow: 0 10px 40px rgba(168,85,247,.4); }
  .t-diffs { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .t-diff { width: 230px; padding: 12px 14px; text-align: left; cursor: pointer; color: #cfd6e2; background: rgba(12,15,22,.8); border: 1px solid #2c3444; border-radius: 10px; transition: all .15s; font-family: var(--font-body); }
  .t-diff b { display: block; font: 700 16px var(--font-head); letter-spacing: .2em; color: #fff; margin-bottom: 4px; }
  .t-diff span { font-size: 14px; color: #95a0b3; }
  .t-diff:hover { border-color: #ffd36b88; transform: translateY(-2px); }
  .t-diff.sel { border-color: #ffd36b; box-shadow: 0 0 24px rgba(255,211,107,.25), inset 0 0 20px rgba(255,211,107,.08); }
  .t-diff.sel b { color: #ffd36b; }
  .t-diff.locked { opacity: .5; cursor: not-allowed; }
  .t-ops { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
  .t-op { width: 172px; padding: 8px 10px; display: grid; grid-template-columns: 30px 1fr; column-gap: 8px; text-align: left; cursor: pointer;
    color: #cfd6e2; background: rgba(12,15,22,.75); border: 1px solid #2c3444; border-radius: 9px; font-family: var(--font-body); transition: all .15s; }
  .t-op .op-icon { grid-row: span 2; font-size: 22px; align-self: center; }
  .t-op b { font: 700 12px var(--font-head); letter-spacing: .18em; color: #fff; }
  .t-op span:last-child { font-size: 12px; line-height: 1.2; color: #8a94a6; }
  .t-op:hover { border-color: #c084fc88; }
  .t-op.sel { border-color: #c084fc; box-shadow: 0 0 18px rgba(192,132,252,.25); }
  .t-op.sel b { color: #d9b8ff; }
  .t-op.locked { opacity: .45; cursor: not-allowed; }
  .t-best { font: 600 13px var(--font-head); letter-spacing: .18em; color: #8a94a6; }
  .t-row { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .t-btn { font: 700 13px var(--font-head); letter-spacing: .2em; padding: 11px 20px; cursor: pointer; color: #cfd6e2; background: rgba(14,18,26,.85); border: 1px solid #333c4d; border-radius: 8px; transition: all .15s; }
  .t-btn:hover { border-color: #ffd36b; color: #fff; }
  .t-btn.danger:hover { border-color: #ff5a4a; color: #ff9a8a; }
  .p-title, .o-title { font: 800 72px/1 var(--font-head); letter-spacing: .14em; }
  .o-wrap.won .o-title { color: #ffd36b; text-shadow: 0 0 50px rgba(255,211,107,.6); }
  .o-wrap.lost .o-title { color: #ff5a4a; text-shadow: 0 0 50px rgba(255,60,40,.5); }
  .p-sub, .o-sub { font: 600 15px var(--font-head); letter-spacing: .24em; color: #9aa5b8; }
  .o-score { font: 800 46px var(--font-head); } .o-score span { font-size: 16px; color: #ffd36b; letter-spacing: .12em; }
  .o-unlock { font: 700 16px var(--font-head); letter-spacing: .2em; color: #c084fc; animation: glow 2s infinite; }
  .o-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; width: 100%; }
  .o-stats div { background: rgba(14,18,26,.8); border: 1px solid #2a3140; border-radius: 8px; padding: 10px; }
  .o-stats span { display: block; font: 600 10px var(--font-head); letter-spacing: .2em; color: #7d879a; }
  .o-stats b { font: 700 22px var(--font-head); }
  .o-kills { font: 600 12px var(--font-head); letter-spacing: .12em; color: #8a94a6; text-transform: uppercase; }
  .build-chips { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; max-width: 900px; }
  .chip { font: 600 13px var(--font-body); padding: 3px 9px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--c) 60%, transparent); color: var(--c); background: rgba(0,0,0,.35); }
  .chip.syn { --c: #ffd36b; font-weight: 700; box-shadow: 0 0 12px rgba(255,211,107,.25); }

  #modal { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; background: rgba(4,6,10,.7); backdrop-filter: blur(4px); padding: 20px; }
  #modal.hidden { display: none; }
  .modal-card { width: min(860px, 96vw); max-height: 88vh; overflow-y: auto; background: linear-gradient(170deg, #161b25, #0c0f15); border: 1px solid #2c3444; border-radius: 14px; padding: 26px 30px; display: flex; flex-direction: column; gap: 14px; color: #e8ecf2; font-family: var(--font-body); }
  .m-title { font: 800 30px var(--font-head); letter-spacing: .2em; }
  .modal-card .close { align-self: center; margin-top: 8px; }
  .how-grid { display: grid; grid-template-columns: auto 1fr; gap: 8px 16px; align-items: center; }
  kbd { font: 700 13px var(--font-head); padding: 4px 9px; border: 1px solid #3b4557; border-bottom-width: 3px; border-radius: 6px; background: #1b212c; text-align: center; white-space: nowrap; }
  .how-notes p { margin: 6px 0; color: #b9c2d0; font-size: 16px; line-height: 1.4; }
  .gold { color: #ffd36b; font-weight: 700; } .purple { color: #c084fc; font-weight: 700; }
  .set-row { display: grid; grid-template-columns: 200px 1fr 70px; gap: 14px; align-items: center; font-size: 16px; }
  .set-row input[type=range] { accent-color: #ffd36b; width: 100%; }
  .set-row b { font-family: var(--font-head); color: #ffd36b; }
  .seg-btns { display: flex; gap: 6px; }
  .seg-btns button { font: 700 12px var(--font-head); letter-spacing: .15em; padding: 7px 14px; border-radius: 6px; background: #1b212c; color: #9aa5b8; border: 1px solid #333c4d; cursor: pointer; }
  .seg-btns button.sel { color: #121212; background: #ffd36b; border-color: #ffd36b; }
  .tabs { margin-bottom: 4px; }
  .cx-head { font: 700 14px var(--font-head); letter-spacing: .24em; margin-top: 10px; }
  .cx-head span { color: #7d879a; margin-left: 8px; }
  .cx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 8px; }
  .cx-item { border-left: 3px solid var(--c); background: #131821; padding: 8px 10px; border-radius: 6px; display: flex; flex-direction: column; gap: 3px; }
  .cx-item b { font: 700 14px var(--font-head); }
  .cx-item span { font-size: 14px; color: #a9b3c2; }
  .cx-item i { font-size: 12px; color: #7d879a; font-style: normal; }
  .cx-item.unk { opacity: .55; }

  #intermission { position: fixed; inset: 0; z-index: 25; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px; overflow-y: auto; padding: 24px 12px;
    background: radial-gradient(ellipse at 50% 40%, rgba(10,14,22,.55), rgba(4,6,10,.9)); backdrop-filter: blur(5px); font-family: var(--font-body); color: #e8ecf2; }
  #intermission.hidden { display: none; }
  #offer-title { font: 800 34px var(--font-head); letter-spacing: .18em; text-align: center; }
  #offer-sub { font: 600 14px var(--font-head); letter-spacing: .24em; color: #9aa5b8; margin-top: -12px; }

  #fade { position: fixed; inset: 0; z-index: 35; background: #000; opacity: 0; pointer-events: none; transition: opacity 1s ease; display: grid; place-items: center; }
  #fade.on { opacity: 1; }
  .act-card { text-align: center; color: #e8ecf2; animation: actin 3s ease both; }
  .act-n { font: 700 18px var(--font-head); letter-spacing: .6em; color: #ffd36b; }
  .act-name { font: 800 64px var(--font-head); letter-spacing: .12em; margin: 10px 0; }
  .act-tag { font: 600 16px var(--font-body); letter-spacing: .1em; color: #9aa5b8; }
  @keyframes actin { from { opacity: 0; transform: scale(1.1); letter-spacing: .3em; } 30% { opacity: 1; transform: none; } }
  `;
  document.head.appendChild(s);
}
