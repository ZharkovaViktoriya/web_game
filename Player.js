import { resolvePlatformCollisions } from './collision.js';

/** Палитры, названия и управление четырьмя стихиями. */
export const ELEMENT_TYPES = Object.freeze({
  FIRE: {
    name: 'Огонь',
    base: '#ff754f', light: '#ffe19a', dark: '#c63d3c',
    glow: 'rgba(255, 112, 75, 0.78)', eye: '#2b1720',
    bodyTop: '#ff7b42', bodyMid: '#f34832', bodyBottom: '#b82a39',
    headTop: '#fff19a', headMid: '#ffb329', headBottom: '#ff572e',
    outline: '#ffcf78', particle: ['#ffd15a', '#ff9c35', '#ff5638'],
    controls: { left: ['a', 'keya'], right: ['d', 'keyd'], jump: ['w', 'keyw'] },
  },
  WATER: {
    name: 'Вода',
    base: '#4bc7f0', light: '#d1ffff', dark: '#277fe0',
    glow: 'rgba(78, 202, 247, 0.78)', eye: '#12304e',
    bodyTop: '#55d9ff', bodyMid: '#168ff0', bodyBottom: '#174fbd',
    headTop: '#d7ffff', headMid: '#54d7ff', headBottom: '#1188e3',
    outline: '#c9ffff', particle: ['rgba(120,235,255,0.68)', 'rgba(60,180,255,0.5)', 'rgba(40,135,255,0.42)'],
    controls: { left: ['arrowleft'], right: ['arrowright'], jump: ['arrowup'] },
  },
  EARTH: {
    name: 'Земля',
    base: '#75c878', light: '#d8ffad', dark: '#378452',
    glow: 'rgba(117, 200, 120, 0.55)', eye: '#1d3926',
    bodyTop: '#c9f58d', bodyMid: '#91d36d', bodyBottom: '#42835a',
    headTop: '#b5ed76', headMid: '#71c65e', headBottom: '#397a4c',
    outline: '#d7ff9f', particle: ['#9a7751', '#795a3f', '#c49a65'],
    controls: { left: ['j', 'keyj'], right: ['l', 'keyl'], jump: ['i', 'keyi'] },
  },
  AIR: {
    name: 'Воздух',
    base: '#a7e8ff', light: '#e7fbff', dark: '#51b7e4',
    glow: 'rgba(175, 239, 255, 0.63)', eye: '#234b67',
    bodyTop: 'rgba(250,255,255,0.82)', bodyMid: 'rgba(190,238,255,0.76)', bodyBottom: 'rgba(119,205,239,0.72)',
    headTop: 'rgba(255,255,255,0.95)', headMid: 'rgba(224,250,255,0.88)', headBottom: 'rgba(167,232,255,0.78)',
    outline: 'rgba(245,255,255,0.94)', particle: ['rgba(239,253,255,0.74)', 'rgba(172,234,255,0.55)', 'rgba(111,206,246,0.4)'],
    controls: { left: ['f', 'keyf'], right: ['h', 'keyh'], jump: ['t', 'keyt'] },
  },
});

function moveTowards(current, target, maxDelta) {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function makeVerticalGradient(ctx, x, y, width, height, colors) {
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(0.52, colors[1]);
  gradient.addColorStop(1, colors[2]);
  return gradient;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawSmile(ctx, cx, y, width, color, lineWidth = 1.15) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, y, width, 0.16 * Math.PI, 0.84 * Math.PI, false);
  ctx.stroke();
}

/**
 * Составной персонаж. Игровая рамка (x/y/width/height) нужна физике, а
 * body, head и legs — независимые визуальные модули со своими координатами.
 * Все движения визуальных модулей рассчитываются из update(dt), вызванного RAF.
 */
export default class Player {
  constructor({
    x = 100,
    y = 300,
    width = 28,
    height = 34,
    type = 'FIRE',
    element,
    speed = 250,
    acceleration = 850,
    airAcceleration = 500,
    friction = 1400,
    airFriction = 250,
    jumpStrength = 470,
    gravity = 1120,
    maxJumps,
  } = {}) {
    const requestedType = String(element ?? type).toUpperCase();
    this.type = Object.hasOwn(ELEMENT_TYPES, requestedType) ? requestedType : 'FIRE';
    this.element = this.type.toLowerCase();
    this.name = ELEMENT_TYPES[this.type].name;
    this.controls = ELEMENT_TYPES[this.type].controls;

    this.width = width;
    this.height = height;
    this.speed = speed;
    this.acceleration = acceleration;
    this.airAcceleration = airAcceleration;
    this.friction = friction;
    this.airFriction = airFriction;
    this.jumpStrength = jumpStrength;
    this.gravity = gravity;
    this.maxJumps = maxJumps ?? (this.type === 'AIR' ? 2 : 1);
    this.jumpsUsed = 0;

    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.facing = 1;
    this.completed = false;
    this.deaths = 0;
    this.resetPosition = { x, y };

    // Параметры анимации. Отдельный таймер исключает зависимость от FPS.
    this.animationTime = 0;
    this.animationState = 'idle'; // idle | run | jump
    this.bodyBob = 0;
    this.legSwing = 0;
    this.headOffsetX = 0;
    this.headOffsetY = 0;
    this.tailSquash = 0;
    this.tailVelocity = 0;
    this.fireTipOffset = 0;

    // Визуальные модули с собственными world-координатами.
    this.body = { x, y, width: 0, height: 0 };
    this.head = { x, y, width: 0, height: 0, offsetX: 0, offsetY: 0 };
    this.legs = [
      { x, y, width: 0, height: 0, side: -1 },
      { x, y, width: 0, height: 0, side: 1 },
    ];
    this.syncModules();
  }

  get palette() {
    return ELEMENT_TYPES[this.type];
  }

  update(dt, input, platforms, worldWidth) {
    dt = Math.max(0, Math.min(dt, 1 / 20));
    const previousX = this.x;
    const previousY = this.y;

    if (this.grounded) this.jumpsUsed = 0;

    let horizontal = 0;
    if (input.isDown(...this.controls.left)) horizontal -= 1;
    if (input.isDown(...this.controls.right)) horizontal += 1;

    if (horizontal !== 0) {
      this.facing = horizontal > 0 ? 1 : -1;
      const targetSpeed = horizontal * this.speed;
      const acceleration = this.grounded ? this.acceleration : this.airAcceleration;
      this.vx = moveTowards(this.vx, targetSpeed, acceleration * dt);
    } else {
      const friction = this.grounded ? this.friction : this.airFriction;
      this.vx = moveTowards(this.vx, 0, friction * dt);
    }

    // Воздух сохраняет двойной прыжок, остальные персонажи — обычный.
    // В низком коридоре уменьшаем импульс прыжка по фактическому зазору до
    // потолка, чтобы персонаж не пытался вытолкнуться сквозь платформу.
    if (input.wasPressed(...this.controls.jump) && this.jumpsUsed < this.maxJumps) {
      let availableJumpHeight = (this.jumpStrength * this.jumpStrength) / (2 * this.gravity);
      for (const platform of platforms) {
        const overlapsHorizontally = this.x < platform.x + platform.width &&
          this.x + this.width > platform.x;
        const platformBottom = platform.y + platform.height;
        const isAbovePlayer = platformBottom <= this.y + 1;
        if (!overlapsHorizontally || !isAbovePlayer) continue;
        const clearance = this.y - platformBottom;
        availableJumpHeight = Math.min(availableJumpHeight, Math.max(3, clearance - 2));
      }
      const jumpImpulse = Math.sqrt(2 * this.gravity * availableJumpHeight);
      this.vy = -Math.min(this.jumpStrength, jumpImpulse);
      this.grounded = false;
      this.jumpsUsed += 1;
    }

    this.vy += this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    resolvePlatformCollisions(this, platforms, previousX, previousY);

    const maxX = Math.max(0, worldWidth - this.width);
    this.x = clamp(this.x, 0, maxX);
    if (this.x <= 0 && this.vx < 0) this.vx = 0;
    if (this.x >= maxX && this.vx > 0) this.vx = 0;

    this.updateAnimation(dt);
    this.syncModules();
  }

  updateAnimation(dt) {
    this.animationTime += dt;
    const moving = Math.abs(this.vx) > 24;
    this.animationState = !this.grounded ? 'jump' : moving ? 'run' : 'idle';
    const t = this.animationTime;

    this.bodyBob = 0;
    this.legSwing = 0;
    this.headOffsetX = 0;
    this.headOffsetY = 0;

    if (this.animationState === 'run') {
      const cadence = this.type === 'EARTH' ? 9.5 : 13.5;
      const phase = t * cadence;
      if (this.type === 'EARTH') {
        // Земля двигается дискретно, как тяжёлый каменный персонаж.
        this.bodyBob = Math.round(Math.sin(phase * 2)) * 0.65;
        this.legSwing = Math.round(Math.sin(phase)) * 2.35;
        this.headOffsetX = Math.round(Math.sin(phase * 0.5)) * 0.55;
      } else {
        this.bodyBob = -Math.abs(Math.sin(phase)) * 0.75;
        this.legSwing = Math.sin(phase) * 2.8;
        this.headOffsetX = Math.sin(phase * 0.5) * 0.65;
      }
      this.headOffsetY = Math.sin(phase * 1.1) * 0.5;
    } else if (this.animationState === 'jump') {
      this.bodyBob = this.type === 'EARTH' ? 0 : (this.vy < 0 ? -0.35 : 0.35);
      this.legSwing = this.vy < 0 ? 1.15 : -1.15;
      this.headOffsetX = Math.sin(t * 5) * 0.35;
      this.headOffsetY = this.type === 'AIR' ? Math.sin(t * 3.5) * 0.6 : -0.45;
    } else {
      if (this.type === 'AIR') {
        // Тело и облачная голова парят почти синхронно в состоянии покоя.
        this.bodyBob = Math.sin(t * 2.1) * 1.15;
        this.headOffsetY = Math.sin(t * 2.1 + 0.15) * 0.4;
      } else if (this.type === 'FIRE') {
        this.bodyBob = Math.sin(t * 2.5) * 0.2;
        this.headOffsetY = Math.sin(t * 2.4) * 0.3;
      } else {
        this.bodyBob = Math.sin(t * 1.8) * 0.16;
        this.headOffsetY = Math.sin(t * 2) * 0.2;
      }
    }

    // Верхушка огня колышется даже в покое.
    this.fireTipOffset = Math.sin(t * (this.animationState === 'run' ? 8 : 3.5)) *
      (this.animationState === 'run' ? 1.4 : 0.8);

    // Пружинящий хвост воды: spring-модель реагирует на смену скорости при прыжке.
    if (this.type === 'WATER') {
      const targetSquash = this.animationState === 'jump'
        ? clamp(Math.abs(this.vy) / this.jumpStrength, 0, 1) * 2.25
        : 0;
      this.tailVelocity += (targetSquash - this.tailSquash) * 34 * dt;
      this.tailVelocity *= Math.max(0, 1 - 8.5 * dt);
      this.tailSquash += this.tailVelocity * dt;
    } else {
      this.tailSquash = 0;
      this.tailVelocity = 0;
    }
  }

  /** Пересчитывает независимые координаты модулей от рамки физики. */
  syncModules() {
    const visualX = this.x;
    const visualY = this.y + this.bodyBob;

    // Компактная hitbox-модель 28 × 34 позволяет проходить низкие каменные коридоры.
    // Голова остаётся крупной относительно короткого туловища для chibi-силуэта.
    const bodyWidth = this.width * 0.58;
    const bodyHeight = this.height * 0.29;
    const bodyY = visualY + this.height * 0.59;
    this.body.x = visualX + (this.width - bodyWidth) / 2;
    this.body.y = bodyY;
    this.body.width = bodyWidth;
    this.body.height = bodyHeight;

    // Голова заметно шире и выше туловища. У каждого элемента своя форма:
    // у Огня она вытянутая, у Воды округлая, у Земли почти квадратная,
    // а у Воздуха облако выступает за ширину тела.
    const headWidths = { FIRE: 0.95, WATER: 0.90, EARTH: 0.88, AIR: 1.04 };
    const headHeights = { FIRE: 0.60, WATER: 0.60, EARTH: 0.57, AIR: 0.57 };
    const headWidth = this.width * headWidths[this.type];
    const headHeight = this.height * headHeights[this.type];
    this.head.width = headWidth;
    this.head.height = headHeight;
    this.head.offsetX = this.headOffsetX;
    this.head.offsetY = this.headOffsetY;
    this.head.x = visualX + (this.width - headWidth) / 2 + this.headOffsetX;
    this.head.y = bodyY - headHeight + this.headOffsetY;

    const legWidth = this.width * 0.27;
    const legHeight = this.height * 0.17;
    const legBaseY = visualY + this.height * 0.80;
    const step = this.animationState === 'run' ? this.legSwing : this.animationState === 'jump' ? this.legSwing * 0.45 : 0;
    this.legs[0].width = legWidth;
    this.legs[0].height = legHeight;
    this.legs[0].x = visualX + this.width * 0.18 - step * 0.35;
    this.legs[0].y = legBaseY + Math.max(0, step * 0.22);
    this.legs[1].width = legWidth;
    this.legs[1].height = legHeight;
    this.legs[1].x = visualX + this.width * 0.57 + step * 0.35;
    this.legs[1].y = legBaseY + Math.max(0, -step * 0.22);
  }

  draw(ctx) {
    const palette = this.palette;
    const { body, head } = this;
    const cx = head.x + head.width / 2;
    const eyeY = head.y + head.height * (this.type === 'EARTH' ? 0.52 : 0.54);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Слой 1. Две раздельные овальные ноги с чередованием по синусоиде.
    for (const leg of this.legs) {
      const gradient = makeVerticalGradient(ctx, leg.x, leg.y, leg.width, leg.height, [
        palette.bodyTop, palette.bodyMid, palette.bodyBottom,
      ]);
      ctx.fillStyle = gradient;
      ctx.shadowColor = palette.glow;
      ctx.shadowBlur = this.type === 'FIRE' || this.type === 'WATER' ? 5 : 2;
      ctx.beginPath();
      ctx.ellipse(
        leg.x + leg.width / 2,
        leg.y + leg.height / 2,
        leg.width / 2,
        leg.height / 2,
        this.type === 'EARTH' ? 0 : (leg.side * this.legSwing * 0.018),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }

    // Слой 2. Туловище — самостоятельная округлая капсула с градиентом стихии.
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = this.type === 'FIRE' || this.type === 'WATER' ? 11 : 6;
    const bodyGradient = makeVerticalGradient(ctx, body.x, body.y, body.width, body.height, [
      palette.bodyTop, palette.bodyMid, palette.bodyBottom,
    ]);
    ctx.fillStyle = bodyGradient;
    roundedRectPath(ctx, body.x, body.y, body.width, body.height, body.width * 0.46);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = palette.outline;
    ctx.globalAlpha = this.type === 'AIR' ? 0.68 : 0.8;
    ctx.lineWidth = 1;
    roundedRectPath(ctx, body.x, body.y, body.width, body.height, body.width * 0.46);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Трещины — часть отдельного модуля туловища Земли.
    if (this.type === 'EARTH') this.drawEarthCracks(ctx, body);

    // Слой 3. Голова рисуется отдельной функцией по типу стихии.
    if (this.type === 'FIRE') this.drawFireHead(ctx, head, cx);
    else if (this.type === 'WATER') this.drawWaterHead(ctx, head, cx);
    else if (this.type === 'EARTH') this.drawEarthHead(ctx, head, cx);
    else this.drawAirHead(ctx, head, cx);

    // completed остаётся общей визуальной подсказкой для всех модулей.
    if (this.completed) {
      ctx.strokeStyle = '#f6ffd9';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(this.x - 3, this.y - 3, this.width + 6, this.height + 6);
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  drawFireHead(ctx, head, cx) {
    const p = this.palette;
    const { x, y, width, height } = head;
    const tipX = cx + this.fireTipOffset;
    const gradient = makeVerticalGradient(ctx, x, y, width, height, [
      p.headTop, p.headMid, p.headBottom,
    ]);

    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 13;
    ctx.beginPath();
    ctx.moveTo(tipX, y + 0.5);
    ctx.bezierCurveTo(x + width * 0.82, y + height * 0.08, x + width * 1.01, y + height * 0.48, x + width * 0.82, y + height * 0.73);
    ctx.quadraticCurveTo(x + width * 0.68, y + height * 0.98, cx, y + height);
    ctx.quadraticCurveTo(x + width * 0.18, y + height * 0.96, x + width * 0.11, y + height * 0.7);
    ctx.bezierCurveTo(x - width * 0.04, y + height * 0.43, x + width * 0.2, y + height * 0.15, tipX, y + 0.5);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // Внутреннее ядро пламени.
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,249,177,0.76)';
    ctx.beginPath();
    ctx.moveTo(cx + this.fireTipOffset * 0.35, y + height * 0.35);
    ctx.quadraticCurveTo(cx + width * 0.3, y + height * 0.65, cx, y + height * 0.84);
    ctx.quadraticCurveTo(cx - width * 0.27, y + height * 0.69, cx + this.fireTipOffset * 0.35, y + height * 0.35);
    ctx.fill();

    this.drawFriendlyFace(ctx, cx, y, width, height, '#271520', 'smile');
    ctx.restore();
  }

  drawWaterHead(ctx, head, cx) {
    const p = this.palette;
    const { x, y, width, height } = head;
    const radius = Math.min(width, height) * 0.48;
    const centerY = y + height * 0.53;
    const squash = this.tailSquash;

    ctx.save();
    // Хвостик сзади головы. Пружина сжимается/разжимается во время прыжка.
    ctx.strokeStyle = p.headBottom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.1;
    ctx.beginPath();
    ctx.moveTo(cx + width * 0.08, y + height * 0.24);
    ctx.bezierCurveTo(
      cx + width * (0.24 + squash * 0.02), y - height * (0.04 + squash * 0.025),
      cx + width * (0.02 + squash * 0.015), y - height * (0.2 + squash * 0.02),
      cx - width * 0.18, y + height * (0.05 + squash * 0.03),
    );
    ctx.stroke();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 1;
    ctx.stroke();

    const gradient = makeVerticalGradient(ctx, cx - radius, centerY - radius, radius * 2, radius * 2, [
      p.headTop, p.headMid, p.headBottom,
    ]);
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 12;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, centerY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Характерный блик капли.
    ctx.fillStyle = 'rgba(255,255,255,0.83)';
    ctx.beginPath();
    ctx.ellipse(cx - radius * 0.44, centerY - radius * 0.32, radius * 0.14, radius * 0.31, -0.35, 0, Math.PI * 2);
    ctx.fill();
    this.drawFriendlyFace(ctx, cx, y, width, height, '#12304e', 'smile');
    ctx.restore();
  }

  drawAirHead(ctx, head, cx) {
    const p = this.palette;
    const { x, y, width, height } = head;
    const gradient = makeVerticalGradient(ctx, x, y, width, height, [
      p.headTop, p.headMid, p.headBottom,
    ]);

    ctx.save();
    ctx.shadowColor = p.glow;
    ctx.shadowBlur = 9;
    ctx.fillStyle = gradient;
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 1;
    // Четыре перекрывающихся окружности образуют отдельный облачный модуль.
    const clouds = [
      { x: x + width * 0.23, y: y + height * 0.59, r: height * 0.29 },
      { x: x + width * 0.39, y: y + height * 0.35, r: height * 0.36 },
      { x: x + width * 0.63, y: y + height * 0.37, r: height * 0.34 },
      { x: x + width * 0.79, y: y + height * 0.59, r: height * 0.27 },
    ];
    for (const cloud of clouds) {
      ctx.beginPath();
      ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(cx, y + height * 0.65, width * 0.44, height * 0.31, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Удивлённые круглые глаза и маленький рот остаются непрозрачными.
    const eyeY = y + height * 0.59;
    const eyeDx = width * 0.19;
    for (const eyeX of [cx - eyeDx, cx + eyeDx]) {
      ctx.fillStyle = '#16405a';
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, Math.max(1.6, width * 0.065), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX - 0.45, eyeY - 0.55, Math.max(0.55, width * 0.022), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#16405a';
    ctx.beginPath();
    ctx.ellipse(cx, y + height * 0.79, width * 0.045, height * 0.065, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawEarthHead(ctx, head, cx) {
    const p = this.palette;
    const { x, y, width, height } = head;
    const gradient = makeVerticalGradient(ctx, x, y, width, height, [
      p.headTop, p.headMid, p.headBottom,
    ]);

    ctx.save();
    ctx.shadowColor = 'rgba(97,180,89,0.35)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = gradient;
    ctx.fillRect(x + 1, y + 1, width - 2, height - 1);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = p.outline;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 2);

    // Небольшая полоска мха на верхней грани каменного блока.
    ctx.fillStyle = '#8ce66b';
    ctx.fillRect(x + 3, y, width * 0.42, 2.1);
    ctx.fillStyle = '#c4f58d';
    ctx.fillRect(x + 4, y - 0.5, width * 0.19, 1.3);

    // Суровые прямоугольные глаза и строгое выражение лица.
    const eyeY = y + height * 0.49;
    ctx.fillStyle = p.eye;
    ctx.fillRect(cx - width * 0.28, eyeY, width * 0.2, 1.8);
    ctx.fillRect(cx + width * 0.08, eyeY, width * 0.2, 1.8);
    ctx.fillRect(cx - width * 0.13, y + height * 0.76, width * 0.26, 1.05);
    ctx.restore();
  }

  drawFriendlyFace(ctx, cx, y, width, height, eyeColor, mouth = 'smile') {
    const eyeY = y + height * 0.59;
    const eyeDx = width * 0.18;
    const eyeRadius = Math.max(1.65, width * 0.075);
    for (const eyeX of [cx - eyeDx, cx + eyeDx]) {
      ctx.fillStyle = eyeColor;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(eyeX - eyeRadius * 0.25, eyeY - eyeRadius * 0.28, Math.max(0.55, eyeRadius * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }
    if (mouth === 'smile') {
      drawSmile(ctx, cx, y + height * 0.77, width * 0.16, eyeColor, 1.1);
    }
  }

  drawEarthCracks(ctx, body) {
    const { x, y, width, height } = body;
    const cracks = [
      [[x + width * 0.23, y + height * 0.3], [x + width * 0.34, y + height * 0.46], [x + width * 0.28, y + height * 0.62]],
      [[x + width * 0.73, y + height * 0.22], [x + width * 0.62, y + height * 0.39], [x + width * 0.72, y + height * 0.51]],
      [[x + width * 0.4, y + height * 0.7], [x + width * 0.5, y + height * 0.82]],
    ];
    ctx.save();
    ctx.strokeStyle = 'rgba(39,88,55,0.75)';
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'square';
    for (const crack of cracks) {
      ctx.beginPath();
      ctx.moveTo(crack[0][0], crack[0][1]);
      for (let i = 1; i < crack.length; i += 1) ctx.lineTo(crack[i][0], crack[i][1]);
      ctx.stroke();
    }
    ctx.restore();
  }

  reset({ x = this.resetPosition.x, y = this.resetPosition.y } = {}) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.jumpsUsed = 0;
    this.facing = 1;
    this.completed = false;
    this.deaths = 0;
    this.animationTime = 0;
    this.animationState = 'idle';
    this.bodyBob = 0;
    this.legSwing = 0;
    this.headOffsetX = 0;
    this.headOffsetY = 0;
    this.tailSquash = 0;
    this.tailVelocity = 0;
    this.fireTipOffset = 0;
    this.syncModules();
  }
}
