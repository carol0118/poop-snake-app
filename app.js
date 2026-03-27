const CELL_COUNT = 14;
const BASE_SPEED = 190;
const MIN_SPEED = 95;
const GROW_POINTS = 10;
const BEST_KEY = "poop-snake-best-score";
const SWIPE_THRESHOLD = 20;

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreValue = document.querySelector("#scoreValue");
const lengthValue = document.querySelector("#lengthValue");
const bestValue = document.querySelector("#bestValue");
const statusValue = document.querySelector("#statusValue");
const messageText = document.querySelector("#messageText");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const restartBtn = document.querySelector("#restartBtn");
const tapStartBtn = document.querySelector("#tapStartBtn");
const installBtn = document.querySelector("#installBtn");
const overlayPanel = document.querySelector("#overlayPanel");
const overlayTitle = document.querySelector("#overlayTitle");
const overlayText = document.querySelector("#overlayText");
const boardWrap = document.querySelector("#boardWrap");

let installPromptEvent = null;
let timerId = null;
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
let touchStart = null;

bestValue.textContent = String(bestScore);

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPromptEvent = event;
  installBtn.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!installPromptEvent) {
    setMessage("请在浏览器菜单里选择“添加到主屏幕”。");
    return;
  }

  installPromptEvent.prompt();
  await installPromptEvent.userChoice;
  installPromptEvent = null;
  installBtn.hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

document.addEventListener("keydown", (event) => {
  const map = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    a: "left",
    s: "down",
    d: "right",
    W: "up",
    A: "left",
    S: "down",
    D: "right"
  };

  if (event.key === " ") {
    event.preventDefault();
    toggleStartPause();
    return;
  }

  const next = map[event.key];
  if (!next) {
    return;
  }

  event.preventDefault();
  handleDirection(next);
});

for (const button of document.querySelectorAll("[data-dir]")) {
  button.addEventListener("click", () => {
    unlockAudio();
    handleDirection(button.dataset.dir);
  });
}

canvas.addEventListener("touchstart", (event) => {
  const touch = event.touches[0];
  touchStart = { x: touch.clientX, y: touch.clientY };
  unlockAudio();
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

boardWrap.addEventListener("pointerdown", unlockAudio, { passive: true });
startBtn.addEventListener("click", () => {
  unlockAudio();
  startGame();
});
pauseBtn.addEventListener("click", pauseGame);
restartBtn.addEventListener("click", () => {
  unlockAudio();
  resetGame();
});
tapStartBtn.addEventListener("click", () => {
  unlockAudio();
  toggleStartPause();
});

resetGame();

function resetGame() {
  clearTimer();
  speed = BASE_SPEED;
  score = 0;
  pendingGrowth = 0;
  direction = { x: 1, y: 0 };
  queuedDirection = { x: 1, y: 0 };
  isRunning = false;
  isGameOver = false;
  snake = [
    { x: 3, y: 7 },
    { x: 2, y: 7 },
    { x: 1, y: 7 }
  ];
  growFood = randomFreeCell();
  shrinkFood = randomFreeCell([growFood]);
  syncStats();
  setStatus("待机");
  setMessage("准备好了。用手指在棋盘上滑动开始。");
  setOverlay("向上滑一下开始", "在棋盘上滑动，也可以点下面方向盘。", false);
  draw();
}

function startGame() {
  if (isRunning) {
    return;
  }
  if (isGameOver) {
    resetGame();
  }
  isRunning = true;
  setStatus("进行中");
  setMessage("开始了，先去吃便便。");
  setOverlay("", "", true);
  playSound("start");
  runLoop();
}

function pauseGame() {
  if (!isRunning) {
    return;
  }
  isRunning = false;
  clearTimer();
  setStatus("暂停");
  setMessage("已暂停。点开始继续。");
  setOverlay("游戏暂停", "点开始继续，或者在棋盘上继续滑动。", false);
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

function runLoop() {
  clearTimer();
  timerId = window.setTimeout(() => {
    tick();
    if (isRunning) {
      runLoop();
    }
  }, speed);
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
    setMessage("吃到便便，身体变长了。");
    playSound("grow");
    growFood = randomFreeCell([shrinkFood]);
  } else if (sameCell(nextHead, shrinkFood)) {
    shrinkSnake();
    speed = Math.max(MIN_SPEED, speed - 8);
    setMessage("吃到绿色虫子巧克力，身体缩了一截。");
    playSound("shrink");
    shrinkFood = randomFreeCell([growFood]);
  }

  if (pendingGrowth > 0) {
    pendingGrowth -= 1;
  } else {
    snake.pop();
  }

  syncStats();
  draw();
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
  clearTimer();
  bestScore = Math.max(bestScore, score);
  localStorage.setItem(BEST_KEY, String(bestScore));
  setStatus("结束");
  setMessage(`撞到了。最终分数 ${score}。`);
  setOverlay("游戏结束", "点重开再来一局。", false);
  playSound("gameOver");
  syncStats();
  draw(true);
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

function draw(showOverlay = false) {
  const size = canvas.width;
  const cell = size / CELL_COUNT;

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

  snake.forEach((segment, index) => {
    const px = segment.x * cell;
    const py = segment.y * cell;
    const radius = cell * 0.28;
    const bodyGradient = ctx.createLinearGradient(px, py, px + cell, py + cell);
    bodyGradient.addColorStop(0, index === 0 ? "#8c5a3a" : "#c17c4f");
    bodyGradient.addColorStop(1, index === 0 ? "#59311c" : "#8e5838");

    ctx.fillStyle = bodyGradient;
    roundRect(px + 3, py + 3, cell - 6, cell - 6, radius);
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
  });

  if (showOverlay) {
    ctx.fillStyle = "rgba(34, 21, 13, 0.32)";
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

  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.beginPath();
  ctx.arc(x + size * 0.57, y + size * 0.28, size * 0.05, 0, Math.PI * 2);
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

function roundRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function clearTimer() {
  if (timerId) {
    window.clearTimeout(timerId);
    timerId = null;
  }
}

function setMessage(text) {
  messageText.textContent = text;
}

function unlockAudio() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return;
  }

  if (!audioContext) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioCtor();
  }

  if (audioContext.state === "suspended") {
    audioContext.resume().catch(() => {});
  }
}

function playSound(type) {
  if (!audioContext) {
    return;
  }

  const now = audioContext.currentTime;
  const master = audioContext.createGain();
  master.connect(audioContext.destination);

  const patterns = {
    start: [
      [392, 0.07, "triangle", 0.06],
      [523.25, 0.09, "triangle", 0.05],
      [659.25, 0.12, "triangle", 0.05]
    ],
    grow: [
      [330, 0.04, "sine", 0.05],
      [494, 0.06, "sine", 0.05]
    ],
    shrink: [
      [280, 0.04, "square", 0.04],
      [220, 0.08, "square", 0.03]
    ],
    gameOver: [
      [320, 0.08, "sawtooth", 0.05],
      [220, 0.09, "sawtooth", 0.05],
      [160, 0.18, "sawtooth", 0.04]
    ]
  };

  let cursor = now;
  for (const [frequency, duration, wave, volume] of patterns[type] || []) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(frequency, cursor);
    gain.gain.setValueAtTime(0.0001, cursor);
    gain.gain.exponentialRampToValueAtTime(volume, cursor + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, cursor + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(cursor);
    osc.stop(cursor + duration);
    cursor += duration * 0.82;
  }
}
