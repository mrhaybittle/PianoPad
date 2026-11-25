// js/games/rugby/rugbyDataAndSprites.js

export const TEAMS = [
  { id: 'canterbury-bulldogs', name: 'Canterbury-Bankstown Bulldogs', primary: '#1d4ed8', secondary: '#ffffff', chant: 'Fire up, Doggies!' },
  { id: 'brisbane-broncos', name: 'Brisbane Broncos', primary: '#6b1d2f', secondary: '#fbbf24', chant: 'Buck up, Broncos!' },
  { id: 'canberra-raiders', name: 'Canberra Raiders', primary: '#65a30d', secondary: '#1e3a8a', chant: 'We are the Raiders!' },
  { id: 'cronulla-sharks', name: 'Cronulla-Sutherland Sharks', primary: '#0284c7', secondary: '#ffffff', chant: 'Up, up Cronulla!' },
  { id: 'dolphins', name: 'Dolphins', primary: '#dc2626', secondary: '#fde047', chant: 'Phins up!' },
  { id: 'gold-coast-titans', name: 'Gold Coast Titans', primary: '#0369a1', secondary: '#facc15', chant: 'Titans roar!' },
  { id: 'manly-sea-eagles', name: 'Manly Warringah Sea Eagles', primary: '#7f1d1d', secondary: '#ffffff', chant: 'Manly! Manly!' },
  { id: 'melbourne-storm', name: 'Melbourne Storm', primary: '#312e81', secondary: '#facc15', chant: 'Storm warning!' },
  { id: 'newcastle-knights', name: 'Newcastle Knights', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Go the Knights!' },
  { id: 'nz-warriors', name: 'New Zealand Warriors', primary: '#111827', secondary: '#16a34a', chant: 'New Zealand Warriors!' },
  { id: 'nq-cowboys', name: 'North Queensland Cowboys', primary: '#1e3a8a', secondary: '#facc15', chant: 'Cowboys country!' },
  { id: 'parramatta-eels', name: 'Parramatta Eels', primary: '#1d4ed8', secondary: '#facc15', chant: 'Parra! Parra!' },
  { id: 'penrith-panthers', name: 'Penrith Panthers', primary: '#18181b', secondary: '#f43f5e', chant: 'Let’s go Panthers!' },
  { id: 'souths-rabbitohs', name: 'South Sydney Rabbitohs', primary: '#15803d', secondary: '#dc2626', chant: 'Glory, glory to South Sydney!' },
  { id: 'st-george-illawarra-dragons', name: 'St. George Illawarra Dragons', primary: '#b91c1c', secondary: '#ffffff', chant: 'Up the Dragons!' },
  { id: 'sydney-roosters', name: 'Sydney Roosters', primary: '#1e3a8a', secondary: '#dc2626', chant: 'Easts to win!' },
  { id: 'wests-tigers', name: 'Wests Tigers', primary: '#ea580c', secondary: '#ffffff', chant: 'Tigers charge!' },
  { id: 'perth-bears', name: 'Perth Bears', primary: '#dc2626', secondary: '#111827', chant: 'Bears on the prowl!' }
];

export const PIANO_FREQS = { C: 261.63, D: 293.66, E: 329.63, F: 349.23, G: 392.00 };
export const LANES = [0.16, 0.33, 0.5, 0.67, 0.84];
export const LANE_NOTES = ['C', 'D', 'E', 'F', 'G'];
export const NOTE_TO_INDEX = { C: 0, D: 1, E: 2, F: 3, G: 4 };

const PIXEL_FONT_5X7 = {
  C: ['1111', '1..1', '1...', '1...', '1...', '1..1', '1111'],
  D: ['111.', '1..1', '1..1', '1..1', '1..1', '1..1', '111.'],
  E: ['1111', '1...', '1...', '111.', '1...', '1...', '1111'],
  F: ['1111', '1...', '1...', '111.', '1...', '1...', '1...'],
  G: ['1111', '1...', '1...', '1.11', '1..1', '1..1', '1111']
};

function buildUpperBodyRows(pose, hasBall, facing) {
  const isFront = facing === 'front';
  const head = isFront
    ? [
        '.........KKKKKKKK.........',
        '........KHHHHHHHHK........',
        '.......KHHHHHHHHHHK.......',
        '.......KHHSSSSSSHHK.......',
        '......KSKSEWSSWESKSK......',
        '......KSKSSSSSSSSKSK......',
        '.......KKSSSMMSSSSKK......',
        '........KssssssssK........',
        '........KKKKKKKKKK........',
        '.......KK222SS222KK.......'
      ]
    : [
        '.........KKKKKKKK.........',
        '........KHHHHHHHHK........',
        '.......KHHHHHHHHHHK.......',
        '.......KHHHHHHHHHHK.......',
        '......KSKHHHHHHHHKSK......',
        '......KSKHHHHHHHHKSK......',
        '.......KKHHHHHHHHKK.......',
        '........KSSSSSSSSK........',
        '........KKKKKKKKKK........',
        '.......KK22222222KK.......'
      ];

  const neckRow = isFront ? '.....KK11122SS22111KK.....' : '.....KK111111111111KK.....';
  const vRow = isFront ? '...K112211112211112211K...' : '...K112211111111112211K...';
  const ballRight = pose === 'idle' || pose === 'runLeft' || pose === 'straightL';

  if (ballRight) {
    return [
      ...head,
      ...(hasBall
        ? [
            neckRow,
            '....K1122222222222211K....',
            vRow,
            '..KK221111111111111122KK..',
            '.KSSK1112222222222111KSSK.',
            '.KSSK111222222222211KKKKK.',
            '.KSSK11111111111111KwwGSSK',
            '.KssK11122222222221KwwGSSK',
            '..KKK11122222222221KwwwKK.',
            '....K11111111111111KGGwK..',
            '....KKKKKKKKKKKKKKKKKKKK..'
          ]
        : [
            neckRow,
            '....K1122222222222211K....',
            vRow,
            '..KK221111111111111122KK..',
            '.KSSK1112222222222111KSSK.',
            '.KSSK1112222222222111KSSK.',
            '.KSSK1111111111111111KssK.',
            '.KssK1112222222222111KKK..',
            '..KKK1112222222222111K....',
            '....K1111111111111111K....',
            '....KKKKKKKKKKKKKKKKKK....'
          ])
    ];
  }

  return [
    ...head,
    ...(hasBall
      ? [
          neckRow,
          '....K1122222222222211K....',
          vRow,
          '..KK221111111111111122KK..',
          '.KSSK1112222222222111KSSK.',
          '.KKKKK112222222222111KSSK.',
          'KSSGwwK11111111111111KSSK.',
          'KSSGwwK12222222222111KssK.',
          '.KKwwwK12222222222111KKK..',
          '..KwGGK11111111111111K....',
          '..KKKKKKKKKKKKKKKKKKKK....'
        ]
      : [
          neckRow,
          '....K1122222222222211K....',
          vRow,
          '..KK221111111111111122KK..',
          '.KSSK1112222222222111KSSK.',
          '.KSSK1112222222222111KSSK.',
          '.KssK1111111111111111KSSK.',
          '..KKK1112222222222111KssK.',
          '....K1112222222222111KKK..',
          '....K1111111111111111K....',
          '....KKKKKKKKKKKKKKKKKK....'
        ])
  ];
}

function buildLowerBodyRows(pose, facing = 'back') {
  const isFront = facing === 'front';
  if (pose === 'idle') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      isFront ? '....KSssSK......KSssSK....' : '....KSSSSK......KSSSSK....',
      '....KssssK......KssssK....',
      '....KWWWWK......KWWWWK....',
      '....K1111K......K1111K....',
      '....KNNNNK......KNNNNK....',
      '....KNNNNK......KNNNNK....',
      isFront ? '...KBBbbBK......KBbbBBK...' : '..KKBBbBBK......KBBbBBKK..',
      isFront ? '...KBBBBBK......KBBBBBK...' : '.KBBBBBBBK......KBBBBBBBK.',
      isFront ? '...KKKKKKK......KKKKKKK...' : '.KKKKKKKKK......KKKKKKKKK.',
      isFront ? '....K.K.K........K.K.K....' : '..K.K.K.K........K.K.K.K..'
    ];
  }
  if (pose === 'straightL') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      isFront ? '....KSssSK......KssssK....' : '....KSSSSK......KssssK....',
      '....KssssK......KWWWWK....',
      '....KWWWWK......K1111K....',
      '....K1111K......KNNNNK....',
      '....KNNNNK......KBBbBK....',
      '....KNNNNK......KBBBBK....',
      isFront ? '....KbbBBK......KKKKKK....' : '....KBBbBK......KKKKKK....',
      '....KBBBBK.......K..K.....',
      '....KKKKKK................',
      '.....K..K.................'
    ];
  }
  if (pose === 'straightR') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK......KSSSSK....',
      isFront ? '....KssssK......KSssSK....' : '....KssssK......KSSSSK....',
      '....KWWWWK......KssssK....',
      '....K1111K......KWWWWK....',
      '....KNNNNK......K1111K....',
      '....KBBbBK......KNNNNK....',
      '....KBBBBK......KNNNNK....',
      isFront ? '....KKKKKK......KbbBBK....' : '....KKKKKK......KBBbBK....',
      '.....K..K.......KBBBBK....',
      '................KKKKKK....',
      '.................K..K.....'
    ];
  }
  if (pose === 'runLeft') {
    return [
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNNNNNNNNNNK....',
      '....KWNNNNNNKKNNNNNNNK....',
      '....KKKKKKKK..KKKKKKKK....',
      '....KSSSSK.....KSSSSK.....',
      '....KSssSK......KSSSSK....',
      '....KssssK.......KsssKK...',
      '....KWWWWK........KWW11K..',
      '....K1111K.........K1NNK..',
      '....KNNNNK..........KNNBK.',
      '....KNNNNK..........KBBBK.',
      '..KKBBbBBK..........KbBBK.',
      '.KBBBBBBBK...........KKKK.',
      '.KKKKKKKKK................',
      '..K.K.K.K.................'
    ];
  }
  return [
    '....KWNNNNNNNNNNNNNNNK....',
    '....KWNNNNNNNNNNNNNNNK....',
    '....KWNNNNNNKKNNNNNNNK....',
    '....KKKKKKKK..KKKKKKKK....',
    '.....KSSSSK.....KSSSSK....',
    '....KSSSSK......KSssSK....',
    '...KKsssK.......KssssK....',
    '..K11WWK........KWWWWK....',
    '..KNN1K.........K1111K....',
    '.KBNNK..........KNNNNK....',
    '.KBBBK..........KNNNNK....',
    '.KBBbK..........KBBbBBKK..',
    '.KKKK...........KBBBBBBBK.',
    '................KKKKKKKKK.',
    '.................K.K.K.K..'
  ];
}

function buildDiveBackRows() {
  return [
    '..............................KKKKKK........',
    '....KKK......................KHHHHHHK.......',
    '...KBBbK.....................KHHHHHHHK......',
    '..KBBBB1K....................KHHHHHHHK......',
    '..KKKK111K..........KKKKKKK..KHHHHHHK.......',
    '......K111K.......KK1122111KKKHHHHKK........',
    '.......K11WK.....K112211122111KKKK..........',
    '........KWWSSK..KWWW1112211122111K..........',
    '.........KSSSSKKWWWW11221112211122K.........',
    '..KKK.....KssSKWWWWW11122111221111K.........',
    '.KBBbK.....KKKKWWWWW1112211122111KKSSK.......',
    '.KBBBB1111WKKKWWWWWW1111111111KKssSSSK......',
    '.KKKK11111WSSSSSSSSWKKKKKKKKKK..KsssSSK.....',
    '.....KNN11WSSSSSSSSWK...........KKKSSSSKKK..',
    '......KKKKKKssssssKK...............KSSSSRRKK',
    '............KKKKKK..................KSSSRwwR',
    '.....................................KKKRwwR',
    '.......................................KRwRR',
    '.......................................KRRRK',
    '........................................KKKK'
  ];
}

function buildDiveFrontRows() {
  return [
    '......KKKK....................KKKKKK........',
    '.....K11bBK..................KrrrrrrK.......',
    '....K111BBBK................KrrrrrrrrK......',
    '....KKKK1111K...............KrrSSSSrrK......',
    '........K1111K....KKKKKKK...KrSSEKSSrK......',
    '.........K11WWK.KK1122111KK.KrSSSSSSSK......',
    '..........KWWSSK11221112211KKsSSWWSSsK......',
    '...........KSSSSWW111221112211KssssKK.......',
    '..KKKK......KssSWWWW11221112211KKKK.........',
    '.K11bBK.....KKKKWWWW1112211112211K..........',
    '.K111BB111WKK..KWWWW1122111222211K..........',
    '.KKKK11111WSSSSSWWWW1111111111KSSSK.........',
    '.....KNN11WSSSSSSSSWKKKKKKKKKKKSSSSKK.......',
    '......KKKKKKssssssKK..........KssSSSSKKK....',
    '............KKKKKK.............KKKSSSSSSKKK.',
    '..................................KSSSS1wwwK',
    '...................................KKKK1www1',
    '......................................K1ww1K',
    '......................................K111K.',
    '.......................................KKKK.'
  ];
}

const spriteCache = new Map();

export function getPixelSprite(team, noteLetter, pose, hasBall, facing = 'back') {
  const key = `${team.id}|${noteLetter}|${pose}|${hasBall ? 1 : 0}|${facing}`;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const isDive = pose === 'diveBack' || pose === 'diveFront';
  let rows;
  if (pose === 'diveBack') {
    rows = buildDiveBackRows();
  } else if (pose === 'diveFront') {
    rows = buildDiveFrontRows();
  } else {
    rows = [
      ...buildUpperBodyRows(pose, hasBall, facing),
      ...buildLowerBodyRows(pose, facing)
    ];
  }

  const h = rows.length;
  const w = rows[0].length;
  const grid = rows.map((r) => r.split(''));

  const glyph = PIXEL_FONT_5X7[noteLetter] || PIXEL_FONT_5X7.C;
  const startRow = isDive ? 6 : (facing === 'front' ? 13 : 12);
  const startCol = isDive ? 22 : 11;

  for (let r = 0; r < glyph.length; r++) {
    for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const rr = startRow + r + dr;
            const cc = startCol + c + dc;
            if (grid[rr] && grid[rr][cc] && grid[rr][cc] !== '.') {
              grid[rr][cc] = 'K';
            }
          }
        }
      }
    }
  }
  for (let r = 0; r < glyph.length; r++) {
    for (let c = 0; c < glyph[r].length; c++) {
      if (glyph[r][c] === '1' && grid[startRow + r] && grid[startRow + r][startCol + c]) {
        grid[startRow + r][startCol + c] = 'W';
      }
    }
  }

  const palette = {
    K: '#09090b',
    H: '#1c1917',
    r: '#451a03',
    R: '#92400e',
    E: '#09090b',
    M: '#9a5b3c',
    S: '#eba87c',
    s: '#c98257',
    '1': team.primary,
    '2': team.secondary,
    N: '#111827',
    n: '#334155',
    W: '#ffffff',
    B: '#475569',
    b: '#94a3b8',
    G: '#15803d',
    w: '#f8fafc'
  };

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = grid[y][x];
      if (ch === '.' || !palette[ch]) continue;
      octx.fillStyle = palette[ch];
      octx.fillRect(x, y, 1, 1);
    }
  }

  spriteCache.set(key, off);
  return off;
}
