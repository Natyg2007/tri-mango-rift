import * as THREE from "https://unpkg.com/three@0.165.0/build/three.module.js";

const mount = document.querySelector("#sceneMount");
const phaseNameNode = document.querySelector("#phaseName");
const coreCountNode = document.querySelector("#coreCount");
const scoreNode = document.querySelector("#score");
const arenaNameNode = document.querySelector("#arenaName");
const timerNode = document.querySelector("#timer");
const statusBanner = document.querySelector("#statusBanner");
const startButton = document.querySelector("#startButton");
const resetButton = document.querySelector("#resetButton");
const phaseButtons = [...document.querySelectorAll(".phase-button")];

const phases = [
  { name: "Sun", color: 0xf4c64f, dark: 0x4a3515 },
  { name: "Tide", color: 0x55c2e4, dark: 0x153b4a },
  { name: "Ember", color: 0xf05c3f, dark: 0x4b1d16 },
];

const arenaLevels = [
  { name: "Easy", phase: 0, coreCount: 3, hazardSpeed: 0.9, hazardRange: 0.85, timeBonus: 18 },
  { name: "Medium", phase: 1, coreCount: 4, hazardSpeed: 1.18, hazardRange: 1, timeBonus: 15 },
  { name: "Hard", phase: 2, coreCount: 5, hazardSpeed: 1.42, hazardRange: 1.16, timeBonus: 12 },
];

const arena = { halfX: 14, halfZ: 9 };
const keys = new Set();
const clock = new THREE.Clock();

let scene;
let camera;
let renderer;
let player;
let playerRing;
let playerLight;
let floor;
let rimLight;
let riftGroup;
let riftLights = [];
let wormholeGroup;
let wormholeLight;
let cores = [];
let hazards = [];
let teleporters = [];
let particles;
let phaseIndex = 0;
let collected = 0;
let levelIndex = 0;
let levelGoal = 3;
let score = 0;
let timeLeft = 90;
let penaltyCooldown = 0;
let teleportCooldown = 0;
let dropTransition = null;
let running = false;
let won = false;
let startedOnce = false;

init();
resetGame();
requestAnimationFrame(loop);

function init() {
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07100f, 0.035);

  camera = new THREE.PerspectiveCamera(48, 1, 0.1, 120);
  camera.position.set(0, 16, 18);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x07100f, 1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xfff3d0, 0x19342e, 1.7));

  const sun = new THREE.DirectionalLight(0xfff1c6, 2.8);
  sun.position.set(-8, 14, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);

  rimLight = new THREE.PointLight(phases[0].color, 16, 42);
  rimLight.position.set(0, 6, 0);
  scene.add(rimLight);

  buildArena();
  buildRift();
  buildWormhole();
  buildParticles();
  buildPlayer();
  createEntities();
  resize();

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
  startButton.addEventListener("click", startGame);
  resetButton.addEventListener("click", resetGame);

  for (const button of phaseButtons) {
    button.addEventListener("click", () => {
      if (running) switchPhase(Number(button.dataset.phase));
    });
  }
}

function buildArena() {
  const floorMaterial = new THREE.MeshStandardMaterial({
    color: phases[0].dark,
    roughness: 0.62,
    metalness: 0.1,
    emissive: phases[0].dark,
    emissiveIntensity: 0.14,
  });
  floor = new THREE.Mesh(new THREE.BoxGeometry(31, 0.45, 21), floorMaterial);
  floor.position.y = -0.26;
  floor.receiveShadow = true;
  scene.add(floor);

  const ringMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff8e9,
    roughness: 0.45,
    metalness: 0.25,
    emissive: 0x9f7d35,
    emissiveIntensity: 0.18,
  });

  const wallPieces = [
    { x: 0, z: -arena.halfZ - 0.35, sx: 31.5, sz: 0.35 },
    { x: 0, z: arena.halfZ + 0.35, sx: 31.5, sz: 0.35 },
    { x: -arena.halfX - 0.35, z: 0, sx: 0.35, sz: 21 },
    { x: arena.halfX + 0.35, z: 0, sx: 0.35, sz: 21 },
  ];

  for (const piece of wallPieces) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(piece.sx, 0.75, piece.sz), ringMaterial);
    mesh.position.set(piece.x, 0.15, piece.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  const grid = new THREE.GridHelper(30, 30, 0xfff8e9, 0xfff8e9);
  grid.position.y = 0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.12;
  scene.add(grid);

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0x21443a,
    roughness: 0.5,
    metalness: 0.12,
    emissive: 0x15342d,
    emissiveIntensity: 0.35,
  });

  const shardPositions = [
    [-13.2, 0.55, -7.5, 0.7, 1.8, 0.7],
    [12.8, 0.55, -6.8, 0.9, 2.2, 0.9],
    [-12.7, 0.55, 7.2, 1.2, 1.4, 1.2],
    [13.1, 0.55, 7.5, 0.8, 1.7, 0.8],
  ];

  for (const [x, y, z, sx, sy, sz] of shardPositions) {
    const shard = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), shardMaterial.clone());
    shard.position.set(x, y, z);
    shard.scale.set(sx, sy, sz);
    shard.rotation.set(Math.random(), Math.random(), Math.random());
    shard.castShadow = true;
    shard.receiveShadow = true;
    scene.add(shard);
  }
}

function buildRift() {
  riftGroup = new THREE.Group();
  riftGroup.position.set(0, 1.05, -0.35);
  scene.add(riftGroup);

  const ringGeometries = [
    new THREE.TorusGeometry(3.35, 0.045, 12, 128),
    new THREE.TorusGeometry(2.35, 0.035, 12, 128),
    new THREE.TorusGeometry(1.35, 0.028, 12, 96),
  ];

  ringGeometries.forEach((geometry, index) => {
    const material = new THREE.MeshStandardMaterial({
      color: phases[index].color,
      emissive: phases[index].color,
      emissiveIntensity: 1.1,
      roughness: 0.2,
      metalness: 0.35,
      transparent: true,
      opacity: 0.8,
    });
    const ring = new THREE.Mesh(geometry, material);
    ring.rotation.x = Math.PI / 2.2;
    ring.rotation.z = index * 0.5;
    riftGroup.add(ring);
  });

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.72, 2),
    new THREE.MeshStandardMaterial({
      color: 0xfff8e9,
      roughness: 0.14,
      metalness: 0.22,
      emissive: phases[0].color,
      emissiveIntensity: 0.65,
    }),
  );
  core.castShadow = true;
  riftGroup.add(core);

  const beaconPositions = [
    [-4.4, 0.1, -3.4],
    [4.4, 0.1, -3.4],
    [0, 0.1, 4.2],
  ];

  beaconPositions.forEach(([x, y, z], index) => {
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.16, 1.5, 20),
      new THREE.MeshStandardMaterial({
        color: phases[index].color,
        emissive: phases[index].color,
        emissiveIntensity: 0.75,
        transparent: true,
        opacity: 0.72,
      }),
    );
    beacon.position.set(x, y + 0.75, z);
    beacon.castShadow = true;
    riftGroup.add(beacon);

    const light = new THREE.PointLight(phases[index].color, 2.8, 7);
    light.position.set(x, 1.4, z);
    scene.add(light);
    riftLights.push(light);
  });
}

function buildWormhole() {
  wormholeGroup = new THREE.Group();
  wormholeGroup.visible = false;
  scene.add(wormholeGroup);

  const hole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.28, 1.42, 0.08, 64),
    new THREE.MeshStandardMaterial({
      color: 0x020504,
      roughness: 0.28,
      metalness: 0.15,
      emissive: 0x000000,
      emissiveIntensity: 1,
    }),
  );
  hole.position.y = 0.02;
  wormholeGroup.add(hole);

  const ringSizes = [1.55, 2.05, 2.62];
  ringSizes.forEach((radius, index) => {
    const phase = phases[index];
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.055, 12, 96),
      new THREE.MeshStandardMaterial({
        color: phase.color,
        emissive: phase.color,
        emissiveIntensity: 1.2,
        roughness: 0.16,
        metalness: 0.4,
        transparent: true,
        opacity: 0.82,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08 + index * 0.08;
    wormholeGroup.add(ring);
  });

  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 2.25, 7.5, 48, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: phases[0].color,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  beam.position.y = 3.4;
  wormholeGroup.add(beam);

  const shardMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff8e9,
    roughness: 0.34,
    metalness: 0.2,
    emissive: phases[0].color,
    emissiveIntensity: 0.25,
  });
  for (let i = 0; i < 14; i += 1) {
    const shard = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.62), shardMaterial.clone());
    const angle = (i / 14) * Math.PI * 2;
    const radius = 2.3 + (i % 4) * 0.32;
    shard.position.set(Math.cos(angle) * radius, 0.22 + (i % 3) * 0.16, Math.sin(angle) * radius);
    shard.rotation.set(Math.random() * 2, angle, Math.random() * 2);
    shard.userData = { angle, radius, speed: 1.2 + (i % 5) * 0.22 };
    wormholeGroup.add(shard);
  }

  wormholeLight = new THREE.PointLight(phases[0].color, 0, 12);
  scene.add(wormholeLight);
}

function buildPlayer() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xfff8e9,
    roughness: 0.28,
    metalness: 0.2,
    emissive: phases[0].color,
    emissiveIntensity: 0.18,
  });
  player = new THREE.Mesh(new THREE.SphereGeometry(0.48, 32, 24), material);
  player.castShadow = true;
  scene.add(player);

  playerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.78, 0.035, 12, 56),
    new THREE.MeshStandardMaterial({
      color: phases[0].color,
      emissive: phases[0].color,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.72,
    }),
  );
  playerRing.rotation.x = Math.PI / 2;
  scene.add(playerRing);

  playerLight = new THREE.PointLight(phases[0].color, 8, 8);
  scene.add(playerLight);
}

function buildParticles() {
  const count = 850;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = THREE.MathUtils.randFloatSpread(42);
    positions[i * 3 + 1] = THREE.MathUtils.randFloat(0.2, 9);
    positions[i * 3 + 2] = THREE.MathUtils.randFloatSpread(30);
    color.setHex(phases[i % 3].color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.06,
    vertexColors: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
  });
  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function createEntities() {
  clearEntities();
  const level = arenaLevels[levelIndex];
  levelGoal = level.coreCount;

  const corePositions = [
    [-10.5, -5.5, 0],
    [-4.8, -7.1, 1],
    [2.2, -6.2, 2],
    [9.7, -4.7, 0],
    [-11.2, 0.2, 2],
    [-2.4, 0.6, 0],
    [6.2, 0.3, 1],
    [-7.2, 5.7, 1],
    [8.8, 5.5, 2],
  ];

  cores = corePositions.slice(0, level.coreCount).map(([x, z], index) => {
    const phase = level.phase;
    const group = new THREE.Group();
    group.position.set(x, 0.7, z);
    group.userData = { baseY: 0.72, phase, index, radius: 0.65, angle: index * 0.8 };

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.48, 32, 18).scale(0.82, 1.12, 0.72),
      new THREE.MeshStandardMaterial({
        color: phases[phase].color,
        roughness: 0.36,
        metalness: 0.14,
        emissive: phases[phase].color,
        emissiveIntensity: 0.48,
      }),
    );
    body.castShadow = true;
    group.add(body);

    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 8).scale(1.5, 0.45, 0.65),
      new THREE.MeshStandardMaterial({
        color: 0x52b975,
        roughness: 0.42,
        emissive: 0x1b6337,
        emissiveIntensity: 0.4,
      }),
    );
    leaf.position.set(-0.18, 0.5, 0.03);
    leaf.rotation.z = 0.6;
    group.add(leaf);

    scene.add(group);
    return group;
  });

  const hazardData = [
    { x: -7.2, z: -1.8, sx: 1.15, sz: 5.4, phase: 0, axis: "z", range: 3.4, speed: 1.15 },
    { x: 0.8, z: 2.5, sx: 6.6, sz: 0.95, phase: 2, axis: "x", range: 4.4, speed: 1.0 },
    { x: 7.8, z: -1.2, sx: 1.1, sz: 6.2, phase: 1, axis: "z", range: 4.2, speed: 1.35 },
    { x: -1.8, z: -3.7, sx: 4.8, sz: 0.9, phase: level.phase, axis: "x", range: 3.1, speed: 1.45 },
  ];

  hazards = hazardData.map((data, index) => {
    const speed = data.speed * level.hazardSpeed;
    const range = data.range * level.hazardRange;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(data.sx, 1.15, data.sz),
      new THREE.MeshStandardMaterial({
        color: phases[data.phase].color,
        transparent: true,
        opacity: 0.72,
        roughness: 0.28,
        metalness: 0.12,
        emissive: phases[data.phase].color,
        emissiveIntensity: 0.35,
      }),
    );
    mesh.position.set(data.x, 0.55, data.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { ...data, speed, range, baseX: data.x, baseZ: data.z, index, radius: Math.max(data.sx, data.sz) / 2 };
    scene.add(mesh);
    return mesh;
  });

  const teleporterData = [
    { x: -12, z: -7.2, phase: 0, pair: 1 },
    { x: 12, z: 7.2, phase: 0, pair: 0 },
    { x: 11.6, z: -7.1, phase: 1, pair: 3 },
    { x: -11.6, z: 7.1, phase: 1, pair: 2 },
    { x: -1.2, z: -8.1, phase: 2, pair: 5 },
    { x: 1.2, z: 8.1, phase: 2, pair: 4 },
  ];

  teleporters = teleporterData.map((data, index) => {
    const group = new THREE.Group();
    group.position.set(data.x, 0.65, data.z);
    group.userData = { ...data, baseX: data.x, baseZ: data.z, index, radius: 1.05 };

    const block = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 1.1, 1.1),
      new THREE.MeshStandardMaterial({
        color: phases[data.phase].color,
        emissive: phases[data.phase].color,
        emissiveIntensity: 0.5,
        roughness: 0.22,
        metalness: 0.28,
        transparent: true,
        opacity: 0.74,
      }),
    );
    block.castShadow = true;
    group.add(block);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.045, 12, 64),
      new THREE.MeshStandardMaterial({
        color: phases[data.phase].color,
        emissive: phases[data.phase].color,
        emissiveIntensity: 1,
        transparent: true,
        opacity: 0.82,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);

    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.28, 1.8, 20),
      new THREE.MeshStandardMaterial({
        color: phases[data.phase].color,
        emissive: phases[data.phase].color,
        emissiveIntensity: 0.42,
        transparent: true,
        opacity: 0.45,
      }),
    );
    pillar.position.y = -0.1;
    group.add(pillar);

    scene.add(group);
    return group;
  });
}

function clearEntities() {
  for (const core of cores) scene.remove(core);
  for (const hazard of hazards) scene.remove(hazard);
  for (const teleporter of teleporters) scene.remove(teleporter);
  cores = [];
  hazards = [];
  teleporters = [];
}

function resetGame() {
  document.querySelector("#game-root").classList.remove("is-playing");
  levelIndex = 0;
  phaseIndex = arenaLevels[levelIndex].phase;
  createEntities();
  collected = 0;
  score = 0;
  timeLeft = 90;
  penaltyCooldown = 0;
  teleportCooldown = 0;
  dropTransition = null;
  running = false;
  won = false;
  player.position.set(0, 0.48, 0);
  player.scale.setScalar(1);
  wormholeGroup.visible = false;
  wormholeLight.intensity = 0;
  updatePhaseVisuals();
  updateHud();
  showStatus(startedOnce ? "Reset ready" : "Press Start");
}

function startGame() {
  if (timeLeft <= 0 || won || collected === 9) resetGame();
  startedOnce = true;
  running = true;
  document.querySelector("#game-root").classList.add("is-playing");
  hideStatus();
  clock.getDelta();
}

function updateHud() {
  phaseNameNode.textContent = phases[phaseIndex].name;
  phaseNameNode.style.color = `#${phases[phaseIndex].color.toString(16).padStart(6, "0")}`;
  coreCountNode.textContent = `${collected}/${levelGoal}`;
  scoreNode.textContent = String(score);
  arenaNameNode.textContent = arenaLevels[levelIndex].name;
  timerNode.textContent = String(Math.max(0, Math.ceil(timeLeft)));

  for (const button of phaseButtons) {
    button.classList.toggle("active", Number(button.dataset.phase) === phaseIndex);
  }
}

function switchPhase(nextPhase) {
  phaseIndex = ((nextPhase % phases.length) + phases.length) % phases.length;
  updatePhaseVisuals();
  updateHud();
}

function updatePhaseVisuals() {
  const active = phases[phaseIndex];
  floor.material.color.setHex(active.dark);
  floor.material.emissive.setHex(active.dark);
  player.material.emissive.setHex(active.color);
  playerRing.material.color.setHex(active.color);
  playerRing.material.emissive.setHex(active.color);
  playerLight.color.setHex(active.color);
  rimLight.color.setHex(active.color);
  riftGroup.children[3].material.emissive.setHex(active.color);
  wormholeLight.color.setHex(active.color);
  wormholeGroup.children.forEach((child) => {
    if (child.isMesh && child.material?.emissive) {
      child.material.emissive.setHex(active.color);
    }
  });

  for (const core of cores) {
    const isActive = core.userData.phase === phaseIndex;
    core.children[0].material.emissiveIntensity = isActive ? 0.82 : 0.18;
    core.children[0].material.opacity = isActive ? 1 : 0.4;
    core.children[0].material.transparent = !isActive;
  }

  for (const hazard of hazards) {
    const isActive = hazard.userData.phase === phaseIndex;
    hazard.material.opacity = isActive ? 0.88 : 0.2;
    hazard.material.emissiveIntensity = isActive ? 0.72 : 0.12;
  }

  for (const teleporter of teleporters) {
    const isActive = teleporter.userData.phase === phaseIndex;
    teleporter.children[0].material.opacity = isActive ? 0.86 : 0.36;
    teleporter.children[0].material.emissiveIntensity = isActive ? 0.85 : 0.28;
    teleporter.children[1].material.opacity = isActive ? 1 : 0.5;
    teleporter.children[1].material.emissiveIntensity = isActive ? 1.35 : 0.45;
  }
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
    event.preventDefault();
  }
  if (key === " " && running) switchPhase(phaseIndex + 1);
  if (["1", "2", "3"].includes(key) && running) switchPhase(Number(key) - 1);
  keys.add(key);
}

function updatePlayer(dt) {
  const direction = new THREE.Vector3();
  if (keys.has("arrowleft") || keys.has("a")) direction.x -= 1;
  if (keys.has("arrowright") || keys.has("d")) direction.x += 1;
  if (keys.has("arrowup") || keys.has("w")) direction.z -= 1;
  if (keys.has("arrowdown") || keys.has("s")) direction.z += 1;

  if (direction.lengthSq() > 0) {
    direction.normalize();
    const speed = phaseIndex === 1 ? 7.1 : phaseIndex === 2 ? 5.85 : 6.35;
    player.position.addScaledVector(direction, speed * dt);
  }

  player.position.x = THREE.MathUtils.clamp(player.position.x, -arena.halfX, arena.halfX);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -arena.halfZ, arena.halfZ);
  player.rotation.y += dt * 2.4;
  playerRing.position.copy(player.position);
  playerRing.position.y = 0.52;
  playerRing.rotation.z += dt * (phaseIndex === 2 ? 3.6 : 2.4);
  playerLight.position.copy(player.position).add(new THREE.Vector3(0, 1.2, 0));
}

function updateEntities(dt, elapsed) {
  penaltyCooldown = Math.max(0, penaltyCooldown - dt);
  teleportCooldown = Math.max(0, teleportCooldown - dt);

  riftGroup.rotation.y += dt * 0.18;
  riftGroup.children.forEach((child, index) => {
    child.rotation.z += dt * (index % 2 === 0 ? 0.45 : -0.32);
    if (child.isMesh && child.material?.emissiveIntensity !== undefined) {
      child.material.emissiveIntensity = 0.45 + Math.sin(elapsed * 2 + index) * 0.12 + (index === phaseIndex ? 0.45 : 0);
    }
  });

  riftLights.forEach((light, index) => {
    light.intensity = index === phaseIndex ? 4.8 : 1.4;
  });

  for (const core of cores) {
    const data = core.userData;
    core.position.y = data.baseY + Math.sin(elapsed * 2.2 + data.index) * 0.18;
    core.rotation.y += dt * (1.4 + data.phase * 0.22);
    core.rotation.z = Math.sin(elapsed * 1.8 + data.index) * 0.12;
  }

  for (const hazard of hazards) {
    const data = hazard.userData;
    const offset = Math.sin(elapsed * data.speed + data.index) * data.range;
    hazard.position.x = data.axis === "x" ? data.baseX + offset : data.baseX;
    hazard.position.z = data.axis === "z" ? data.baseZ + offset : data.baseZ;
    hazard.rotation.y += dt * (data.phase === phaseIndex ? 0.55 : 2.4);
    hazard.rotation.x = Math.sin(elapsed * 1.8 + data.index) * 0.18;
  }

  for (const teleporter of teleporters) {
    const data = teleporter.userData;
    const active = data.phase === phaseIndex;
    const orbit = active ? 0.08 : 0.36;
    teleporter.position.x = data.baseX + Math.cos(elapsed * 1.35 + data.index) * orbit;
    teleporter.position.z = data.baseZ + Math.sin(elapsed * 1.35 + data.index) * orbit;
    teleporter.position.y = 0.65 + Math.sin(elapsed * 2.2 + data.index) * 0.18;
    teleporter.rotation.y += dt * (active ? 1.8 : 5.2);
    teleporter.rotation.x = active ? 0 : Math.sin(elapsed * 3.4 + data.index) * 0.45;
    teleporter.children[1].rotation.z += dt * (active ? 2.2 : -5.4);
  }

  const positions = particles.geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const y = positions.getY(i) + dt * (0.2 + (i % 9) * 0.025);
    positions.setY(i, y > 9.5 ? 0.15 : y);
  }
  positions.needsUpdate = true;
  particles.rotation.y += dt * 0.015;
}

function checkCollisions() {
  const playerPos = player.position;

  cores = cores.filter((core) => {
    if (core.userData.phase !== phaseIndex) return true;
    const distance = Math.hypot(playerPos.x - core.position.x, playerPos.z - core.position.z);
    if (distance > 0.9) return true;

    collected += 1;
    score += 15;
    timeLeft += 2.5;
    scene.remove(core);
    updateHud();
    return false;
  });

  if (collected === levelGoal) {
    completeArena();
    return;
  }

  for (const teleporter of teleporters) {
    const distance = Math.hypot(playerPos.x - teleporter.position.x, playerPos.z - teleporter.position.z);
    if (distance > teleporter.userData.radius) continue;

    if (teleporter.userData.phase === phaseIndex) {
      if (teleportCooldown > 0) continue;
      const target = teleporters[teleporter.userData.pair];
      player.position.set(target.position.x, 0.48, target.position.z);
      score += 10;
      timeLeft += 1;
      teleportCooldown = 1.15;
      showStatus("+10 teleport");
      window.setTimeout(() => {
        if (running) hideStatus();
      }, 480);
      updateHud();
      continue;
    }

    if (penaltyCooldown <= 0) {
      score = Math.max(0, score - 8);
      timeLeft = Math.max(0, timeLeft - 3);
      penaltyCooldown = 0.9;
      const push = player.position.clone().sub(teleporter.position).setY(0);
      if (push.lengthSq() > 0) {
        push.normalize();
        player.position.addScaledVector(push, 1.45);
      }
      showStatus("-8 wrong color");
      window.setTimeout(() => {
        if (running) hideStatus();
      }, 520);
      updateHud();
    }
  }

  for (const hazard of hazards) {
    if (hazard.userData.phase !== phaseIndex) continue;
    const dx = Math.abs(playerPos.x - hazard.position.x);
    const dz = Math.abs(playerPos.z - hazard.position.z);
    const hitX = dx < hazard.userData.sx / 2 + 0.45;
    const hitZ = dz < hazard.userData.sz / 2 + 0.45;
    if (hitX && hitZ) {
      player.position.set(0, 0.48, 0);
      score = Math.max(0, score - 12);
      timeLeft = Math.max(0, timeLeft - 6);
      showStatus("-12 hazard");
      window.setTimeout(() => {
        if (running) hideStatus();
      }, 420);
      break;
    }
  }
}

function updateGame(dt, elapsed) {
  if (!running) return;

  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    running = false;
    showStatus("Rift collapsed");
  }

  updatePlayer(dt);
  updateEntities(dt, elapsed);
  checkCollisions();

  updateHud();
}

function completeArena() {
  running = false;
  score += 30 + levelIndex * 15;

  if (levelIndex >= arenaLevels.length - 1) {
    won = true;
    player.position.set(0, 0.48, 0);
    showStatus("Rift stabilized");
    updateHud();
    return;
  }

  const nextLevel = levelIndex + 1;
  showStatus("Wormhole opening");
  wormholeGroup.visible = true;
  wormholeGroup.position.set(0, 0.02, 0);
  wormholeGroup.scale.setScalar(0.35);
  wormholeLight.position.set(0, 1.2, 0);
  dropTransition = {
    stage: "suck",
    elapsed: 0,
    duration: 1.15,
    nextLevel,
    start: player.position.clone(),
  };
}

function updateCamera(dt) {
  const target = new THREE.Vector3(player.position.x * 0.22, 13.5, player.position.z + 16.5);
  camera.position.lerp(target, 1 - Math.pow(0.001, dt));
  camera.lookAt(player.position.x * 0.2, 0.35, player.position.z - 1.5);
}

function showStatus(text) {
  statusBanner.textContent = text;
  statusBanner.classList.remove("hidden");
}

function hideStatus() {
  statusBanner.classList.add("hidden");
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.033);
  const elapsed = clock.elapsedTime;

  if (!running) updateEntities(dt, elapsed);
  updateDropTransition(dt);
  updateGame(dt, elapsed);
  updateCamera(dt);

  animateWormhole(dt, elapsed);
  if (!dropTransition) player.scale.setScalar(1 + Math.sin(elapsed * 5) * 0.025);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

function animateWormhole(dt, elapsed) {
  if (!wormholeGroup.visible) return;

  wormholeGroup.children.forEach((child, index) => {
    if (!child.isMesh) return;
    if (index >= 1 && index <= 3) {
      child.rotation.z += dt * (index % 2 === 0 ? -3.4 : 4.2);
      child.material.opacity = 0.58 + Math.sin(elapsed * 5 + index) * 0.18;
    }
    if (child.userData?.radius) {
      child.userData.angle += dt * child.userData.speed;
      child.position.x = Math.cos(child.userData.angle) * child.userData.radius;
      child.position.z = Math.sin(child.userData.angle) * child.userData.radius;
      child.rotation.y += dt * 4.5;
    }
  });
}

function updateDropTransition(dt) {
  if (!dropTransition) return;

  dropTransition.elapsed += dt;
  const progress = Math.min(dropTransition.elapsed / dropTransition.duration, 1);
  const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;

  if (dropTransition.stage === "suck") {
    player.position.x = THREE.MathUtils.lerp(dropTransition.start.x, 0, eased);
    player.position.z = THREE.MathUtils.lerp(dropTransition.start.z, 0, eased);
    player.position.y = THREE.MathUtils.lerp(dropTransition.start.y, -2.3, eased);
    player.scale.setScalar(THREE.MathUtils.lerp(1, 0.18, eased));
    wormholeGroup.position.set(0, 0.02, 0);
    wormholeGroup.scale.setScalar(THREE.MathUtils.lerp(0.35, 1.25, Math.min(progress * 1.4, 1)));
    wormholeLight.position.set(0, 1.2, 0);
    wormholeLight.intensity = THREE.MathUtils.lerp(1.2, 14, Math.sin(progress * Math.PI));
  } else {
    const wobble = Math.sin(progress * Math.PI * 5) * (1 - progress) * 0.36;
    player.position.x = wobble;
    player.position.z = -wobble * 0.6;
    player.position.y = THREE.MathUtils.lerp(8.8, 0.48, eased);
    player.scale.setScalar(THREE.MathUtils.lerp(0.55, 1, eased));
    wormholeGroup.position.set(0, THREE.MathUtils.lerp(6.9, 0.02, Math.min(progress * 1.2, 1)), 0);
    wormholeGroup.scale.setScalar(THREE.MathUtils.lerp(1.45, 0.55, progress));
    wormholeLight.position.set(0, wormholeGroup.position.y + 0.8, 0);
    wormholeLight.intensity = THREE.MathUtils.lerp(12, 0, progress);
  }

  playerRing.position.copy(player.position);
  playerRing.position.y = player.position.y + 0.04;

  if (progress >= 1) {
    if (dropTransition.stage === "suck") {
      levelIndex = dropTransition.nextLevel;
      phaseIndex = arenaLevels[levelIndex].phase;
      collected = 0;
      timeLeft += arenaLevels[levelIndex].timeBonus;
      createEntities();
      updatePhaseVisuals();
      updateHud();
      showStatus(`Dropping into ${arenaLevels[levelIndex].name}`);
      dropTransition = {
        stage: "drop",
        elapsed: 0,
        duration: 1.25,
      };
      player.position.set(0, 8.8, 0);
      player.scale.setScalar(0.55);
      wormholeGroup.visible = true;
      return;
    }

    dropTransition = null;
    player.position.set(0, 0.48, 0);
    player.scale.setScalar(1);
    wormholeGroup.visible = false;
    wormholeLight.intensity = 0;
    running = true;
    hideStatus();
  }
}

function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
