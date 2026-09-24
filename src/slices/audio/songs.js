// Song data for the adaptive music engine: one theme per act plus the menu.
// Pure data — tempo, key, chord progressions, hand-written patterns and motifs.
//
// Notation
//   chords:   [semitones from key, quality] — one per bar, 8 bars per progression
//   bass:     16 steps of semitone offsets from the chord root (null = rest)
//   drums:    16-char strings; x = hit, X = accent, o = ghost, O = open hat,
//             perc letters h/m/l pick high/mid/low variants
//   pulse:    8 eighth-notes of chord-tone indices; arp: 16 sixteenths
//   motifs:   2-bar phrases of [step 0..31, chord-tone index, length in steps];
//             chord-tone indices follow the current chord (0 = root, 3 = root
//             an octave up, ...), so melodies always sit on the harmony.

const _ = null;

export const QUALITIES = {
  m: [0, 3, 7],
  M: [0, 4, 7],
  m7: [0, 3, 7, 10],
  M7: [0, 4, 7, 11],
  m9: [0, 3, 7, 14],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
};

export const SONGS = {
  menu: {
    name: 'Standby',
    bpm: 84,
    key: 45, // A
    bassOct: -12,
    bassStyle: 'sub',
    bassGate: 14,
    progs: {
      a: [[0, 'm9'], [-4, 'M7'], [3, 'M'], [-2, 'M'], [0, 'm9'], [-4, 'M7'], [5, 'm7'], [7, 'sus4']],
      b: [[5, 'm7'], [-4, 'M7'], [0, 'm9'], [-2, 'M'], [5, 'm7'], [3, 'M'], [-2, 'M'], [7, 'M']],
    },
    bass: {
      a: [0, _, _, _, _, _, _, _, _, _, _, _, _, _, _, _],
      b: [0, _, _, _, _, _, _, _, _, _, 12, _, _, _, _, _],
    },
    drums: {
      kick: 'x.........x.....',
      snare: '............o...',
      hat: '....o.......o...',
      hat16: '..o...o...o...o.',
      perc: '................',
      fill: { snare: '..oo', perc: '....' },
    },
    snareKind: 'snare',
    percKind: null,
    pulse: [0, _, 2, _, 1, _, 2, _],
    pulseType: 'sine',
    arp: {
      a: [0, _, 2, _, 4, _, 3, _, 5, _, 4, _, 2, _, 1, _],
      b: [3, _, 2, _, 5, _, 4, _, 6, _, 5, _, 4, _, 2, _],
    },
    arpType: 'triangle',
    arpBright: 2200,
    leadStyle: 'soft',
    motifs: [
      [[0, 4, 6], [6, 3, 2], [8, 2, 8], [16, 3, 6], [22, 4, 2], [24, 5, 8]],
      [[0, 5, 4], [4, 4, 4], [8, 3, 8], [16, 2, 4], [20, 1, 4], [24, 0, 8]],
    ],
    padCut: 1500,
    pump: false,
  },

  act1: {
    name: 'Dust Outpost',
    bpm: 112,
    key: 38, // D minor with a harmonic-minor V for desert flavour
    bassOct: 0,
    bassStyle: 'drive',
    bassGate: 1.5,
    progs: {
      a: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'm'], [5, 'm'], [7, 'M']],
      b: [[-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'sus2'], [5, 'm'], [-4, 'M'], [7, 'sus4'], [7, 'M']],
      boss: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M'], [0, 'm'], [1, 'M'], [3, 'M'], [1, 'M']],
    },
    bass: {
      a: [0, _, 0, 0, 12, _, 0, _, 0, _, 0, 0, 12, _, 7, _],
      b: [0, _, _, 0, _, _, 0, _, 0, _, _, 0, _, _, 12, 10],
    },
    drums: {
      kick: 'x.....x.x.......',
      snare: '....x.......x...',
      hat: 'x.o.x.o.x.o.x.o.',
      hat16: 'xoxoXoxoxoxoXoxo',
      perc: '..h..m....h..l..',
      fill: { snare: '..xX', perc: 'hmll' },
    },
    snareKind: 'snare',
    percKind: 'tom',
    pulse: [0, 2, 1, 2, 0, 2, 1, 2],
    pulseType: 'triangle',
    arp: {
      a: [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 4, 3, 2, 1, 2],
      b: [3, 2, 1, 2, 4, 3, 2, 3, 5, 4, 3, 2, 1, 2, 3, 4],
    },
    arpType: 'sawtooth',
    arpBright: 1800,
    leadStyle: 'twang',
    motifs: [
      [[0, 3, 3], [3, 4, 1], [4, 5, 4], [10, 4, 2], [12, 3, 4], [16, 2, 3], [19, 3, 1], [20, 4, 6], [28, 2, 4]],
      [[0, 5, 2], [2, 4, 2], [4, 3, 4], [8, 4, 2], [10, 3, 2], [12, 2, 4], [16, 1, 6], [24, 0, 8]],
      [[0, 3, 1], [2, 3, 1], [4, 4, 2], [6, 3, 2], [8, 5, 6], [16, 4, 1], [18, 4, 1], [20, 5, 2], [22, 4, 2], [24, 3, 8]],
    ],
    padCut: 1400,
    pump: false,
  },

  act2: {
    name: 'The Refinery',
    bpm: 120,
    key: 40, // E minor, heavy and industrial
    bassOct: 0,
    bassStyle: 'grind',
    bassGate: 0.9,
    progs: {
      a: [[0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'm'], [-4, 'M'], [-5, 'M']],
      b: [[5, 'm'], [-4, 'M'], [0, 'm'], [-2, 'M'], [5, 'm'], [-4, 'M'], [-5, 'sus4'], [-5, 'M']],
      boss: [[0, 'm'], [1, 'M'], [0, 'm'], [-2, 'M'], [0, 'm'], [1, 'M'], [3, 'M'], [1, 'M']],
    },
    bass: {
      a: [0, _, _, 0, _, _, 0, _, 0, _, _, 0, _, _, 0, _],
      b: [0, 0, _, 0, 0, _, 0, _, 0, 0, _, 0, 12, _, 10, _],
    },
    drums: {
      kick: 'x...x...x...x.x.',
      snare: '....X.......X...',
      hat: 'x.x.x.x.x.x.x.x.',
      hat16: 'xoxoxoxoxoxoxoxo',
      perc: '..x...h....x..h.',
      fill: { snare: 'xxXX', perc: 'x.hx' },
    },
    snareKind: 'snare',
    percKind: 'clank',
    pulse: [0, 1, 2, 1, 0, 1, 2, 1],
    pulseType: 'square',
    arp: {
      a: [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 1, 2, 4, 3, 2, 1],
      b: [3, 1, 2, 0, 3, 1, 2, 0, 4, 2, 3, 1, 4, 2, 3, 1],
    },
    arpType: 'square',
    arpBright: 1600,
    leadStyle: 'metal',
    motifs: [
      [[0, 3, 2], [2, 3, 2], [4, 4, 2], [6, 3, 2], [8, 2, 8], [16, 3, 2], [18, 3, 2], [20, 5, 4], [24, 4, 8]],
      [[0, 5, 6], [6, 4, 2], [8, 3, 6], [14, 2, 2], [16, 1, 8], [24, 2, 8]],
    ],
    padCut: 1100,
    pump: false,
  },

  act3: {
    name: 'Reactor Core',
    bpm: 128,
    key: 45, // A minor synthwave
    bassOct: -12,
    bassStyle: 'wave',
    bassGate: 1.4,
    progs: {
      a: [[-4, 'M'], [-2, 'M'], [0, 'm'], [0, 'm'], [-4, 'M'], [-2, 'M'], [3, 'M'], [7, 'M']],
      b: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M'], [0, 'm'], [-4, 'M'], [-2, 'M'], [7, 'M']],
      boss: [[0, 'm'], [-4, 'M'], [5, 'm'], [7, 'M'], [0, 'm'], [1, 'M'], [5, 'm'], [7, 'M']],
    },
    bass: {
      a: [0, _, 0, _, 12, _, 0, _, 0, _, 0, _, 12, _, 0, _],
      b: [0, 0, 12, 0, 0, 12, 0, 0, 0, 0, 12, 0, 0, 12, 0, 12],
    },
    drums: {
      kick: 'x...x...x...x...',
      snare: '....x.......x...',
      hat: '..O...O...O...O.',
      hat16: 'xxOxxxOxxxOxxxOx',
      perc: 'oxoxoxoxoxoxoxox',
      fill: { snare: 'xxxX', perc: 'xxxx' },
    },
    snareKind: 'clap',
    percKind: 'shaker',
    pulse: [0, 1, 2, 3, 0, 1, 2, 3],
    pulseType: 'sawtooth',
    arp: {
      a: [0, 1, 2, 3, 4, 5, 4, 3, 0, 1, 2, 3, 4, 5, 6, 5],
      b: [6, 5, 4, 3, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1, 2, 3],
    },
    arpType: 'sawtooth',
    arpBright: 3200,
    leadStyle: 'super',
    motifs: [
      [[0, 5, 4], [4, 4, 2], [6, 3, 2], [8, 4, 6], [14, 5, 2], [16, 6, 4], [20, 5, 4], [24, 4, 8]],
      [[0, 3, 2], [2, 4, 2], [4, 5, 4], [8, 4, 2], [10, 3, 2], [12, 4, 4], [16, 2, 6], [22, 3, 2], [24, 1, 8]],
    ],
    padCut: 2000,
    pump: true,
  },
};
