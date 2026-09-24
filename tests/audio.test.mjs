// Audio slice data checks (no WebAudio in Node): every contract sfx id has a
// recipe, and the song data is well-formed (8-bar progressions, 16-step
// patterns, motifs inside their 2-bar window).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SFX_IDS, RECIPES } from '../src/slices/audio/sfx.js';
import { SONGS, QUALITIES } from '../src/slices/audio/songs.js';
import { MOODS } from '../src/slices/audio/music.js';

const CONTRACT = `rifle marksman scattergun arcsmg rail_charge rail_fire launcher dry_fire reload_start
reload_end weapon_switch shell grenade_throw grenade_bounce explosion explosion_small ads_in hit headshot
kill shield_hit impact whiz footstep jump land hurt hurt_heavy heartbeat death armor_hit armor_break heal
pickup_scrap pickup_grenade pickup_health jetpack double_jump dash jump_pad enemy_rifle enemy_heavy
sniper_charge sniper_fire melee_swipe enemy_step boss_step enemy_death enemy_spawn wasp_dive flame lob
orb_volley missile_launch artillery_warn shockwave summon mender_beam boss_roar boss_enrage teleport
laser_charge laser_fire ui_hover ui_click card_flip card_pick card_legendary card_cursed reroll buy deny
wave_start wave_clear boss_warning callout synergy bounty_complete bounty_fail act_clear countdown victory
defeat grapple_fire grapple_pull bubble_up bubble_break heal_field missile_home nova laser_sweep overclock
mech_enter mech_shot mech_step mech_stomp mech_rockets drone_shot collector reactor_warn reactor_pulse
lava_sizzle`.split(/\s+/);

test('every contract sfx id has a recipe', () => {
  const missing = CONTRACT.filter((id) => !SFX_IDS.includes(id));
  assert.deepEqual(missing, []);
});

test('recipes have sane voice caps', () => {
  for (const [id, r] of Object.entries(RECIPES)) {
    assert.ok(r.max >= 1 && r.max <= 8, id);
    assert.equal(typeof r.fn, 'function', id);
  }
  assert.equal(RECIPES.enemy_rifle.max, 6);
  assert.equal(RECIPES.footstep.max, 2);
});

test('music moods match the contract', () => {
  assert.deepEqual([...MOODS].sort(), ['boss', 'calm', 'combat', 'defeat', 'menu', 'shop', 'silent', 'transition', 'victory']);
});

test('song data is well-formed', () => {
  for (const [key, s] of Object.entries(SONGS)) {
    assert.ok(s.bpm > 60 && s.bpm < 160, key);
    for (const prog of Object.values(s.progs)) {
      assert.equal(prog.length, 8, key);
      for (const [, q] of prog) assert.ok(QUALITIES[q], `${key} quality ${q}`);
    }
    for (const pat of Object.values(s.bass)) assert.equal(pat.length, 16, key);
    for (const k of ['kick', 'snare', 'hat', 'hat16', 'perc']) assert.equal(s.drums[k].length, 16, `${key} ${k}`);
    assert.equal(s.drums.fill.snare.length, 4);
    assert.equal(s.drums.fill.perc.length, 4);
    assert.equal(s.pulse.length, 8, key);
    for (const pat of Object.values(s.arp)) assert.equal(pat.length, 16, key);
    for (const m of s.motifs) for (const [st, , len] of m) assert.ok(st >= 0 && st < 32 && len > 0, key);
  }
});
