// Shop slice: spend scrap between waves. Renders into #shop-panel while an
// offer is open. Every purchase is `scrap:spend` + `shop:buy { item }`; the
// slice that owns the thing (player, weapons, drones, mech) applies it.
//
// Listens: offer:open, offer:picked, armory:open, armory:done, run:start
// Emits:   scrap:spend, shop:buy, offer:reroll, sfx, hud:feed

const PRICE = {
  reroll: 75, grenade: 30, armor: 25, drone: 125, droneRate: 150, droneTwin: 250, droneRepair: 200,
  collector: 300, collectorSpeed: 150, jetpack: 300, jetFuel: 150, jetThrust: 150, mech: 1000,
};

export function createShop(state, bus) {
  injectStyles();
  const panel = document.getElementById('shop-panel');
  let jetFuel = 0, jetThrust = 0;
  let visible = false;
  let cardsMode = false;

  function items() {
    const p = state.player;
    const d = state.drones || {};
    const W = state.weapons;
    const mech = state.mech || {};
    const jet = p.jetpack?.owned;
    const armorBars = Math.round((p.armor || 0) / 25);
    return [
      {
        group: 'SUPPLIES', list: [
          { id: 'reroll', icon: '🎲', label: 'Reroll cards', can: cardsMode, note: cardsMode ? '' : 'cards only' },
          { id: 'grenade', icon: '💣', label: 'Grenade', can: W.grenades < W.grenadeMax, note: `${W.grenades}/${W.grenadeMax}` },
          { id: 'armor', icon: '🛡️', label: 'Armor bar (25)', can: armorBars < 4, note: `${armorBars}/4` },
        ],
      },
      {
        group: 'DRONES', list: [
          { id: 'drone', icon: '🛸', label: 'Combat drone', can: (d.count || 0) < (d.max || 2), note: `${d.count || 0}/${d.max || 2}` },
          ...(d.count ? [
            { id: 'droneRate', icon: '⏩', label: 'Drone fire rate +15%', can: d.rateUps < 3, note: `${d.rateUps}/3` },
            { id: 'droneTwin', icon: '👯', label: 'Twin cannons', can: !d.twin, note: d.twin ? 'owned' : '' },
            { id: 'droneRepair', icon: '🔧', label: 'Repair beam (heals you)', can: !d.repair, note: d.repair ? 'owned' : '' },
          ] : []),
          { id: 'collector', icon: '🧲', label: 'Scrap collector', can: !d.collector, note: d.collector ? 'owned' : '' },
          ...(d.collector ? [{ id: 'collectorSpeed', icon: '💨', label: 'Collector speed +40%', can: d.collectorUps < 3, note: `${d.collectorUps}/3` }] : []),
        ],
      },
      {
        group: 'HEAVY GEAR', list: [
          ...(!jet ? [{ id: 'jetpack', icon: '🎒', label: 'Jetpack', can: !mech.active, note: 'hold SPACE in air' }] : [
            { id: 'jetFuel', icon: '⛽', label: 'Jet fuel +50%', can: jetFuel < 3, note: `${jetFuel}/3` },
            { id: 'jetThrust', icon: '🔥', label: 'Jet thrust +20%', can: jetThrust < 3, note: `${jetThrust}/3` },
          ]),
          { id: 'mech', icon: '🤖', label: 'MECH', can: !mech.active, note: mech.active ? 'active' : '1000hp war machine', big: true },
        ],
      },
    ];
  }

  function render() {
    if (!visible) { panel.innerHTML = ''; return; }
    const scrap = state.run.scrap;
    let html = `<div class="shop-head"><span>SCRAP SHOP</span><span class="shop-scrap">⬡ ${scrap}</span></div>`;
    for (const g of items()) {
      html += `<div class="shop-group"><div class="shop-group-label">${g.group}</div><div class="shop-items">`;
      for (const it of g.list) {
        const price = PRICE[it.id];
        const afford = scrap >= price;
        const ok = it.can && afford;
        html += `<button class="shop-item${ok ? '' : ' off'}${it.big ? ' big' : ''}" data-id="${it.id}" ${ok ? '' : 'data-off="1"'}>
          <span class="si-icon">${it.icon}</span><span class="si-label">${it.label}</span>
          <span class="si-note">${it.note || ''}</span><span class="si-price${afford ? '' : ' poor'}">${it.can ? `⬡ ${price}` : '—'}</span></button>`;
      }
      html += '</div></div>';
    }
    panel.innerHTML = html;
  }

  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('.shop-item');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.off) { bus.emit('sfx', { id: 'deny' }); return; }
    const price = PRICE[id];
    if (state.run.scrap < price) return;
    bus.emit('scrap:spend', { amount: price });
    if (id === 'reroll') {
      bus.emit('sfx', { id: 'reroll' });
      bus.emit('offer:reroll');
    } else {
      if (id === 'jetFuel') jetFuel++;
      if (id === 'jetThrust') jetThrust++;
      bus.emit('shop:buy', { item: id });
      bus.emit('sfx', { id: 'buy' });
      if (id === 'mech') bus.emit('sfx', { id: 'mech_enter' });
    }
    render();
  });
  panel.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('.shop-item');
    if (btn && btn !== panel._hover) { panel._hover = btn; bus.emit('sfx', { id: 'ui_hover', vol: 0.25 }); }
  });

  bus.on('offer:open', () => { visible = true; cardsMode = true; render(); });
  bus.on('armory:open', () => { visible = true; cardsMode = false; render(); });
  bus.on('offer:picked', () => { visible = false; render(); });
  bus.on('armory:done', () => { visible = false; render(); });
  bus.on('run:start', () => { jetFuel = 0; jetThrust = 0; visible = false; render(); });
  bus.on('scrap:add', () => { if (visible) render(); });

  return { PRICE };
}

function injectStyles() {
  if (document.getElementById('shop-css')) return;
  const s = document.createElement('style');
  s.id = 'shop-css';
  s.textContent = `
  #shop-panel { display: flex; flex-direction: column; gap: 10px; width: min(980px, 94vw); margin: 0 auto; }
  .shop-head { display: flex; justify-content: space-between; align-items: baseline; font: 700 14px var(--font-head); letter-spacing: .2em; color: #8a94a6; border-bottom: 1px solid #2a3140; padding-bottom: 6px; }
  .shop-scrap { font-size: 24px; color: #ffd36b; letter-spacing: .04em; text-shadow: 0 0 16px rgba(255,211,107,.4); }
  .shop-group { display: flex; gap: 12px; align-items: flex-start; }
  .shop-group-label { width: 92px; flex: none; font: 700 11px var(--font-head); letter-spacing: .16em; color: #5d677a; padding-top: 12px; }
  .shop-items { display: flex; flex-wrap: wrap; gap: 8px; flex: 1; }
  .shop-item { display: grid; grid-template-columns: 26px 1fr auto; grid-template-rows: auto auto; column-gap: 8px; align-items: center; text-align: left;
    min-width: 200px; padding: 7px 10px; border-radius: 9px; cursor: pointer; color: #dfe5ee;
    background: rgba(24,29,39,.92); border: 1px solid #2f3747; font-family: var(--font-body); transition: all .15s; }
  .shop-item:hover { border-color: #ffd36b; background: rgba(40,36,24,.95); transform: translateY(-2px); }
  .shop-item.big { border-color: #7fd8ff55; }
  .shop-item.off { opacity: .42; cursor: default; }
  .shop-item.off:hover { transform: none; border-color: #2f3747; background: rgba(24,29,39,.92); }
  .si-icon { grid-row: span 2; font-size: 20px; text-align: center; }
  .si-label { font-weight: 700; font-size: 14px; }
  .si-note { font-size: 11px; color: #7d879a; grid-column: 2; }
  .si-price { grid-row: 1 / span 2; grid-column: 3; font: 700 14px var(--font-head); color: #ffd36b; }
  .si-price.poor { color: #7a5a5a; }
  `;
  document.head.appendChild(s);
}
