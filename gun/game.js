/************************************************************
 * Multiplayer Gun – WebView Version (MANUAL AIM + SHOOT BTN)
 * Host-authoritative shooting integrated
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;

let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- STATE ---------- */
let mode = "lobby"; // "lobby" | "game"
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
    try { msg = JSON.parse(msg); } catch { }
  }

  console.log("📩 RN → WebView:", msg);

  if (msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
  }

  if (msg.type === "start") {
    startGame();
  }

  if (msg.type === "state" && !isHost) {
    applyRemoteState(msg.state);
  }

  // Host handles shoot actions from client
  if (msg.action === "shoot" && isHost) {
    const src = msg.player === "A" ? me : enemy;
    bullets.push({
      x: src.x + BOX / 2,
      y: src.y + BOX / 2,
      angle: src.angle,
      owner: msg.player
    });
  }
};

/* ---------- PEER → RN BRIDGE ---------- */
window.onPeerMessage = function (msg) {
  window.onRNMessage && window.onRNMessage(msg);
};

/* ---------- START BUTTON ---------- */
function createStartButton() {
  if (!startBtn) return;
  startBtn.style.display = "block";

  startBtn.onclick = () => {
    startBtn.style.display = "none";
    if (isHost) {
      startGame();
      sendToRN({ action: "start" });
    } else {
      sendToRN({ action: "requestStart" });
    }
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
      b.x > -BULLET_SIZE &&
      b.x < W + BULLET_SIZE &&
      b.y > -BULLET_SIZE &&
      b.y < H + BULLET_SIZE
    );
  });
}

function move(p) {
  p.x += p.dx;
  p.y += p.dy;
  if (p.x < 0 || p.x > W - BOX) p.dx *= -1;
  if (p.y < 0 || p.y > H - BOX) p.dy *= -1;
}

/* ---------- SHOOT BUTTON ---------- */
function shoot() {
  if (!playerRole || mode !== "game") return;

  // Always send shooting + position + angle to host
  sendToRN({
    action: "shoot",
    player: playerRole,
    x: me.x,
    y: me.y,
    angle: me.angle
  });

  // If host, immediately add bullet locally
  if (isHost) {
    bullets.push({
      x: me.x + BOX / 2,
      y: me.y + BOX / 2,
      angle: me.angle,
      owner: playerRole
    });
  }
}

if (shootBtn) shootBtn.onclick = shoot;

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
    b.el.style.background = b.owner === "A" ? "cyan" : "yellow";
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
  flash(p.el);
}

function flash(el) {
  const body = el.querySelector(".body");
  body.classList.add("flash");
  setTimeout(() => body.classList.remove("flash"), 120);
}

/* ---------- STATE SYNC ---------- */
let lastSent = 0;
function sendState() {
  const now = Date.now();
  if (now - lastSent < 100) return;
  lastSent = now;

  sendToRN({
    action: "state",
    state: {
      me: strip(me),
      enemy: strip(enemy),
      bullets: bullets.map(strip)
    }
  });
}

function applyRemoteState(state) {
  if (!state) return;
  Object.assign(me, state.enemy);
  Object.assign(enemy, state.me);

  bullets.forEach(b => b.el?.remove());
  bullets = state.bullets || [];
}

/* ---------- HELPERS ---------- */
function strip(o) {
  const c = { ...o };
  delete c.el; delete c.cannon; delete c.hp;
  return c;
}

/* ---------- AIM JOYSTICK ---------- */
let aiming = false;
let centerX = 0;
let centerY = 0;

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

  const dist = Math.hypot(dx, dy);
  const max = 40;
  if (dist > max) {
    dx = dx / dist * max;
    dy = dy / dist * max;
  }

  stick.style.transform = `translate(${dx}px, ${dy}px)`;
  me.angle = Math.atan2(dy, dx);
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
