import Player, { ELEMENT_TYPES } from './Player.js';

const GRID_COLUMNS = 47;
const GRID_ROWS = 30;
const TILE_SIZE = 20;
const WORLD_WIDTH = GRID_COLUMNS * TILE_SIZE;
const WORLD_HEIGHT = GRID_ROWS * TILE_SIZE;

// Все карты записаны одинаково: # — твёрдая поверхность, . — пустое пространство, M — место подвижного камня (его физика задаётся отдельно).
const LEVEL_GRID = [
  "###.........................................###",
  "###.........................................###",
  "###.........................................###",
  "###........####################################",
  "###.........#######........MM...............###",
  "###..........######........MM...............###",
  "########...............###############......###",
  "########...............###############......###",
  "########################.............###....###",
  "###.........................................###",
  "###.........................................###",
  "###.........................................###",
  "###............#######......................###",
  "###....########......###....................###",
  "###....................########################",
  "###.....................................#######",
  "###......................................######",
  "###.......................................#####",
  "###.........................................###",
  "########################....................###",
  "######################################......###",
  "###...................################......###",
  "###.........................................###",
  "###.........................................###",
  "###....................................########",
  "###....................................########",
  "###....................................########",
  "###....................................########",
  "###############################################",
  "###############################################",
];

const LEVEL_TWO_GRID = [
  "...............................................",
  "...............................................",
  "....................................###########",
  "...............................................",
  "...............................................",
  "...............................................",
  // Вырез под лифтом: оставлен достаточный вертикальный просвет для персонажа.
  "..........######....###########................",
  "..........................................#####",
  "..........................................#####",
  "......................................#########",
  "...............................................",
  "###########....................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  "...............................................",
  ".................######...............###......",
  "...............................................",
  "...............................................",
  "...............................................",
  "..........................................#####",
  "..........................................#####",
  "..........................................#####",
  "..........................................#####",
  "############.........#######.......############",
];

// Карта уровня 3 в том же формате, что и остальные уровни: # — платформа, . — пустая клетка.
const LEVEL_THREE_GRID = [
  "##################################################",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#......###############....#....#....##############",
  "#......###########################################",
  "#................................................#",
  "#....##..........................................#",
  "#................................................#",
  "#...##...........................................#",
  "###..............................................#",
  "###..............................................#",
  "#................................................#",
  "####################.................#....#....###",
  "##################################################",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#................................................#",
  "#....................................#############",
  "#................................................#",
  "#...............................##...............#",
  "#................................................#",
  "#................................................#",
  "#.........................##.....................#",
  "#................................................#",
  "#................................................#",
  "#...................##...........................#",
  "#................................................#",
  "#................................................#",
  "#####.###########................................#",
  "##################################################",
];
function buildTerrainPlatforms(grid = LEVEL_GRID) {
  // Склеиваем одинаковые соседние ряды в цельные прямоугольники столкновений.
  const finished = [];
  let active = new Map();
  for (let row = 0; row < grid.length; row += 1) {
    const cells = grid[row];
    const runs = [];
    let col = 0;
    while (col < cells.length) {
      const material = cells[col];
      if (material !== '#' && material !== 'X') { col += 1; continue; }
      const start = col;
      while (col < cells.length && cells[col] === material) col += 1;
      runs.push({ start, end: col, material });
    }
    const next = new Map();
    for (const run of runs) {
      const key = `${run.start}:${run.end}:${run.material}`;
      let rect = active.get(key);
      if (rect) rect.height += TILE_SIZE;
      else rect = {
        id: `terrain-${row}-${run.start}-${run.end}`,
        x: run.start * TILE_SIZE,
        y: row * TILE_SIZE,
        width: (run.end - run.start) * TILE_SIZE,
        height: TILE_SIZE,
        type: 'terrain',
        material: run.material,
      };
      next.set(key, rect);
    }
    for (const [key, rect] of active) if (!next.has(key)) finished.push(rect);
    active = next;
  }
  finished.push(...active.values());
  return finished;
}


export default class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = input;
    this.width = WORLD_WIDTH;
    this.height = WORLD_HEIGHT;
    this.running = false;
    this.lastTimestamp = null;
    this.animationFrameId = null;

    // Базовый уровень привязан к сетке схемы: 47 колонок × 30 рядов.
    this.boundaryInset = 60;
    this.levelGrid = LEVEL_GRID;
    this.platforms = buildTerrainPlatforms(this.levelGrid);

    // Фиолетовые кнопки нужно удерживать персонажем, чтобы соответствующий лифт двигался.
    this.buttons = [
      { id: 'button-one', x: 200, y: 240, width: 40, height: 20, mode: 'pressure', requiredType: null, pressed: false, activated: false, compression: 0 },
      { id: 'button-two', x: 760, y: 140, width: 40, height: 20, mode: 'pressure', requiredType: null, pressed: false, activated: false, compression: 0 },
    ];
    this.buttonPlatforms = this.buttons.map((button) => ({
      id: `${button.id}-platform`, x: button.x, y: button.y,
      width: button.width, height: button.height, type: 'button-platform', buttonId: button.id,
    }));
    this.platforms.push(...this.buttonPlatforms);

    this.platforms.push(
      {
        id: 'white-lift-one', x: 60, y: 240, width: 80, height: 20,
        type: 'moving-platform', role: 'white-lift', restY: 240, targetY: 240,
        activatedY: 340, speed: 115, enabled: false, activation: 'button-one',
      },
      {
        id: 'purple-lift-two', x: 800, y: 160, width: 80, height: 20,
        type: 'moving-platform', role: 'purple-lift', restY: 160, targetY: 160,
        activatedY: 240, speed: 105, enabled: false, activation: 'button-two',
      },
    );
    this.movingPlatforms = this.platforms.filter((platform) => platform.type === 'moving-platform');

    // Жёлтый рычаг расположен в клетках 11–12, ряды 16–17; он разблокирует белый лифт.
    this.levers = [
      { id: 'lever-one', x: 220, y: 340, width: 20, height: 40, requiredType: null, activated: false, action: 'unlock-left-lift' },
    ];
    this.mechanismsUnlocked = false;
    this.masterConveyorActive = false;
    this.interactionConsumed = false;
    this.gates = [];

    // Подвижный камень отмечен символом M в LEVEL_GRID (клетки 27–28, ряды 4–5).
    // Он имеет физическую коллизию, падает под действием гравитации,
    // любой персонаж может толкать его в стороны.
    this.pushableRock = {
      x: 27 * TILE_SIZE, y: 4 * TILE_SIZE, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE,
      vx: 0, vy: 0, grounded: false,
      startX: 27 * TILE_SIZE, startY: 4 * TILE_SIZE,
    };

    this.zones = [
      { id: 'lava', name: 'лава', x: 360, y: 560, width: 120, height: 20, surfaceY: 560, depth: 20, color: '#ed5959', safeFor: ['FIRE'] },
      { id: 'water', name: 'вода', x: 560, y: 560, width: 120, height: 20, surfaceY: 560, depth: 20, color: '#41a6d8', safeFor: ['WATER'] },
      { id: 'acid', name: 'кислота', x: 560, y: 400, width: 120, height: 20, surfaceY: 400, depth: 20, color: '#8dd841', safeFor: ['EARTH'] },
    ];

    this.collectibles = [
      { id: 'air-star', type: 'AIR', x: 80, y: 80, size: 20, collected: false },
      { id: 'earth-star', type: 'EARTH', x: 610, y: 340, size: 20, collected: false },
      { id: 'fire-star', type: 'FIRE', x: 410, y: 520, size: 20, collected: false },
      { id: 'water-star', type: 'WATER', x: 610, y: 520, size: 20, collected: false },
    ];
    this.score = 0;
    this.bestScoreStorageKey = 'elementalPlatformerBestScore';
    this.bestScore = this.loadBestScore();
    this.resumeAfterVisibility = false;

    // У каждого персонажа свой набор клавиш и собственный финиш.
    this.players = [
      new Player({ type: 'FIRE',  x: 100, y: 528, width: 18, height: 32, speed: 220, jumpStrength: 340, gravity: 650 }),
      new Player({ type: 'WATER', x: 140, y: 528, width: 18, height: 32, speed: 220, jumpStrength: 340, gravity: 650 }),
      new Player({ type: 'EARTH', x: 180, y: 528, width: 18, height: 32, speed: 220, jumpStrength: 340, gravity: 650 }),
      new Player({ type: 'AIR',   x: 220, y: 528, width: 18, height: 32, speed: 220, jumpStrength: 340, gravity: 650 }),
    ];
    this.player = this.players[0]; // Совместимость с существующим интерфейсом.

    this.finishes = [
      { type: 'FIRE',  x: 648, y: 10, width: 44, height: 46 },
      { type: 'WATER', x: 698, y: 10, width: 44, height: 46 },
      { type: 'EARTH', x: 750, y: 10, width: 44, height: 46 },
      { type: 'AIR',   x: 800, y: 10, width: 44, height: 46 },
    ];
    this.gameState = 'ready'; // ready | playing | paused | victory | defeat
    this.messageElement = null;
    this.scoreElement = null;
    this.collectiblesElement = null;
    this.starsPreviewElement = null;
    this.resultOverlayElement = null;
    this.resultTitleElement = null;
    this.resultDescriptionElement = null;
    this.resultScoreElement = null;
    this.resultStarsElement = null;
    this.resultStarsCountElement = null;
    this.statusText = 'Соберите четыре звезды, используйте лифты и доведите каждую стихию до своего выхода.';
    this.elapsedSeconds = 0;
    this.particles = [];
    // Внешние аудио-эффекты и кампания подключаются из main.js.
    this.audioManager = null;
    this.onResult = null;

    this.stars = Array.from({ length: 54 }, (_, index) => ({
      x: (index * 167 + 31) % WORLD_WIDTH,
      y: (index * 73 + 19) % 420,
      radius: index % 7 === 0 ? 1.7 : 0.8 + (index % 3) * 0.25,
      alpha: 0.18 + (index % 5) * 0.09,
    }));

    this.loop = this.loop.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    // Canvas вписывается в рамку с сохранением пропорций текущей карты.
    this.resizeObserver.observe(this.canvas.parentElement ?? this.canvas);
    this.resizeCanvas();

    // Исходный уровень сохраняется отдельно: переключение на уровень 2
    // не изменяет выверенную геометрию первого.
    this.levelId = 1;
    this.playerStarts = this.players.map((player) => ({ x: player.resetPosition.x, y: player.resetPosition.y }));
    this.levelPresets = { 1: this.captureLevelConfig() };
  }

  cloneLevelData(value) {
    return JSON.parse(JSON.stringify(value));
  }

  captureLevelConfig() {
    return this.cloneLevelData({
      grid: this.levelGrid,
      width: this.width,
      height: this.height,
      boundaryInset: this.boundaryInset,
      platforms: this.platforms,
      buttons: this.buttons,
      levers: this.levers,
      gates: this.gates,
      zones: this.zones,
      collectibles: this.collectibles,
      pushableRock: this.pushableRock,
      finishes: this.finishes,
      playerStarts: this.players.map((player) => ({ x: player.resetPosition.x, y: player.resetPosition.y })),
      statusText: this.statusText,
    });
  }

  createLevelTwoConfig() {
    const grid = LEVEL_TWO_GRID;
    const buttons = [
      // Воздух удерживает бирюзовую плиту: лифт слева опускается.
      { id: 'button-air', x: 44 * TILE_SIZE, y: 6 * TILE_SIZE, width: 2 * TILE_SIZE, height: TILE_SIZE,
        mode: 'pressure', requiredType: 'AIR', accent: '#44e6c0', bright: '#c9fff3', dark: '#126f67', border: '#a5fff0',
        pressed: false, activated: false, compression: 0 },
      // Вода удерживает плиту на среднем мосту, опуская синий лифт к нижнему маршруту.
      { id: 'button-water', x: 18 * TILE_SIZE, y: 18 * TILE_SIZE, width: 2 * TILE_SIZE, height: TILE_SIZE,
        mode: 'pressure', requiredType: 'WATER', accent: '#49748e', bright: '#c1e9ff', dark: '#1b4258', border: '#a4d8f1',
        pressed: false, activated: false, compression: 0 },
      // Огонь включает красный лифт с безопасного островка между лавой и водой.
      { id: 'button-fire', x: 23 * TILE_SIZE, y: 26 * TILE_SIZE, width: 2 * TILE_SIZE, height: TILE_SIZE,
        mode: 'pressure', requiredType: 'FIRE', accent: '#e53c3c', bright: '#ffc2c2', dark: '#7d252b', border: '#ff8b8b',
        pressed: false, activated: false, compression: 0 },
      // Земля удерживает зелёную плиту, убирая стену на дальнем левом пути.
      { id: 'button-earth', x: 44 * TILE_SIZE, y: 22 * TILE_SIZE, width: 2 * TILE_SIZE, height: TILE_SIZE,
        mode: 'pressure', requiredType: 'EARTH', accent: '#5b9952', bright: '#d7ffb7', dark: '#2b5f32', border: '#a5dc8e',
        pressed: false, activated: false, compression: 0 },
      // Камень должен полностью лечь на серую плиту, чтобы опустить вертикальный лифт.
      { id: 'button-stone', x: 1 * TILE_SIZE, y: 10 * TILE_SIZE, width: 2 * TILE_SIZE, height: TILE_SIZE,
        mode: 'pressure', rockOnly: true, allowRock: true, accent: '#7b7b7b', bright: '#e1e1e1', dark: '#44484e', border: '#bdbdbd',
        pressed: false, activated: false, compression: 0 },
    ];

    const buttonPlatforms = buttons.map((button) => ({
      id: `${button.id}-platform`, x: button.x, y: button.y,
      width: button.width, height: button.height, type: 'button-platform', buttonId: button.id,
    }));

    const lifts = [
      {
        // Бирюзовый лифт: единственная видимая стартовая позиция — верхняя;
        // при удержании кнопки он опускается на уровень нижней метки со схемы.
        id: 'air-lift', x: 16 * TILE_SIZE, y: 7 * TILE_SIZE, width: 4 * TILE_SIZE, height: TILE_SIZE,
        type: 'moving-platform', role: 'air-lift', accent: '#44e6c0', bright: '#c9fff3', dark: '#126f67',
        restY: 7 * TILE_SIZE, targetY: 7 * TILE_SIZE, activatedY: 12 * TILE_SIZE,
        speed: 90, enabled: false, activation: 'button:button-air', solidWhenRest: true,
      },
      {
        // Синий лифт опускается к нижнему ярусу, пока Вода удерживает кнопку.
        id: 'water-lift', x: 26 * TILE_SIZE, y: 14 * TILE_SIZE, width: 4 * TILE_SIZE, height: TILE_SIZE,
        type: 'moving-platform', role: 'water-lift', accent: '#49748e', bright: '#c1e9ff', dark: '#1b4258',
        restY: 14 * TILE_SIZE, targetY: 14 * TILE_SIZE, activatedY: 24 * TILE_SIZE,
        speed: 90, enabled: false, activation: 'button:button-water', solidWhenRest: true,
      },
      {
        // Красный лифт опускается к островку над лавой при удержании красной кнопки.
        id: 'fire-lift', x: 13 * TILE_SIZE, y: 19 * TILE_SIZE, width: 4 * TILE_SIZE, height: TILE_SIZE,
        type: 'moving-platform', role: 'fire-lift', accent: '#a24b4b', bright: '#ffd0d0', dark: '#68252b',
        restY: 19 * TILE_SIZE, targetY: 19 * TILE_SIZE, activatedY: 24 * TILE_SIZE,
        speed: 75, enabled: false, activation: 'button:button-fire', solidWhenRest: true,
      },
      {
        // Жёлтый лифт начинает снизу и поднимается к платформе у выходов после рычага.
        id: 'yellow-lift', x: 33 * TILE_SIZE, y: 16 * TILE_SIZE, width: 3 * TILE_SIZE, height: TILE_SIZE,
        type: 'moving-platform', role: 'yellow-lift', accent: '#caaf43', bright: '#fff0ad', dark: '#66531a',
        restY: 16 * TILE_SIZE, targetY: 16 * TILE_SIZE, activatedY: 2 * TILE_SIZE,
        speed: 95, enabled: false, activation: 'lever:lever-yellow', solidWhenRest: true,
      },
      {
        // Серый вертикальный подъёмник перемещается вниз по шахте;
        // длинный путь из схемы не рисуется — отображается только сам подвижный блок.
        id: 'gray-vertical-lift', x: 31 * TILE_SIZE, y: 0, width: TILE_SIZE, height: 11 * TILE_SIZE,
        type: 'moving-platform', role: 'gray-lift', accent: '#7b7b7b', bright: '#dedede', dark: '#45484d',
        restY: 0, targetY: 0, activatedY: 17 * TILE_SIZE,
        speed: 95, enabled: false, activation: 'button:button-stone', solidWhenRest: true,
      },
    ];

    const finishes = [
      { type: 'FIRE',  x: 36 * TILE_SIZE, y: 0, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE },
      { type: 'WATER', x: 39 * TILE_SIZE, y: 0, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE },
      { type: 'EARTH', x: 42 * TILE_SIZE, y: 0, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE },
      { type: 'AIR',   x: 45 * TILE_SIZE, y: 0, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE },
    ];

    return {
      grid,
      width: grid[0].length * TILE_SIZE,
      height: grid.length * TILE_SIZE,
      boundaryInset: 0,
      platforms: [...buildTerrainPlatforms(grid), ...buttonPlatforms, ...lifts],
      buttons,
      levers: [
        { id: 'lever-yellow', x: 24 * TILE_SIZE, y: 4 * TILE_SIZE, width: TILE_SIZE, height: 2 * TILE_SIZE,
          requiredType: null, activated: false, action: 'raise-yellow-lift' },
      ],
      gates: [
        { id: 'green-wall', kind: 'green-wall', x: 12 * TILE_SIZE, y: 7 * TILE_SIZE,
          width: TILE_SIZE, height: 6 * TILE_SIZE, open: false, activationButtonId: 'button-earth', requiredForVictory: false },
      ],
      zones: [
        { id: 'lava', name: 'лава', kind: 'lava', x: 12 * TILE_SIZE, y: 27 * TILE_SIZE,
          width: 9 * TILE_SIZE, surfaceY: 27 * TILE_SIZE, depth: TILE_SIZE, color: '#e53c3c', safeFor: ['FIRE'] },
        { id: 'water', name: 'вода', kind: 'water', x: 28 * TILE_SIZE, y: 27 * TILE_SIZE,
          width: 7 * TILE_SIZE, surfaceY: 27 * TILE_SIZE, depth: TILE_SIZE, color: '#4fb0df', safeFor: ['WATER'] },
      ],
      collectibles: [
        { id: 'air-star', type: 'AIR', x: 20 * TILE_SIZE - 10, y: 5 * TILE_SIZE - 10, size: TILE_SIZE, collected: false },
        { id: 'earth-star', type: 'EARTH', x: 28 * TILE_SIZE - 10, y: 13 * TILE_SIZE - 10, size: TILE_SIZE, collected: false },
        { id: 'fire-star', type: 'FIRE', x: 18 * TILE_SIZE + 2, y: 25 * TILE_SIZE - 10, size: TILE_SIZE, collected: false },
        { id: 'water-star', type: 'WATER', x: 31 * TILE_SIZE + 2, y: 25 * TILE_SIZE - 10, size: TILE_SIZE, collected: false },
      ],
      pushableRock: {
        x: 13 * TILE_SIZE, y: 4 * TILE_SIZE, width: 2 * TILE_SIZE, height: 2 * TILE_SIZE,
        vx: 0, vy: 0, grounded: false, startX: 13 * TILE_SIZE, startY: 4 * TILE_SIZE,
      },
      finishes,
      playerStarts: [
        { x: 2 * TILE_SIZE, y: 27 * TILE_SIZE - 32 },   // Огонь: левый берег перед лавой.
        { x: 22 * TILE_SIZE, y: 27 * TILE_SIZE - 32 },  // Вода: центральный островок.
        { x: 37 * TILE_SIZE, y: 27 * TILE_SIZE - 32 },  // Земля: правый берег.
        { x: 40 * TILE_SIZE, y: 27 * TILE_SIZE - 32 },  // Воздух: правый берег.
      ],
      statusText: 'Уровень 2: толкните камень на серую плиту, удерживайте цветные кнопки стихиями своего цвета и используйте жёлтый рычаг, чтобы поднять лифт к выходам.',
    };
  }


  createLevelThreeConfig() {
    const grid = LEVEL_THREE_GRID;
    // Объекты уровня хранятся отдельно от карты; карта использует только # и ..
    const buttons = [
      {
            "id": "button-a-13-3",
            "symbol": "a",
            "x": 60,
            "y": 260,
            "width": 20,
            "height": 20,
            "mode": "pressure",
            "requiredType": null,
            "allowedTypes": [
                  "FIRE",
                  "AIR"
            ],
            "barrierSymbols": [
                  "s",
                  "d"
            ],
            "accent": "#ff754f",
            "bright": "#ffe19a",
            "dark": "#8c3027",
            "border": "#ffd09b",
            "pressed": false,
            "activated": false,
            "compression": 0
      },
      {
            "id": "button-z-15-48",
            "symbol": "z",
            "x": 960,
            "y": 300,
            "width": 20,
            "height": 20,
            "mode": "pressure",
            "requiredType": null,
            "allowedTypes": [
                  "FIRE",
                  "WATER"
            ],
            "barrierSymbols": [
                  "x",
                  "c"
            ],
            "accent": "#c65cff",
            "bright": "#f2bdff",
            "dark": "#672c78",
            "border": "#e6a0f3",
            "pressed": false,
            "activated": false,
            "compression": 0
      },
      {
            "id": "button-q-33-5",
            "symbol": "q",
            "x": 100,
            "y": 660,
            "width": 20,
            "height": 20,
            "mode": "pressure",
            "requiredType": null,
            "allowedTypes": [
                  "WATER"
            ],
            "barrierSymbols": [
                  "w",
                  "e"
            ],
            "accent": "#4bc7f0",
            "bright": "#d1ffff",
            "dark": "#174fbd",
            "border": "#a6f1ff",
            "pressed": false,
            "activated": false,
            "compression": 0
      }
];
    const buttonPlatforms = buttons.map((button) => ({
      id: `${button.id}-platform`, x: button.x, y: button.y,
      width: button.width, height: button.height, type: 'button-platform', buttonId: button.id,
    }));
    const gates = [
      {
            "id": "gate-w-4-7",
            "symbol": "w",
            "switchSymbol": "q",
            "x": 140,
            "y": 80,
            "width": 20,
            "height": 60,
            "open": false,
            "activationButtonId": "button-q-33-5"
      },
      {
            "id": "gate-e-9-1",
            "symbol": "e",
            "switchSymbol": "q",
            "x": 20,
            "y": 180,
            "width": 60,
            "height": 20,
            "open": false,
            "activationButtonId": "button-q-33-5"
      },
      {
            "id": "gate-d-15-24",
            "symbol": "d",
            "switchSymbol": "a",
            "x": 480,
            "y": 300,
            "width": 60,
            "height": 20,
            "open": false,
            "activationButtonId": "button-a-13-3"
      },
      {
            "id": "gate-d-15-31",
            "symbol": "d",
            "switchSymbol": "a",
            "x": 620,
            "y": 300,
            "width": 60,
            "height": 20,
            "open": false,
            "activationButtonId": "button-a-13-3"
      },
      {
            "id": "gate-x-19-37",
            "symbol": "x",
            "switchSymbol": "z",
            "x": 740,
            "y": 380,
            "width": 20,
            "height": 60,
            "open": false,
            "activationButtonId": "button-z-15-48"
      }
];
    const zones = [
      {
            "id": "acid-7-22",
            "name": "кислота",
            "x": 440,
            "y": 140,
            "width": 80,
            "height": 20,
            "kind": "acid",
            "surfaceY": 140,
            "depth": 20,
            "color": "#8dd841",
            "safeFor": [
                  "EARTH"
            ]
      },
      {
            "id": "lava-7-27",
            "name": "лава",
            "x": 540,
            "y": 140,
            "width": 80,
            "height": 20,
            "kind": "lava",
            "surfaceY": 140,
            "depth": 20,
            "color": "#ed5959",
            "safeFor": [
                  "FIRE"
            ]
      },
      {
            "id": "acid-7-32",
            "name": "кислота",
            "x": 640,
            "y": 140,
            "width": 80,
            "height": 20,
            "kind": "acid",
            "surfaceY": 140,
            "depth": 20,
            "color": "#8dd841",
            "safeFor": [
                  "EARTH"
            ]
      },
      {
            "id": "lava-16-20",
            "name": "лава",
            "x": 400,
            "y": 320,
            "width": 340,
            "height": 20,
            "kind": "lava",
            "surfaceY": 320,
            "depth": 20,
            "color": "#ed5959",
            "safeFor": [
                  "FIRE"
            ]
      },
      {
            "id": "water-16-38",
            "name": "вода",
            "x": 760,
            "y": 320,
            "width": 80,
            "height": 20,
            "kind": "water",
            "surfaceY": 320,
            "depth": 20,
            "color": "#41a6d8",
            "safeFor": [
                  "WATER"
            ]
      },
      {
            "id": "acid-16-43",
            "name": "кислота",
            "x": 860,
            "y": 320,
            "width": 80,
            "height": 20,
            "kind": "acid",
            "surfaceY": 320,
            "depth": 20,
            "color": "#8dd841",
            "safeFor": [
                  "EARTH"
            ]
      },
      {
            "id": "water-33-17",
            "name": "вода",
            "x": 340,
            "y": 660,
            "width": 640,
            "height": 20,
            "kind": "water",
            "surfaceY": 660,
            "depth": 20,
            "color": "#41a6d8",
            "safeFor": [
                  "WATER"
            ]
      }
];
    return {
      grid,
      width: grid[0].length * TILE_SIZE,
      height: grid.length * TILE_SIZE,
      boundaryInset: 0,
      platforms: [...buildTerrainPlatforms(grid), ...buttonPlatforms],
      buttons,
      levers: [],
      gates,
      zones,
      collectibles: [
        { id: 'fire-star', type: 'FIRE', x: 360, y: 560, size: 20, collected: false },
        { id: 'water-star', type: 'WATER', x: 720, y: 560, size: 20, collected: false },
        { id: 'earth-star', type: 'EARTH', x: 400, y: 260, size: 20, collected: false },
        { id: 'air-star', type: 'AIR', x: 700, y: 100, size: 20, collected: false },
      ],
      pushableRock: { x: 0, y: 0, width: 0, height: 0, vx: 0, vy: 0, grounded: false, startX: 0, startY: 0 },
      finishes: [
      {
            "type": "AIR",
            "x": 700,
            "y": 80,
            "width": 40,
            "height": 60
      },
      {
            "type": "FIRE",
            "x": 860,
            "y": 80,
            "width": 40,
            "height": 60
      },
      {
            "type": "EARTH",
            "x": 360,
            "y": 280,
            "width": 40,
            "height": 60
      },
      {
            "type": "WATER",
            "x": 20,
            "y": 600,
            "width": 40,
            "height": 60
      }
],
      playerStarts: [
      {
            "x": 200,
            "y": 262
      },
      {
            "x": 300,
            "y": 602
      },
      {
            "x": 100,
            "y": 262
      },
      {
            "x": 300,
            "y": 262
      }
],
      statusText: 'Уровень 3: используйте цветные кнопки, чтобы открывать проходы, и проведите каждую стихию к своему выходу.',
    };
  }


  applyLevelConfig(config) {
    const data = this.cloneLevelData(config);
    this.levelGrid = data.grid;
    this.width = data.width;
    this.height = data.height;
    this.boundaryInset = data.boundaryInset;
    this.platforms = data.platforms;
    this.buttons = data.buttons;
    this.buttonPlatforms = this.platforms.filter((platform) => platform.type === 'button-platform');
    this.movingPlatforms = this.platforms.filter((platform) => platform.type === 'moving-platform');
    this.levers = data.levers;
    this.gates = data.gates;
    this.zones = data.zones;
    this.collectibles = data.collectibles;
    this.pushableRock = data.pushableRock;
    this.finishes = data.finishes;
    this.playerStarts = data.playerStarts;
    this.players.forEach((player, index) => {
      player.resetPosition = { ...this.playerStarts[index] };
    });
    this.statusText = data.statusText;
    this.mechanismsUnlocked = false;
    this.masterConveyorActive = false;
    this.interactionConsumed = false;
  }

  setLevel(levelId) {
    const numericId = Number(levelId);
    if (![1, 2, 3].includes(numericId)) return false;

    // Переключение всегда останавливает старый цикл и начинает выбранную
    // карту с чистого состояния — игроки не остаются на координатах прошлого уровня.
    this.stopLoop();
    if (numericId === 1) {
      this.applyLevelConfig(this.levelPresets[1]);
    } else if (numericId === 2) {
      if (!this.levelPresets[2]) this.levelPresets[2] = this.createLevelTwoConfig();
      this.applyLevelConfig(this.levelPresets[2]);
    } else {
      if (!this.levelPresets[3]) this.levelPresets[3] = this.createLevelThreeConfig();
      this.applyLevelConfig(this.levelPresets[3]);
    }

    this.levelId = numericId;
    this.reset();
    return true;
  }

  /** Запускает игру из начального состояния. После результата новый старт
   * начинает новый заход; пауза снимается отдельной кнопкой «Продолжить». */
  start() {
    // Уровень 3 пока демонстрационный: даже при вызове start/restart из UI
    // игровой цикл не запускается, а персонажи остаются неподвижными.
    if (this.levelId === 3) {
      this.stopLoop();
      this.input.setActive?.(false);
      this.input.endFrame?.();
      this.updateControlButtons();
      this.render();
      return;
    }
    if (document.hidden || this.running) return;

    if (this.gameState === 'victory' || this.gameState === 'defeat') {
      this.reset();
    }
    if (this.gameState !== 'ready') return;

    this.gameState = 'playing';
    this.running = true;
    this.lastTimestamp = null;
    this.resumeAfterVisibility = false;
    this.input.setActive?.(true);
    this.input.endFrame?.();
    const startMessage = this.levelId === 2
      ? 'Уровень 2: Огонь, Вода, Земля и Воздух удерживают только свои кнопки. Переместите камень на серую плиту и активируйте жёлтый рычаг.'
      : this.levelId === 3
        ? 'Уровень 3: используйте цветные плиты, чтобы открывать связанные ворота. На каждой плите может стоять только разрешённая стихия; помогайте друг другу добраться до выходов.'
        : 'Уровень 1: соберите звёзды, используйте лифты и доведите каждую стихию до своего выхода.';
    this.setStatus(startMessage);
    this.updateControlButtons();

    // Единственный ожидающий RAF на один экземпляр игры.
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  pause() {
    if (this.gameState !== 'playing') return;

    this.gameState = 'paused';
    this.stopLoop();
    this.setStatus('Пауза. Нажмите «Продолжить», чтобы вернуться в игру.');
    this.updateControlButtons();
  }

  resume() {
    if (this.gameState !== 'paused' || document.hidden || this.running) return;

    this.gameState = 'playing';
    this.running = true;
    this.lastTimestamp = null;
    this.input.setActive?.(true);
    this.input.endFrame?.();
    this.setStatus('Игра продолжается.');
    this.updateControlButtons();

    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  /** Останавливает RAF и очищает ввод, не меняя состояние уровня. */
  stopLoop() {
    this.running = false;
    this.lastTimestamp = null;
    this.input.setActive?.(false);
    this.input.endFrame?.();

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  handleVisibilityChange() {
    if (document.hidden) {
      // Автоматически продолжим только если игра шла до скрытия вкладки.
      this.resumeAfterVisibility = this.gameState === 'playing';
      if (this.resumeAfterVisibility) this.pause();
      else this.input.setActive?.(false);
      return;
    }

    if (this.resumeAfterVisibility) {
      this.resumeAfterVisibility = false;
      this.resume();
    }
  }

  loop(timestamp) {
    // Текущий callback RAF уже исполняется — ожидающего кадра нет.
    this.animationFrameId = null;
    if (!this.running || document.hidden || this.gameState !== 'playing') return;

    const elapsed = this.lastTimestamp === null
      ? 0
      : (timestamp - this.lastTimestamp) / 1000;
    const dt = Math.min(Math.max(elapsed, 0), 1 / 30);
    this.lastTimestamp = timestamp;

    this.update(dt);
    this.render();

    // finishLevel/pause могут остановить игру внутри update().
    if (this.running && !document.hidden && this.gameState === 'playing' && this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  update(dt) {
    if (this.gameState !== 'playing') return;

    this.elapsedSeconds += dt;
    this.updateParticles(dt);
    this.interactionConsumed = false;
    this.updateMovingPlatforms(dt);
    this.updatePushableRock(dt);

    for (const player of this.players) {
      if (player.completed) continue;

      const previousX = player.x;
      const previousY = player.y;
      const jumpWasPressed = this.input.wasPressed(...player.controls.jump);
      const wasGrounded = player.grounded;
      const jumpsUsedBefore = player.jumpsUsed;
      player.update(dt, this.input, this.getCollisionPlatformsForPlayer(player), this.width);
      if (player.y < 0) {
        player.y = 0;
        if (player.vy < 0) player.vy = 0;
        player.syncModules?.();
      }
      this.resolvePlayerRock(player, previousX, previousY);

      // Физическая граница совпадает с внутренней гранью боковых колонн.
      const minPlayerX = this.boundaryInset;
      const maxPlayerX = this.width - this.boundaryInset - player.width;
      const boundedX = Math.max(minPlayerX, Math.min(maxPlayerX, player.x));
      if (boundedX !== player.x) {
        if ((boundedX === minPlayerX && player.vx < 0) || (boundedX === maxPlayerX && player.vx > 0)) {
          player.vx = 0;
        }
        player.x = boundedX;
        player.syncModules?.();
      }

      if (jumpWasPressed && (wasGrounded || jumpsUsedBefore < player.maxJumps)) {
        this.audioManager?.playCharacter('jump', player.type);
      }
      if (Math.abs(player.x - previousX) > 0.1 && Math.abs(player.vx) > 38) {
        this.emitMovementParticles(player);
      }
      // При касании земли Земля создаёт короткий выброс каменной крошки.
      if (player.type === 'EARTH' && !wasGrounded && player.grounded) {
        this.emitEarthLanding(player);
      }

      // Падение в провал означает немедленное поражение всей команды.
      if (player.y > this.height) {
        player.deaths += 1;
        this.finishLevel('defeat', `${player.name} упал в провал. Уровень провален.`);
        this.input.endFrame();
        return;
      }

      // Безопасная для стихии зона не наносит урон. Любая чужая опасная зона — поражение.
      const deadlyZone = this.zones.find((zone) => {
        if (zone.safeFor.includes(player.type)) return false;
        // Центр персонажа должен войти в бассейн, а ноги — пересечь поверхность.
        // Так можно перепрыгнуть жидкость, не умирая от касания её края.
        const centerX = player.x + player.width / 2;
        const bottomY = player.y + player.height;
        const bottomOfPool = zone.surfaceY + (zone.depth ?? zone.height ?? 40);
        return centerX >= zone.x && centerX <= zone.x + zone.width &&
          bottomY >= zone.surfaceY - 2 && player.y < bottomOfPool;
      });
      if (deadlyZone) {
        player.deaths += 1;
        this.finishLevel('defeat', `${player.name} попал в опасную зону «${deadlyZone.name}». Уровень провален.`);
        this.input.endFrame();
        return;
      }

      // Подбираем предметы до проверки финиша, чтобы предмет у портала тоже засчитался.
      for (const item of this.collectibles) {
        if (!item.collected && item.type === player.type && this.intersects(player, {
          x: item.x, y: item.y, width: item.size, height: item.size,
        })) {
          item.collected = true;
          this.score += 1;
          this.audioManager?.playCharacter('collect', player.type);
          this.updateBestScore();
          this.updateHUD();
          this.setStatus(`${player.name} собрал свой кристалл. Счёт: ${this.score}/${this.collectibles.length}`);
        }
      }

      this.updateLeverInteraction(player);

      // Каждый персонаж активирует только свой портал.
      const finish = this.finishes.find((item) =>
        item.type === player.type && this.intersects(player, item),
      );
      if (finish) {
        // Во втором уровне выходы не засчитываются, пока команда не решила обе
        // кооперативные задачи: камень удерживает нижние ворота, Воздух открыл верхние.
        const levelTwoGatesOpen = this.levelId !== 2 || this.gates.every((gate) => !gate.requiredForVictory || gate.open);
        if (!levelTwoGatesOpen) {
          const hint = 'Сначала выполните обязательные механизмы уровня, затем направьте всех персонажей к выходам.';
          if (this.statusText !== hint) this.setStatus(hint);
        } else {
          player.completed = true;
          player.vx = 0;
          player.vy = 0;
          this.setStatus(`${player.name} достиг своего финиша (${this.players.filter((p) => p.completed).length}/4)`);
        }
      }
    }

    this.updatePressureSwitches(dt);
    this.input.endFrame();

    if (this.players.every((player) => player.completed)) {
      this.finishLevel('victory', 'Все четыре стихии достигли своих финишей. Уровень пройден!');
    }
  }

  finishLevel(result, message) {
    if (this.gameState !== 'playing') return;

    this.gameState = result;
    this.setStatus(message);

    const collected = this.collectibles.filter((item) => item.collected).length;
    const awardedStars = result === 'victory' ? collected : 0;

    if (this.resultTitleElement) {
      this.resultTitleElement.textContent = result === 'victory'
        ? 'Уровень пройден!'
        : 'поражение';
    }
    if (this.resultDescriptionElement) {
      this.resultDescriptionElement.textContent = result === 'victory'
        ? 'Все стихии добрались до своих порталов.'
        : message;
    }
    if (this.resultScoreElement) {
      this.resultScoreElement.textContent = `${this.score} / ${this.collectibles.length}`;
    }
    if (this.resultStarsElement) {
      this.resultStarsElement.textContent = '★'.repeat(awardedStars) + '☆'.repeat(this.collectibles.length - awardedStars);
      this.resultStarsElement.setAttribute('aria-label', `${awardedStars} из ${this.collectibles.length} звёзд`);
    }
    if (this.resultStarsCountElement) {
      this.resultStarsCountElement.textContent = `${awardedStars} из ${this.collectibles.length} звёзд`;
    }
    if (this.resultOverlayElement) {
      this.resultOverlayElement.hidden = false;
      this.resultOverlayElement.classList.toggle('is-victory', result === 'victory');
      this.resultOverlayElement.classList.toggle('is-defeat', result === 'defeat');
    }

    // Терминальное состояние: остановить RAF и не обновлять уровень,
    // пока пользователь не нажмёт «Старт» или «Заново».
    this.stopLoop();
    this.updateHUD();
    this.updateControlButtons();
    this.audioManager?.playCharacter(result === 'victory' ? 'victory' : 'defeat', 'AIR');
    try {
      this.onResult?.(result, { score: this.score, collected, stars: awardedStars });
    } catch (error) {
      console.error('Не удалось обработать результат уровня:', error);
    }
  }

  loadBestScore() {
    try {
      const storage = window.localStorage;
      const value = Number(storage.getItem(this.bestScoreStorageKey) ?? 0);
      return Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
    } catch (error) {
      // localStorage может быть заблокирован политикой браузера или режимом приватности.
      return 0;
    }
  }

  updateBestScore() {
    if (this.score <= this.bestScore) return;

    this.bestScore = this.score;
    try {
      window.localStorage.setItem(this.bestScoreStorageKey, String(this.bestScore));
    } catch (error) {
      // Счёт продолжает работать в памяти даже при недоступном хранилище.
    }
  }

  updateControlButtons() {
    const state = this.gameState;
    if (this.startButton) this.startButton.disabled = state === 'playing' || state === 'paused';
    if (this.pauseButton) this.pauseButton.disabled = state !== 'playing';
    if (this.continueButton) this.continueButton.disabled = state !== 'paused';
    if (this.restartButtons) {
      for (const button of this.restartButtons) button.disabled = false;
    }
    // Сенсорные кнопки принимают ввод только во время активной игры.
    for (const button of document.querySelectorAll('[data-touch-control]')) {
      button.disabled = state !== 'playing';
    }
  }

  updateHUD() {
    const collected = this.collectibles.filter((item) => item.collected).length;
    if (this.scoreElement) this.scoreElement.textContent = String(this.score);
    if (this.bestScoreElement) this.bestScoreElement.textContent = String(this.bestScore);
    if (this.collectiblesElement) {
      this.collectiblesElement.textContent = `${collected}/${this.collectibles.length}`;
    }
    if (this.starsPreviewElement) {
      this.starsPreviewElement.textContent = '★'.repeat(collected) + '☆'.repeat(this.collectibles.length - collected);
    }
  }

  getCollisionPlatforms() {
    // Серые клетки, камни, кнопки и все лифты имеют физическую поверхность.
    const solids = [...this.platforms];
    for (const gate of this.gates) if (!gate.open) solids.push({ ...gate, type: 'wall' });
    return solids;
  }

  getCollisionPlatformsForPlayer(player) {
    // Совместимая стихия может идти по поверхности своей жидкости, даже когда
    // под жидкостью нет каменного пола. Остальным нужен мост или лифт.
    const solids = this.getCollisionPlatforms();
    for (const zone of this.zones) {
      if (!zone.safeFor.includes(player.type)) continue;
      solids.push({
        id: `surface-${zone.id}`,
        x: zone.x,
        y: zone.surfaceY,
        width: zone.width,
        height: 3,
        type: 'zone-surface',
      });
    }
    return solids;
  }

  updateLeverInteraction(player) {
    if (this.interactionConsumed || !this.input.wasPressed('e', 'keye')) return;
    const centerX = player.x + player.width / 2;
    const centerY = player.y + player.height / 2;
    const lever = this.levers.find((item) => {
      if (item.activated) return false;
      if (item.requiredType && item.requiredType !== player.type) return false;
      const lx = item.x + item.width / 2;
      const ly = item.y + item.height / 2;
      return Math.hypot(centerX - lx, centerY - ly) <= 48;
    });
    if (!lever) return;
    lever.activated = true;
    this.interactionConsumed = true;
    if (lever.action === 'unlock-left-lift') {
      this.mechanismsUnlocked = true;
      this.setStatus('Рычаг активирован. Белый лифт опускается до нижнего уровня.');
    } else if (lever.action === 'open-upper-gate') {
      const gate = this.gates.find((item) => item.id === 'upper-final-gate');
      if (gate) gate.open = true;
      this.setStatus('Воздух активировал верхний рычаг. Верхние ворота открыты — команда может подняться к выходам.');
    } else if (lever.action === 'raise-yellow-lift') {
      this.setStatus('Жёлтый лифт поднимается к верхней площадке. Помогите остальным подняться к выходам.');
    }
    this.audioManager?.playCharacter('collect', player.type);
  }

  intersects(a, b) {
    return a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;
  }

  setStatus(message) {
    this.statusText = message;
    if (this.messageElement) this.messageElement.textContent = message;
  }

  render() {
    const ctx = this.ctx;
    if (!ctx) return;

    const viewportWidth = this.canvas.width;
    const viewportHeight = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);
    ctx.fillStyle = '#0b111b';
    ctx.fillRect(0, 0, viewportWidth, viewportHeight);
    ctx.imageSmoothingEnabled = false;

    // Атмосферный храм заполняет весь экран, в том числе letterbox-области.
    // Игровой мир поверх него масштабируется равномерно, без искажения физики и фигур.
    ctx.save();
    ctx.setTransform(
      viewportWidth / this.width, 0,
      0, viewportHeight / this.height,
      0, 0,
    );
    this.drawBackground(ctx);
    ctx.restore();

    const scale = Math.min(
      viewportWidth / this.width,
      viewportHeight / this.height,
    );
    const offsetX = (viewportWidth - this.width * scale) / 2;
    const offsetY = (viewportHeight - this.height * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

    this.drawGround(ctx);
    this.drawElementZones(ctx);
    this.drawPlatforms(ctx);
    this.drawMechanisms(ctx);
    this.drawCollectibles(ctx);
    this.drawFinishes(ctx);
    this.drawParticles(ctx);
    for (const player of this.players) player.draw(ctx);

    // Сначала возвращаемся к физическим пикселям canvas. Колонны занимают
    // всё пространство от края экрана до реальной кромки платформы, в том числе
    // боковые поля, возникающие при сохранении пропорций мира 16:9.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.drawBoundaryPillars(ctx, viewportWidth, viewportHeight, scale, offsetX);
  }

  drawBackground(ctx) {
    // Каменная стена древнего храма: тёмный сине-серый градиент.
    const wall = ctx.createLinearGradient(0, 0, this.width, this.height);
    wall.addColorStop(0, '#1b202b');
    wall.addColorStop(0.45, '#121a29');
    wall.addColorStop(1, '#20202a');
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGlow(ctx, 110, 330, 300, 'rgba(255, 70, 33, 0.13)');
    this.drawGlow(ctx, 835, 300, 350, 'rgba(34, 148, 245, 0.14)');

    // Каменные блоки на стенах со смещением каждого второго ряда.
    for (let row = 0, y = 0; y < this.height; row++, y += 42) {
      const offset = row % 2 === 0 ? -28 : 6;
      for (let x = offset; x < this.width; x += 74) {
        const seed = Math.abs((row * 17 + Math.floor(x / 74) * 13) % 5);
        const shade = ['#202734', '#242a35', '#1b2430', '#252832', '#1c2531'][seed];
        ctx.fillStyle = shade;
        ctx.fillRect(x + 2, y + 2, 70, 38);
        ctx.strokeStyle = 'rgba(105, 124, 151, 0.24)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2.5, y + 2.5, 69, 37);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(x + 4, y + 34, 66, 4);
        ctx.fillStyle = 'rgba(173, 189, 206, 0.10)';
        ctx.fillRect(x + 5, y + 4, 22 + (seed % 3) * 5, 2);

        // Небольшие сколы и трещины вместо гладкой цифровой поверхности.
        if (seed === 1 || seed === 4) {
          ctx.strokeStyle = 'rgba(7, 12, 22, 0.58)';
          ctx.beginPath();
          ctx.moveTo(x + 46, y + 7);
          ctx.lineTo(x + 42, y + 14);
          ctx.lineTo(x + 47, y + 19);
          ctx.lineTo(x + 43, y + 24);
          ctx.stroke();
        }
      }
    }

    // Потускневшие огоньки и тонкие горизонтальные швы.
    for (const star of this.stars) {
      ctx.globalAlpha = star.alpha * 0.52;
      ctx.fillStyle = '#d8e4f8';
      ctx.fillRect(Math.round(star.x), Math.round(star.y), 2, 2);
    }
    ctx.globalAlpha = 1;

    ctx.strokeStyle = 'rgba(151, 176, 205, 0.10)';
    ctx.lineWidth = 1;
    for (let y = 126; y < 450; y += 42) {
      ctx.beginPath();
      ctx.moveTo(28, y + 0.5);
      ctx.lineTo(this.width - 28, y + 0.5);
      ctx.stroke();
    }

    const altarLight = ctx.createLinearGradient(0, 110, 0, 430);
    altarLight.addColorStop(0, 'rgba(127, 174, 205, 0)');
    altarLight.addColorStop(0.5, 'rgba(127, 174, 205, 0.07)');
    altarLight.addColorStop(1, 'rgba(127, 174, 205, 0)');
    ctx.fillStyle = altarLight;
    ctx.fillRect(this.width / 2 - 1, 110, 2, 320);

    // Колонны рисуются поверх игрового мира в его едином масштабе,
    // чтобы их внутренние грани совпадали с физическими границами уровня.
  }

  drawBoundaryPillars(ctx, viewportWidth, viewportHeight, worldScale, offsetX) {
    // Верхние/нижние поля при letterbox не должны прерывать колонны, поэтому
    // высота берётся от всего canvas, а горизонтальная кромка рассчитывается
    // по той же матрице, которой рисуется начало и конец пола.
    const leftPlatformEdge = Math.max(0, Math.min(
      viewportWidth,
      offsetX + this.boundaryInset * worldScale,
    ));
    const rightPlatformEdge = Math.max(0, Math.min(
      viewportWidth,
      offsetX + (this.width - this.boundaryInset) * worldScale,
    ));

    this.drawPillarBand(ctx, 0, leftPlatformEdge, viewportHeight, worldScale, 'left');
    this.drawPillarBand(
      ctx,
      rightPlatformEdge,
      Math.max(0, viewportWidth - rightPlatformEdge),
      viewportHeight,
      worldScale,
      'right',
    );
  }

  drawPillarBand(ctx, x, width, height, worldScale, side) {
    if (width <= 0.5 || height <= 0) return;

    const px = (value) => Math.max(1, value * Math.max(0.65, Math.min(worldScale, 2.5)));
    const s = Math.max(0.65, Math.min(worldScale, 2.5));
    const edgeWidth = Math.min(px(6), width * 0.16);
    const innerInset = Math.min(px(8), width * 0.17);
    const right = x + width;

    const gradient = ctx.createLinearGradient(x, 0, right, 0);
    gradient.addColorStop(0, '#0a101a');
    gradient.addColorStop(width > px(70) ? 0.08 : 0.18, '#303542');
    gradient.addColorStop(0.45, '#45444d');
    gradient.addColorStop(width > px(70) ? 0.92 : 0.72, '#292d39');
    gradient.addColorStop(1, '#0b111b');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, 0, width + 0.5, height);

    // Внутренняя грань темнее, наружная — чуть светлее; справа/слева зеркально.
    const lightEdgeX = side === 'left' ? x + edgeWidth : right - edgeWidth * 2;
    const darkEdgeX = side === 'left' ? right - edgeWidth : x + edgeWidth;
    ctx.fillStyle = 'rgba(183, 174, 157, 0.22)';
    ctx.fillRect(lightEdgeX, 0, Math.max(1, edgeWidth * 0.45), height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.fillRect(darkEdgeX, 0, edgeWidth, height);
    ctx.fillStyle = 'rgba(204, 194, 172, 0.11)';
    ctx.fillRect(side === 'left' ? x + edgeWidth * 1.5 : right - edgeWidth * 2.2, 0, Math.max(1, edgeWidth * 0.25), height);

    // Каменные панели повторяются сверху до самого нижнего края canvas.
    const capHeight = px(9);
    const panelGap = px(4);
    const panelHeight = px(54);
    const panelInset = Math.min(innerInset, Math.max(1, width * 0.12));
    for (let y = px(13), row = 0; y < height; y += panelHeight + px(4), row += 1) {
      const h = Math.min(panelHeight, height - y - px(2));
      if (h <= 0) break;
      const panelX = x + panelInset;
      const panelWidth = Math.max(1, width - panelInset * 2);
      ctx.fillStyle = row % 2 === 0
        ? 'rgba(91, 91, 103, 0.43)'
        : 'rgba(39, 43, 55, 0.50)';
      ctx.fillRect(panelX, y, panelWidth, h);
      ctx.strokeStyle = 'rgba(7, 11, 19, 0.62)';
      ctx.lineWidth = Math.max(1, px(1));
      ctx.strokeRect(panelX + 0.5, y + 0.5, Math.max(0, panelWidth - 1), Math.max(0, h - 1));
      ctx.fillStyle = 'rgba(205, 196, 179, 0.13)';
      ctx.fillRect(panelX + px(3), y + px(3), Math.max(1, panelWidth - px(6)), Math.max(1, px(2)));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(panelX + px(2), y + h - px(5), Math.max(1, panelWidth - px(4)), px(4));

      // Маленькие выщерблины располагаются в сторону внутренней кромки.
      if (panelWidth > px(16) && row % 2 === 1) {
        const chipX = side === 'left' ? right - panelInset - px(12) : x + panelInset + px(8);
        ctx.strokeStyle = 'rgba(8, 12, 20, 0.66)';
        ctx.lineWidth = Math.max(1, px(1));
        ctx.beginPath();
        ctx.moveTo(chipX, y + px(9));
        ctx.lineTo(chipX - px(4), y + px(17));
        ctx.lineTo(chipX + px(1), y + px(24));
        ctx.stroke();
      }
    }

    // Непрерывная капитель и основание сходятся с рамкой экрана без зазора.
    ctx.fillStyle = '#55525a';
    ctx.fillRect(x, 0, width + 0.5, capHeight);
    ctx.fillStyle = '#77706a';
    ctx.fillRect(x, 0, width + 0.5, px(2));
    ctx.fillStyle = '#191e2a';
    ctx.fillRect(x, Math.max(0, capHeight - px(2)), width + 0.5, px(2));

    const baseHeight = px(10);
    ctx.fillStyle = '#55525a';
    ctx.fillRect(x, Math.max(0, height - baseHeight), width + 0.5, baseHeight);
    ctx.fillStyle = '#77706a';
    ctx.fillRect(x, Math.max(0, height - baseHeight), width + 0.5, px(2));
    ctx.fillStyle = '#191e2a';
    ctx.fillRect(x, Math.max(0, height - px(3)), width + 0.5, px(3));

    // Узкая внутренняя полоса подчёркивает линию, в которую упирается пол.
    ctx.fillStyle = 'rgba(11, 15, 23, 0.72)';
    ctx.fillRect(side === 'left' ? right - px(2) : x, 0, px(2), height);
    ctx.fillStyle = 'rgba(198, 190, 174, 0.16)';
    ctx.fillRect(side === 'left' ? right - px(5) : x + px(3), 0, px(1), height);
  }

  drawGlow(ctx, x, y, radius, color) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, color);
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawElementZones(ctx) {
    for (const zone of this.zones) {
      const y = zone.surfaceY;
      const depth = Math.min(zone.depth ?? zone.height ?? 46, this.height - y);
      const phase = this.elapsedSeconds;
      // На уровнях 1–2 id короткий (например, "lava"), а на уровне 3 он
      // уникален для каждой клетки ("lava-7-30"). Для отрисовки используем
      // общий тип опасности, чтобы палитра и анимация были одинаковыми.
      const zoneKind = zone.kind ?? zone.id.split('-')[0];
      const pulse = 0.78 + (Math.sin(phase * (zoneKind === 'lava' ? 7.2 : 4.6) + zone.x * 0.04) + 1) * 0.10;
      ctx.save();

      // Нет чёрной ванны, внешней рамки или отдельной подложки:
      // цветная жидкость заполняет проём в кладке от кромки пола вниз.
      let gradient;
      if (zoneKind === 'lava') {
        gradient = ctx.createLinearGradient(0, y, 0, y + depth);
        gradient.addColorStop(0, `rgba(255, 177, 65, ${pulse})`);
        gradient.addColorStop(0.18, '#f85b2f');
        gradient.addColorStop(0.62, '#c53228');
        gradient.addColorStop(1, '#672c32');
        ctx.fillStyle = gradient;
        ctx.fillRect(zone.x, y, zone.width, depth);
        ctx.strokeStyle = 'rgba(255, 226, 139, .84)';
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(zone.x, y + 2);
        for (let px = 4; px < zone.width; px += 6) {
          ctx.lineTo(zone.x + px, y + 2 + Math.sin(px * .13 + phase * 4.4) * 1.5);
        }
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          const bx = zone.x + ((i * 23 + Math.floor(phase * (13 + i * 2))) % Math.max(1, zone.width - 3));
          ctx.fillStyle = i % 2 ? '#ffbd50' : '#fff0a0';
          ctx.fillRect(bx, y + 7 + ((i * 7) % Math.max(9, depth - 10)), 2 + (i % 2), 1.5);
        }
      } else if (zoneKind === 'water') {
        gradient = ctx.createLinearGradient(0, y, 0, y + depth);
        gradient.addColorStop(0, `rgba(94, 222, 255, ${pulse})`);
        gradient.addColorStop(.24, '#178ee5');
        gradient.addColorStop(.7, '#145b9c');
        gradient.addColorStop(1, '#243c61');
        ctx.fillStyle = gradient;
        ctx.fillRect(zone.x, y, zone.width, depth);
        ctx.strokeStyle = 'rgba(228, 253, 255, .8)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i += 1) {
          const startX = zone.x + ((i * 29 + phase * (13 + i * 3)) % Math.max(1, zone.width - 16));
          const waveY = y + 3 + i * 5;
          ctx.beginPath();
          ctx.moveTo(startX, waveY);
          ctx.lineTo(startX + 6, waveY - 1.2);
          ctx.lineTo(startX + 12, waveY);
          ctx.stroke();
        }
      } else if (zoneKind === 'electricity') {
        gradient = ctx.createLinearGradient(0, y, 0, y + depth);
        gradient.addColorStop(0, `rgba(151, 218, 255, ${pulse})`);
        gradient.addColorStop(.22, '#6b91ed');
        gradient.addColorStop(.65, '#3d58b2');
        gradient.addColorStop(1, '#29334f');
        ctx.fillStyle = gradient;
        ctx.fillRect(zone.x, y, zone.width, depth);
        ctx.strokeStyle = `rgba(222, 248, 255, ${.63 + .25 * Math.sin(phase * 9)})`;
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 3; i += 1) {
          const ex = zone.x + 8 + ((i * 31 + phase * (18 + i * 4)) % Math.max(1, zone.width - 18));
          const ey = y + 5 + (i % 2) * 9;
          ctx.beginPath();
          ctx.moveTo(ex, ey);
          ctx.lineTo(ex + 4, ey + 4);
          ctx.lineTo(ex + 1, ey + 8);
          ctx.lineTo(ex + 7, ey + 13);
          ctx.stroke();
        }
      } else if (zoneKind === 'acid') {
        gradient = ctx.createLinearGradient(0, y, 0, y + depth);
        gradient.addColorStop(0, `rgba(205, 255, 116, ${pulse})`);
        gradient.addColorStop(.28, '#8fe64f');
        gradient.addColorStop(.7, '#4d9d3c');
        gradient.addColorStop(1, '#283d31');
        ctx.fillStyle = gradient;
        ctx.fillRect(zone.x, y, zone.width, depth);
        ctx.strokeStyle = 'rgba(230, 255, 167, .78)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(zone.x, y + 2);
        for (let px = 4; px < zone.width; px += 7) {
          ctx.lineTo(zone.x + px, y + 2 + Math.sin(px * .18 + phase * 3.2) * 1.3);
        }
        ctx.stroke();
        for (let i = 0; i < 5; i += 1) {
          const bx = zone.x + ((i * 17 + Math.floor(phase * 7)) % zone.width);
          ctx.fillStyle = 'rgba(236,255,157,.85)';
          ctx.fillRect(bx, y + 8 + (i * 9) % Math.max(10, depth - 10), 2, 2);
        }
      }
      // Тонкий внутренний блик — только на поверхности жидкости.
      ctx.globalAlpha = .28;
      ctx.fillStyle = '#fff4d8';
      ctx.fillRect(zone.x + 1, y + 1, Math.max(1, zone.width - 2), 1);
      ctx.restore();
    }
  }

  drawCollectibles(ctx) {
    for (const item of this.collectibles) {
      if (item.collected) continue;

      const palette = ELEMENT_TYPES[item.type];
      const bob = Math.sin(this.elapsedSeconds * 3 + item.x) * 1.5;
      const drawY = item.y + bob;
      const centerX = item.x + item.size / 2;
      const centerY = drawY + item.size / 2;

      ctx.save();
      ctx.shadowColor = palette.base;
      ctx.shadowBlur = 12 + (Math.sin(this.elapsedSeconds * 5 + item.x) + 1) * 5;

      const gem = ctx.createLinearGradient(item.x, drawY, item.x + item.size, drawY + item.size);
      gem.addColorStop(0, palette.light);
      gem.addColorStop(0.48, palette.base);
      gem.addColorStop(1, palette.dark);
      ctx.fillStyle = gem;
      ctx.strokeStyle = palette.light;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(centerX, drawY);
      ctx.lineTo(item.x + item.size, centerY);
      ctx.lineTo(centerX, drawY + item.size);
      ctx.lineTo(item.x, centerY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerX, drawY + 3);
      ctx.lineTo(centerX, drawY + item.size - 3);
      ctx.moveTo(item.x + 3, centerY);
      ctx.lineTo(item.x + item.size - 3, centerY);
      ctx.stroke();

      // Крошечная цветная искра усиливает привязку кристалла к стихии.
      ctx.fillStyle = palette.light;
      ctx.beginPath();
      ctx.arc(item.x - 3, drawY + 3, 1.5, 0, Math.PI * 2);
      ctx.arc(item.x + item.size + 3, drawY + item.size - 3, 1.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawFinishes(ctx) {
    const colors = { FIRE: '#ff754f', WATER: '#4bc7f0', EARTH: '#75c878', AIR: '#a7e8ff' };
    for (const finish of this.finishes) {
      const color = colors[finish.type];
      const player = this.players.find((item) => item.type === finish.type);
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = player.completed ? 22 : 12;
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(15, 20, 35, 0.88)';
      ctx.beginPath();
      ctx.roundRect(finish.x, finish.y, finish.width, finish.height, 14);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

    }
  }

  drawGround(ctx) {
    // Геометрия всех карт строится одной функцией сетки и рисуется единым
    // стилем каменной кладки; отличаться могут только размеры карты.
    const terrain = this.platforms.filter((platform) => platform.type === 'terrain');
    for (let index = 0; index < terrain.length; index += 1) {
      const block = terrain[index];
      const isRock = block.material === 'X';
      ctx.save();
      ctx.beginPath();
      ctx.rect(block.x, block.y, block.width, block.height);
      ctx.clip();

      const stone = ctx.createLinearGradient(block.x, block.y, block.x, block.y + Math.max(1, block.height));
      if (isRock) {
        stone.addColorStop(0, '#737b88');
        stone.addColorStop(.22, '#4b5361');
        stone.addColorStop(.68, '#303744');
        stone.addColorStop(1, '#171d29');
      } else {
        stone.addColorStop(0, '#74727b');
        stone.addColorStop(.18, '#555865');
        stone.addColorStop(.58, '#393f4d');
        stone.addColorStop(1, '#202633');
      }
      ctx.fillStyle = stone;
      ctx.fillRect(block.x, block.y, block.width, block.height);

      // Рельефные каменные сегменты с чередованием швов; края карты при этом
      // остаются привязаны к исходной 20-пиксельной сетке.
      const tileWidth = isRock ? 19 : 29;
      const tileHeight = 20;
      const firstRow = Math.floor(block.y / tileHeight);
      for (let y = firstRow * tileHeight; y < block.y + block.height; y += tileHeight) {
        const row = Math.floor(y / tileHeight);
        const offset = row % 2 ? Math.floor(tileWidth / 2) : 0;
        for (let x = Math.floor(block.x / tileWidth) * tileWidth - tileWidth + offset;
             x < block.x + block.width; x += tileWidth) {
          const seed = Math.abs((row * 17 + Math.floor(x / tileWidth) * 13 + index * 7) % 5);
          const shade = isRock
            ? ['#586170', '#505866', '#434b59', '#626a77', '#3d4553'][seed]
            : ['#626775', '#555d6b', '#4c5361', '#5c6270', '#454c5a'][seed];
          ctx.fillStyle = shade;
          ctx.fillRect(x + 1, y + 1, tileWidth - 2, tileHeight - 2);
          ctx.strokeStyle = isRock ? 'rgba(7, 11, 19, .82)' : 'rgba(8, 13, 23, .68)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 1.5, y + 1.5, tileWidth - 3, tileHeight - 3);
          ctx.fillStyle = isRock ? 'rgba(224, 232, 240, .17)' : 'rgba(237, 229, 215, .22)';
          ctx.fillRect(x + 3, y + 3, Math.max(2, tileWidth * .36), 2);
          ctx.fillStyle = 'rgba(0, 0, 0, .28)';
          ctx.fillRect(x + 3, y + tileHeight - 5, tileWidth - 6, 3);

          // Трещины — только на отдельных камнях, чтобы поверхность не была плоской.
          if ((isRock && seed !== 2) || (!isRock && seed === 1 && block.height >= 40)) {
            ctx.strokeStyle = isRock ? 'rgba(14, 19, 29, .8)' : 'rgba(13, 18, 29, .52)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + tileWidth * .62, y + 4);
            ctx.lineTo(x + tileWidth * .52, y + 9);
            ctx.lineTo(x + tileWidth * .65, y + 13);
            ctx.stroke();
          }
        }
      }

      // Светлая верхняя грань и тяжёлая нижняя тень повторяют эстетику платформ
      // из второго файла, не меняя положение и размеры коллизий.
      ctx.shadowColor = isRock ? 'rgba(138, 164, 192, .22)' : 'rgba(87, 198, 241, .22)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = isRock ? '#a3adba' : '#b8c3ce';
      ctx.fillRect(block.x, block.y, block.width, 1.5);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(8, 11, 19, .55)';
      ctx.fillRect(block.x, block.y + block.height - 2, block.width, 2);
      ctx.restore();
    }

    // Подсказочные стрелки из схемы не отображаются в игровом уровне.

  }

  drawPlatforms(ctx) {
    // Рисуем только фактическое положение лифтов — целевые позиции
    // из схемы были поясняющими метками и не являются объектами уровня.
    for (const platform of this.movingPlatforms) {
      this.drawLiftFrame(ctx, platform, platform.y, false);
    }
  }

  drawLiftFrame(ctx, platform, y, isTarget = false) {
    const isPurple = platform.role === 'purple-lift';
    const accent = platform.accent ?? (isPurple ? '#d76bea' : '#e1e6ef');
    const bright = platform.bright ?? (isPurple ? '#ffd0ff' : '#ffffff');
    const dark = platform.dark ?? (isPurple ? '#632b78' : '#4a5668');

    ctx.save();
    ctx.globalAlpha = isTarget ? .58 : 1;
    if (isTarget) {
      ctx.shadowColor = accent;
      ctx.shadowBlur = 10;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 4]);
      ctx.strokeRect(platform.x + 1.5, y + 1.5, platform.width - 3, platform.height - 3);
      ctx.setLineDash([]);
      ctx.globalAlpha = .16;
      ctx.fillStyle = accent;
      ctx.fillRect(platform.x + 2, y + 2, platform.width - 4, Math.max(2, platform.height - 4));
      ctx.restore();
      return;
    }

    ctx.shadowColor = platform.accent ?? (isPurple ? 'rgba(204, 117, 255, .48)' : 'rgba(228, 238, 255, .35)');
    ctx.shadowBlur = platform.enabled ? 13 : 6;
    ctx.fillStyle = '#171d2a';
    ctx.fillRect(platform.x - 2, y - 1, platform.width + 4, platform.height + 5);
    ctx.shadowBlur = 0;

    const metal = ctx.createLinearGradient(platform.x, y, platform.x, y + platform.height);
    metal.addColorStop(0, bright);
    metal.addColorStop(.22, accent);
    metal.addColorStop(.65, isPurple ? '#a83bca' : '#a8b2c2');
    metal.addColorStop(1, dark);
    ctx.fillStyle = metal;
    ctx.fillRect(platform.x, y, platform.width, platform.height);

    const segments = Math.max(1, Math.floor(platform.width / TILE_SIZE));
    for (let i = 0; i < segments; i += 1) {
      const sx = platform.x + i * TILE_SIZE;
      const sw = Math.min(TILE_SIZE, platform.x + platform.width - sx);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,.12)' : 'rgba(6,10,20,.14)';
      ctx.fillRect(sx + 1, y + 3, Math.max(1, sw - 2), Math.max(1, platform.height - 6));
      if (i > 0) {
        ctx.strokeStyle = 'rgba(18, 22, 35, .62)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx + .5, y + 2);
        ctx.lineTo(sx + .5, y + platform.height - 2);
        ctx.stroke();
      }
    }
    ctx.fillStyle = bright;
    ctx.fillRect(platform.x + 2, y + 1, platform.width - 4, 2);
    ctx.fillStyle = 'rgba(8, 12, 22, .78)';
    ctx.fillRect(platform.x + 1, y + platform.height - 3, platform.width - 2, 2);
    ctx.strokeStyle = isPurple ? '#f6b8ff' : bright;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(platform.x + 1.5, y + 1.5, platform.width - 3, platform.height - 3);

    for (const sx of [platform.x + 5, platform.x + platform.width - 8]) {
      ctx.fillStyle = isPurple ? '#ffd0ff' : bright;
      ctx.fillRect(sx, y + Math.max(4, platform.height / 2 - 1.5), 3, 3);
    }
    ctx.restore();
  }

  updateMovingPlatforms(dt) {
    const whiteButton = this.buttons.find((button) => button.id === 'button-one');
    // Второй лифт работает от общей линии давления: достаточно, чтобы
    // персонаж удерживал любую из нажимных плит. Когда все плиты отпущены,
    // лифт возвращается к верхней позиции.
    const anyButtonPressed = this.buttons.some((button) => button.pressed);

    for (const platform of this.movingPlatforms) {
      const previousX = platform.x;
      const previousY = platform.y;
      let shouldMove = false;

      if (platform.activation === 'button-one') {
        shouldMove = Boolean(this.mechanismsUnlocked || whiteButton?.pressed);
        platform.targetY = shouldMove ? platform.activatedY : platform.restY;
      } else if (platform.activation === 'button-two') {
        // На первом уровне второй лифт связан с общей линией давления.
        shouldMove = anyButtonPressed;
        platform.targetY = shouldMove ? platform.activatedY : platform.restY;
      } else if (platform.activation === 'any-button') {
        shouldMove = anyButtonPressed;
        platform.targetY = shouldMove ? platform.activatedY : platform.restY;
      } else if (platform.activation?.startsWith('button:')) {
        const buttonId = platform.activation.slice('button:'.length);
        const switchButton = this.buttons.find((button) => button.id === buttonId);
        shouldMove = Boolean(switchButton?.pressed);
        platform.targetY = shouldMove ? platform.activatedY : platform.restY;
      } else if (platform.activation?.startsWith('lever:')) {
        const leverId = platform.activation.slice('lever:'.length);
        const lever = this.levers.find((item) => item.id === leverId);
        shouldMove = Boolean(lever?.activated);
        platform.targetY = shouldMove ? platform.activatedY : platform.restY;
      }

      platform.enabled = shouldMove || Math.abs(platform.y - platform.restY) > 0.5;
      const deltaY = platform.targetY - platform.y;
      platform.y += Math.sign(deltaY) * Math.min(Math.abs(deltaY), platform.speed * dt);
      const dx = platform.x - previousX;
      const dy = platform.y - previousY;
      if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) continue;

      // Пассажиры едут вместе с лифтом, как если бы стояли на его поверхности.
      for (const player of this.players) {
        const bottom = player.y + player.height;
        const overlaps = player.x < previousX + platform.width && player.x + player.width > previousX;
        if (player.grounded && overlaps && Math.abs(bottom - previousY) <= 3) {
          player.x += dx;
          player.y += dy;
          player.vy = 0;
          player.syncModules?.();
        }
      }
    }
  }

  updatePushableRock(dt) {
    const rock = this.pushableRock;
    if (!rock || rock.width <= 0 || rock.height <= 0) return;
    const previousY = rock.y;
    const previousBottom = previousY + rock.height;
    rock.grounded = false;
    rock.vy = Math.min(rock.vy + 1450 * dt, 820);
    rock.y += rock.vy * dt;

    // Камень приземляется на любую платформу, включая подвижные мосты.
    let landing = null;
    for (const platform of this.getCollisionPlatforms()) {
      if (platform.ceilingOnly) continue;
      const horizontalOverlap = rock.x < platform.x + platform.width && rock.x + rock.width > platform.x;
      const newBottom = rock.y + rock.height;
      if (horizontalOverlap && previousBottom <= platform.y + 1 && newBottom >= platform.y && rock.vy >= 0) {
        if (!landing || platform.y < landing.y) landing = platform;
      }
    }
    if (landing) {
      rock.y = landing.y - rock.height;
      rock.vy = 0;
      rock.grounded = true;
    }

    if (rock.y > this.height + 40) {
      rock.x = rock.startX;
      rock.y = rock.startY;
      rock.vx = 0;
      rock.vy = 0;
      rock.grounded = false;
    }
  }

  resolvePlayerRock(player, previousX, previousY) {
    const rock = this.pushableRock;
    if (!rock || rock.width <= 0 || rock.height <= 0) return;

    const previousBottom = previousY + player.height;
    const currentBottom = player.y + player.height;
    const horizontalOverlap = player.x < rock.x + rock.width &&
      player.x + player.width > rock.x;

    // Камень — полноценная платформа: на него можно приземлиться сверху.
    // Проверяем пересечение траектории, а не только финальное положение кадра.
    const crossedRockTop = horizontalOverlap &&
      previousBottom <= rock.y + 3 && currentBottom >= rock.y && player.vy >= 0;
    if (crossedRockTop) {
      player.y = rock.y - player.height;
      player.vy = 0;
      player.grounded = true;
      player.syncModules?.();
      return;
    }

    if (!this.intersects(player, rock)) return;

    // Любой персонаж может толкать камень. Определяем сторону по положению
    // в предыдущем кадре; это надёжнее, чем сравнивать центры уже пересёкшихся тел.
    const movement = player.x - previousX;
    const cameFromLeft = previousX + player.width <= rock.x + 3;
    const cameFromRight = previousX >= rock.x + rock.width - 3;
    let direction = 0;

    if (movement > 0.01 && (cameFromLeft || player.x < rock.x + rock.width / 2)) {
      direction = 1;
    } else if (movement < -0.01 && (cameFromRight || player.x + player.width > rock.x + rock.width / 2)) {
      direction = -1;
    } else if (cameFromLeft) {
      direction = 1;
    } else if (cameFromRight) {
      direction = -1;
    } else {
      direction = player.x + player.width / 2 < rock.x + rock.width / 2 ? 1 : -1;
    }

    // Не позволяем персонажу пройти сквозь камень по вертикали при боковом ударе.
    // Когда игрок нажимает в сторону камня, двигаем его на фактическое расстояние
    // перемещения игрока. Скорость игрока сохраняется во время успешного толчка,
    // иначе её сброс каждый кадр делал бы толкание почти незаметным.
    const pushingIntoRock = direction > 0
      ? (movement > 0.01 || player.vx > 1)
      : (movement < -0.01 || player.vx < -1);
    let moved = false;

    if (pushingIntoRock) {
      let delta = movement;
      if (Math.abs(delta) < 0.01) delta = player.vx * (1 / 60);
      delta = direction > 0 ? Math.max(0, delta) : Math.min(0, delta);

      if (Math.abs(delta) > 0.001) {
        const nextX = Math.max(
          this.boundaryInset,
          Math.min(this.width - this.boundaryInset - rock.width, rock.x + delta),
        );
        const candidate = { ...rock, x: nextX };
        // Камень может заехать на одноклеточную нажимную плиту, даже если
        // приземлился на полу рядом с ней. Это нужно для серой плиты уровня 2:
        // она расположена на одну клетку выше нижней площадки.
        let stepPlate = null;
        for (const platform of this.getCollisionPlatforms()) {
          if (platform.type !== 'button-platform') continue;
          const overlapsHorizontally = candidate.x < platform.x + platform.width &&
            candidate.x + candidate.width > platform.x;
          const rise = rock.y + rock.height - platform.y;
          if (overlapsHorizontally && rise > 0 && rise <= TILE_SIZE + 1) {
            const steppedCandidate = { ...candidate, y: platform.y - rock.height };
            const blockedAbove = this.getCollisionPlatforms().some((other) =>
              other !== platform && this.intersects(steppedCandidate, other),
            );
            if (!blockedAbove) {
              stepPlate = platform;
              candidate.y = steppedCandidate.y;
              break;
            }
          }
        }
        // Пол/платформа под камнем касается его нижней грани, но не мешает
        // скольжению по поверхности. Проверяем боковые препятствия и верх плиты.
        const blocked = this.getCollisionPlatforms().some((platform) =>
          platform !== stepPlate && this.intersects(candidate, platform),
        );
        if (!blocked && Math.abs(nextX - rock.x) > 0.001) {
          rock.x = nextX;
          if (stepPlate) {
            rock.y = candidate.y;
            rock.vy = 0;
            rock.grounded = true;
          }
          moved = true;
        }
      }
    }

    // Возвращаем игрока к ближайшей боковой грани. Если камень упёрся в стену,
    // останавливаем и игрока; при успешном толчке оставляем скорость для плавного движения.
    if (direction > 0) player.x = rock.x - player.width;
    else player.x = rock.x + rock.width;
    if (!moved) player.vx = 0;
    player.syncModules?.();
  }

  updatePressureSwitches(dt = 1 / 60) {
    const animationFactor = Math.min(1, Math.max(0, dt) * 9);

    for (const button of this.buttons) {
      const platform = this.buttonPlatforms.find((item) => item.buttonId === button.id);

      // ВАЖНО: коллизия кнопки никогда не сжимается вместе с её картинкой.
      // Иначе движущаяся верхняя грань пересекает ноги стоящего персонажа,
      // после чего физика выталкивает его в сторону. Физическая поверхность
      // остаётся неподвижной, а сжатие — только визуальная анимация.
      if (platform) {
        platform.y = button.y;
        platform.height = button.height;
      }

      const standingOnButton = !button.rockOnly && this.players.some((player) => {
        if (player.completed || !player.grounded) return false;
        if (button.requiredType && player.type !== button.requiredType) return false;
        if (button.allowedTypes?.length && !button.allowedTypes.includes(player.type)) return false;
        const overlaps = player.x < button.x + button.width && player.x + player.width > button.x;
        const feetY = player.y + player.height;
        // Проверяем исходную высоту плиты, а не её визуально сжатую верхушку.
        return overlaps && Math.abs(feetY - button.y) <= 5;
      });

      button.pressed = standingOnButton;
      const targetCompression = button.pressed ? 6 : 0;
      button.compression += (targetCompression - button.compression) * animationFactor;
      if (button.allowRock && this.pushableRock?.grounded) {
        const rock = this.pushableRock;
        const overlapWidth = Math.min(rock.x + rock.width, button.x + button.width) -
          Math.max(rock.x, button.x);
        // Камень должен лечь на большую часть плиты, а не задеть её одним пикселем.
        const rockOnButton = overlapWidth >= Math.min(rock.width, button.width) * 0.65 &&
          Math.abs(rock.y + rock.height - button.y) <= 5;
        button.pressed = button.pressed || rockOnButton;
        if (button.pressed && !standingOnButton) button.compression = Math.max(button.compression, 5.8);
      }
      if (Math.abs(targetCompression - button.compression) < 0.08) {
        button.compression = targetCompression;
      }
    }

    // Ворота с нажимной плитой закрываются, если с плиты убрали вес.
    for (const gate of this.gates) {
      if (!gate.activationButtonId) continue;
      const source = this.buttons.find((button) => button.id === gate.activationButtonId);
      gate.open = Boolean(source?.pressed);
    }
  }

  drawMechanisms(ctx) {
    // Нажимные плиты визуально сжимаются под весом персонажа.
    for (const button of this.buttons) {
      const active = button.pressed;
      const press = button.compression;
      const plateY = button.y + press;
      const plateHeight = Math.max(4, button.height - press);
      ctx.save();
      const accent = button.accent ?? '#c65cff';
      const bright = button.bright ?? '#f2bdff';
      const dark = button.dark ?? '#672c78';
      const border = button.border ?? '#e6a0f3';
      ctx.shadowColor = active ? bright : accent;
      ctx.shadowBlur = active ? 16 : 7;
      // Основание остаётся неподвижным, верхняя пластина уходит внутрь корпуса.
      ctx.fillStyle = '#171b27';
      ctx.fillRect(button.x - 3, button.y + 2, button.width + 6, button.height + 1);
      ctx.fillStyle = button.accent ? dark : '#3a2049';
      ctx.fillRect(button.x - 1, button.y + button.height - 4, button.width + 2, 3);
      const plate = ctx.createLinearGradient(button.x, plateY, button.x, plateY + plateHeight);
      plate.addColorStop(0, active ? (button.accent ? '#ffffff' : '#fff0ff') : bright);
      plate.addColorStop(.35, active ? (button.accent ? bright : '#ed8aff') : (button.accent ? accent : '#c53fb3'));
      plate.addColorStop(1, dark);
      ctx.fillStyle = plate;
      ctx.fillRect(button.x, plateY, button.width, plateHeight - 1);
      ctx.fillStyle = 'rgba(255,255,255,.82)';
      ctx.fillRect(button.x + 3, plateY + 1, Math.max(1, button.width - 6), Math.min(2, plateHeight - 1));
      if (plateHeight > 8) {
        ctx.fillStyle = active ? '#ffffff' : (button.accent ? dark : 'rgba(72, 32, 83, .72)');
        ctx.fillRect(button.x + 5, plateY + 4, Math.max(1, button.width - 10), 2);
      }
      ctx.strokeStyle = active ? (button.accent ? bright : '#fff0ff') : border;
      ctx.lineWidth = 1.25;
      ctx.strokeRect(button.x + .6, plateY + .6, button.width - 1.2, Math.max(2, plateHeight - 1.2));
      ctx.restore();
    }

    // Закрытые ворота изображены решёткой и используют те же коллизии,
    // которые блокируют проход персонажам.
    for (const gate of this.gates) {
      if (gate.open) continue;
      if (gate.kind === 'green-wall') {
        ctx.save();
        ctx.shadowColor = '#5b9952';
        ctx.shadowBlur = 7;
        const wall = ctx.createLinearGradient(gate.x, gate.y, gate.x + gate.width, gate.y + gate.height);
        wall.addColorStop(0, '#8fc77b');
        wall.addColorStop(.45, '#5b9952');
        wall.addColorStop(1, '#294d2e');
        ctx.fillStyle = wall;
        ctx.fillRect(gate.x, gate.y, gate.width, gate.height);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#b8e6a7';
        ctx.lineWidth = 1;
        ctx.strokeRect(gate.x + .5, gate.y + .5, gate.width - 1, gate.height - 1);
        for (let y = gate.y + 8; y < gate.y + gate.height; y += 14) {
          ctx.fillStyle = 'rgba(15, 48, 22, .55)';
          ctx.fillRect(gate.x + 3, y, gate.width - 6, 2);
        }
        ctx.restore();
        continue;
      }
      ctx.save();
      const glow = gate.activationButtonId ? '#d66bf2' : '#ffc85a';
      ctx.shadowColor = glow;
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(10, 15, 25, .94)';
      ctx.fillRect(gate.x, Math.max(0, gate.y), gate.width, Math.min(this.height, gate.y + gate.height) - Math.max(0, gate.y));
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#505a69';
      ctx.fillRect(gate.x + 2, Math.max(0, gate.y), Math.max(2, gate.width - 4), Math.min(this.height, gate.y + gate.height) - Math.max(0, gate.y));
      ctx.strokeStyle = glow;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gate.x + .75, Math.max(0, gate.y) + .75, gate.width - 1.5, Math.max(1, Math.min(this.height, gate.y + gate.height) - Math.max(0, gate.y) - 1.5));
      for (let y = Math.max(0, gate.y + 4); y < Math.min(this.height, gate.y + gate.height - 2); y += 9) {
        ctx.fillStyle = '#aeb7c5';
        ctx.fillRect(gate.x + 4, y, Math.max(1, gate.width - 8), 2);
      }
      ctx.fillStyle = glow;
      ctx.fillRect(gate.x + 2, Math.max(0, gate.y + 2), Math.max(1, gate.width - 4), 2);
      ctx.restore();
    }

    // Рычаг в янтарной гамме второго файла, с изменением наклона после активации.
    for (const lever of this.levers) {
      ctx.save();
      const active = lever.activated;
      const accent = '#ffc85a';
      ctx.shadowColor = accent;
      ctx.shadowBlur = active ? 18 : 11;
      ctx.fillStyle = '#242833';
      ctx.fillRect(lever.x + 6, lever.y + 8, Math.max(4, lever.width - 12), Math.max(6, lever.height - 8));
      ctx.fillStyle = '#a5a4ad';
      ctx.fillRect(lever.x + 2, lever.y + lever.height - 5, Math.max(1, lever.width - 4), 5);
      ctx.strokeStyle = active ? '#fff0b3' : accent;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(lever.x + lever.width / 2, lever.y + lever.height - 7);
      ctx.lineTo(lever.x + (active ? lever.width - 3 : 4), lever.y + (active ? 4 : 10));
      ctx.stroke();
      ctx.fillStyle = active ? '#fff4c6' : accent;
      ctx.beginPath();
      ctx.arc(lever.x + (active ? lever.width - 3 : 4), lever.y + (active ? 4 : 10), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Подвижный камень: фактический физический объект с коллизией и гравитацией.
    const rock = this.pushableRock;
    if (rock && rock.width > 0 && rock.height > 0) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, .55)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      const rockGradient = ctx.createLinearGradient(rock.x, rock.y, rock.x + rock.width, rock.y + rock.height);
      rockGradient.addColorStop(0, '#aeb9c7');
      rockGradient.addColorStop(.22, '#737f8e');
      rockGradient.addColorStop(.68, '#46515f');
      rockGradient.addColorStop(1, '#222a37');
      ctx.fillStyle = rockGradient;
      ctx.fillRect(rock.x, rock.y, rock.width, rock.height);
      ctx.shadowBlur = 0;
      // Две каменные панели и трещины помогают отличить объект от фона.
      const half = rock.width / 2;
      for (let i = 0; i < 2; i += 1) {
        const rx = rock.x + i * half;
        ctx.fillStyle = i === 0 ? 'rgba(204, 214, 225, .12)' : 'rgba(10, 16, 27, .18)';
        ctx.fillRect(rx + 2, rock.y + 2, half - 4, rock.height - 4);
        ctx.strokeStyle = 'rgba(11, 17, 27, .75)';
        ctx.lineWidth = 1;
        ctx.strokeRect(rx + 2.5, rock.y + 2.5, half - 5, rock.height - 5);
      }
      ctx.strokeStyle = 'rgba(13, 18, 27, .8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(rock.x + rock.width * .27, rock.y + 8);
      ctx.lineTo(rock.x + rock.width * .4, rock.y + 17);
      ctx.lineTo(rock.x + rock.width * .32, rock.y + 25);
      ctx.moveTo(rock.x + rock.width * .72, rock.y + 11);
      ctx.lineTo(rock.x + rock.width * .62, rock.y + 20);
      ctx.lineTo(rock.x + rock.width * .74, rock.y + 29);
      ctx.stroke();
      ctx.fillStyle = 'rgba(235, 242, 250, .65)';
      ctx.fillRect(rock.x + 3, rock.y + 2, rock.width - 6, 2);
      ctx.restore();
    }

    // Подсказка появляется только тогда, когда персонаж находится рядом с рычагом.
    for (const lever of this.levers) {
      if (lever.activated) continue;
      const nearby = this.players.some((player) => {
        if (player.completed) return false;
        if (lever.requiredType && player.type !== lever.requiredType) return false;
        const cx = player.x + player.width / 2;
        const cy = player.y + player.height / 2;
        const lx = lever.x + lever.width / 2;
        const ly = lever.y + lever.height / 2;
        return Math.hypot(cx - lx, cy - ly) <= 48;
      });
      if (!nearby) continue;

      ctx.save();
      const label = 'E — взаимодействовать';
      ctx.font = 'bold 9px Arial, sans-serif';
      const hintWidth = Math.ceil(ctx.measureText(label).width) + 18;
      const hintHeight = 20;
      const hintX = Math.max(4, Math.min(this.width - hintWidth - 4, lever.x + lever.width / 2 - hintWidth / 2));
      const hintY = Math.max(4, lever.y - hintHeight - 7);
      ctx.shadowColor = 'rgba(255, 200, 90, .35)';
      ctx.shadowBlur = 9;
      ctx.fillStyle = 'rgba(18, 23, 34, .96)';
      ctx.fillRect(hintX, hintY, hintWidth, hintHeight);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#ffc85a';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(hintX + .6, hintY + .6, hintWidth - 1.2, hintHeight - 1.2);
      ctx.fillStyle = '#fff0b3';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, hintX + hintWidth / 2, hintY + hintHeight / 2 + .4);
      ctx.restore();
    }
  }

  emitMovementParticles(player) {
    if (this.particles.length > 150) this.particles.splice(0, this.particles.length - 110);

    const direction = Math.sign(player.vx) || player.facing;
    const palette = ELEMENT_TYPES[player.type];
    const backX = direction > 0 ? player.x + 3 : player.x + player.width - 3;
    const lowerBodyY = player.y + player.height * 0.69;

    if (player.type === 'FIRE') {
      const count = Math.abs(player.vx) > 150 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const colors = palette.particle;
        this.particles.push({
          x: backX,
          y: lowerBodyY + Math.random() * 5,
          vx: -direction * (28 + Math.random() * 72) - player.vx * 0.12,
          vy: -18 - Math.random() * 60,
          size: 2 + Math.floor(Math.random() * 3),
          life: 0.22 + Math.random() * 0.25,
          maxLife: 0.47,
          color: colors[Math.floor(Math.random() * colors.length)],
          shape: 'square',
          gravity: 65,
        });
      }
      return;
    }

    if (player.type === 'WATER') {
      // Полупрозрачные голубые кружки с небольшим разбросом по высоте.
      this.particles.push({
        x: backX,
        y: lowerBodyY + Math.random() * 7,
        vx: -direction * (18 + Math.random() * 38) - player.vx * 0.07,
        vy: -5 - Math.random() * 26,
        size: 1.5 + Math.random() * 2,
        life: 0.28 + Math.random() * 0.16,
        maxLife: 0.44,
        color: palette.particle[Math.floor(Math.random() * palette.particle.length)],
        shape: 'circle',
        gravity: 8,
      });
      return;
    }

    if (player.type === 'AIR' && !player.grounded && Math.random() > 0.38) {
      // Мелкие светлые воздушные пылинки появляются у парящего персонажа.
      this.particles.push({
        x: backX,
        y: player.y + player.height * (0.55 + Math.random() * 0.25),
        vx: -direction * (8 + Math.random() * 20),
        vy: 5 + Math.random() * 19,
        size: 1.5 + Math.random() * 1.5,
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.48,
        color: palette.particle[Math.floor(Math.random() * palette.particle.length)],
        shape: 'circle',
        gravity: -8,
      });
    }
  }

  emitEarthLanding(player) {
    if (this.particles.length > 150) this.particles.splice(0, this.particles.length - 110);
    const palette = ELEMENT_TYPES.EARTH;
    const footY = player.y + player.height - 2;
    const footXs = [player.x + player.width * 0.28, player.x + player.width * 0.72];

    for (const footX of footXs) {
      for (let i = 0; i < 3; i += 1) {
        this.particles.push({
          x: footX + (Math.random() - 0.5) * 7,
          y: footY - Math.random() * 2,
          vx: (Math.random() - 0.5) * 135,
          vy: -28 - Math.random() * 95,
          size: 2 + Math.floor(Math.random() * 3),
          life: 0.24 + Math.random() * 0.25,
          maxLife: 0.49,
          color: palette.particle[Math.floor(Math.random() * palette.particle.length)],
          shape: 'square',
          gravity: 180,
        });
      }
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.gravity ?? 65) * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  drawParticles(ctx) {
    for (const particle of this.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = particle.color;
      ctx.shadowBlur = particle.shape === 'circle' ? 4 : 7;
      ctx.fillStyle = particle.color;

      if (particle.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(
          particle.x,
          particle.y,
          Math.max(0.75, particle.size / 2),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else {
        const size = Math.max(1, particle.size * alpha);
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), size, size);
      }
      ctx.restore();
    }
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const targetWidth = Math.max(1, Math.round(rect.width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(rect.height * pixelRatio));

    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.canvas.width = targetWidth;
      this.canvas.height = targetHeight;
    }
    this.render();
  }

  /** Полный сброс состояния без добавления новых DOM-обработчиков или RAF-циклов. */
  reset() {
    this.stopLoop();
    this.resumeAfterVisibility = false;

    const starts = this.playerStarts ?? [
      { x: 100, y: 528 }, { x: 140, y: 528 },
      { x: 180, y: 528 }, { x: 220, y: 528 },
    ];

    this.players.forEach((player, index) => player.reset(starts[index]));
    this.collectibles.forEach((item) => { item.collected = false; });
    for (const platform of this.movingPlatforms) {
      if (typeof platform.restX === 'number') platform.x = platform.restX;
      if (typeof platform.restY === 'number') platform.y = platform.restY;
      platform.targetY = platform.restY ?? platform.y;
      platform.direction = 1;
      if (platform.oscillateY) platform.directionY = -1;
      platform.enabled = false;
    }
    for (const button of this.buttons) {
      button.activated = false;
      button.pressed = false;
      button.compression = 0;
      const platform = this.buttonPlatforms.find((item) => item.buttonId === button.id);
      if (platform) { platform.y = button.y; platform.height = button.height; }
      if ('unlocked' in button) button.unlocked = false;
    }
    for (const lever of this.levers) lever.activated = false;
    for (const gate of this.gates) gate.open = false;
    this.masterConveyorActive = false;
    this.mechanismsUnlocked = false;
    this.interactionConsumed = false;
    this.pushableRock.x = this.pushableRock.startX;
    this.pushableRock.y = this.pushableRock.startY;
    this.pushableRock.vx = 0;
    this.pushableRock.vy = 0;
    this.pushableRock.grounded = false;
    this.particles = [];
    this.elapsedSeconds = 0;
    this.score = 0;
    this.gameState = 'ready';

    if (this.resultOverlayElement) {
      this.resultOverlayElement.hidden = true;
      this.resultOverlayElement.classList.remove('is-victory', 'is-defeat');
    }
    if (this.resultTitleElement) this.resultTitleElement.textContent = 'Уровень пройден!';
    if (this.resultDescriptionElement) {
      this.resultDescriptionElement.textContent = 'Все стихии добрались до своих порталов.';
    }
    if (this.resultScoreElement) this.resultScoreElement.textContent = `0 / ${this.collectibles.length}`;
    if (this.resultStarsElement) {
      this.resultStarsElement.textContent = '☆☆☆☆';
      this.resultStarsElement.setAttribute('aria-label', `0 из ${this.collectibles.length} звёзд`);
    }
    if (this.resultStarsCountElement) this.resultStarsCountElement.textContent = `0 из ${this.collectibles.length} звёзд`;

    this.setStatus('Уровень сброшен. Нажмите «Старт», чтобы начать заново.');
    this.updateHUD();
    this.updateControlButtons();
    this.render();
  }

  restart() {
    this.reset();
    this.start();
  }

  destroy() {
    this.stopLoop();
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.resizeObserver?.disconnect();
  }
}
