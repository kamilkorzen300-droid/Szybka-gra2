
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

const $ = id => document.getElementById(id);

function load(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

let data = load("spmSave", {
  coins: 0,
  level: 1,
  xp: 0,
  kills: 0,
  bestWave: 0,
  passLevel: 1,
  skins: ["soldier"],
  skin: "soldier",
  items: []
});

const skins = [
  { id: "soldier", name: "Żołnierz", icon: "🪖", price: 0 },
  { id: "blue", name: "Niebieski", icon: "🧑‍🚀", price: 100 },
  { id: "ninja", name: "Ninja", icon: "🥷", price: 250 },
  { id: "robot", name: "Robot", icon: "🤖", price: 400 },
  { id: "alien", name: "Kosmita", icon: "👽", price: 650 },
  { id: "king", name: "Król", icon: "👑", price: 1000 }
];

const shopItems = [
  { id: "health", name: "Dodatkowe zdrowie", price: 150 },
  { id: "damage", name: "Ulepszenie obrażeń", price: 250 },
  { id: "ammo", name: "Więcej amunicji", price: 200 }
];

function save() {
  localStorage.setItem("spmSave", JSON.stringify(data));
  updateUI();
}

function updateUI() {
  $("lobbyCoins").textContent = data.coins;
  $("shopCoins").textContent = data.coins;
  $("coins").textContent = data.coins;
  $("playerLevel").textContent = data.level;
  $("statLevel").textContent = data.level;
  $("kills").textContent = data.kills;
  $("bestWave").textContent = data.bestWave;
  $("statCoins").textContent = data.coins;
  $("passLevel").textContent = data.passLevel;
  $("passProgress").style.width = (data.passLevel / 50 * 100) + "%";

  const current = skins.find(s => s.id === data.skin) || skins[0];

  $("characterPreview").textContent = current.icon;
  $("avatar").textContent = current.icon;
  $("skinName").textContent = current.name;
}

function showOnly(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function showLobby() {
  stopGame();
  showOnly("lobby");
  $("hud").classList.add("hidden");
  updateUI();
}

function addCoins(amount) {
  data.coins += amount;
  save();
}

function addXP(amount) {
  data.xp += amount;

  while (data.xp >= data.level * 100) {
    data.xp -= data.level * 100;
    data.level++;
    addCoins(50);
    showMessage("NOWY POZIOM! +50 MONET");
  }

  if (data.passLevel < 50) {
    data.passLevel++;
  }

  save();
}

// ===== SKINY =====

function renderSkins() {
  const root = $("skinItems");
  root.innerHTML = "";

  skins.forEach(skin => {
    const owned = data.skins.includes(skin.id);

    const item = document.createElement("div");
    item.className = "item";

    const text = document.createElement("span");
    text.textContent = skin.icon + " " + skin.name;

    const button = document.createElement("button");
    button.textContent = owned ? "WYBIERZ" : skin.price + " 🪙";

    button.onclick = () => {
      if (owned) {
        data.skin = skin.id;
        save();
        renderSkins();
      } else if (data.coins >= skin.price) {
        data.coins -= skin.price;
        data.skins.push(skin.id);
        data.skin = skin.id;
        save();
        renderSkins();
      } else {
        alert("Masz za mało monet!");
      }
    };

    item.append(text, button);
    root.appendChild(item);
  });
}

// ===== SKLEP =====

function renderShop() {
  const root = $("shopItems");
  root.innerHTML = "";

  shopItems.forEach(product => {
    const item = document.createElement("div");
    item.className = "item";

    const text = document.createElement("span");
    text.textContent = product.name;

    const button = document.createElement("button");
    button.textContent = product.price + " 🪙";

    button.onclick = () => {
      if (data.coins < product.price) {
        alert("Masz za mało monet!");
        return;
      }

      data.coins -= product.price;
      data.items.push(product.id);
      save();
      renderShop();
      alert("Kupiono: " + product.name);
    };

    item.append(text, button);
    root.appendChild(item);
  });
}

// ===== BATTLE PASS =====

function renderPass() {
  const root = $("passItems");
  root.innerHTML = "";

  for (let i = 1; i <= 50; i++) {
    const item = document.createElement("div");
    item.className = "item";

    const reward = i % 5 === 0 ? "100 monet 🪙" : "25 monet 🪙";

    const text = document.createElement("span");
    text.textContent = "Poziom " + i + " – " + reward;

    const button = document.createElement("button");

    if (i <= data.passLevel) {
      button.textContent = "ODEBRANO";
      button.disabled = true;
    } else {
      button.textContent = "ZABLOKOWANE";
      button.disabled = true;
    }

    item.append(text, button);
    root.appendChild(item);
  }
}

// ===== GRA THREE.JS =====

let scene, camera, renderer;
let enemies = [];
let bullets = [];
let player = new THREE.Vector3();
let yaw = 0, pitch = 0;
let moveX = 0, moveY = 0;
let wave = 1, hp = 100, ammo = 30;
let playing = false, paused = false;
let lastFrame = 0, lastShot = 0;
let messageTimer, nextWaveTimer;
let keys = {};
let isTouch = navigator.maxTouchPoints > 0;
let selectedMap = "warehouse";
let damageBonus = 0;
let healthBonus = 0;

const mapColors = {
  warehouse: [0x8193a3, 0x68717c, 0x465568],
  city: [0x9aa9b9, 0x555e69, 0x46516a],
  desert: [0xd7ad75, 0xc49a58, 0x9e7749],
  base: [0x687b70, 0x485b50, 0x34493d]
};

function showMessage(text) {
  $("message").textContent = text;
  clearTimeout(messageTimer);
  messageTimer = setTimeout(() => $("message").textContent = "", 2200);
}

function addObstacle(x, y, z, sx, sy, sz, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

function createMap() {
  const colors = mapColors[selectedMap];

  scene.background = new THREE.Color(colors[0]);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({ color: colors[1] })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  addObstacle(0, 3, -50, 100, 6, 1, colors[2]);
  addObstacle(0, 3, 50, 100, 6, 1, colors[2]);
  addObstacle(-50, 3, 0, 1, 6, 100, colors[2]);
  addObstacle(50, 3, 0, 1, 6, 100, colors[2]);

  [
    [-12, -12], [12, -12], [-12, 12], [12, 12],
    [0, -25], [0, 25], [-25, 0], [25, 0],
    [-25, -25], [25, 25]
  ].forEach((p, i) => {
    addObstacle(
      p[0], 1.5, p[1],
      i % 2 ? 5 : 7, 3, 4, colors[2]
    );
  });
}

function createLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 2));

  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(10, 20, 10);
  scene.add(light);
}

function createEnemy(boss = false) {
  const group = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color: boss ? 0x9b35df : 0xd74747
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(boss ? 1.6 : 0.9, boss ? 2.2 : 1.4, 0.8),
    material
  );
  body.position.y = boss ? 1.1 : 0.7;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(boss ? 0.45 : 0.3, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffc49c })
  );
  head.position.y = boss ? 2.4 : 1.6;
  group.add(head);

  const angle = Math.random() * Math.PI * 2;
  const distance = 18 + Math.random() * 15;

  group.position.set(
    player.x + Math.cos(angle) * distance,
    0,
    player.z + Math.sin(angle) * distance
  );

  scene.add(group);

  enemies.push({
    group,
    body,
    hp: boss ? 20 + wave * 4 : 3 + Math.floor(wave / 5),
    maxHp: boss ? 20 + wave * 4 : 3 + Math.floor(wave / 5),
    boss,
    speed: boss ? 1.5 : Math.min(2 + wave * 0.05, 5),
    attackTimer: 0
  });
}

function spawnWave() {
  const count = Math.min(3 + wave * 2, 70);
  const boss = wave % 5 === 0;

  for (let i = 0; i < count; i++) createEnemy();

  if (boss) createEnemy(true);

  $("wave").textContent = wave;

  showMessage(boss ? "BOSS! FALA " + wave : "FALA " + wave + " / 50");
}

const raycaster = new THREE.Raycaster();

function shoot() {
  if (!playing || paused || ammo <= 0) return;

  const now = performance.now();
  if (now - lastShot < 220) return;

  lastShot = now;
  ammo--;
  $("ammo").textContent = ammo;

  raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
  const targets = enemies.map(e => e.body);
  const hits = raycaster.intersectObjects(targets);

  if (!hits.length) return;

  const enemy = enemies.find(e => e.body === hits[0].object);
  if (!enemy) return;

  enemy.hp -= 1 + damageBonus;

  if (enemy.hp <= 0) {
    scene.remove(enemy.group);
    enemies = enemies.filter(e => e !== enemy);

    data.kills++;
    addCoins(enemy.boss ? 100 : 10);
    addXP(enemy.boss ? 100 : 20);

    showMessage(enemy.boss ? "BOSS POKONANY! +100 🪙" : "POKONANY! +10 🪙");
  }
}

function reload() {
  if (!playing || paused || ammo === 30) return;

  showMessage("PRZEŁADOWANIE...");
  setTimeout(() => {
    if (!playing) return;
    ammo = 30;
    $("ammo").textContent = ammo;
  }, 1200);
}

function startGame() {
  stopGame();

  showOnly("lobby");
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  $("hud").classList.remove("hidden");

  wave = 1;
  hp = 100 + healthBonus;
  ammo = 30;
  yaw = 0;
  pitch = 0;
  player.set(0, 0, 0);

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75, innerWidth / innerHeight, 0.1, 150
  );
  camera.rotation.order = "YXZ";
  camera.position.set(0, 1.7, 0);
  scene.add(camera);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  $("game").appendChild(renderer.domElement);

  createLights();
  createMap();

  enemies = [];
  bullets = [];
  hp = Math.min(hp, 200);

  $("hp").textContent = hp;
  $("ammo").textContent = ammo;

  playing = true;
  paused = false;
  lastFrame = performance.now();

  spawnWave();
  requestAnimationFrame(animate);
}

function stopGame() {
  playing = false;
  paused = false;
  clearTimeout(nextWaveTimer);
  clearTimeout(messageTimer);

  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }

  scene = null;
  camera = null;
  enemies = [];
}

function endGame() {
  if (!playing) return;

  playing = false;
  data.bestWave = Math.max(data.bestWave, wave);
  save();

  $("finalWave").textContent = wave;
  $("hud").classList.add("hidden");
  showOnly("gameOver");
}

function pauseGame() {
  if (!playing) return;
  playing = false;
  paused = true;
  showOnly("pause");
}

function resumeGame() {
  if (!paused) return;
  paused = false;
  playing = true;
  lastFrame = performance.now();
  document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
  $("hud").classList.remove("hidden");
  requestAnimationFrame(animate);
}

function updateMovement(delta) {
  if (!isTouch) {
    moveX = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
    moveY = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  }

  const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  player.addScaledVector(forward, moveY * 8 * delta);
  player.addScaledVector(right, moveX * 8 * delta);

  player.x = THREE.MathUtils.clamp(player.x, -46, 46);
  player.z = THREE.MathUtils.clamp(player.z, -46, 46);

  camera.position.set(player.x, 1.7, player.z);
  camera.rotation.set(pitch, yaw, 0);
}

function updateEnemies(delta) {
  enemies.forEach(enemy => {
    const direction = new THREE.Vector3(
      player.x - enemy.group.position.x,
      0,
      player.z - enemy.group.position.z
    );

    const distance = direction.length();

    if (distance > 2.2) {
      direction.normalize();
      enemy.group.position.addScaledVector(direction, enemy.speed * delta);
    }

    enemy.group.lookAt(player.x, 0, player.z);

    if (distance < 2.5) {
      enemy.attackTimer -= delta;
      if (enemy.attackTimer <= 0) {
        hp -= enemy.boss ? 10 : 5;
        $("hp").textContent = Math.max(0, hp);
        enemy.attackTimer = 1;
      }
    }
  });

  if (hp <= 0) endGame();
}

function finishWave() {
  if (!playing || enemies.length) return;

  playing = false;

  const reward = 30 + wave * 5;
  addCoins(reward);
  addXP(50);

  showMessage("FALA UKOŃCZONA! +" + reward + " MONET");

  nextWaveTimer = setTimeout(() => {
    if (!scene) return;

    wave++;

    if (wave > 50) {
      showMessage("UKOŃCZONO 50 FAL! TRYB NIESKOŃCZONY!");
    }

    playing = true;
    lastFrame = performance.now();
    spawnWave();
    requestAnimationFrame(animate);
  }, 1800);
}

function animate(now) {
  if (!playing || !renderer) return;

  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  updateMovement(delta);
  updateEnemies(delta);

  if (!playing) return;

  if (enemies.length === 0) finishWave();

  renderer.render(scene, camera);
  if (playing) requestAnimationFrame(animate);
}

// ===== STEROWANIE =====

window.addEventListener("keydown", e => {
  keys[e.code] = true;
  if (e.code === "KeyR") reload();
});

window.addEventListener("keyup", e => {
  keys[e.code] = false;
});

document.addEventListener("mousedown", e => {
  if (e.button === 0 && playing && !isTouch) shoot();
});

document.addEventListener("mousemove", e => {
  if (playing && !isTouch && document.pointerLockElement && renderer) {
    yaw -= e.movementX * 0.003;
    pitch -= e.movementY * 0.003;
    pitch = THREE.MathUtils.clamp(pitch, -1.3, 1.3);
  }
});

$("game").addEventListener("click", () => {
  if (playing && !isTouch && renderer) {
    renderer.domElement.requestPointerLock?.();
  }
});

let lookId = null;
let lastTouch = { x: 0, y: 0 };

$("game").addEventListener("pointerdown", e => {
  if (!playing || !isTouch) return;
  lookId = e.pointerId;
  lastTouch = { x: e.clientX, y: e.clientY };
});

$("game").addEventListener("pointermove", e => {
  if (e.pointerId !== lookId) return;

  yaw -= (e.clientX - lastTouch.x) * 0.005;
  pitch -= (e.clientY - lastTouch.y) * 0.005;
  pitch = THREE.MathUtils.clamp(pitch, -1.3, 1.3);

  lastTouch = { x: e.clientX, y: e.clientY };
});

$("game").addEventListener("pointerup", () => lookId = null);
$("game").addEventListener("pointercancel", () => lookId = null);

// Joystick
const joystick = $("joystick");
const stick = $("stick");

joystick.addEventListener("pointerdown", e => {
  joystick.setPointerCapture(e.pointerId);
  updateStick(e);
});

joystick.addEventListener("pointermove", e => {
  if (e.buttons) updateStick(e);
});

function updateStick(e) {
  const rect = joystick.getBoundingClientRect();
  let x = e.clientX - rect.left - 60;
  let y = e.clientY - rect.top - 60;
  const length = Math.hypot(x, y);
  if (length > 38) {
    x *= 38 / length;
    y *= 38 / length;
  }
  stick.style.left = 33 + x + "px";
  stick.style.top = 33 + y + "px";
  moveX = x / 38;
  moveY = -y / 38;
}

function resetStick() {
  moveX = moveY = 0;
  stick.style.left = "33px";
  stick.style.top = "33px";
}

joystick.addEventListener("pointerup", resetStick);
joystick.addEventListener("pointercancel", resetStick);

$("fireBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  shoot();
});

$("reloadBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  reload();
});

$("jumpBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  if (camera && playing) camera.position.y = 2.7;
  setTimeout(() => {
    if (camera && playing) camera.position.y = 1.7;
  }, 350);
});

// ===== MENU =====

$("playBtn").onclick = () => showOnly("maps");
$("skinsBtn").onclick = () => {
  renderSkins();
  showOnly("skins");
};
$("shopBtn").onclick = () => {
  renderShop();
  showOnly("shop");
};
$("passBtn").onclick = () => {
  renderPass();
  showOnly("battlepass");
};
$("statsBtn").onclick = () => showOnly("stats");

document.querySelectorAll("[data-map]").forEach(button => {
  button.onclick = () => {
    selectedMap = button.dataset.map;
    startGame();
  };
});

document.querySelectorAll(".backBtn").forEach(button => {
  button.onclick = showLobby;
});

$("pauseBtn").onclick = pauseGame;
$("resumeBtn").onclick = resumeGame;
$("pauseMenuBtn").onclick = showLobby;
$("againBtn").onclick = startGame;
$("overMenuBtn").onclick = showLobby;

window.addEventListener("resize", () => {
  if (!camera || !renderer) return;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

updateUI();
