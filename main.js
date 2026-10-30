import Game from './Game.js';
import Input from './input.js';
import AudioManager from './audio.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const canvas = $('#game-canvas');
if (!canvas) {
  throw new Error('Не найден canvas с id="game-canvas". Проверьте разметку index.html.');
}

const input = new Input();
const audio = new AudioManager();
const game = new Game(canvas, input);
game.audioManager = audio;

// HTML-элементы HUD, результата и кнопок игрового экрана.
game.messageElement = $('#game-message');
game.scoreElement = $('#score-value');
game.bestScoreElement = $('#best-score-value');
game.collectiblesElement = $('#collectibles-count');
game.starsPreviewElement = $('#stars-preview');
game.resultOverlayElement = $('#result-overlay');
game.resultTitleElement = $('#result-title');
game.resultDescriptionElement = $('#result-description');
game.resultScoreElement = $('#result-score');
game.resultStarsElement = $('#result-stars');
game.resultStarsCountElement = $('#result-stars-count');
game.startButton = $('#start-button');
game.pauseButton = $('#game-pause-button');
game.continueButton = $('#continue-button');
game.restartButtons = $$('[data-game-action="restart"]');

const mainMenuScreen = $('#main-menu-screen');
const levelSelectScreen = $('#level-select-screen');
const gameScreen = $('#game-screen');
const helpDialog = $('#help-dialog');
const settingsDialog = $('#settings-dialog');
const gamePauseDialog = $('#game-pause-dialog');
const gameHelpDialog = $('#game-help-dialog');
const gameSettingsDialog = $('#game-settings-dialog');
const levelNoticeDialog = $('#level-notice-dialog');
const levelDevelopmentOverlay = $('#level-development-overlay');
const musicAudioButtons = $$('[data-audio-toggle="music"]');
const characterSoundsButtons = $$('[data-audio-toggle="character-sounds"]');
const dialogCloseTimers = new Map();
let resumeAfterGameHelp = false;
let gameHelpResumeTimer = null;

const LEVELS = [
  { id: 1, requires: [] },
  { id: 2, requires: [1] },
  { id: 3, requires: [2] },
];
const PROGRESS_KEY = 'elementalTempleCompletedLevels';
const LEVEL_STARS_KEY = 'elementalTempleBestLevelStars';
const LEGACY_LEVEL_STARS_KEY = 'elementalTempleLevelStars';
const MAX_LEVEL_STARS = 4;
let completedLevels = loadCompletedLevels();
let latestStarsByLevel = loadLevelStars();
let currentLevelId = 1;
let selectedTouchPlayer = 'FIRE';
const touchPlayerNames = { FIRE: 'Огонь', WATER: 'Вода', EARTH: 'Земля', AIR: 'Воздух' };
const touchPlayerName = $('#touch-player-name');
const activeTouchPointers = new Map();

// Уровень отмечается пройденным, а количество звёзд хранится как рекорд.
// При повторном прохождении результат обновляется только если он лучше прежнего.
game.onResult = (result, stats = {}) => {
  if (result !== 'victory') return;
  completedLevels.add(currentLevelId);
  const key = String(currentLevelId);
  const earnedStars = Math.max(0, Math.min(MAX_LEVEL_STARS, Math.floor(Number(stats.stars) || 0)));
  latestStarsByLevel[key] = Math.max(latestStarsByLevel[key] ?? 0, earnedStars);
  saveCompletedLevels();
  saveLevelStars();
  renderLevelTree();
};

function loadCompletedLevels() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PROGRESS_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value) => Number.isInteger(value) && value >= 1 && value <= LEVELS.length));
  } catch {
    // Недоступный localStorage не блокирует кампанию в текущей вкладке.
    return new Set();
  }
}

function saveCompletedLevels() {
  try {
    window.localStorage.setItem(PROGRESS_KEY, JSON.stringify([...completedLevels].sort((a, b) => a - b)));
  } catch {
    // Прогресс остаётся действительным в памяти до перезагрузки.
  }
}

function loadLevelStars() {
  try {
    // Переносим старые результаты, если в предыдущей версии игры они уже были сохранены.
    const stored = window.localStorage.getItem(LEVEL_STARS_KEY)
      ?? window.localStorage.getItem(LEGACY_LEVEL_STARS_KEY)
      ?? '{}';
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const normalized = {};
    for (const level of LEVELS) {
      const value = Number(parsed[level.id]);
      if (Number.isFinite(value) && value >= 0 && value <= MAX_LEVEL_STARS) {
        normalized[String(level.id)] = Math.floor(value);
      }
    }
    return normalized;
  } catch {
    // При недоступном localStorage звёзды сохраняются только в памяти.
    return {};
  }
}

function saveLevelStars() {
  try {
    window.localStorage.setItem(LEVEL_STARS_KEY, JSON.stringify(latestStarsByLevel));
  } catch {
    // Не блокируем экран выбора уровней, если хранилище недоступно.
  }
}

function isLevelUnlocked(level) {
  return level.requires.every((requiredLevel) => completedLevels.has(requiredLevel));
}

function renderLevelTree() {
  const map = $('#level-tree-map');

  // Узлы строятся из единого списка уровней, чтобы экран и счётчик кампании
  // не расходились по количеству уровней.
  if (map && map.dataset.rendered !== 'true') {
    map.innerHTML = LEVELS.map((level) => `
      <button type="button" class="level-node node-${level.id}" data-level-node="${level.id}" aria-label="Уровень ${level.id}">
        <span class="level-node-number">${level.id}</span>
        <span class="level-node-stars" aria-label="Звёзды за уровень ещё не получены">
          <span class="level-node-star-icons">${'☆'.repeat(MAX_LEVEL_STARS)}</span>
          <span class="level-node-star-count">0/${MAX_LEVEL_STARS}</span>
        </span>
      </button>
    `).join('');
    map.dataset.rendered = 'true';
  }

  for (const level of LEVELS) {
    const button = $(`[data-level-node="${level.id}"]`, map ?? document);
    if (!button) continue;

    const unlocked = isLevelUnlocked(level);
    const completed = completedLevels.has(level.id);
    const starsRow = $('.level-node-stars', button);
    const starsIcons = $('.level-node-star-icons', button);
    const starsCount = $('.level-node-star-count', button);
    const hasStars = Object.hasOwn(latestStarsByLevel, String(level.id));
    const stars = hasStars ? latestStarsByLevel[String(level.id)] : 0;

    if (starsRow) {
      starsRow.classList.toggle('has-stars', hasStars);
      starsRow.setAttribute('aria-label', hasStars
        ? `Лучший результат: ${stars} из ${MAX_LEVEL_STARS} звёзд`
        : 'Звёзды за уровень ещё не получены');
    }
    if (starsIcons) starsIcons.textContent = '★'.repeat(stars) + '☆'.repeat(MAX_LEVEL_STARS - stars);
    if (starsCount) starsCount.textContent = `${stars}/${MAX_LEVEL_STARS}`;

    button.disabled = !unlocked;
    button.classList.toggle('is-locked', !unlocked);
    button.classList.toggle('is-available', unlocked && !completed);
    button.classList.remove('is-upcoming');
    button.classList.toggle('is-completed', completed);
    const starDescription = hasStars ? `, лучший результат ${stars} из ${MAX_LEVEL_STARS} звёзд` : '';
    button.setAttribute('aria-label', `Уровень ${level.id}, ${completed ? 'пройден' : unlocked ? 'доступен' : 'закрыт'}${starDescription}`);
  }

  const progress = $('#campaign-progress');
  if (progress) progress.textContent = `${completedLevels.size} / ${LEVELS.length}`;
}

function showScreen(screenId) {
  document.body.classList.toggle('is-playing-screen', screenId === 'game-screen');
  const screens = [mainMenuScreen, levelSelectScreen, gameScreen];
  for (const screen of screens) {
    if (screen) screen.hidden = screen.id !== screenId;
  }
  if (screenId === 'game-screen') {
    // После показа скрытого canvas пересчитываем физический размер,
    // сохраняя логический мир 960 × 540.
    game.resizeCanvas();
  }
}

function openDialog(dialog) {
  if (!dialog) return;
  const pendingClose = dialogCloseTimers.get(dialog);
  if (pendingClose !== undefined) {
    window.clearTimeout(pendingClose);
    dialogCloseTimers.delete(dialog);
  }
  dialog.classList.remove('is-closing');
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(dialog) {
  if (!dialog) return;
  const pendingClose = dialogCloseTimers.get(dialog);
  if (pendingClose !== undefined) window.clearTimeout(pendingClose);

  const isOpen = typeof dialog.open === 'boolean'
    ? dialog.open
    : dialog.hasAttribute('open');
  if (!isOpen) return;

  dialog.classList.add('is-closing');
  const timer = window.setTimeout(() => {
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
    dialog.classList.remove('is-closing');
    dialogCloseTimers.delete(dialog);
  }, 360);
  dialogCloseTimers.set(dialog, timer);
}

function openGameHelp() {
  if (!gameHelpDialog) return;
  clearTouchPointers();
  resumeAfterGameHelp = game.gameState === 'playing';
  if (resumeAfterGameHelp) game.pause();
  openDialog(gameHelpDialog);
}

function closeGameHelp() {
  if (!gameHelpDialog) return;
  const shouldResume = resumeAfterGameHelp;
  resumeAfterGameHelp = false;
  closeDialog(gameHelpDialog);

  if (gameHelpResumeTimer !== null) window.clearTimeout(gameHelpResumeTimer);
  gameHelpResumeTimer = null;
  if (shouldResume) {
    // Возвращаем игровой цикл после завершения анимации закрытия окна.
    gameHelpResumeTimer = window.setTimeout(() => {
      gameHelpResumeTimer = null;
      if (!gameHelpDialog.open && !document.hidden && game.gameState === 'paused' && !gamePauseDialog.open) {
        game.resume();
      }
    }, 400);
  }
}

function clearTouchPointers() {
  for (const { button } of activeTouchPointers.values()) button.classList.remove('is-held');
  activeTouchPointers.clear();
  input.clearTouchControls();
}

function updateSelectedTouchPlayer(type) {
  if (!Object.hasOwn(touchPlayerNames, type)) return;
  selectedTouchPlayer = type;
  input.clearTouchControls();
  for (const button of $$('[data-player-select]')) {
    const selected = button.dataset.playerSelect === type;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  }
  if (touchPlayerName) touchPlayerName.textContent = touchPlayerNames[type];
  for (const button of $$('[data-touch-control]')) button.classList.remove('is-held');
  activeTouchPointers.clear();
}

function enterLevel(levelId) {
  const level = LEVELS.find((item) => item.id === levelId);
  if (!level || !isLevelUnlocked(level)) return;

  // На третьем уровне показываем настоящую карту под затемнённым слоем,
  // но игровой цикл не запускаем: уровень пока нельзя проходить.
  clearTouchPointers();
  currentLevelId = levelId;
  game.setLevel(levelId);
  audio.activate();
  if (levelDevelopmentOverlay) levelDevelopmentOverlay.hidden = levelId !== 3;
  showScreen('game-screen');

  if (levelId === 3) {
    game.stopLoop();
    input.setActive?.(false);
    input.endFrame?.();
    game.updateControlButtons();
    game.render();
    return;
  }

  game.start();
}

function returnToLevelSelect() {
  clearTouchPointers();
  if (game.gameState === 'playing') game.pause();
  if (levelDevelopmentOverlay) levelDevelopmentOverlay.hidden = true;
  renderLevelTree();
  showScreen('level-select-screen');
}

function handleClick(event) {
  if (!(event.target instanceof Element)) return;

  const closeButton = event.target.closest('[data-dialog-close]');
  if (closeButton) {
    const dialog = $(`#${closeButton.dataset.dialogClose}`);
    if (dialog === gameHelpDialog) closeGameHelp();
    else closeDialog(dialog);
    return;
  }

  const uiButton = event.target.closest('[data-ui-action]');
  if (uiButton && !uiButton.disabled) {
    switch (uiButton.dataset.uiAction) {
      case 'help': openDialog(helpDialog); return;
      case 'settings': openDialog(settingsDialog); return;
      case 'game-help': openGameHelp(); return;
      case 'open-pause':
        if (game.gameState === 'playing') {
          clearTouchPointers();
          game.pause();
          openDialog(gamePauseDialog);
        }
        return;
      case 'game-settings':
        if (gamePauseDialog?.open) openDialog(gameSettingsDialog);
        return;
      case 'finish-game':
        clearTouchPointers();
        closeDialog(gameSettingsDialog);
        closeDialog(gamePauseDialog);
        game.reset();
        renderLevelTree();
        showScreen('level-select-screen');
        return;
      case 'open-levels':
        audio.activate();
        renderLevelTree();
        showScreen('level-select-screen');
        return;
      case 'back-home':
        clearTouchPointers();
        showScreen('main-menu-screen');
        return;
      case 'level-select':
        returnToLevelSelect();
        return;
      default: break;
    }
  }

  const audioToggleButton = event.target.closest('[data-audio-toggle]');
  if (audioToggleButton && !audioToggleButton.disabled) {
    handleAudioToggle(audioToggleButton);
    return;
  }

  const levelButton = event.target.closest('[data-level-node]');
  if (levelButton && !levelButton.disabled) {
    enterLevel(Number(levelButton.dataset.levelNode));
    return;
  }

  const playerButton = event.target.closest('[data-player-select]');
  if (playerButton) {
    updateSelectedTouchPlayer(playerButton.dataset.playerSelect);
    return;
  }

  const gameActionButton = event.target.closest('[data-game-action]');
  if (!gameActionButton || gameActionButton.disabled) return;

  clearTouchPointers();
  switch (gameActionButton.dataset.gameAction) {
    case 'start': game.start(); break;
    case 'pause':
      if (game.gameState === 'playing') {
        game.pause();
        openDialog(gamePauseDialog);
      }
      break;
    case 'continue':
      closeDialog(gameSettingsDialog);
      closeDialog(gamePauseDialog);
      game.resume();
      break;
    case 'restart':
      closeDialog(gameSettingsDialog);
      closeDialog(gamePauseDialog);
      game.restart();
      break;
    default: break;
  }
}

function handleTouchPointerDown(event) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest('[data-touch-control]');
  if (!button || button.disabled || game.gameState !== 'playing' || gameScreen.hidden) return;

  event.preventDefault();
  const control = button.dataset.touchControl;
  const type = selectedTouchPlayer;
  activeTouchPointers.set(event.pointerId, { type, control, button });
  input.setTouchControl(type, control, true);
  button.classList.add('is-held');
  try {
    button.setPointerCapture(event.pointerId);
  } catch {
    // Pointerup/cancel на документе служит запасным вариантом для WebView.
  }
}

function releaseTouchPointer(event) {
  const held = activeTouchPointers.get(event.pointerId);
  if (!held) return;

  input.setTouchControl(held.type, held.control, false);
  activeTouchPointers.delete(event.pointerId);
  const anotherPointerHoldsSameButton = [...activeTouchPointers.values()].some((item) => item.button === held.button);
  if (!anotherPointerHoldsSameButton) held.button.classList.remove('is-held');
}

function handleDialogBackdrop(event) {
  if (event.target !== event.currentTarget) return;
  // Пауза не закрывается кликом по затемнению: выбор должен быть явным.
  if (event.currentTarget === gamePauseDialog) return;
  if (event.currentTarget === gameHelpDialog) {
    closeGameHelp();
    return;
  }
  closeDialog(event.currentTarget);
}

function syncAudioButtons() {
  const musicOn = Boolean(audio.settings.music);
  const characterSoundsOn = Boolean(audio.settings.characterSounds);

  for (const button of musicAudioButtons) {
    button.setAttribute('aria-pressed', String(musicOn));
    button.setAttribute('aria-label', `Музыка ${musicOn ? 'включена' : 'выключена'}`);
    button.title = `Музыка: ${musicOn ? 'включена' : 'выключена'}`;
  }
  for (const button of characterSoundsButtons) {
    button.setAttribute('aria-pressed', String(characterSoundsOn));
    button.setAttribute('aria-label', `Звуки персонажей ${characterSoundsOn ? 'включены' : 'выключены'}`);
    button.title = `Звуки персонажей: ${characterSoundsOn ? 'включены' : 'выключены'}`;
  }
}

function handleAudioToggle(button) {
  const kind = button.dataset.audioToggle;
  if (kind === 'music') {
    audio.setMusicEnabled(!audio.settings.music);
  } else if (kind === 'character-sounds') {
    const enabled = !audio.settings.characterSounds;
    audio.setCharacterSoundsEnabled(enabled);
    if (enabled) audio.activate();
  }
  syncAudioButtons();
}

function handleDialogCancel(event) {
  event.preventDefault();
  if (event.currentTarget === gameHelpDialog) {
    closeGameHelp();
    return;
  }
  if (event.currentTarget === gamePauseDialog) {
    closeDialog(gameSettingsDialog);
    closeDialog(gamePauseDialog);
    game.resume();
    return;
  }
  closeDialog(event.currentTarget);
}

function handleVisibilityForTouch() {
  audio.handleVisibilityChange();
  if (document.hidden) clearTouchPointers();
}

document.addEventListener('click', handleClick);
document.addEventListener('pointerdown', handleTouchPointerDown, { passive: false });
document.addEventListener('pointerup', releaseTouchPointer);
document.addEventListener('pointercancel', releaseTouchPointer);
window.addEventListener('blur', clearTouchPointers);
document.addEventListener('visibilitychange', handleVisibilityForTouch);

for (const dialog of [helpDialog, settingsDialog, gamePauseDialog, gameHelpDialog, gameSettingsDialog, levelNoticeDialog]) {
  dialog?.addEventListener('click', handleDialogBackdrop);
  dialog?.addEventListener('cancel', handleDialogCancel);
}

// Состояние двух иконок отражает настройки AudioManager.
syncAudioButtons();

renderLevelTree();
game.setStatus('Выберите первый уровень, чтобы начать путешествие.');
game.updateHUD();
game.updateControlButtons();
game.render();

function cleanup() {
  clearTouchPointers();
  document.removeEventListener('click', handleClick);
  document.removeEventListener('pointerdown', handleTouchPointerDown);
  document.removeEventListener('pointerup', releaseTouchPointer);
  document.removeEventListener('pointercancel', releaseTouchPointer);
  window.removeEventListener('blur', clearTouchPointers);
  document.removeEventListener('visibilitychange', handleVisibilityForTouch);
  for (const dialog of [helpDialog, settingsDialog, gamePauseDialog, gameHelpDialog, gameSettingsDialog, levelNoticeDialog]) {
    dialog?.removeEventListener('click', handleDialogBackdrop);
    dialog?.removeEventListener('cancel', handleDialogCancel);
    const timer = dialogCloseTimers.get(dialog);
    if (timer !== undefined) window.clearTimeout(timer);
  }
  dialogCloseTimers.clear();
  if (gameHelpResumeTimer !== null) window.clearTimeout(gameHelpResumeTimer);
  gameHelpResumeTimer = null;
  game.destroy();
  input.destroy();
  audio.destroy();
}

window.addEventListener('pagehide', cleanup, { once: true });
