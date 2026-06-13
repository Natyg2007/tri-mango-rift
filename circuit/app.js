const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const root = document.querySelector("#gameRoot");
const phaseNameNode = document.querySelector("#phaseName");
const mangoCountNode = document.querySelector("#mangoCount");
const scoreNode = document.querySelector("#score");
const arenaNameNode = document.querySelector("#arenaName");
const timerNode = document.querySelector("#timer");
const statusNode = document.querySelector("#status");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const phaseButtons = [...document.querySelectorAll(".phase-button")];

const phases = [
  { name: "Sun", color: "#f6c64f", dark: "#4a3515" },
  { name: "Tide", color: "#54c3e8", dark: "#123b49" },
  { name: "Ember", color: "#f35b3e", dark: "#4b1d16" },
];

const levels = [
  { name: "Easy", phase: 0, mangos: 3, blocks: 4, speed: 1, bonus: 18 },
  { name: "Medium", phase: 1, mangos: 4, blocks: 5, speed: 1.22, bonus: 15 },
  { name: "Hard", phase: 2, mangos: 5, blocks: 6, speed: 1.45, bonus: 12 },
];

const keys = new Set();
const arena = { x: 90, y: 95, w: 1100, h: 520 };
let player;
let mangos = [];
let blocks = [];
let pads = [];
let sparks = [];
let phaseIndex = 0;
let levelIndex = 0;
let collected = 0;
let score = 0;
let timeLeft = 90;
let running = false;
let won = false;
let startedOnce = false;
let penaltyCooldown = 0;
let teleportCooldown = 0;
let transition = null;
let lastTick = performance.now();

resetGame();
requestAnimationFrame(loop);

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function sign() {
  return Math.random() < 0.5 ? -1 : 1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function randomPoint(existing = [], gap = 72) {
  for (let i = 0; i < 90; i += 1) {
    const point = {
      x: rand(arena.x + 56, arena.x + arena.w - 56),
      y: rand(arena.y + 50, arena.y + arena.h - 50),
    };
    const farCenter = Math.hypot(point.x - canvas.width / 2, point.y - canvas.height / 2) > 95;
    const farOthers = existing.every((other) => Math.hypot(point.x - other.x, point.y - other.y) > gap);
    if (farCenter && farOthers) return point;
  }
  return { x: rand(arena.x + 56, arena.x + arena.w - 56), y: rand(arena.y + 50, arena.y + arena.h - 50) };
}

function buildArena() {
  const level = levels[levelIndex];
  const occupied = [];
  mangos = Array.from({ length: level.mangos }, (_, index) => {
    const point = randomPoint(occupied, 92);
    occupied.push(point);
    return { ...point, r: 16, phase: level.phase, angle: index * 0.8 };
  });

  blocks = Array.from({ length: level.blocks }, (_, index) => {
    const point = randomPoint(occupied, 92);
    occupied.push(point);
    const long = rand(72, 132);
    const short = rand(28, 42);
    const horizontal = Math.random() < 0.5;
    const angle = rand(0, Math.PI * 2);
    return {
      ...point,
      w: horizontal ? long : short,
      h: horizontal ? short : long,
      phase: index === 0 ? level.phase : Math.floor(Math.random() * 3),
      moveX: Math.cos(angle),
      moveY: Math.sin(angle),
      baseX: point.x,
      baseY: point.y,
      range: rand(34, 92),
      speed: rand(0.9, 1.7) * level.speed,
      rotation: rand(0, Math.PI),
      spin: rand(1.5, 5.2) * sign(),
    };
  });

  pads = [];
  [0, 1, 2].forEach((phase) => {
    const first = randomPoint(occupied, 90);
    occupied.push(first);
    const second = randomPoint(occupied, 90);
    occupied.push(second);
    const firstIndex = pads.length;
    pads.push({ ...first, phase, pair: firstIndex + 1, r: 28, angle: 0, spin: rand(1.8, 4.4) * sign() });
    pads.push({ ...second, phase, pair: firstIndex, r: 28, angle: 0, spin: rand(1.8, 4.4) * sign() });
  });

  sparks = Array.from({ length: 150 }, () => ({
    x: rand(0, canvas.width),
    y: rand(0, canvas.height),
    s: rand(1, 3),
    phase: Math.floor(Math.random() * 3),
    v: rand(8, 30),
  }));
}

function resetGame() {
  root.classList.remove("is-playing");
  levelIndex = 0;
  phaseIndex = levels[levelIndex].phase;
  collected = 0;
  score = 0;
  timeLeft = 90;
  won = false;
  running = false;
  penaltyCooldown = 0;
  teleportCooldown = 0;
  transition = null;
  player = { x: canvas.width / 2, y: canvas.height / 2, r: 18, speed: 260, scale: 1 };
  buildArena();
  updateHud();
  showStatus(startedOnce ? "Reset ready" : "Press Start");
}

function startGame() {
  if (won || timeLeft <= 0) resetGame();
  startedOnce = true;
  running = true;
  root.classList.add("is-playing");
  hideStatus();
  lastTick = performance.now();
}

function updateHud() {
  phaseNameNode.textContent = phases[phaseIndex].name;
  phaseNameNode.style.color = phases[phaseIndex].color;
  mangoCountNode.textContent = `${collected}/${levels[levelIndex].mangos}`;
  scoreNode.textContent = String(score);
  arenaNameNode.textContent = levels[levelIndex].name;
  timerNode.textContent = String(Math.max(0, Math.ceil(timeLeft)));
  for (const button of phaseButtons) {
    button.classList.toggle("active", Number(button.dataset.phase) === phaseIndex);
  }
}

function switchPhase(next) {
  if (!running) return;
  phaseIndex = ((next % 3) + 3) % 3;
  updateHud();
}

function showStatus(text) {
  statusNode.textContent = text;
  statusNode.classList.remove("hidden");
}

function hideStatus() {
  statusNode.classList.add("hidden");
}

function returnToInfo() {
  root.classList.remove("is-playing");
  running = false;
  keys.clear();
  hideStatus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    const speed = phaseIndex === 1 ? player.speed * 1.12 : phaseIndex === 2 ? player.speed * 0.94 : player.speed;
    player.x += (dx / len) * speed * dt;
    player.y += (dy / len) * speed * dt;
  }
  player.x = clamp(player.x, arena.x + player.r, arena.x + arena.w - player.r);
  player.y = clamp(player.y, arena.y + player.r, arena.y + arena.h - player.r);
}

function updateEntities(dt, elapsed) {
  penaltyCooldown = Math.max(0, penaltyCooldown - dt);
  teleportCooldown = Math.max(0, teleportCooldown - dt);
  for (const mango of mangos) {
    mango.angle += dt * 2;
  }
  for (const block of blocks) {
    const offset = Math.sin(elapsed * block.speed) * block.range;
    block.x = clamp(block.baseX + block.moveX * offset, arena.x + 40, arena.x + arena.w - 40);
    block.y = clamp(block.baseY + block.moveY * offset, arena.y + 40, arena.y + arena.h - 40);
    block.rotation += dt * block.spin * (block.phase === phaseIndex ? 0.55 : 1.35);
  }
  for (const pad of pads) {
    pad.angle += dt * pad.spin * (pad.phase === phaseIndex ? 0.75 : 1.45);
  }
  for (const spark of sparks) {
    spark.y += spark.v * dt;
    if (spark.y > canvas.height) {
      spark.y = -4;
      spark.x = rand(0, canvas.width);
    }
  }
}

function rectHitCircle(block) {
  const cos = Math.cos(-block.rotation);
  const sin = Math.sin(-block.rotation);
  const dx = player.x - block.x;
  const dy = player.y - block.y;
  const localX = dx * cos - dy * sin;
  const localY = dx * sin + dy * cos;
  const closestX = clamp(localX, -block.w / 2, block.w / 2);
  const closestY = clamp(localY, -block.h / 2, block.h / 2);
  return Math.hypot(localX - closestX, localY - closestY) < player.r;
}

function checkCollisions() {
  mangos = mangos.filter((mango) => {
    if (mango.phase !== phaseIndex) return true;
    if (Math.hypot(player.x - mango.x, player.y - mango.y) > player.r + mango.r) return true;
    collected += 1;
    score += 15;
    timeLeft += 2.5;
    return false;
  });

  if (collected === levels[levelIndex].mangos) {
    completeArena();
    return;
  }

  for (const pad of pads) {
    if (Math.hypot(player.x - pad.x, player.y - pad.y) > player.r + pad.r) continue;
    if (pad.phase === phaseIndex) {
      if (teleportCooldown > 0) continue;
      const target = pads[pad.pair];
      player.x = target.x;
      player.y = target.y;
      score += 10;
      timeLeft += 1;
      teleportCooldown = 1;
      showStatus("+10 teleport");
      window.setTimeout(() => running && hideStatus(), 420);
    } else if (penaltyCooldown <= 0) {
      score = Math.max(0, score - 8);
      timeLeft = Math.max(0, timeLeft - 3);
      penaltyCooldown = 0.85;
      showStatus("-8 wrong color");
      window.setTimeout(() => running && hideStatus(), 480);
    }
  }

  for (const block of blocks) {
    if (block.phase !== phaseIndex && rectHitCircle(block) && penaltyCooldown <= 0) {
      score = Math.max(0, score - 12);
      timeLeft = Math.max(0, timeLeft - 5);
      penaltyCooldown = 0.85;
      player.x = canvas.width / 2;
      player.y = canvas.height / 2;
      showStatus("-12 spinning block");
      window.setTimeout(() => running && hideStatus(), 480);
    }
  }
}

function completeArena() {
  running = false;
  score += 30 + levelIndex * 15;
  if (levelIndex >= levels.length - 1) {
    won = true;
    showStatus("Circuit stabilized");
    transition = makeTransition("winSuck", levelIndex);
    return;
  }
  showStatus("Wormhole opening");
  transition = makeTransition("suck", levelIndex + 1);
}

function makeTransition(stage, nextLevel) {
  const dx = player.x - canvas.width / 2;
  const dy = player.y - canvas.height / 2;
  return {
    stage,
    elapsed: 0,
    duration: 1.35,
    nextLevel,
    startX: player.x,
    startY: player.y,
    startAngle: Math.atan2(dy, dx),
    startRadius: Math.max(90, Math.hypot(dx, dy)),
  };
}

function updateTransition(dt) {
  if (!transition) return;
  transition.elapsed += dt;
  const t = Math.min(transition.elapsed / transition.duration, 1);
  const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  if (transition.stage === "suck" || transition.stage === "winSuck") {
    const radius = transition.startRadius * (1 - eased);
    const angle = transition.startAngle + t * Math.PI * 5;
    player.x = cx + Math.cos(angle) * radius;
    player.y = cy + Math.sin(angle) * radius;
    player.scale = 1 - eased * 0.82;
  } else if (transition.stage === "drop") {
    const radius = (1 - eased) * 72;
    const angle = t * Math.PI * 4.5;
    player.x = cx + Math.cos(angle) * radius;
    player.y = -80 + (cy + 80) * eased + Math.sin(angle) * radius * 0.35;
    player.scale = 0.45 + eased * 0.55;
  } else if (transition.stage === "winClose") {
    player.x = cx;
    player.y = cy;
    player.scale = 0.15;
  }

  if (t < 1) return;

  if (transition.stage === "suck") {
    levelIndex = transition.nextLevel;
    phaseIndex = levels[levelIndex].phase;
    collected = 0;
    timeLeft += levels[levelIndex].bonus;
    buildArena();
    updateHud();
    showStatus(`Dropping into ${levels[levelIndex].name}`);
    transition = { stage: "drop", elapsed: 0, duration: 1.25 };
    return;
  }

  if (transition.stage === "drop") {
    transition = null;
    player.x = cx;
    player.y = cy;
    player.scale = 1;
    running = true;
    hideStatus();
    return;
  }

  if (transition.stage === "winSuck") {
    showStatus("Wormhole closing");
    transition = { stage: "winClose", elapsed: 0, duration: 0.9 };
    return;
  }

  if (transition.stage === "winClose") {
    transition = null;
    player.x = cx;
    player.y = cy;
    player.scale = 1;
    returnToInfo();
  }
}

function update(dt, elapsed) {
  if (transition) {
    updateEntities(dt, elapsed);
    updateTransition(dt);
    return;
  }
  if (!running) {
    updateEntities(dt, elapsed);
    return;
  }
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    running = false;
    showStatus("Circuit collapsed");
  }
  updatePlayer(dt);
  updateEntities(dt, elapsed);
  checkCollisions();
  updateHud();
}

function drawGrid() {
  ctx.fillStyle = "#07100f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const active = phases[phaseIndex];
  const gradient = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, 40, canvas.width / 2, canvas.height / 2, 680);
  gradient.addColorStop(0, active.dark);
  gradient.addColorStop(1, "#07100f");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(255,248,233,0.09)";
  ctx.lineWidth = 1;
  for (let x = arena.x; x <= arena.x + arena.w; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, arena.y);
    ctx.lineTo(x, arena.y + arena.h);
    ctx.stroke();
  }
  for (let y = arena.y; y <= arena.y + arena.h; y += 40) {
    ctx.beginPath();
    ctx.moveTo(arena.x, y);
    ctx.lineTo(arena.x + arena.w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,248,233,0.34)";
  ctx.lineWidth = 3;
  ctx.strokeRect(arena.x, arena.y, arena.w, arena.h);
}

function drawMango(mango) {
  const active = mango.phase === phaseIndex;
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.32;
  ctx.translate(mango.x, mango.y + Math.sin(mango.angle) * 5);
  ctx.rotate(-0.55 + mango.angle * 0.1);
  ctx.fillStyle = phases[mango.phase].color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.38)";
  ctx.beginPath();
  ctx.ellipse(-3, -6, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#56c27b";
  ctx.beginPath();
  ctx.ellipse(-4, -18, 7, 3, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawPad(pad) {
  const active = pad.phase === phaseIndex;
  ctx.save();
  ctx.translate(pad.x, pad.y);
  ctx.rotate(pad.angle);
  ctx.globalAlpha = active ? 1 : 0.42;
  ctx.strokeStyle = phases[pad.phase].color;
  ctx.lineWidth = active ? 4 : 2;
  ctx.beginPath();
  ctx.arc(0, 0, pad.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.rotate(Math.PI / 4);
  ctx.strokeRect(-17, -17, 34, 34);
  ctx.restore();
}

function drawBlock(block) {
  ctx.save();
  ctx.translate(block.x, block.y);
  ctx.rotate(block.rotation);
  ctx.globalAlpha = block.phase === phaseIndex ? 0.35 : 0.82;
  ctx.fillStyle = phases[block.phase].color;
  ctx.fillRect(-block.w / 2, -block.h / 2, block.w, block.h);
  ctx.strokeStyle = "rgba(255,248,233,0.62)";
  ctx.lineWidth = 2;
  ctx.strokeRect(-block.w / 2, -block.h / 2, block.w, block.h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawPlayer() {
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.scale(player.scale, player.scale);
  ctx.shadowColor = phases[phaseIndex].color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#fff8e9";
  ctx.beginPath();
  ctx.arc(0, 0, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = phases[phaseIndex].color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 30, 0.2, Math.PI * 1.65);
  ctx.stroke();
  ctx.fillStyle = phases[phaseIndex].color;
  ctx.beginPath();
  ctx.arc(7, -5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawWormhole(elapsed) {
  if (!transition) return;
  const cx = canvas.width / 2;
  const cy = transition.stage === "drop" ? 70 : canvas.height / 2;
  const t = transition.elapsed / transition.duration;
  const closing = transition.stage === "winClose";
  const size = closing ? 110 * (1 - Math.min(t, 1)) : 45 + Math.sin(Math.min(t, 1) * Math.PI) * 110;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3; i += 1) {
    ctx.strokeStyle = phases[(phaseIndex + i) % 3].color;
    ctx.globalAlpha = 0.72 - i * 0.14;
    ctx.lineWidth = 5 - i;
    ctx.beginPath();
    ctx.ellipse(0, 0, size + i * 24, size * 0.38 + i * 10, elapsed * (1.8 + i), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = "#020504";
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.max(4, size * 0.45), Math.max(3, size * 0.18), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw(elapsed) {
  drawGrid();
  for (const spark of sparks) {
    ctx.globalAlpha = spark.phase === phaseIndex ? 0.72 : 0.22;
    ctx.fillStyle = phases[spark.phase].color;
    ctx.fillRect(spark.x, spark.y, spark.s, spark.s);
  }
  ctx.globalAlpha = 1;
  for (const pad of pads) drawPad(pad);
  for (const mango of mangos) drawMango(mango);
  for (const block of blocks) drawBlock(block);
  drawWormhole(elapsed);
  drawPlayer();
}

function loop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.033);
  lastTick = now;
  const elapsed = now / 1000;
  update(dt, elapsed);
  draw(elapsed);
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
  if (key === " ") switchPhase(phaseIndex + 1);
  if (["1", "2", "3"].includes(key)) switchPhase(Number(key) - 1);
  keys.add(key);
});

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
startButton.addEventListener("click", startGame);
resetButton.addEventListener("click", resetGame);
for (const button of phaseButtons) {
  button.addEventListener("click", () => switchPhase(Number(button.dataset.phase)));
}
