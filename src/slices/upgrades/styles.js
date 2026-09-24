// Card + intermission styles owned by the upgrades slice.
export function injectStyles() {
  if (document.getElementById('upgrades-css')) return;
  const s = document.createElement('style');
  s.id = 'upgrades-css';
  s.textContent = `
  #offer-cards { display: flex; gap: 18px; justify-content: center; flex-wrap: wrap; perspective: 1200px; }
  .card {
    --tier: #b8c0cc;
    position: relative; width: 218px; min-height: 300px; padding: 18px 16px 14px;
    display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px;
    background: linear-gradient(170deg, rgba(30,36,48,.96), rgba(12,15,21,.97));
    border: 1px solid color-mix(in srgb, var(--tier) 55%, transparent);
    border-radius: 14px; color: #e8ecf2; cursor: pointer; overflow: hidden;
    box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 14px 40px rgba(0,0,0,.55), inset 0 0 30px color-mix(in srgb, var(--tier) 10%, transparent);
    font-family: var(--font-body); transform-style: preserve-3d;
    animation: card-in .5s cubic-bezier(.2,.9,.3,1.2) both;
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s;
  }
  .card:hover { transform: translateY(-8px) scale(1.035); border-color: var(--tier);
    box-shadow: 0 0 0 1px var(--tier), 0 20px 50px rgba(0,0,0,.6), 0 0 40px color-mix(in srgb, var(--tier) 35%, transparent); }
  .card:active { transform: translateY(-4px) scale(.99); }
  @keyframes card-in { from { opacity: 0; transform: rotateY(-80deg) translateY(30px) scale(.9); } to { opacity: 1; transform: none; } }
  .card::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 4px; background: var(--tier); box-shadow: 0 0 18px var(--tier); }
  .card-tier { font: 700 11px/1 var(--font-head); letter-spacing: .18em; display: flex; gap: 8px; align-items: center; }
  .card-tag { color: #8a94a6; font-weight: 600; letter-spacing: .12em; font-size: 9px; border: 1px solid #3a4252; padding: 2px 5px; border-radius: 4px; }
  .card-icon { font-size: 46px; line-height: 1; margin: 10px 0 4px; filter: drop-shadow(0 4px 14px color-mix(in srgb, var(--tier) 50%, transparent)); }
  .card-icon.big { font: 800 54px/1 var(--font-head); color: var(--tier); }
  .card-name { font: 700 19px/1.15 var(--font-head); letter-spacing: .02em; }
  .card-desc { font-size: 15px; line-height: 1.3; color: #b9c2d0; font-weight: 500; }
  .card-stats { font: 600 11px/1.4 var(--font-head); color: #ffd36b; letter-spacing: .04em; margin-top: 4px; }
  .card-foot { margin-top: auto; font: 600 11px var(--font-head); color: #7d879a; letter-spacing: .1em; }
  .card-key { position: absolute; top: 10px; right: 12px; font: 700 12px var(--font-head); color: #5a6475; border: 1px solid #333b49; border-radius: 5px; padding: 1px 6px; }
  .syn-hint { font: 600 11px/1.3 var(--font-head); color: #9aa5b8; letter-spacing: .04em; }
  .syn-hint.complete { color: #ffd36b; text-shadow: 0 0 10px rgba(255,211,107,.6); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .55; } }
  .card-shine { position: absolute; inset: -50%; background: linear-gradient(115deg, transparent 40%, rgba(255,255,255,.08) 50%, transparent 60%); transform: translateX(-60%); pointer-events: none; }
  .card:hover .card-shine { animation: shine .9s ease; }
  @keyframes shine { to { transform: translateX(60%); } }
  .tier-legendary { background: linear-gradient(170deg, rgba(58,40,10,.97), rgba(18,13,6,.97)); }
  .tier-legendary .card-shine { background: linear-gradient(115deg, transparent 35%, rgba(255,210,120,.18) 50%, transparent 65%); animation: shine 2.4s ease-in-out infinite; }
  .tier-cursed { background: radial-gradient(circle at 50% 30%, rgba(90,40,120,.95), rgba(16,8,24,.98) 70%); }
  .tier-cursed .card-icon { animation: float 2.4s ease-in-out infinite; }
  @keyframes float { 50% { transform: translateY(-6px) rotate(-4deg); } }
  .tier-armory { background: linear-gradient(170deg, rgba(48,40,18,.97), rgba(14,12,8,.97)); width: 240px; }
  .slot-card { min-height: 200px; justify-content: center; }
  `;
  document.head.appendChild(s);
}
