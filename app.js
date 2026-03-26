const GRID_SIZE = 14;
const CELL_COUNT = 14;
const BASE_SPEED = 190;
const MIN_SPEED = 95;
const GROW_POINTS = 10;
const BEST_KEY = "poop-snake-best-score";

const canvas = document.querySelector("#gameCanvas");
const ctx = canvas.getContext("2d");
const scoreValue = document.querySelector("#scoreValue");
const lengthValue = document.querySelector("#lengthValue");
const bestValue = document.querySelector("#bestValue");
const messageText = document.querySelector("#messageText");
const startBtn = document.querySelector("#startBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const restartBtn = document.querySelector("#restartBtn");
const tapStartBtn = document.querySelector("#tapStartBtn");
const installBtn = document.querySelector("#installBtn");

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
    W: "up",
    s: "down",
    S: "down",
    a: "left",
    A: "left",
    d: "right",
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
  button.addEventListener("click", () => handleDirection(button.dataset.dir));
}

startBtn.addEventListener("click", startGame);
pauseBtn.addEventListener("click", pauseGame);
restartBtn.addEventListener("click", resetGame);
tapStartBtn.addEventListener("click", toggleStartPause);

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
  setMessage("新的一局已准备好。按方向键或点开始。");
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
  setMessage("开始了，先找便便吃。");
  runLoop();
}

function pauseGame() {
  if (!isRunning) {
    return;
  }
  isRunning = false;
  clearTimer();
  setMessage("已暂停。");
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
    growFood = randomFreeCell([shrinkFood]);
  } else if (sameCell(nextHead, shrinkFood)) {
    shrinkSnake();
    speed = Math.max(MIN_SPEED, speed - 8);
    setMessage("吃到绿色虫子巧克力，身体变短了。");
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
  bestValue.textContent = String(bestScore);
  setMessage(`撞到了，游戏结束。最终分数 ${score}。`);
  draw(true);
}

function syncStats() {
  scoreValue.textContent = String(score);
  lengthValue.textContent = String(snake.length);
  bestValue.textContent = String(bestScore);
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

  for (let y = 0; y < CELL_COUNT; y += 1) {
    for (let x = 0; x < CELL_COUNT; x += 1) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#fff9f2" : "#f5eadf";
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }

  drawPoop(growFood, cell);
  drawBugChocolate(shrinkFood, cell);

  snake.forEach((segment, index) => {
    const px = segment.x * cell;
    const py = segment.y * cell;
    const radius = cell * 0.22;

    ctx.fillStyle = index === 0 ? "#7c5132" : "#a66a45";
    roundRect(px + 3, py + 3, cell - 6, cell - 6, radius);
    ctx.fill();

    if (index === 0) {
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(px + cell * 0.38, py + cell * 0.36, cell * 0.07, 0, Math.PI * 2);
      ctx.arc(px + cell * 0.62, py + cell * 0.36, cell * 0.07, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  if (showOverlay) {
    ctx.fillStyle = "rgba(44, 29, 19, 0.48)";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#fff8f1";
    ctx.font = "700 32px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText("游戏结束", size / 2, size / 2 - 8);
    ctx.font = "600 18px Trebuchet MS";
    ctx.fillText("点“重新开始”再来一局", size / 2, size / 2 + 24);
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
  ctx.ellipse(x + size * 0.5, y + size * 0.7, size * 0.22, size * 0.14, 0, 0, Math.PI * 2);
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
