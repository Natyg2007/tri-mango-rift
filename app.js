const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const phaseNameNode = document.querySelector("#phaseName");
const coreCountNode = document.querySelector("#coreCount");
const timerNode = document.querySelector("#timer");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");

const phases = [
  { name: "Sun", color: "#f2c14e", dark: "#58421d" },
  { name: "Tide", color: "#53b7d7", dark: "#173e4d" },
  { name: "Ember", color: "#df5b3f", dark: "#54231b" },
];

const keys = new Set();
let player;
let cores;
let sentries;
let ripples;
let sparks;
let trail;
let phaseIndex;
let collected;
let timeLeft;
let running;
let won;
let lastTick;

function createCores() {
  return [
    { x: 168, y: 142, phase: 0, angle: 0.2 },
    { x: 512, y: 122, phase: 1, angle: 1.8 },
    { x: 848, y: 160, phase: 2, angle: 3.2 },
    { x: 242, y: 330, phase: 1, angle: 5.1 },
    { x: 514, y: 318, phase: 2, angle: 2.6 },
    { x: 780, y: 342, phase: 0, angle: 4.5 },
    { x: 150, y: 518, phase: 2, angle: 0.9 },
    { x: 506, y: 512, phase: 0, angle: 3.7 },
    { x: 870, y: 498, phase: 1, angle: 5.6 },
  ];
}

function resetGame() {
  player = { x: 512, y: 320, r: 17, speed: 270, invulnerable: 0 };
  cores = createCores();
  sentries = [
    { x: 315, y: 210, w: 58, h: 170, phase: 0, vx: 0, vy: 86 },
    { x: 644, y: 250, w: 58, h: 170, phase: 1, vx: 0, vy: -92 },
    { x: 360, y: 440, w: 295, h: 34, phase: 2, vx: 92, vy: 0 },
    { x: 715, y: 95, w: 36, h: 255, phase: 0, vx: -68, vy: 0 },
  ];
  ripples = [];
  sparks = Array.from({ length: 80 }, () => ({
    x: Math.random() * canvas.width,
    y: 70 + Math.random() * (canvas.height - 100),
    speed: 8 + Math.random() * 22,
    size: 1 + Math.random() * 2.2,
    phase: Math.floor(Math.random() * 3),
  }));
  trail = [];
  phaseIndex = 0;
  collected = 0;
  timeLeft = 75;
  running = false;
  won = false;
  lastTick = performance.now();
  updateHud();
  draw();
}

function updateHud() {
  phaseNameNode.textContent = phases[phaseIndex].name;
  phaseNameNode.style.color = phases[phaseIndex].color;
  coreCountNode.textContent = `${collected}/9`;
  timerNode.textContent = String(Math.max(0, Math.ceil(timeLeft)));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function switchPhase(nextPhase) {
  phaseIndex = ((nextPhase % phases.length) + phases.length) % phases.length;
  ripples.push({ x: player.x, y: player.y, age: 0, color: phases[phaseIndex].color });
  updateHud();
}

function circleRectOverlap(circle, rect) {
  const closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  const closestY = clamp(circle.y, rect.y, rect.y + rect.h);
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  return dx * dx + dy * dy < circle.r * circle.r;
}

function moveSentries(dt) {
  for (const sentry of sentries) {
    const speedBoost = sentry.phase === phaseIndex ? 1.08 : 0.72;
    sentry.x += sentry.vx * dt * speedBoost;
    sentry.y += sentry.vy * dt * speedBoost;

    if (sentry.y < 86 || sentry.y + sentry.h > canvas.height - 60) {
      sentry.vy *= -1;
      sentry.y = clamp(sentry.y, 86, canvas.height - 60 - sentry.h);
    }

    if (sentry.x < 70 || sentry.x + sentry.w > canvas.width - 70) {
      sentry.vx *= -1;
      sentry.x = clamp(sentry.x, 70, canvas.width - 70 - sentry.w);
    }
  }
}

function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;
  if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
  if (keys.has("arrowright") || keys.has("d")) dx += 1;
  if (keys.has("arrowup") || keys.has("w")) dy -= 1;
  if (keys.has("arrowdown") || keys.has("s")) dy += 1;

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    const phaseSpeed = phaseIndex === 1 ? 1.14 : phaseIndex === 2 ? 0.95 : 1;
    player.x += (dx / length) * player.speed * phaseSpeed * dt;
    player.y += (dy / length) * player.speed * phaseSpeed * dt;
  }

  player.x = clamp(player.x, player.r + 28, canvas.width - player.r - 28);
  player.y = clamp(player.y, player.r + 72, canvas.height - player.r - 28);
}

function update(dt) {
  if (!running) return;

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    running = false;
  }

  player.invulnerable = Math.max(0, player.invulnerable - dt);
  updatePlayer(dt);
  moveSentries(dt);
  trail.push({ x: player.x, y: player.y, age: 0, color: phases[phaseIndex].color });
  if (trail.length > 38) trail.shift();

  for (const core of cores) {
    core.angle += dt * (1.6 + core.phase * 0.18);
  }

  for (const sentry of sentries) {
    if (sentry.phase === phaseIndex && player.invulnerable <= 0 && circleRectOverlap(player, sentry)) {
      player.x = 512;
      player.y = 320;
      player.invulnerable = 1.2;
      timeLeft = Math.max(0, timeLeft - 5);
      ripples.push({ x: player.x, y: player.y, age: 0, color: "#ffffff" });
      break;
    }
  }

  cores = cores.filter((core) => {
    const bobX = Math.cos(core.angle) * 8;
    const bobY = Math.sin(core.angle * 1.3) * 8;
    const isCollected =
      core.phase === phaseIndex &&
      Math.hypot(player.x - (core.x + bobX), player.y - (core.y + bobY)) < player.r + 17;

    if (isCollected) {
      collected += 1;
      timeLeft += 2;
      ripples.push({ x: core.x + bobX, y: core.y + bobY, age: 0, color: phases[core.phase].color });
    }

    return !isCollected;
  });

  for (const ripple of ripples) {
    ripple.age += dt;
  }
  ripples = ripples.filter((ripple) => ripple.age < 0.65);

  for (const point of trail) {
    point.age += dt;
  }
  trail = trail.filter((point) => point.age < 0.5);

  for (const spark of sparks) {
    spark.y += spark.speed * dt;
    spark.x += Math.sin((spark.y + spark.phase * 90) / 34) * dt * 12;
    if (spark.y > canvas.height - 22) {
      spark.y = 74;
      spark.x = Math.random() * canvas.width;
    }
  }

  if (collected === 9) {
    won = true;
    running = false;
  }

  updateHud();
}

function drawArena() {
  const active = phases[phaseIndex];
  ctx.fillStyle = "#111d18";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(512, 320, 30, 512, 320, 620);
  gradient.addColorStop(0, active.dark);
  gradient.addColorStop(1, "#101713");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "rgba(248,245,233,0.08)";
  ctx.lineWidth = 1;
  for (let x = 32; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 70);
    ctx.lineTo(x - 48, canvas.height - 24);
    ctx.stroke();
  }
  for (let y = 82; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(26, y);
    ctx.lineTo(canvas.width - 26, y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(248,245,233,0.24)";
  ctx.lineWidth = 3;
  ctx.strokeRect(28, 72, canvas.width - 56, canvas.height - 100);

  for (const spark of sparks) {
    const phase = phases[spark.phase];
    ctx.globalAlpha = spark.phase === phaseIndex ? 0.72 : 0.2;
    ctx.fillStyle = phase.color;
    ctx.fillRect(spark.x, spark.y, spark.size, spark.size * 2.4);
  }
  ctx.globalAlpha = 1;
}

function drawCore(core) {
  const phase = phases[core.phase];
  const bobX = Math.cos(core.angle) * 8;
  const bobY = Math.sin(core.angle * 1.3) * 8;
  const x = core.x + bobX;
  const y = core.y + bobY;
  const active = core.phase === phaseIndex;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = active ? 1 : 0.32;
  ctx.rotate(core.angle);
  ctx.fillStyle = phase.color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 13, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.42)";
  ctx.beginPath();
  ctx.ellipse(-3, -6, 4, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = active ? "#fff8d6" : phase.color;
  ctx.lineWidth = active ? 3 : 1;
  ctx.stroke();
  ctx.restore();
}

function drawSentry(sentry) {
  const phase = phases[sentry.phase];
  const active = sentry.phase === phaseIndex;
  ctx.save();
  ctx.globalAlpha = active ? 0.95 : 0.24;
  ctx.fillStyle = phase.color;
  ctx.fillRect(sentry.x, sentry.y, sentry.w, sentry.h);
  ctx.fillStyle = "rgba(16,23,19,0.42)";
  ctx.fillRect(sentry.x + 8, sentry.y + 8, sentry.w - 16, sentry.h - 16);
  ctx.strokeStyle = active ? "#fff8d6" : phase.color;
  ctx.lineWidth = active ? 3 : 1;
  ctx.strokeRect(sentry.x, sentry.y, sentry.w, sentry.h);
  ctx.restore();
}

function drawPlayer() {
  const active = phases[phaseIndex];
  for (const point of trail) {
    const progress = point.age / 0.5;
    ctx.globalAlpha = 0.28 * (1 - progress);
    ctx.fillStyle = point.color;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 13 * (1 - progress), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.save();
  if (player.invulnerable > 0) {
    ctx.globalAlpha = 0.48 + Math.sin(performance.now() / 65) * 0.28;
  }
  ctx.shadowColor = active.color;
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#f8f5e9";
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = active.color;
  ctx.beginPath();
  ctx.arc(player.x + 6, player.y - 5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = active.color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.r + 7, -Math.PI / 3, Math.PI * 1.15);
  ctx.stroke();
  ctx.restore();
}

function drawRipples() {
  for (const ripple of ripples) {
    const progress = ripple.age / 0.65;
    ctx.strokeStyle = ripple.color;
    ctx.globalAlpha = 1 - progress;
    ctx.lineWidth = 4 - progress * 3;
    ctx.beginPath();
    ctx.arc(ripple.x, ripple.y, 20 + progress * 72, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

function drawOverlay() {
  if (running) return;

  ctx.fillStyle = "rgba(16,23,19,0.7)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8f5e9";
  ctx.textAlign = "center";
  ctx.font = "800 38px system-ui, sans-serif";

  let headline = "Press Start";
  if (won) headline = "Rift stabilized";
  if (!won && timeLeft === 0) headline = "Rift collapsed";

  ctx.fillText(headline, canvas.width / 2, canvas.height / 2 - 16);
  ctx.font = "600 18px system-ui, sans-serif";
  ctx.fillText(
    "Space changes phase. Matching color collects cores and activates hazards.",
    canvas.width / 2,
    canvas.height / 2 + 24,
  );
}

function draw() {
  drawArena();
  for (const core of cores) drawCore(core);
  for (const sentry of sentries) drawSentry(sentry);
  drawRipples();
  drawPlayer();
  drawOverlay();
}

function loop(now) {
  const dt = Math.min(0.033, (now - lastTick) / 1000);
  lastTick = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }
  if (key === " " && running) switchPhase(phaseIndex + 1);
  if (["1", "2", "3"].includes(key) && running) switchPhase(Number(key) - 1);
  keys.add(key);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

startButton.addEventListener("click", () => {
  if (timeLeft <= 0 || won) resetGame();
  running = true;
  lastTick = performance.now();
});

resetButton.addEventListener("click", resetGame);

resetGame();
requestAnimationFrame(loop);
