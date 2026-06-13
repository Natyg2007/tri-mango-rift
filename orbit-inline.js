const orbitCanvas = document.querySelector("#orbitGame");
const orbitCtx = orbitCanvas.getContext("2d");
const orbitRoot = document.querySelector("#orbitRoot");
const orbitZoneNode = document.querySelector("#orbitZone");
const orbitSeedsNode = document.querySelector("#orbitSeeds");
const orbitEnergyNode = document.querySelector("#orbitEnergy");
const orbitShieldNode = document.querySelector("#orbitShield");
const orbitScoreNode = document.querySelector("#orbitScore");
const orbitStatusNode = document.querySelector("#orbitStatus");
const orbitStartButton = document.querySelector("#orbitStartButton");
const orbitResetButton = document.querySelector("#orbitResetButton");
const orbitBoostButton = document.querySelector("#orbitBoostButton");

const orbitArena = { x: 86, y: 84, w: 1108, h: 548 };
const zoneNames = ["One", "Two", "Three"];
const zoneConfigs = [
  { seeds: 5, wells: 2, sentinels: 3, mines: 5, pull: 980 },
  { seeds: 6, wells: 3, sentinels: 4, mines: 7, pull: 1160 },
  { seeds: 7, wells: 4, sentinels: 5, mines: 9, pull: 1320 },
];

const orbitKeys = new Set();
const pointer = { x: orbitCanvas.width / 2, y: orbitCanvas.height / 2, active: false };
let orbitPlayer;
let orbitSeeds = [];
let orbitWells = [];
let orbitSentinels = [];
let orbitMines = [];
let orbitStars = [];
let orbitParticles = [];
let orbitZone = 0;
let orbitCollected = 0;
let orbitScore = 0;
let orbitEnergy = 100;
let orbitShield = 3;
let orbitRunning = false;
let orbitWon = false;
let orbitStartedOnce = false;
let orbitHitCooldown = 0;
let orbitGateOpen = false;
let orbitLastTick = performance.now();

resetOrbitGame();
requestAnimationFrame(orbitLoop);

function orbitRand(min, max) {
  return min + Math.random() * (max - min);
}

function orbitClamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function orbitPoint(existing = [], gap = 90) {
  for (let i = 0; i < 100; i += 1) {
    const point = {
      x: orbitRand(orbitArena.x + 70, orbitArena.x + orbitArena.w - 70),
      y: orbitRand(orbitArena.y + 64, orbitArena.y + orbitArena.h - 64),
    };
    const farPlayer = Math.hypot(point.x - orbitCanvas.width / 2, point.y - orbitCanvas.height / 2) > 120;
    const farOthers = existing.every((other) => Math.hypot(point.x - other.x, point.y - other.y) > gap);
    if (farPlayer && farOthers) return point;
  }
  return {
    x: orbitRand(orbitArena.x + 70, orbitArena.x + orbitArena.w - 70),
    y: orbitRand(orbitArena.y + 64, orbitArena.y + orbitArena.h - 64),
  };
}

function buildOrbitZone() {
  const config = zoneConfigs[orbitZone];
  const occupied = [];

  orbitSeeds = Array.from({ length: config.seeds }, (_, index) => {
    const point = orbitPoint(occupied, 92);
    occupied.push(point);
    return { ...point, r: 15, angle: index * 0.9, pulse: orbitRand(0, Math.PI * 2) };
  });

  orbitWells = Array.from({ length: config.wells }, (_, index) => {
    const point = orbitPoint(occupied, 180);
    occupied.push(point);
    return {
      ...point,
      r: 42 + index * 4,
      pull: config.pull + index * 140,
      spin: orbitRand(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1),
      angle: orbitRand(0, Math.PI * 2),
    };
  });

  orbitSentinels = Array.from({ length: config.sentinels }, (_, index) => {
    const well = orbitWells[index % orbitWells.length];
    return {
      cx: well.x,
      cy: well.y,
      radius: orbitRand(76, 150),
      angle: orbitRand(0, Math.PI * 2),
      speed: orbitRand(0.75, 1.35) * (index % 2 ? -1 : 1),
      r: 17,
    };
  });

  orbitMines = Array.from({ length: config.mines }, (_, index) => {
    const point = orbitPoint(occupied, 84);
    occupied.push(point);
    return { ...point, r: orbitRand(14, 21), pulse: index * 0.7 };
  });

  orbitStars = Array.from({ length: 180 }, () => ({
    x: orbitRand(0, orbitCanvas.width),
    y: orbitRand(0, orbitCanvas.height),
    s: orbitRand(0.8, 2.7),
    drift: orbitRand(5, 18),
    tint: Math.random() < 0.6 ? "#52b975" : Math.random() < 0.5 ? "#f4c64f" : "#55c2e4",
  }));
}

function resetOrbitGame() {
  orbitRoot.classList.remove("is-playing");
  orbitZone = 0;
  orbitCollected = 0;
  orbitScore = 0;
  orbitEnergy = 100;
  orbitShield = 3;
  orbitRunning = false;
  orbitWon = false;
  orbitGateOpen = false;
  orbitHitCooldown = 0;
  orbitParticles = [];
  orbitPlayer = {
    x: orbitCanvas.width / 2,
    y: orbitCanvas.height / 2,
    vx: 0,
    vy: 0,
    r: 18,
    trail: [],
  };
  buildOrbitZone();
  updateOrbitHud();
  showOrbitStatus(orbitStartedOnce ? "Reset ready" : "Press Start");
}

function startOrbitGame() {
  if (orbitWon || orbitShield <= 0) resetOrbitGame();
  orbitStartedOnce = true;
  orbitRunning = true;
  orbitRoot.classList.add("is-playing");
  hideOrbitStatus();
  orbitLastTick = performance.now();
}

function updateOrbitHud() {
  orbitZoneNode.textContent = zoneNames[orbitZone];
  orbitSeedsNode.textContent = `${orbitCollected}/${zoneConfigs[orbitZone].seeds}`;
  orbitEnergyNode.textContent = String(Math.round(orbitEnergy));
  orbitShieldNode.textContent = String(orbitShield);
  orbitScoreNode.textContent = String(orbitScore);
}

function showOrbitStatus(text) {
  orbitStatusNode.textContent = text;
  orbitStatusNode.classList.remove("hidden");
}

function hideOrbitStatus() {
  orbitStatusNode.classList.add("hidden");
}

function isOrbitBoosting() {
  return orbitRunning && orbitEnergy > 0 && (orbitKeys.has(" ") || orbitKeys.has("shift") || pointer.active);
}

function updateOrbitPlayer(dt) {
  const dx = pointer.x - orbitPlayer.x;
  const dy = pointer.y - orbitPlayer.y;
  const len = Math.hypot(dx, dy) || 1;
  orbitPlayer.vx += (dx / len) * 155 * dt;
  orbitPlayer.vy += (dy / len) * 155 * dt;

  for (const well of orbitWells) {
    const wx = well.x - orbitPlayer.x;
    const wy = well.y - orbitPlayer.y;
    const dist = Math.max(60, Math.hypot(wx, wy));
    const force = well.pull / (dist * dist);
    orbitPlayer.vx += wx * force * dt;
    orbitPlayer.vy += wy * force * dt;
  }

  if (isOrbitBoosting()) {
    orbitPlayer.vx += (dx / len) * 760 * dt;
    orbitPlayer.vy += (dy / len) * 760 * dt;
    orbitEnergy = Math.max(0, orbitEnergy - 34 * dt);
    spawnOrbitBurst(orbitPlayer.x - (dx / len) * 18, orbitPlayer.y - (dy / len) * 18, "#52b975", 2);
  } else {
    orbitEnergy = Math.min(100, orbitEnergy + 18 * dt);
  }

  orbitPlayer.vx *= 1 - 0.35 * dt;
  orbitPlayer.vy *= 1 - 0.35 * dt;
  const speed = Math.hypot(orbitPlayer.vx, orbitPlayer.vy);
  if (speed > 520) {
    orbitPlayer.vx = (orbitPlayer.vx / speed) * 520;
    orbitPlayer.vy = (orbitPlayer.vy / speed) * 520;
  }

  orbitPlayer.x += orbitPlayer.vx * dt;
  orbitPlayer.y += orbitPlayer.vy * dt;

  if (orbitPlayer.x < orbitArena.x + orbitPlayer.r || orbitPlayer.x > orbitArena.x + orbitArena.w - orbitPlayer.r) {
    orbitPlayer.vx *= -0.62;
  }
  if (orbitPlayer.y < orbitArena.y + orbitPlayer.r || orbitPlayer.y > orbitArena.y + orbitArena.h - orbitPlayer.r) {
    orbitPlayer.vy *= -0.62;
  }
  orbitPlayer.x = orbitClamp(orbitPlayer.x, orbitArena.x + orbitPlayer.r, orbitArena.x + orbitArena.w - orbitPlayer.r);
  orbitPlayer.y = orbitClamp(orbitPlayer.y, orbitArena.y + orbitPlayer.r, orbitArena.y + orbitArena.h - orbitPlayer.r);

  orbitPlayer.trail.unshift({ x: orbitPlayer.x, y: orbitPlayer.y });
  orbitPlayer.trail = orbitPlayer.trail.slice(0, 24);
}

function updateOrbitEntities(dt, elapsed) {
  orbitHitCooldown = Math.max(0, orbitHitCooldown - dt);
  for (const star of orbitStars) {
    star.y += star.drift * dt;
    if (star.y > orbitCanvas.height + 8) {
      star.y = -8;
      star.x = orbitRand(0, orbitCanvas.width);
    }
  }
  for (const well of orbitWells) {
    well.angle += well.spin * dt;
  }
  for (const seed of orbitSeeds) {
    seed.angle += dt * 2.6;
    seed.pulse += dt * 3;
  }
  for (const sentinel of orbitSentinels) {
    sentinel.angle += sentinel.speed * dt;
    sentinel.x = sentinel.cx + Math.cos(sentinel.angle) * sentinel.radius;
    sentinel.y = sentinel.cy + Math.sin(sentinel.angle) * sentinel.radius;
  }
  for (const mine of orbitMines) {
    mine.pulse += dt * 3;
  }
  orbitParticles = orbitParticles
    .map((particle) => ({
      ...particle,
      x: particle.x + particle.vx * dt,
      y: particle.y + particle.vy * dt,
      life: particle.life - dt,
    }))
    .filter((particle) => particle.life > 0);

  if (orbitGateOpen) {
    const gate = orbitGate();
    if (Math.hypot(orbitPlayer.x - gate.x, orbitPlayer.y - gate.y) < orbitPlayer.r + gate.r) {
      advanceOrbitZone();
    }
  }
}

function checkOrbitCollisions() {
  orbitSeeds = orbitSeeds.filter((seed) => {
    if (Math.hypot(orbitPlayer.x - seed.x, orbitPlayer.y - seed.y) > orbitPlayer.r + seed.r) return true;
    orbitCollected += 1;
    orbitScore += 20 + Math.round(orbitEnergy / 10);
    orbitEnergy = Math.min(100, orbitEnergy + 16);
    spawnOrbitBurst(seed.x, seed.y, "#f4c64f", 14);
    if (orbitCollected === zoneConfigs[orbitZone].seeds) {
      orbitGateOpen = true;
      showOrbitStatus("Extraction open");
      window.setTimeout(() => {
        if (orbitRunning) hideOrbitStatus();
      }, 800);
    }
    return false;
  });

  for (const sentinel of orbitSentinels) {
    if (Math.hypot(orbitPlayer.x - sentinel.x, orbitPlayer.y - sentinel.y) < orbitPlayer.r + sentinel.r) {
      damageOrbitPlayer(sentinel.x, sentinel.y);
    }
  }
  for (const mine of orbitMines) {
    if (Math.hypot(orbitPlayer.x - mine.x, orbitPlayer.y - mine.y) < orbitPlayer.r + mine.r) {
      damageOrbitPlayer(mine.x, mine.y);
    }
  }
}

function damageOrbitPlayer(x, y) {
  if (orbitHitCooldown > 0) return;
  orbitHitCooldown = 1.1;
  orbitShield -= 1;
  orbitScore = Math.max(0, orbitScore - 12);
  const angle = Math.atan2(orbitPlayer.y - y, orbitPlayer.x - x);
  orbitPlayer.vx += Math.cos(angle) * 260;
  orbitPlayer.vy += Math.sin(angle) * 260;
  spawnOrbitBurst(orbitPlayer.x, orbitPlayer.y, "#f05c3f", 18);
  if (orbitShield <= 0) {
    orbitRunning = false;
    orbitRoot.classList.remove("is-playing");
    showOrbitStatus("Drone lost - Reset");
  }
}

function advanceOrbitZone() {
  if (orbitZone >= zoneConfigs.length - 1) {
    orbitWon = true;
    orbitRunning = false;
    orbitRoot.classList.remove("is-playing");
    showOrbitStatus("Orbit stabilized");
    orbitScore += 100;
    updateOrbitHud();
    document.querySelector(".orbit-details").scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  orbitZone += 1;
  orbitCollected = 0;
  orbitGateOpen = false;
  orbitPlayer.x = orbitCanvas.width / 2;
  orbitPlayer.y = orbitCanvas.height / 2;
  orbitPlayer.vx = 0;
  orbitPlayer.vy = 0;
  orbitEnergy = 100;
  buildOrbitZone();
  showOrbitStatus(`Zone ${zoneNames[orbitZone]}`);
  window.setTimeout(() => {
    if (orbitRunning) hideOrbitStatus();
  }, 900);
}

function spawnOrbitBurst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    const angle = orbitRand(0, Math.PI * 2);
    const speed = orbitRand(35, 150);
    orbitParticles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: orbitRand(0.35, 0.75),
      color,
      r: orbitRand(2, 4.8),
    });
  }
}

function orbitGate() {
  return {
    x: orbitArena.x + orbitArena.w - 88,
    y: orbitArena.y + orbitArena.h / 2,
    r: 36,
  };
}

function drawOrbitGame(elapsed) {
  orbitCtx.clearRect(0, 0, orbitCanvas.width, orbitCanvas.height);
  const gradient = orbitCtx.createRadialGradient(orbitCanvas.width / 2, orbitCanvas.height / 2, 20, orbitCanvas.width / 2, orbitCanvas.height / 2, 650);
  gradient.addColorStop(0, "#16221b");
  gradient.addColorStop(0.55, "#0b1412");
  gradient.addColorStop(1, "#060b0d");
  orbitCtx.fillStyle = gradient;
  orbitCtx.fillRect(0, 0, orbitCanvas.width, orbitCanvas.height);

  drawOrbitStars();
  drawOrbitGrid();
  drawOrbitWells(elapsed);
  drawOrbitGate(elapsed);
  drawOrbitSeeds();
  drawOrbitHazards(elapsed);
  drawOrbitPlayer(elapsed);
  drawOrbitAimLine();
  drawOrbitParticles();
}

function drawOrbitStars() {
  for (const star of orbitStars) {
    orbitCtx.globalAlpha = 0.35;
    orbitCtx.fillStyle = star.tint;
    orbitCtx.fillRect(star.x, star.y, star.s, star.s);
  }
  orbitCtx.globalAlpha = 1;
}

function drawOrbitGrid() {
  orbitCtx.save();
  orbitCtx.strokeStyle = "rgba(255, 248, 233, 0.08)";
  orbitCtx.lineWidth = 1;
  orbitCtx.strokeRect(orbitArena.x, orbitArena.y, orbitArena.w, orbitArena.h);
  for (let x = orbitArena.x + 54; x < orbitArena.x + orbitArena.w; x += 54) {
    orbitCtx.beginPath();
    orbitCtx.moveTo(x, orbitArena.y);
    orbitCtx.lineTo(x, orbitArena.y + orbitArena.h);
    orbitCtx.stroke();
  }
  for (let y = orbitArena.y + 54; y < orbitArena.y + orbitArena.h; y += 54) {
    orbitCtx.beginPath();
    orbitCtx.moveTo(orbitArena.x, y);
    orbitCtx.lineTo(orbitArena.x + orbitArena.w, y);
    orbitCtx.stroke();
  }
  orbitCtx.restore();
}

function drawOrbitWells(elapsed) {
  for (const well of orbitWells) {
    orbitCtx.save();
    orbitCtx.translate(well.x, well.y);
    orbitCtx.rotate(well.angle);
    for (let i = 0; i < 3; i += 1) {
      orbitCtx.strokeStyle = `rgba(82, 185, 117, ${0.18 + i * 0.08})`;
      orbitCtx.lineWidth = 3 - i * 0.5;
      orbitCtx.beginPath();
      orbitCtx.ellipse(0, 0, well.r + i * 20 + Math.sin(elapsed * 2 + i) * 4, well.r * 0.55 + i * 12, 0, 0, Math.PI * 2);
      orbitCtx.stroke();
    }
    orbitCtx.fillStyle = "rgba(82, 185, 117, 0.18)";
    orbitCtx.beginPath();
    orbitCtx.arc(0, 0, well.r * 0.36, 0, Math.PI * 2);
    orbitCtx.fill();
    orbitCtx.restore();
  }
}

function drawOrbitGate(elapsed) {
  const gate = orbitGate();
  orbitCtx.save();
  orbitCtx.translate(gate.x, gate.y);
  orbitCtx.rotate(elapsed * 1.6);
  orbitCtx.globalAlpha = orbitGateOpen ? 1 : 0.25;
  orbitCtx.strokeStyle = orbitGateOpen ? "#f4c64f" : "rgba(255, 248, 233, 0.3)";
  orbitCtx.lineWidth = 5;
  orbitCtx.beginPath();
  orbitCtx.ellipse(0, 0, gate.r, gate.r * 1.45, 0, 0, Math.PI * 2);
  orbitCtx.stroke();
  orbitCtx.strokeStyle = orbitGateOpen ? "rgba(244, 198, 79, 0.35)" : "rgba(255, 248, 233, 0.14)";
  orbitCtx.lineWidth = 2;
  orbitCtx.beginPath();
  orbitCtx.ellipse(0, 0, gate.r * 1.55, gate.r * 0.82, 0, 0, Math.PI * 2);
  orbitCtx.stroke();
  orbitCtx.restore();
  orbitCtx.globalAlpha = 1;
}

function drawOrbitSeeds() {
  for (const seed of orbitSeeds) {
    const pulse = Math.sin(seed.pulse) * 4;
    orbitCtx.save();
    orbitCtx.translate(seed.x, seed.y);
    orbitCtx.rotate(seed.angle);
    orbitCtx.fillStyle = "#f4c64f";
    orbitCtx.strokeStyle = "rgba(255, 248, 233, 0.48)";
    orbitCtx.lineWidth = 2;
    orbitCtx.beginPath();
    orbitCtx.ellipse(0, 0, seed.r + pulse, seed.r * 0.62, 0, 0, Math.PI * 2);
    orbitCtx.fill();
    orbitCtx.stroke();
    orbitCtx.restore();
  }
}

function drawOrbitHazards(elapsed) {
  for (const sentinel of orbitSentinels) {
    orbitCtx.strokeStyle = "rgba(240, 92, 63, 0.18)";
    orbitCtx.beginPath();
    orbitCtx.arc(sentinel.cx, sentinel.cy, sentinel.radius, 0, Math.PI * 2);
    orbitCtx.stroke();
    orbitCtx.fillStyle = "#f05c3f";
    orbitCtx.beginPath();
    orbitCtx.arc(sentinel.x, sentinel.y, sentinel.r, 0, Math.PI * 2);
    orbitCtx.fill();
    orbitCtx.strokeStyle = "rgba(255, 248, 233, 0.34)";
    orbitCtx.stroke();
  }
  for (const mine of orbitMines) {
    const r = mine.r + Math.sin(mine.pulse) * 3;
    orbitCtx.save();
    orbitCtx.translate(mine.x, mine.y);
    orbitCtx.rotate(elapsed * 2 + mine.pulse);
    orbitCtx.fillStyle = "rgba(240, 92, 63, 0.58)";
    orbitCtx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const angle = (i / 8) * Math.PI * 2;
      const radius = i % 2 ? r * 0.62 : r;
      orbitCtx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    }
    orbitCtx.closePath();
    orbitCtx.fill();
    orbitCtx.restore();
  }
}

function drawOrbitPlayer(elapsed) {
  orbitCtx.save();
  for (let i = orbitPlayer.trail.length - 1; i >= 0; i -= 1) {
    const point = orbitPlayer.trail[i];
    orbitCtx.globalAlpha = (1 - i / orbitPlayer.trail.length) * 0.34;
    orbitCtx.fillStyle = "#52b975";
    orbitCtx.beginPath();
    orbitCtx.arc(point.x, point.y, orbitPlayer.r * (1 - i / 36), 0, Math.PI * 2);
    orbitCtx.fill();
  }
  orbitCtx.globalAlpha = orbitHitCooldown > 0 ? 0.55 + Math.sin(elapsed * 32) * 0.25 : 1;
  orbitCtx.translate(orbitPlayer.x, orbitPlayer.y);
  orbitCtx.fillStyle = "#fff8e9";
  orbitCtx.beginPath();
  orbitCtx.arc(0, 0, orbitPlayer.r, 0, Math.PI * 2);
  orbitCtx.fill();
  orbitCtx.fillStyle = "#52b975";
  orbitCtx.beginPath();
  orbitCtx.arc(0, 0, orbitPlayer.r * 0.56, 0, Math.PI * 2);
  orbitCtx.fill();
  if (isOrbitBoosting()) {
    orbitCtx.strokeStyle = "rgba(82, 185, 117, 0.7)";
    orbitCtx.lineWidth = 4;
    orbitCtx.beginPath();
    orbitCtx.arc(0, 0, orbitPlayer.r + 8 + Math.sin(elapsed * 18) * 2, 0, Math.PI * 2);
    orbitCtx.stroke();
  }
  orbitCtx.restore();
  orbitCtx.globalAlpha = 1;
}

function drawOrbitAimLine() {
  if (!orbitRunning) return;
  orbitCtx.save();
  orbitCtx.strokeStyle = "rgba(255, 248, 233, 0.28)";
  orbitCtx.setLineDash([8, 12]);
  orbitCtx.beginPath();
  orbitCtx.moveTo(orbitPlayer.x, orbitPlayer.y);
  orbitCtx.lineTo(pointer.x, pointer.y);
  orbitCtx.stroke();
  orbitCtx.setLineDash([]);
  orbitCtx.restore();
}

function drawOrbitParticles() {
  for (const particle of orbitParticles) {
    orbitCtx.globalAlpha = Math.max(0, particle.life);
    orbitCtx.fillStyle = particle.color;
    orbitCtx.beginPath();
    orbitCtx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
    orbitCtx.fill();
  }
  orbitCtx.globalAlpha = 1;
}

function orbitLoop(now) {
  const dt = Math.min((now - orbitLastTick) / 1000, 0.033);
  orbitLastTick = now;
  const elapsed = now / 1000;
  if (orbitRunning) {
    updateOrbitPlayer(dt);
    updateOrbitEntities(dt, elapsed);
    checkOrbitCollisions();
    updateOrbitHud();
  } else {
    updateOrbitEntities(dt * 0.45, elapsed);
  }
  drawOrbitGame(elapsed);
  requestAnimationFrame(orbitLoop);
}

function setOrbitPointer(event) {
  const rect = orbitCanvas.getBoundingClientRect();
  const client = event.touches ? event.touches[0] : event;
  pointer.x = ((client.clientX - rect.left) / rect.width) * orbitCanvas.width;
  pointer.y = ((client.clientY - rect.top) / rect.height) * orbitCanvas.height;
}

window.addEventListener("keydown", (event) => {
  orbitKeys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "r") resetOrbitGame();
});

window.addEventListener("keyup", (event) => {
  orbitKeys.delete(event.key.toLowerCase());
});

orbitCanvas.addEventListener("mousemove", setOrbitPointer);
orbitCanvas.addEventListener("touchstart", (event) => {
  pointer.active = true;
  setOrbitPointer(event);
});
orbitCanvas.addEventListener("touchmove", (event) => {
  pointer.active = true;
  setOrbitPointer(event);
  event.preventDefault();
}, { passive: false });
orbitCanvas.addEventListener("touchend", () => {
  pointer.active = false;
});

orbitBoostButton.addEventListener("pointerdown", () => {
  pointer.active = true;
});
orbitBoostButton.addEventListener("pointerup", () => {
  pointer.active = false;
});
orbitBoostButton.addEventListener("pointerleave", () => {
  pointer.active = false;
});
orbitStartButton.addEventListener("click", startOrbitGame);
orbitResetButton.addEventListener("click", resetOrbitGame);
