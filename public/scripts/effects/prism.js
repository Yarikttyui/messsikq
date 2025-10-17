const OGL_SOURCE = '/node_modules/ogl/src/index.js';
let oglPromise = null;
function loadOgl() {
  if (!oglPromise) {
    oglPromise = import(OGL_SOURCE);
  }
  return oglPromise;
}
const DEFAULT_OPTIONS = {
  height: 3.5,
  baseWidth: 5.5,
  animationType: 'rotate',
  glow: 1,
  offset: { x: 0, y: 0 },
  noise: 0.5,
  transparent: true,
  scale: 3.6,
  hueShift: 0,
  colorFrequency: 1,
  hoverStrength: 2,
  inertia: 0.05,
  bloom: 1,
  suspendWhenOffscreen: false,
  timeScale: 0.5
};
export class PrismEffect {
  constructor(container, options = {}) {
    this.container = container;
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._renderer = null;
    this._gl = null;
    this._program = null;
    this._mesh = null;
    this._resizeObserver = null;
    this._intersectionObserver = null;
    this._listeners = [];
    this._cleanupFns = [];
    this._raf = 0;
    this._pointer = { x: 0, y: 0, inside: true };
    this._runtime = null;
    this._startTime = performance.now();
    this._initialized = false;
    this._initializing = false;
    this._destroyRequested = false;
    this._initPromise = null;
    this._render = this._render.bind(this);
    this._pointerMove = this._pointerMove.bind(this);
    this._pointerLeave = this._pointerLeave.bind(this);
    this._onBlur = this._onBlur.bind(this);
    if (!container) return;
    this._initializing = true;
    this._initPromise = this._setup()
      .catch((error) => {
        console.error('[PrismEffect] Failed to initialise', error);
      })
      .finally(() => {
        this._initializing = false;
        if (this._destroyRequested) {
          this._destroyRequested = false;
          this.destroy();
        }
      });
  }
  resume() {
    if (this._destroyRequested) this._destroyRequested = false;
    if (this._initializing) {
      this._initPromise?.then(() => this._startRAF());
      return;
    }
    if (!this._initialized) {
      this._initializing = true;
      this._initPromise = this._setup()
        .catch((error) => {
          console.error('[PrismEffect] Failed to resume', error);
        })
        .finally(() => {
          this._initializing = false;
          if (this._destroyRequested) {
            this._destroyRequested = false;
            this.destroy();
          }
        });
      return;
    }
    this._startRAF();
  }
  pause() {
    this._stopRAF();
  }
  destroy() {
    if (this._initializing) {
      this._destroyRequested = true;
      return;
    }
    if (!this._initialized) return;
    this._stopRAF();
    this._listeners.forEach(({ target, type, handler }) => {
      target.removeEventListener(type, handler);
    });
    this._listeners = [];
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._intersectionObserver) {
      this._intersectionObserver.disconnect();
      this._intersectionObserver = null;
    }
    this._cleanupFns.forEach((fn) => {
      try {
        fn?.();
      } catch (error) {
        console.warn('[PrismEffect] Cleanup callback failed', error);
      }
    });
    this._cleanupFns = [];
    if (this._gl?.canvas && this._gl.canvas.parentElement === this.container) {
      this.container.removeChild(this._gl.canvas);
    }
    this._renderer = null;
    this._gl = null;
    this._program = null;
    this._mesh = null;
    this._runtime = null;
    this._initialized = false;
  }
  async _setup() {
    const container = this.container;
    if (!container) return;
    const {
      height,
      baseWidth,
      animationType,
      glow,
      offset,
      noise,
      transparent,
      scale,
      hueShift,
      colorFrequency,
      hoverStrength,
      inertia,
      bloom,
      suspendWhenOffscreen,
      timeScale
    } = this.options;
    const { Renderer, Triangle, Program, Mesh } = await loadOgl();
    const H = Math.max(0.001, height);
    const BW = Math.max(0.001, baseWidth);
    const BASE_HALF = BW * 0.5;
    const GLOW = Math.max(0.0, glow);
    const NOISE = Math.max(0.0, noise);
    const offX = offset?.x ?? 0;
    const offY = offset?.y ?? 0;
    const SAT = transparent ? 1.5 : 1;
    const SCALE = Math.max(0.001, scale);
    const HUE = hueShift || 0;
    const CFREQ = Math.max(0.0, colorFrequency || 1);
    const BLOOM = Math.max(0.0, bloom || 1);
    const RSX = 1;
    const RSY = 1;
    const RSZ = 1;
    const TS = Math.max(0, timeScale || 1);
    const HOVSTR = Math.max(0, hoverStrength || 1);
    const INERT = Math.max(0, Math.min(1, inertia || 0.12));
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const renderer = new Renderer({
      dpr,
      alpha: transparent,
      antialias: false
    });
    const gl = renderer.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    Object.assign(gl.canvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      display: 'block'
    });
    container.appendChild(gl.canvas);
    const vertex =  `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragment =  `
      precision highp float;
      uniform vec2  iResolution;
      uniform float iTime;
      uniform float uHeight;
      uniform float uBaseHalf;
      uniform mat3  uRot;
      uniform int   uUseBaseWobble;
      uniform float uGlow;
      uniform vec2  uOffsetPx;
      uniform float uNoise;
      uniform float uSaturation;
      uniform float uScale;
      uniform float uHueShift;
      uniform float uColorFreq;
      uniform float uBloom;
      uniform float uCenterShift;
      uniform float uInvBaseHalf;
      uniform float uInvHeight;
      uniform float uMinAxis;
      uniform float uPxScale;
      uniform float uTimeScale;
      vec4 tanh4(vec4 x){
        vec4 e2x = exp(2.0*x);
        return (e2x - 1.0) / (e2x + 1.0);
      }
      float rand(vec2 co){
        return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453123);
      }
      float sdOctaAnisoInv(vec3 p){
        vec3 q = vec3(abs(p.x) * uInvBaseHalf, abs(p.y) * uInvHeight, abs(p.z) * uInvBaseHalf);
        float m = q.x + q.y + q.z - 1.0;
        return m * uMinAxis * 0.5773502691896258;
      }
      float sdPyramidUpInv(vec3 p){
        float oct = sdOctaAnisoInv(p);
        float halfSpace = -p.y;
        return max(oct, halfSpace);
      }
      mat3 hueRotation(float a){
        float c = cos(a), s = sin(a);
        mat3 W = mat3(
          0.299, 0.587, 0.114,
          0.299, 0.587, 0.114,
          0.299, 0.587, 0.114
        );
        mat3 U = mat3(
           0.701, -0.587, -0.114,
          -0.299,  0.413, -0.114,
          -0.300, -0.588,  0.886
        );
        mat3 V = mat3(
           0.168, -0.331,  0.500,
           0.328,  0.035, -0.500,
          -0.497,  0.296,  0.201
        );
        return W + U * c + V * s;
      }
      void main(){
        vec2 f = (gl_FragCoord.xy - 0.5 * iResolution.xy - uOffsetPx) * uPxScale;
        float z = 5.0;
        float d = 0.0;
        vec3 p;
        vec4 o = vec4(0.0);
        float centerShift = uCenterShift;
        float cf = uColorFreq;
        mat2 wob = mat2(1.0);
        if (uUseBaseWobble == 1) {
          float t = iTime * uTimeScale;
          float c0 = cos(t + 0.0);
          float c1 = cos(t + 33.0);
          float c2 = cos(t + 11.0);
          wob = mat2(c0, c1, c2, c0);
        }
        const int STEPS = 100;
        for (int i = 0; i < STEPS; i++) {
          p = vec3(f, z);
          p.xz = p.xz * wob;
          p = uRot * p;
          vec3 q = p;
          q.y += centerShift;
          d = 0.1 + 0.2 * abs(sdPyramidUpInv(q));
          z -= d;
          o += (sin((p.y + z) * cf + vec4(0.0, 1.0, 2.0, 3.0)) + 1.0) / d;
        }
        o = tanh4(o * o * (uGlow * uBloom) / 1e5);
        vec3 col = o.rgb;
        float n = rand(gl_FragCoord.xy + vec2(iTime));
        col += (n - 0.5) * uNoise;
        col = clamp(col, 0.0, 1.0);
        float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = clamp(mix(vec3(L), col, uSaturation), 0.0, 1.0);
        if(abs(uHueShift) > 0.0001){
          col = clamp(hueRotation(uHueShift) * col, 0.0, 1.0);
        }
        gl_FragColor = vec4(col, o.a);
      }
    `;
    const geometry = new Triangle(gl);
    const iResBuf = new Float32Array(2);
    const offsetPxBuf = new Float32Array(2);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iResolution: { value: iResBuf },
        iTime: { value: 0 },
        uHeight: { value: H },
        uBaseHalf: { value: BASE_HALF },
        uUseBaseWobble: { value: 1 },
        uRot: { value: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]) },
        uGlow: { value: GLOW },
        uOffsetPx: { value: offsetPxBuf },
        uNoise: { value: NOISE },
        uSaturation: { value: SAT },
        uScale: { value: SCALE },
        uHueShift: { value: HUE },
        uColorFreq: { value: CFREQ },
        uBloom: { value: BLOOM },
        uCenterShift: { value: H * 0.25 },
        uInvBaseHalf: { value: 1 / BASE_HALF },
        uInvHeight: { value: 1 / H },
        uMinAxis: { value: Math.min(BASE_HALF, H) },
        uPxScale: {
          value: 1 / ((gl.drawingBufferHeight || 1) * 0.1 * SCALE)
        },
        uTimeScale: { value: TS }
      }
    });
    const mesh = new Mesh(gl, { geometry, program });
    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h);
      iResBuf[0] = gl.drawingBufferWidth;
      iResBuf[1] = gl.drawingBufferHeight;
      offsetPxBuf[0] = offX * dpr;
      offsetPxBuf[1] = offY * dpr;
      program.uniforms.uPxScale.value = 1 / ((gl.drawingBufferHeight || 1) * 0.1 * SCALE);
    };
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(resize);
      this._resizeObserver.observe(container);
    } else {
      const handler = () => resize();
      window.addEventListener('resize', handler);
      this._listeners.push({ target: window, type: 'resize', handler });
    }
    resize();
    const rotBuf = new Float32Array(9);
    const setMat3FromEuler = (yawY, pitchX, rollZ, out) => {
      const cy = Math.cos(yawY),
        sy = Math.sin(yawY);
      const cx = Math.cos(pitchX),
        sx = Math.sin(pitchX);
      const cz = Math.cos(rollZ),
        sz = Math.sin(rollZ);
      const r00 = cy * cz + sy * sx * sz;
      const r01 = -cy * sz + sy * sx * cz;
      const r02 = sy * cx;
      const r10 = cx * sz;
      const r11 = cx * cz;
      const r12 = -sx;
      const r20 = -sy * cz + cy * sx * sz;
      const r21 = sy * sz + cy * sx * cz;
      const r22 = cy * cx;
      out[0] = r00;
      out[1] = r10;
      out[2] = r20;
      out[3] = r01;
      out[4] = r11;
      out[5] = r21;
      out[6] = r02;
      out[7] = r12;
      out[8] = r22;
      return out;
    };
    const NOISE_IS_ZERO = NOISE < 1e-6;
    const rnd = () => Math.random();
    const wX = (0.3 + rnd() * 0.6) * RSX;
    const wY = (0.2 + rnd() * 0.7) * RSY;
    const wZ = (0.1 + rnd() * 0.5) * RSZ;
    const phX = rnd() * Math.PI * 2;
    const phZ = rnd() * Math.PI * 2;
    this._runtime = {
      yaw: 0,
      pitch: 0,
      roll: 0,
      targetYaw: 0,
      targetPitch: 0,
      rotBuf,
      wX,
      wY,
      wZ,
      phX,
      phZ,
      NOISE_IS_ZERO,
      TS,
      HOVSTR,
      INERT,
      setMat3FromEuler
    };
    this._pointer = { x: 0, y: 0, inside: true };
    const pointerOptions = { passive: true };
    if (animationType === 'hover') {
      window.addEventListener('pointermove', this._pointerMove, pointerOptions);
      window.addEventListener('mouseleave', this._pointerLeave, pointerOptions);
      window.addEventListener('blur', this._onBlur, pointerOptions);
      this._listeners.push(
        { target: window, type: 'pointermove', handler: this._pointerMove },
        { target: window, type: 'mouseleave', handler: this._pointerLeave },
        { target: window, type: 'blur', handler: this._onBlur }
      );
      program.uniforms.uUseBaseWobble.value = 0;
    } else if (animationType === '3drotate') {
      program.uniforms.uUseBaseWobble.value = 0;
    } else {
      program.uniforms.uUseBaseWobble.value = 1;
    }
    this._startTime = performance.now();
    this._renderer = renderer;
    this._gl = gl;
    this._program = program;
    this._mesh = mesh;
    this._animationType = animationType;
    this._initialized = true;
    if (suspendWhenOffscreen && typeof IntersectionObserver !== 'undefined') {
      this._intersectionObserver = new IntersectionObserver((entries) => {
        const visible = entries.some((entry) => entry.isIntersecting);
        if (visible) this._startRAF();
        else this._stopRAF();
      });
      this._intersectionObserver.observe(container);
      this._startRAF();
    } else {
      this._startRAF();
    }
  }
  _pointerMove(event) {
    const pointer = this._pointer;
    const ww = Math.max(1, window.innerWidth);
    const wh = Math.max(1, window.innerHeight);
    const cx = ww * 0.5;
    const cy = wh * 0.5;
    const nx = (event.clientX - cx) / (ww * 0.5);
    const ny = (event.clientY - cy) / (wh * 0.5);
    pointer.x = Math.max(-1, Math.min(1, nx));
    pointer.y = Math.max(-1, Math.min(1, ny));
    pointer.inside = true;
    this._startRAF();
  }
  _pointerLeave() {
    if (this._pointer) {
      this._pointer.inside = false;
    }
  }
  _onBlur() {
    if (this._pointer) {
      this._pointer.inside = false;
    }
  }
  _startRAF() {
    if (!this._initialized || this._raf) return;
    this._raf = requestAnimationFrame(this._render);
  }
  _stopRAF() {
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = 0;
    }
  }
  _render(time) {
    if (!this._initialized || !this._runtime) return;
    const { yaw, pitch, roll, rotBuf, wX, wY, wZ, phX, phZ, NOISE_IS_ZERO, TS, HOVSTR, INERT, setMat3FromEuler } =
      this._runtime;
    const pointer = this._pointer;
    const program = this._program;
    const renderer = this._renderer;
    const mesh = this._mesh;
    const elapsed = (time - this._startTime) * 0.001;
    program.uniforms.iTime.value = elapsed;
    let newYaw = yaw;
    let newPitch = pitch;
    let newRoll = roll;
    const animationType = this._animationType;
    let continueRAF = true;
    if (animationType === 'hover') {
      const maxPitch = 0.6 * HOVSTR;
      const maxYaw = 0.6 * HOVSTR;
      const desiredYaw = (pointer.inside ? -pointer.x : 0) * maxYaw;
      const desiredPitch = (pointer.inside ? pointer.y : 0) * maxPitch;
      newYaw = newYaw + (desiredYaw - newYaw) * INERT;
      newPitch = newPitch + (desiredPitch - newPitch) * INERT;
      newRoll = newRoll + (0 - newRoll) * 0.1;
      program.uniforms.uRot.value = setMat3FromEuler(newYaw, newPitch, newRoll, rotBuf);
      if (NOISE_IS_ZERO) {
        const settled =
          Math.abs(newYaw - desiredYaw) < 1e-4 && Math.abs(newPitch - desiredPitch) < 1e-4 && Math.abs(newRoll) < 1e-4;
        if (settled) continueRAF = false;
      }
    } else if (animationType === '3drotate') {
      const tScaled = elapsed * TS;
      newYaw = tScaled * wY;
      newPitch = Math.sin(tScaled * wX + phX) * 0.6;
      newRoll = Math.sin(tScaled * wZ + phZ) * 0.5;
      program.uniforms.uRot.value = setMat3FromEuler(newYaw, newPitch, newRoll, rotBuf);
      if (TS < 1e-6) continueRAF = false;
    } else {
      rotBuf[0] = 1;
      rotBuf[1] = 0;
      rotBuf[2] = 0;
      rotBuf[3] = 0;
      rotBuf[4] = 1;
      rotBuf[5] = 0;
      rotBuf[6] = 0;
      rotBuf[7] = 0;
      rotBuf[8] = 1;
      program.uniforms.uRot.value = rotBuf;
      if (TS < 1e-6) continueRAF = false;
    }
    this._runtime.yaw = newYaw;
    this._runtime.pitch = newPitch;
    this._runtime.roll = newRoll;
    renderer.render({ scene: mesh });
    if (continueRAF) {
      this._raf = requestAnimationFrame(this._render);
    } else {
      this._raf = 0;
    }
  }
}
export default function initPrism() {
  const authScreen = document.querySelector('.auth-screen');
  if (authScreen && !authScreen.querySelector('.prism-background')) {
    const prismContainer = document.createElement('div');
    prismContainer.className = 'prism-background';
    prismContainer.style.position = 'absolute';
    prismContainer.style.inset = '0';
    prismContainer.style.zIndex = '0';
    prismContainer.style.pointerEvents = 'none';
    authScreen.insertBefore(prismContainer, authScreen.firstChild);
    const prism = new PrismEffect(prismContainer, {
      animationType: 'rotate',
      timeScale: 0.6,
      height: 3.8,
      baseWidth: 5,
      scale: 3.8,
      hueShift: 0.86,
      colorFrequency: 2.2,
      noise: 0,
      glow: 1
    });
    prismContainer.__prismEffect = prism;
  }
}
