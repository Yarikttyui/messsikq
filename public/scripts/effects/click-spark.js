class ClickSparkEffect {
  constructor(options = {}) {
    this.sparkColor = options.sparkColor || '#6366f1';
    this.sparkSize = options.sparkSize || 10;
    this.sparkRadius = options.sparkRadius || 20;
    this.sparkCount = options.sparkCount || 8;
    this.duration = options.duration || 500;
    this.easing = options.easing || 'ease-out';
    this.extraScale = options.extraScale || 1.0;
    this.canvas = null;
    this.ctx = null;
    this.sparks = [];
    this.animationFrame = null;
    console.log('[ClickSpark] Initialized with options:', options);
  }
  init() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'clickSparkCanvas';
    Object.assign(this.canvas.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      pointerEvents: 'none',
      zIndex: '9999'
    });
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    document.addEventListener('click', (e) => this.handleClick(e));
    this.startAnimation();
    console.log('[ClickSpark] Initialized and ready');
  }
  resizeCanvas() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }
  handleClick(e) {
    const x = e.clientX;
    const y = e.clientY;
    const now = performance.now();
    for (let i = 0; i < this.sparkCount; i++) {
      this.sparks.push({
        x,
        y,
        angle: (2 * Math.PI * i) / this.sparkCount,
        startTime: now
      });
    }
  }
  ease(t) {
    switch (this.easing) {
      case 'linear':
        return t;
      case 'ease-in':
        return t * t;
      case 'ease-in-out':
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      default: // ease-out
        return t * (2 - t);
    }
  }
  startAnimation() {
    const animate = (timestamp) => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      this.sparks = this.sparks.filter(spark => {
        const elapsed = timestamp - spark.startTime;
        if (elapsed >= this.duration) {
          return false; // Удалить искру
        }
        const progress = elapsed / this.duration;
        const eased = this.ease(progress);
        const distance = eased * this.sparkRadius * this.extraScale;
        const lineLength = this.sparkSize * (1 - eased);
        const x1 = spark.x + distance * Math.cos(spark.angle);
        const y1 = spark.y + distance * Math.sin(spark.angle);
        const x2 = spark.x + (distance + lineLength) * Math.cos(spark.angle);
        const y2 = spark.y + (distance + lineLength) * Math.sin(spark.angle);
        this.ctx.strokeStyle = this.sparkColor;
        this.ctx.lineWidth = 2;
        this.ctx.lineCap = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(x1, y1);
        this.ctx.lineTo(x2, y2);
        this.ctx.stroke();
        return true; // Оставить искру
      });
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }
  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.canvas) {
      this.canvas.remove();
    }
    console.log('[ClickSpark] Destroyed');
  }
}
let clickSparkInstance = null;
function initClickSpark(options = {}) {
  if (clickSparkInstance) {
    clickSparkInstance.destroy();
  }
  clickSparkInstance = new ClickSparkEffect(options);
  clickSparkInstance.init();
  return clickSparkInstance;
}
export { ClickSparkEffect, initClickSpark };
export default ClickSparkEffect;
