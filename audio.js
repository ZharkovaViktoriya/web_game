/**
 * Небольшой процедурный аудиодвижок без внешних файлов.
 * Музыка и звуковые эффекты управляются независимо.
 */
const SETTINGS_KEY = 'elementalTempleAudioSettings';

const ELEMENT_TONES = Object.freeze({
  FIRE: 392,
  WATER: 587.33,
  EARTH: 293.66,
  AIR: 739.99,
});

const MELODY = [
  392.00, 493.88, 587.33, 493.88,
  349.23, 392.00, 440.00, 392.00,
  293.66, 349.23, 440.00, 349.23,
  329.63, 392.00, 493.88, 440.00,
];

function safeReadSettings() {
  const defaults = { music: true, characterSounds: true };
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      music: typeof parsed.music === 'boolean' ? parsed.music : defaults.music,
      characterSounds: typeof parsed.characterSounds === 'boolean'
        ? parsed.characterSounds
        : defaults.characterSounds,
    };
  } catch {
    return defaults;
  }
}

export default class AudioManager {
  constructor() {
    this.settings = safeReadSettings();
    this.context = null;
    this.masterGain = null;
    this.musicBus = null;
    this.musicFilter = null;
    this.droneNodes = [];
    this.musicLoopTimer = null;
    this.melodyIndex = 0;
    this.userInteracted = false;
    this.pageHidden = Boolean(document.hidden);
    this.activeSoundSources = new Set();
    this.destroyed = false;
  }

  saveSettings() {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch {
      // Настройки всё равно работают до перезагрузки, даже если хранилище недоступно.
    }
  }

  ensureContext() {
    if (this.destroyed) return null;
    if (this.context && this.context.state !== 'closed') return this.context;

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    try {
      this.context = new AudioContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.58;
      this.masterGain.connect(this.context.destination);
      return this.context;
    } catch {
      this.context = null;
      this.masterGain = null;
      return null;
    }
  }

  activate() {
    if (this.destroyed || document.hidden || this.pageHidden) return;
    this.userInteracted = true;
    const context = this.ensureContext();
    if (!context) return;

    if (context.state === 'suspended') {
      context.resume().then(() => {
        if (!this.pageHidden && !document.hidden && this.settings.music) this.startMusic();
      }).catch(() => {});
      return;
    }
    if (this.settings.music) this.startMusic();
  }

  setMusicEnabled(enabled) {
    this.settings.music = Boolean(enabled);
    this.saveSettings();

    if (this.settings.music) {
      // При переключении вкладки сохраняем выбор, но никогда не будим аудио в фоне.
      if (!document.hidden && !this.pageHidden) this.activate();
    } else {
      this.stopMusic();
    }
  }

  setCharacterSoundsEnabled(enabled) {
    this.settings.characterSounds = Boolean(enabled);
    this.saveSettings();
  }

  startMusic() {
    if (!this.settings.music || !this.userInteracted || this.pageHidden || document.hidden || this.musicBus) return;
    const context = this.ensureContext();
    if (!context || !this.masterGain) return;

    this.musicBus = context.createGain();
    this.musicBus.gain.value = 0.46;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1250;
    this.musicFilter = filter;
    this.musicBus.connect(filter);
    filter.connect(this.masterGain);

    // Низкий тихий фон создаёт атмосферу подземелья.
    for (const [frequency, volume, wave] of [
      [73.42, 0.12, 'triangle'],
      [110.00, 0.075, 'sine'],
      [146.83, 0.035, 'sine'],
    ]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.value = volume;
      oscillator.connect(gain);
      gain.connect(this.musicBus);
      oscillator.start();
      this.droneNodes.push({ oscillator, gain });
    }

    this.melodyIndex = 0;
    this.playNextMelodyNote();
  }

  playNextMelodyNote() {
    if (!this.musicBus || !this.settings.music || this.destroyed || this.pageHidden || document.hidden) return;
    const frequency = MELODY[this.melodyIndex % MELODY.length];
    this.melodyIndex += 1;
    this.playTone(frequency, {
      duration: 0.64,
      volume: 0.075,
      wave: 'sine',
      bus: this.musicBus,
    });
    this.musicLoopTimer = window.setTimeout(() => {
      this.musicLoopTimer = null;
      this.playNextMelodyNote();
    }, 720);
  }

  stopMusic() {
    if (this.musicLoopTimer !== null) {
      window.clearTimeout(this.musicLoopTimer);
      this.musicLoopTimer = null;
    }

    for (const node of this.droneNodes) {
      try { node.oscillator.stop(); } catch { /* Уже остановлен. */ }
      try { node.oscillator.disconnect(); } catch { /* Игнорируем отключённый узел. */ }
      try { node.gain.disconnect(); } catch { /* Игнорируем отключённый узел. */ }
    }
    this.droneNodes = [];

    if (this.musicBus) {
      try { this.musicBus.disconnect(); } catch { /* Игнорируем отключённый узел. */ }
      this.musicBus = null;
    }
    if (this.musicFilter) {
      try { this.musicFilter.disconnect(); } catch { /* Игнорируем отключённый узел. */ }
      this.musicFilter = null;
    }
  }

  playTone(frequency, {
    duration = 0.16,
    volume = 0.12,
    wave = 'sine',
    bus = this.masterGain,
    startAt = 0,
  } = {}) {
    const context = this.ensureContext();
    if (!context || !bus || this.destroyed || this.pageHidden || document.hidden) return;

    try {
      const now = context.currentTime + Math.max(0, startAt);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = wave;
      oscillator.frequency.setValueAtTime(Math.max(30, frequency), now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.045, duration));
      oscillator.connect(gain);
      gain.connect(bus);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.025);
      this.activeSoundSources.add(oscillator);
      oscillator.addEventListener('ended', () => {
        this.activeSoundSources.delete(oscillator);
        try { oscillator.disconnect(); } catch { /* Уже отключён. */ }
        try { gain.disconnect(); } catch { /* Уже отключён. */ }
      }, { once: true });
    } catch {
      // Звук не должен ломать игровой процесс в браузерах с ограниченным Web Audio.
    }
  }

  playBreath({ duration = 0.12, volume = 0.08, frequency = 1200, sharpness = 0.7, startAt = 0 } = {}) {
    const context = this.ensureContext();
    if (!context || !this.masterGain || this.destroyed || this.pageHidden || document.hidden) return;

    try {
      const length = Math.max(1, Math.ceil(context.sampleRate * duration));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const samples = buffer.getChannelData(0);
      // Шумовой сигнал создаёт мягкий воздушный звук вместо синтетического тона.
      for (let index = 0; index < samples.length; index += 1) {
        const position = index / Math.max(1, samples.length - 1);
        const fadeIn = Math.min(1, position * 32);
        const fadeOut = Math.pow(1 - position, 1.25);
        samples[index] = (Math.random() * 2 - 1) * fadeIn * fadeOut;
      }

      const now = context.currentTime + Math.max(0, startAt);
      const source = context.createBufferSource();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      source.buffer = buffer;
      filter.type = 'bandpass';
      filter.Q.value = Math.max(0.35, sharpness);
      filter.frequency.setValueAtTime(frequency * 1.45, now);
      filter.frequency.exponentialRampToValueAtTime(
        Math.max(120, frequency * 0.62),
        now + duration,
      );
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.012, duration * 0.2));
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);
      source.start(now);
      source.stop(now + duration + 0.02);
      this.activeSoundSources.add(source);
      source.addEventListener('ended', () => {
        this.activeSoundSources.delete(source);
        try { source.disconnect(); } catch { /* Уже отключён. */ }
        try { filter.disconnect(); } catch { /* Уже отключён. */ }
        try { gain.disconnect(); } catch { /* Уже отключён. */ }
      }, { once: true });
    } catch {
      // Эффекты звука не должны мешать игровому циклу.
    }
  }

  /**
   * Полностью глушит звук в фоновой вкладке и возобновляет музыку при возврате.
   * Короткие эффекты обрываются, а не продолжаются после возврата.
   */
  handleVisibilityChange() {
    const hidden = Boolean(document.hidden);
    this.pageHidden = hidden;

    if (hidden) {
      this.stopMusic();
      for (const source of this.activeSoundSources) {
        try { source.stop(); } catch { /* Уже остановлен или завершён. */ }
        try { source.disconnect(); } catch { /* Уже отключён. */ }
      }
      this.activeSoundSources.clear();

      if (this.context && this.context.state === 'running') {
        this.context.suspend().catch(() => {});
      }
      return;
    }

    if (!this.userInteracted || this.destroyed) return;
    const context = this.ensureContext();
    if (!context) return;
    // Всегда запрашиваем resume: это закрывает гонку, если пользователь
    // быстро переключил вкладку туда-обратно во время suspend().
    context.resume().then(() => {
      if (!document.hidden && !this.pageHidden && this.settings.music) this.startMusic();
    }).catch(() => {
      // Если контекст уже работает, музыку можно запустить напрямую.
      if (!document.hidden && !this.pageHidden && context.state === 'running' && this.settings.music) {
        this.startMusic();
      }
    });
  }

  playCharacter(action, type = 'FIRE') {
    if (!this.settings.characterSounds || !this.userInteracted || this.destroyed || this.pageHidden || document.hidden) return;
    const context = this.ensureContext();
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => {});

    const base = ELEMENT_TONES[type] ?? ELEMENT_TONES.FIRE;
    switch (action) {
      case 'jump':
        // Короткий мягкий выдох — лёгкий воздушный шум с быстрым затуханием.
        this.playBreath({ duration: 0.105, volume: 0.075, frequency: 1450, sharpness: 0.62 });
        break;
      case 'collect':
        this.playTone(base * 1.5, { duration: 0.12, volume: 0.13, wave: 'sine' });
        this.playTone(base * 2, { duration: 0.19, volume: 0.09, wave: 'triangle', startAt: 0.075 });
        break;
      case 'victory':
        [1, 1.25, 1.5].forEach((ratio, index) => {
          this.playTone(523.25 * ratio, { duration: 0.3, volume: 0.11, wave: 'triangle', startAt: index * 0.12 });
        });
        break;
      case 'defeat':
        // Резкий более низкий выдох и короткий воздушный удар в начале.
        this.playBreath({ duration: 0.27, volume: 0.19, frequency: 760, sharpness: 1.05 });
        this.playBreath({ duration: 0.075, volume: 0.085, frequency: 2050, sharpness: 0.7, startAt: 0.008 });
        break;
      default:
        break;
    }
  }

  destroy() {
    this.destroyed = true;
    this.stopMusic();
    for (const source of this.activeSoundSources) {
      try { source.stop(); } catch { /* Уже остановлен. */ }
      try { source.disconnect(); } catch { /* Уже отключён. */ }
    }
    this.activeSoundSources.clear();
    if (this.context && this.context.state !== 'closed') {
      this.context.close().catch(() => {});
    }
    this.context = null;
    this.masterGain = null;
  }
}
