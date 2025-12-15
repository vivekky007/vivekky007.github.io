/************************************************************
 * Multiplayer Gun – WebView Version (FINAL FIXED)
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;

/* ---------- SCREEN ---------- */
let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- STATE ---------- */
let mode = "lobby"; // lobby | game
let bullets = [];
let playerRole = null; // A | B
let isHost = false;

/* ---------- PLAYER DATA ---------- */
const me = {
  x: 60, y: 60, dx: 3, dy: 3,
  angle: 0, health: 100,
  el: null, cannon: null, hp: null
};

const enemy = {
  x: 300, y: 400, dx: 3, dy: 3,
  angle: 0, health: 100,
  el: null, cannon: null, hp: null
};

/* ---------- DOM ---------- */
const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomId");

const shootBtn = document.getElementById("shootBtn");
const aimZone = document.getElementById("aimZone");
const stick = document.getElementById("stick");

/* ---------- RN BRIDGE ---------- */
function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

/* ---------- LOBBY BUTTONS ---------- */
createBtn.onclick = () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter Room ID");
  sendToRN({ action: "createRoom", roomId });
};

joinBtn.onclick = () => {
  const roomId = roomInput.value.trim();
  if (!roomId) return alert("Enter Room ID");
  sendToRN({ action: "joinRoom", roomId });
};

/* ---------- RN → WEBVIEW ---------- */
window.onRNMessage = function (msg) {
  if (!msg) return;
  if (typeof msg === "string") {
    try { msg = JSON.parse(msg); } catch {}
  }

  console.log("📩 RN → WebView:", msg);

  if (msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    startBtn.style.display = "block";
  }

  if (msg.type === "start") {
    startGame();
  }

  if (msg.type === "state" && !isHost) {
    applyRemoteState(msg.state);
  }

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

/* ---------- PEER BRIDGE ---------- */
window.onPeerMessage = msg => window.onRNMessage(msg);

/* ---------- START BUTTON ---------- */
startBtn.onclick = () => {
  startBtn.style.display = "none";
  if (isHost) {
    startGame();
    sendToRN({ action: "start" });
  } else {
    sendToRN({ action: "requestStart" });
  }
};

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

  console.log("🎮 GAME START");
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

/* ---------- SIMULATION (HOST) ---------- */
function simulate() {
  move(me);
  move(enemy);

  bullets = bullets.filter(b => {
    b.x += Math.cos(b.angle) * SPEED;
    b.y += Math.sin(b.angle) * SPEED;

    if (b.owner === "A" && hit(b, enemy)) { damage(enemy); return false; }
    if (b.owner === "B" && hit(b, me)) { damage(me); return false; }

    return b.x > -20 && b.x < W + 20 && b.y > -20 && b.y < H + 20;
  });
}

function move(p) {
  p.x += p.dx;
  p.y += p.dy;
  if (p.x < 0 || p.x > W - BOX) p.dx *= -1;
  if (p.y < 0 || p.y > H - BOX) p.dy *= -1;
}

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

/* ---------- BULLETS ---------- */
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
}

/* ---------- SHOOT BUTTON ---------- */
shootBtn.onclick = () => {
  if (!playerRole) return;
  sendToRN({ action: "shoot", player: playerRole });
};

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
  Object.assign(me, state.enemy);
  Object.assign(enemy, state.me);

  bullets.forEach(b => b.el?.remove());
  bullets = state.bullets || [];
}

/* ---------- AIM JOYSTICK ---------- */
let aiming = false;
let cx = 0, cy = 0;

aimZone.onpointerdown = e => {
  aiming = true;
  const r = aimZone.getBoundingClientRect();
  cx = r.left + r.width / 2;
  cy = r.top + r.height / 2;
};

window.onpointermove = e => {
  if (!aiming || mode !== "game") return;

  let dx = e.clientX - cx;
  let dy = e.clientY - cy;

  const d = Math.hypot(dx, dy);
  if (d > 40) {
    dx = dx / d * 40;
    dy = dy / d * 40;
  }

  stick.style.transform = `translate(${dx}px,${dy}px)`;
  me.angle = Math.atan2(dy, dx);
};

window.onpointerup = () => {
  aiming = false;
  stick.style.transform = "translate(0,0)";
};

/* ---------- HELPERS ---------- */
function strip(o) {
  const c = { ...o };
  delete c.el; delete c.cannon; delete c.hp;
  return c;
}

/* ---------- RESIZE ---------- */
window.onresize = () => {
  W = window.innerWidth;
  H = window.innerHeight;
};
