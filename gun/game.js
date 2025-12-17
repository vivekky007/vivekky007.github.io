/************************************************************
 * Multiplayer Gun – WebView Version
 * FINAL – Host Authoritative (Movement + Aim + Shoot)
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;

/* ---------- AIM STORAGE ---------- */
let aimA = 0;
let aimB = 0;

let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- STATE ---------- */
let mode = "lobby";
let bullets = [];
let playerRole = null; // "A" | "B"
let isHost = false;

/* ---------- PLAYER DATA ---------- */
const me = {
  x: 50, y: 50, dx: 3, dy: 3,
  angle: 0, health: 100,
  el: null, cannon: null, hp: null
};

const enemy = {
  x: 250, y: 400, dx: 3, dy: 3,
  angle: 0, health: 100,
  el: null, cannon: null, hp: null
};

/* ---------- DOM ---------- */
const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");
const shootBtn = document.getElementById("shootBtn");
const aimZone = document.getElementById("aimZone");
const stick = document.getElementById("stick");

/* ---------- RN ↔ WEBVIEW ---------- */
function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

/* ---------- RN MESSAGE HANDLER ---------- */
window.onRNMessage = function (msg) {
  if (!msg) return;
  if (typeof msg === "string") {
    try { msg = JSON.parse(msg); } catch { return; }
  }

  if (msg.action === "assign"|| msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
  }

  if (msg.action === "start") {
    startGame();
  }

  // HOST receives start request from client
  if (isHost && msg.action === "requestStart") {
    sendToRN({ action: "start" }); // broadcast to both players
    startGame();                   // start on host
  }


  // CLIENT receives authoritative state
  if (!isHost && msg.action === "state") {
    applyRemoteState(msg.state);
  }

  // HOST receives AIM
  if (isHost && msg.action === "aim") {
    if (msg.player === "A") {
      aimA = msg.angle;
      me.angle = msg.angle;
    } else {
      aimB = msg.angle;
      enemy.angle = msg.angle;
    }
  }

  // HOST receives SHOOT
  if (isHost && msg.action === "shoot") {
    spawnBullet(msg.player);
  }
};

/* ---------- PEER → RN ---------- */
window.onPeerMessage = msg => window.onRNMessage(msg);

/* ---------- START BUTTON ---------- */
function createStartButton() {
  if (!startBtn) return;
  startBtn.style.display = "block";
  startBtn.onclick = () => {
    startBtn.style.display = "none";
    sendToRN({ action: isHost ? "start" : "requestStart" });
    if (isHost) startGame();
  };
}

/* ---------- CREATE PLAYER ---------- */
function createPlayer(isEnemy) {
  const p = document.createElement("div");
  p.className = "player";

  const body = document.createElement("div");
  body.className = "body";

  const cannon = document.createElement("div");
  cannon.className = "cannon";

  const hc = document.createElement("div");
  hc.className = "health-container";

  const hb = document.createElement("div");
  hb.className = "health";

  hc.appendChild(hb);
  body.appendChild(cannon);
  p.appendChild(hc);
  p.appendChild(body);
  document.body.appendChild(p);

  const ref = isEnemy ? enemy : me;
  ref.el = p;
  ref.cannon = cannon;
  ref.hp = hb;
}

/* ---------- START GAME ---------- */
function startGame() {
  if (mode === "game") return;
  mode = "game";
  lobby.style.display = "none";
  statusEl.innerText = "Connected ✔";
  createPlayer(false);
  createPlayer(true);
  requestAnimationFrame(loop);
}

/* ---------- GAME LOOP ---------- */
function loop() {
  if (mode !== "game") return;

  if (isHost) {
    simulate();
    sendState();
  }

  render();
  requestAnimationFrame(loop);
}

/* ---------- SIMULATION (HOST ONLY) ---------- */
function simulate() {
  move(me);
  move(enemy);

  bullets = bullets.filter(b => {
    b.x += Math.cos(b.angle) * SPEED;
    b.y += Math.sin(b.angle) * SPEED;

    if (b.owner === "A" && hit(b, enemy)) { damage(enemy); return false; }
    if (b.owner === "B" && hit(b, me)) { damage(me); return false; }

    return (
      b.x > -BULLET_SIZE && b.x < W + BULLET_SIZE &&
      b.y > -BULLET_SIZE && b.y < H + BULLET_SIZE
    );
  });
}

function move(p) {
  p.x += p.dx;
  p.y += p.dy;
  if (p.x < 0 || p.x > W - BOX) p.dx *= -1;
  if (p.y < 0 || p.y > H - BOX) p.dy *= -1;
}

/* ---------- SHOOT ---------- */
function spawnBullet(player) {
  const angle = player === "A" ? aimA : aimB;
  const p = player === "A" ? me : enemy;

  bullets.push({
    x: p.x + BOX / 2,
    y: p.y + BOX / 2,
    angle,
    owner: player
  });
}

if (shootBtn) shootBtn.onclick = () => {
  if (mode !== "game") return;
  if (isHost) {
    spawnBullet(playerRole);
  }

  sendToRN({ action: "shoot", player: playerRole });
};

/* ---------- RENDER ---------- */
function render() {
  drawPlayer(me);
  drawPlayer(enemy);
  bullets.forEach(drawBullet);
}

function drawPlayer(p) {
  if (!p.el) return;
  p.el.style.left = p.x + "px";
  p.el.style.top = p.y + "px";
  p.cannon.style.transform = `rotate(${p.angle}rad)`;
}

function drawBullet(b) {
  if (!b.el) {
    b.el = document.createElement("div");
    b.el.className = "bullet";
    document.body.appendChild(b.el);
  }
  b.el.style.left = b.x + "px";
  b.el.style.top = b.y + "px";
}

/* ---------- COLLISION ---------- */
function hit(b, p) {
  return b.x > p.x && b.x < p.x + BOX &&
         b.y > p.y && b.y < p.y + BOX;
}

function damage(p) {
  p.health = Math.max(0, p.health - 10);
  p.hp.style.width = p.health * 0.8 + "px";
}

/* ---------- STATE SYNC ---------- */
let lastSent = 0;
function sendState() {
  if (Date.now() - lastSent < 100) return;
  lastSent = Date.now();

  sendToRN({
    action: "state",
    state: {
      me: strip(me),
      enemy: strip(enemy),
      bullets: bullets.map(b => ({
        x: b.x,
        y: b.y,
        angle: b.angle,
        owner: b.owner
      }))

    }
  });
}

function applyRemoteState(state) {
  bullets.forEach(b => b.el?.remove());
  bullets = state.bullets || [];

  if (playerRole === "A") {
    Object.assign(me, state.me);
    Object.assign(enemy, state.enemy);
  } else {
    Object.assign(me, state.enemy);
    Object.assign(enemy, state.me);
  }
}

function strip(o) {
  return { x: o.x, y: o.y, angle: o.angle, health: o.health };
}

/* ---------- AIM JOYSTICK ---------- */
let aiming = false, centerX = 0, centerY = 0;

aimZone.addEventListener("pointerdown", e => {
  aiming = true;
  const r = aimZone.getBoundingClientRect();
  centerX = r.left + r.width / 2;
  centerY = r.top + r.height / 2;
});

window.addEventListener("pointermove", e => {
  if (!aiming || mode !== "game") return;

  let dx = e.clientX - centerX;
  let dy = e.clientY - centerY;
  const angle = Math.atan2(dy, dx);

  me.angle = angle; // visual prediction
  sendToRN({ action: "aim", player: playerRole, angle });
});

window.addEventListener("pointerup", () => {
  aiming = false;
  stick.style.transform = "translate(0,0)";
});

/* ---------- RESIZE ---------- */
window.addEventListener("resize", () => {
  W = window.innerWidth;
  H = window.innerHeight;
});
