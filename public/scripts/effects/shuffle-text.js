const gsap = window.gsap;
class ShuffleTextEffect {
  constructor(options = {}) {
    this.charset = options.charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    this.duration = options.duration || 0.8;
    this.iterations = options.iterations || 8;
    this.fps = options.fps || 20;
    console.log('[ShuffleText] Initialized');
  }
  shuffle(element) {
    if (!element) {
      console.error('[ShuffleText] Element not found');
      return;
    }
    const originalText = element.textContent;
    const length = originalText.length;
    const tl = gsap.timeline();
    const frameTime = (this.duration / this.iterations) * 1000;
    for (let i = 0; i <= this.iterations; i++) {
      const delay = (this.duration / this.iterations) * i;
      tl.to(element, {
        duration: 0,
        delay: delay,
        onStart: () => {
          const progress = i / this.iterations;
          let newText = '';
          for (let j = 0; j < length; j++) {
            if (Math.random() < progress) {
              newText += originalText[j];
            } else {
              newText += this.getRandomChar();
            }
          }
          element.textContent = newText;
        }
      });
    }
    tl.to(element, {
      duration: 0,
      onStart: () => {
        element.textContent = originalText;
      }
    });
    return tl;
  }
  getRandomChar() {
    return this.charset[Math.floor(Math.random() * this.charset.length)];
  }
  shuffleAll(selector, stagger = 0.1) {
    const elements = document.querySelectorAll(selector);
    if (elements.length === 0) {
      console.warn('[ShuffleText] No elements found for selector:', selector);
      return;
    }
    elements.forEach((element, index) => {
      setTimeout(() => {
        this.shuffle(element);
      }, stagger * index * 1000);
    });
  }
  applyOnHover(selector) {
    const elements = document.querySelectorAll(selector);
    elements.forEach(element => {
      element.addEventListener('mouseenter', () => {
        this.shuffle(element);
      });
    });
    console.log(`[ShuffleText] Applied hover effect to ${elements.length} elements`);
  }
}
let shuffleTextInstance = null;
function initShuffleText(options = {}) {
  if (!shuffleTextInstance) {
    shuffleTextInstance = new ShuffleTextEffect(options);
  }
  return shuffleTextInstance;
}
export { ShuffleTextEffect, initShuffleText };
export default ShuffleTextEffect;
