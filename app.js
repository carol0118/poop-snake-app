const CELL_COUNT = 14;
const BASE_SPEED = 180;
const MIN_SPEED = 95;
const GROW_POINTS = 10;
const BEST_KEY = "poop-snake-best-score";
const SWIPE_THRESHOLD = 20;
const MAX_PARTICLES = 32;

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d", { alpha: false });
const scoreValue = document.querySelector("#scoreValue");
const lengthValue = document.querySelector("#lengthValue");
const bestValue = document.querySelector("#bestValue");
const statusValue = document.querySelector("#statusValue");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const restartBtn = document.querySelector("#restartBtn");
const tapStartBtn = document.querySelector("#tapStartBtn");
const installBtn = document.querySelector("#installBtn");
const soundBtn = document.querySelector("#soundBtn");
const overlayPanel = document.querySelector("#overlayPanel");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const boardWrap = document.querySelector("#boardWrap");
const toastMessage = document.querySelector("#toastMessage");

let installPromptEvent = null;
let speed = BASE_SPEED;
let score = 0;
let bestScore = Number(localStorage.getItem(BEST_KEY) || 0);
let pendingGrowth = 0;
let direction = { x: 1, y: 0 };
let queuedDirection = { x: 1, y: 0 };
let isRunning = false;
let isGameOver = false;
let snake = [];
let growFood = null;
let shrinkFood = null;
let audioContext = null;
let audioReady = false;
let touchStart = null;
let particles = [];
let lastTickAt = 0;
let lastRenderAt = 0;
let animationFrameId = 0;
let cellSize = 0;
let boardSize = 0;
let toastTimerId = 0;
let audioElements = {};

bestValue.textContent = String(bestScore);
updateSoundButton();

document.addEventListener("WeixinJSBridgeReady", () => {
  unlockAudio(false);
});

document.addEventListener("YixinJSBridgeReady", () => {
  unlockAudio(false);
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPromptEvent = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!installPromptEvent) {
    showToast("请在浏览器菜单里选择“添加到主屏幕”。");
    return;
  }

  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  installBtn.hidden = true;
});

soundBtn.addEventListener("click", async () => {
  await unlockAudio(true);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

window.addEventListener("resize", resizeCanvas);

for (const button of document.querySelectorAll("[data-dir]")) {
  button.addEventListener("click", async () => {
    await unlockAudio(false);
    handleDirection(button.dataset.dir);
  });
}

canvas.addEventListener("touchstart", async (event) => {
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
  await unlockAudio(false);
}, { passive: true });

canvas.addEventListener("touchmove", (event) => {
  if (!touchStart) {
    return;
  }

  const touch = event.touches[0];
  const deltaX = touch.clientX - touchStart.x;
  const deltaY = touch.clientY - touchStart.y;

  if (Math.abs(deltaX) < SWIPE_THRESHOLD && Math.abs(deltaY) < SWIPE_THRESHOLD) {
    return;
  }

  event.preventDefault();

  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    handleDirection(deltaX > 0 ? "right" : "left");
  } else {
    handleDirection(deltaY > 0 ? "down" : "up");
  }

  touchStart = { x: touch.clientX, y: touch.clientY };
}, { passive: false });

canvas.addEventListener("touchend", () => {
  touchStart = null;
}, { passive: true });

boardWrap.addEventListener("pointerdown", () => {
  unlockAudio(false);
}, { passive: true });

startBtn.addEventListener("click", async () => {
  await unlockAudio(false);
  startGame();
});

pauseBtn.addEventListener("click", pauseGame);

restartBtn.addEventListener("click", async () => {
  await unlockAudio(false);
  resetGame();
});

tapStartBtn.addEventListener("click", async () => {
  await unlockAudio(false);
  toggleStartPause();
});

resizeCanvas();
resetGame();
startRenderLoop();

function resetGame() {
  speed = BASE_SPEED;
  score = 0;
  pendingGrowth = 0;
  direction = { x: 1, y: 0 };
  queuedDirection = { x: 1, y: 0 };
  isRunning = false;
  isGameOver = false;
  particles = [];
  snake = [
    { x: 3, y: 7 },
    { x: 2, y: 7 },
    { x: 1, y: 7 }
  ];
  growFood = randomFreeCell();
  shrinkFood = randomFreeCell([growFood]);
  lastTickAt = performance.now();
  document.body.classList.remove("playing");
  resizeCanvas();
  syncStats();
  setStatus("待机");
  showToast("准备好了。手指滑一下，灵灵就开吃。");
  setOverlay("往上滑，灵灵快吃", "在棋盘上滑动控制方向，也能点底部方向键。", false);
}

function startGame() {
  if (isRunning) {
    return;
  }
  if (isGameOver) {
    resetGame();
  }
  isRunning = true;
  document.body.classList.add("playing");
  resizeCanvas();
  lastTickAt = performance.now();
  setStatus("进行中");
  showToast("灵灵快吃，先去追便便。");
  setOverlay("", "", true);
  vibrate([20, 40, 20]);
  playSound("start");
}

function pauseGame() {
  if (!isRunning) {
    return;
  }
  isRunning = false;
  document.body.classList.remove("playing");
  resizeCanvas();
  setStatus("暂停");
  showToast("暂停中。点开始继续吃。");
  setOverlay("先停一下", "点开始继续，或者直接继续滑动。", false);
}

function toggleStartPause() {
  if (isRunning) {
    pauseGame();
  } else {
    startGame();
  }
}

function handleDirection(next) {
  const map = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const candidate = map[next];
  if (!candidate) {
    return;
  }

  const current = queuedDirection;
  if (candidate.x === -current.x && candidate.y === -current.y) {
    return;
  }

  queuedDirection = candidate;
  if (!isRunning && !isGameOver) {
    startGame();
  }
}

function tick() {
  direction = queuedDirection;
  const nextHead = {
    x: snake[0].x + direction.x,
    y: snake[0].y + direction.y
  };

  if (hitWall(nextHead) || hitSnake(nextHead)) {
    gameOver();
    return;
  }

  snake.unshift(nextHead);

  if (sameCell(nextHead, growFood)) {
    pendingGrowth += 1;
    score += GROW_POINTS;
    spawnPoopParticles(nextHead);
    showToast("灵灵快吃，便便到手了。");
    vibrate(25);
    playSound("grow");
    growFood = randomFreeCell([shrinkFood]);
  } else if (sameCell(nextHead, shrinkFood)) {
    shrinkSnake();
    speed = Math.max(MIN_SPEED, speed - 8);
    showToast("哎呀，吃到绿色虫子巧克力了。");
    vibrate([15, 30, 15]);
    playSound("shrink");
    shrinkFood = randomFreeCell([growFood]);
  }

  if (pendingGrowth > 0) {
    pendingGrowth -= 1;
  } else {
    snake.pop();
  }

  syncStats();
}

function shrinkSnake() {
  if (snake.length > 2) {
    snake.pop();
  } else {
    score = Math.max(0, score - 5);
  }
}

function gameOver() {
  isRunning = false;
  isGameOver = true;
  document.body.classList.remove("playing");
  resizeCanvas();
  bestScore = Math.max(bestScore, score);
  localStorage.setItem(BEST_KEY, String(bestScore));
  setStatus("结束");
  showToast(`撞到了，灵灵这局得分 ${score}。`);
  setOverlay("这局结束了", "点重开，再让灵灵快吃一局。", false);
  vibrate([60, 40, 90]);
  playSound("gameOver");
  syncStats();
}

function syncStats() {
  scoreValue.textContent = String(score);
  lengthValue.textContent = String(snake.length);
  bestValue.textContent = String(bestScore);
}

function setStatus(text) {
  statusValue.textContent = text;
}

function setOverlay(title, text, hidden) {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayPanel.classList.toggle("hidden", hidden);
}

function showToast(text) {
  toastMessage.textContent = text;
  toastMessage.classList.add("visible");
  clearTimeout(toastTimerId);
  toastTimerId = window.setTimeout(() => {
    if (!isGameOver && isRunning) {
      toastMessage.classList.remove("visible");
    }
  }, 1200);
}

function hitWall(cell) {
  return cell.x < 0 || cell.y < 0 || cell.x >= CELL_COUNT || cell.y >= CELL_COUNT;
}

function hitSnake(cell) {
  return snake.some((segment) => sameCell(segment, cell));
}

function sameCell(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

function randomFreeCell(extraBlocked = []) {
  const blocked = new Set(
    [...snake, ...extraBlocked.filter(Boolean)].map((cell) => `${cell.x},${cell.y}`)
  );
  const free = [];

  for (let y = 0; y < CELL_COUNT; y += 1) {
    for (let x = 0; x < CELL_COUNT; x += 1) {
      const key = `${x},${y}`;
      if (!blocked.has(key)) {
        free.push({ x, y });
      }
    }
  }

  return free[Math.floor(Math.random() * free.length)];
}

function startRenderLoop() {
  cancelAnimationFrame(animationFrameId);
  animationFrameId = requestAnimationFrame(renderLoop);
}

function renderLoop(now) {
  if (!lastRenderAt) {
    lastRenderAt = now;
  }

  const delta = now - lastRenderAt;
  lastRenderAt = now;

  if (isRunning && now - lastTickAt >= speed) {
    lastTickAt = now;
    tick();
  }

  updateParticles(delta);
  draw();
  animationFrameId = requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  const heroHeight = document.querySelector(".hero-card").offsetHeight;
  const controlsHeight = document.querySelector(".controls-card").offsetHeight;
  const gapBudget = document.body.classList.contains("playing") ? 6 : 14;
  const available = window.innerHeight - heroHeight - controlsHeight - gapBudget;
  const cssSize = Math.max(320, Math.min(boardWrap.clientWidth - 6, available));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  boardSize = cssSize;
  cellSize = boardSize / CELL_COUNT;

  canvas.style.width = `${cssSize}px`;
  canvas.style.height = `${cssSize}px`;
  canvas.width = Math.round(cssSize * dpr);
  canvas.height = Math.round(cssSize * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function draw() {
  const size = boardSize;
  const cell = cellSize;

  ctx.clearRect(0, 0, size, size);

  const boardGradient = ctx.createLinearGradient(0, 0, 0, size);
  boardGradient.addColorStop(0, "#fff8f1");
  boardGradient.addColorStop(1, "#f0decb");
  ctx.fillStyle = boardGradient;
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < CELL_COUNT; y += 1) {
    for (let x = 0; x < CELL_COUNT; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "rgba(255,255,255,0.18)" : "rgba(117,70,44,0.04)";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  drawPoop(growFood, cell);
  drawBugChocolate(shrinkFood, cell);
  drawParticles();

  for (let index = snake.length - 1; index >= 0; index -= 1) {
    const segment = snake[index];
    const px = segment.x * cell;
    const py = segment.y * cell;
    const radius = cell * 0.28;
    const bodyGradient = ctx.createLinearGradient(px, py, px + cell, py + cell);
    bodyGradient.addColorStop(0, index === 0 ? "#8c5a3a" : "#c17c4f");
    bodyGradient.addColorStop(1, index === 0 ? "#59311c" : "#8e5838");

    ctx.fillStyle = bodyGradient;
    roundRect(px + 2.5, py + 2.5, cell - 5, cell - 5, radius);
    ctx.fill();

    if (index === 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px + cell * 0.36, py + cell * 0.35, cell * 0.07, 0, Math.PI * 2);
      ctx.arc(px + cell * 0.62, py + cell * 0.35, cell * 0.07, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#20110a";
      ctx.beginPath();
      ctx.arc(px + cell * 0.37, py + cell * 0.35, cell * 0.03, 0, Math.PI * 2);
      ctx.arc(px + cell * 0.63, py + cell * 0.35, cell * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (isGameOver) {
    ctx.fillStyle = "rgba(34, 21, 13, 0.24)";
    ctx.fillRect(0, 0, size, size);
  }
}

function drawPoop(cell, size) {
  if (!cell) {
    return;
  }
  const x = cell.x * size;
  const y = cell.y * size;

  ctx.fillStyle = "#6f4025";
  ctx.beginPath();
  ctx.ellipse(x + size * 0.5, y + size * 0.72, size * 0.22, size * 0.14, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.5, y + size * 0.5, size * 0.18, size * 0.14, 0, 0, Math.PI * 2);
  ctx.ellipse(x + size * 0.5, y + size * 0.33, size * 0.12, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBugChocolate(cell, size) {
  if (!cell) {
    return;
  }
  const x = cell.x * size;
  const y = cell.y * size;

  roundRect(x + size * 0.16, y + size * 0.24, size * 0.68, size * 0.52, size * 0.12);
  ctx.fillStyle = "#8d5a39";
  ctx.fill();

  ctx.fillStyle = "#86cb59";
  ctx.beginPath();
  ctx.arc(x + size * 0.38, y + size * 0.46, size * 0.09, 0, Math.PI * 2);
  ctx.arc(x + size * 0.6, y + size * 0.38, size * 0.08, 0, Math.PI * 2);
  ctx.arc(x + size * 0.56, y + size * 0.58, size * 0.07, 0, Math.PI * 2);
  ctx.fill();
}

function spawnPoopParticles(cell) {
  const centerX = cell.x * cellSize + cellSize * 0.5;
  const centerY = cell.y * cellSize + cellSize * 0.5;
  const burstCount = 14;

  for (let i = 0; i < burstCount; i += 1) {
    if (particles.length >= MAX_PARTICLES) {
      particles.shift();
    }

    const angle = (Math.PI * 2 * i) / burstCount + Math.random() * 0.42;
    const velocity = 0.05 + Math.random() * 0.09;
    particles.push({
      x: centerX,
      y: centerY,
      vx: Math.cos(angle) * velocity * cellSize,
      vy: Math.sin(angle) * velocity * cellSize,
      life: 420 + Math.random() * 180,
      maxLife: 420 + Math.random() * 180,
      size: 3 + Math.random() * 4,
      color: Math.random() > 0.35 ? "#7b4729" : "#a96c46"
    });
  }
}

function updateParticles(delta) {
  if (!particles.length) {
    return;
  }

  particles = particles.filter((particle) => {
    particle.life -= delta;
    particle.x += particle.vx * (delta / 16.67);
    particle.y += particle.vy * (delta / 16.67);
    particle.vx *= 0.97;
    particle.vy *= 0.97;
    return particle.life > 0;
  });
}

function drawParticles() {
  for (const particle of particles) {
    const alpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = hexToRgba(particle.color, alpha);
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function vibrate(pattern) {
  if ("vibrate" in navigator) {
    navigator.vibrate(pattern);
  }
}

async function unlockAudio(playTest) {
  if (window.AudioContext || window.webkitAudioContext) {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioCtor();
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        // fall through to html audio fallback
      }
    }
  }

  if (!audioElements.start) {
    audioElements = createAudioFallbacks();
  }

  audioReady = Boolean(
    (audioContext && audioContext.state === "running") ||
    Object.keys(audioElements).length
  );
  updateSoundButton();

  if (playTest && audioReady) {
    playSound("start");
    showToast("音效已开启。");
  } else if (playTest && !audioReady) {
    showToast("这个浏览器没有成功开启音效。");
  }
}

function updateSoundButton() {
  soundBtn.textContent = audioReady ? "音效开" : "点我开声";
  soundBtn.classList.toggle("ready", audioReady);
}

function playSound(type) {
  if (audioContext && audioContext.state === "running") {
    const now = audioContext.currentTime;
    const master = audioContext.createGain();
    master.gain.setValueAtTime(1.15, now);
    master.connect(audioContext.destination);

    const patterns = {
      start: [
        [659.25, 0.08, "triangle", 0.1],
        [783.99, 0.09, "triangle", 0.1],
        [1046.5, 0.14, "triangle", 0.09]
      ],
      grow: [
        [783.99, 0.05, "sine", 0.11],
        [987.77, 0.07, "triangle", 0.1],
        [1318.51, 0.12, "triangle", 0.09]
      ],
      shrink: [
        [369.99, 0.05, "square", 0.06],
        [277.18, 0.1, "square", 0.05]
      ],
      gameOver: [
        [392, 0.09, "sawtooth", 0.06],
        [261.63, 0.11, "sawtooth", 0.055],
        [174.61, 0.22, "sawtooth", 0.05]
      ]
    };

    let cursor = now;
    for (const [frequency, duration, wave, volume] of patterns[type] || []) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(frequency, cursor);
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(volume, cursor + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
      osc.connect(gain);
      gain.connect(master);
      osc.start(cursor);
      osc.stop(cursor + duration);
      cursor += duration * 0.82;
    }
  }

  const fallback = audioElements[type];
  if (fallback) {
    fallback.currentTime = 0;
    fallback.play().catch(() => {});
  }
}

function createAudioFallbacks() {
  const patterns = {
    start: [
      [659.25, 0.08],
      [783.99, 0.09],
      [1046.5, 0.14]
    ],
    grow: [
      [783.99, 0.05],
      [987.77, 0.07],
      [1318.51, 0.12]
    ],
    shrink: [
      [369.99, 0.05],
      [277.18, 0.1]
    ],
    gameOver: [
      [392, 0.09],
      [261.63, 0.11],
      [174.61, 0.22]
    ]
  };

  const result = {};
  for (const [key, pattern] of Object.entries(patterns)) {
    const audio = new Audio(buildWaveDataUrl(pattern));
    audio.preload = "auto";
    result[key] = audio;
  }
  return result;
}

function buildWaveDataUrl(pattern) {
  const sampleRate = 22050;
  const totalDuration = pattern.reduce((sum, [, duration]) => sum + duration * 0.82, 0) + 0.04;
  const sampleCount = Math.ceil(totalDuration * sampleRate);
  const buffer = new Uint8Array(44 + sampleCount * 2);
  const view = new DataView(buffer.buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleCount * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, sampleCount * 2, true);

  let offsetSeconds = 0;
  for (const [frequency, duration] of pattern) {
    const start = Math.floor(offsetSeconds * sampleRate);
    const length = Math.floor(duration * sampleRate);
    for (let i = 0; i < length; i += 1) {
      const t = i / sampleRate;
      const attack = Math.min(1, i / 80);
      const release = Math.min(1, (length - i) / 220);
      const env = attack * release;
      const sample =
        Math.sin(2 * Math.PI * frequency * t) * 0.28 * env +
        Math.sin(2 * Math.PI * frequency * 2 * t) * 0.08 * env;
      const index = 44 + (start + i) * 2;
      const current = view.getInt16(index, true) || 0;
      const mixed = Math.max(-1, Math.min(1, current / 32767 + sample));
      view.setInt16(index, mixed * 32767, true);
    }
    offsetSeconds += duration * 0.82;
  }

  let binary = "";
  for (const value of buffer) {
    binary += String.fromCharCode(value);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeString(view, offset, text) {
  for (let i = 0; i < text.length; i += 1) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
