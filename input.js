const CONTROL_KEYS = new Set([
  'a', 'd', 'w', 'e', ' ', 'j', 'l', 'i', 'f', 'h', 't',
  'arrowleft', 'arrowright', 'arrowup',
  'keya', 'keyd', 'keyw', 'keye', 'keyj', 'keyl', 'keyi', 'keyf', 'keyh', 'keyt', 'space',
]);

const TOUCH_KEYS = Object.freeze({
  FIRE: { left: 'a', right: 'd', jump: 'w', interact: 'e' },
  WATER: { left: 'arrowleft', right: 'arrowright', jump: 'arrowup', interact: 'e' },
  EARTH: { left: 'j', right: 'l', jump: 'i', interact: 'e' },
  AIR: { left: 'f', right: 'h', jump: 't', interact: 'e' },
});

const TEXT_INPUT_SELECTOR = 'input, textarea, select, [contenteditable="true"]';
const BUTTON_SELECTOR = 'button, a';

export default class Input {
  constructor() {
    this.keysDown = new Set();
    this.touchKeys = new Set();
    this.justPressed = new Set();
    this.active = false;

    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleKeyUp = this.handleKeyUp.bind(this);
    this.handleBlur = this.handleBlur.bind(this);

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  setActive(active) {
    this.active = Boolean(active);
    if (!this.active) {
      this.keysDown.clear();
      this.touchKeys.clear();
      this.justPressed.clear();
    }
  }

  handleKeyDown(event) {
    if (!this.active) return;

    const key = event.key.toLowerCase();
    const code = event.code.toLowerCase();
    if (!CONTROL_KEYS.has(key) && !CONTROL_KEYS.has(code)) return;

    const target = event.target;
    const isElementTarget = target instanceof Element;
    const isTextInput = isElementTarget && target.closest(TEXT_INPUT_SELECTOR);
    const isButtonTarget = isElementTarget && target.closest(BUTTON_SELECTOR);
    const isSpaceKey = key === ' ' || code === 'space';

    if (isTextInput) return;
    if (isButtonTarget && isSpaceKey) return;

    event.preventDefault();

    const wasDown = this.keysDown.has(key) || this.keysDown.has(code);
    this.keysDown.add(key);
    this.keysDown.add(code);
    if (!wasDown) {
      this.justPressed.add(key);
      this.justPressed.add(code);
    }
  }

  handleKeyUp(event) {
    this.keysDown.delete(event.key.toLowerCase());
    this.keysDown.delete(event.code.toLowerCase());
  }

  handleBlur() {
    this.keysDown.clear();
    this.touchKeys.clear();
    this.justPressed.clear();
  }

  /**
   * Нажатие экранной кнопки. Клавиша остаётся активной всё время,
   * пока палец удерживает кнопку, и освобождается по pointerup/cancel.
   */
  setTouchControl(type, control, pressed) {
    if (!this.active) return;
    const key = TOUCH_KEYS[String(type).toUpperCase()]?.[control];
    if (!key) return;

    if (pressed) {
      if (!this.keysDown.has(key) && !this.touchKeys.has(key)) {
        this.justPressed.add(key);
      }
      this.touchKeys.add(key);
    } else {
      this.touchKeys.delete(key);
    }
  }

  clearTouchControls() {
    this.touchKeys.clear();
    // Не переносим случайное нажатие прыжка на выбранную следующую стихию.
    this.justPressed.clear();
  }

  isDown(...keys) {
    return keys.some((value) => {
      const key = String(value).toLowerCase();
      return this.keysDown.has(key) || this.touchKeys.has(key);
    });
  }

  wasPressed(...keys) {
    return keys.some((key) => this.justPressed.has(String(key).toLowerCase()));
  }

  endFrame() {
    this.justPressed.clear();
  }

  destroy() {
    this.setActive(false);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
