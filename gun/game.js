/************************************************************
 * Multiplayer Gun – WebView Version
 * HOST AUTHORITATIVE (FIXED)
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;

let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- STATE ---------- */
let mode = "lobby";
let bullets = [];
let playerRole = null; // "A" | "B"
let isHost = false;

/* ---------- PLAYER DATA ---------- */
const me = {
  x: 60, y: 60, dx: 3, dy: 3,
  angle: 0, health: 100,
  el: null, cannon: null, hp: null
};

const enemy = {
  x: 260, y: 360, dx: -3, dy: -3,
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
window.onRNMessage = msg => {
  if (!msg) return;
  if (typeof msg === "string") {
    try { msg = JSON.parse(msg); } catch { return; }
  }

  /* ROLE ASSIGN */
  if (msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
  }

  /* GAME START */
  if (msg.type === "start") {
    startGame();
  }

  /* AIM INPUT (HOST ONLY) */
  if (msg.action === "aim" && isHost) {
    if (msg.player === "A") me.angle = msg.angle;
    if (msg.player === "B") enemy.angle = msg.angle;
  }

  /* SHOOT INPUT (HOST ONLY) */
  if (msg.action === "shoot" && isHost) {
    const p = msg.player === "A" ? me : enemy;
    bullets.push({
      x: p.x + BOX / 2,
      y: p.y + BOX / 2,
      angle: p.angle,
      owner: msg.player
    });
  }

  /* STATE UPDATE (CLIENT ONLY) */
  if (msg.type === "state" && !isHost) {
    applyRemoteState(msg.state);
  }
};

/* ---------- PEER BRIDGE ---------- */
window.onPeerMessage = msg => window.onRNMessage(msg);

/* ---------- START BUTTON ---------- */
function createStartButton() {
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
function createPlayer(ref) {
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

  ref.el = p;
  ref.cannon = cannon;
  ref.hp = hb;
}

/* ---------- START GAME ---------- */
function startGame() {
  if (mode === "game") return;
  mode = "game";

  lobby.style.display = "none";
  statusEl.textContent = "Connected ✔";

  if (!me.el) createPlayer(me);
  if (!enemy.el) createPlayer(enemy);

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
}

/* ---------- SHOOT ---------- */
shootBtn.onclick = () => {
  if (!playerRole) return;
  sendToRN({ action: "shoot", player: playerRole });
};

/* ---------- STATE SYNC ---------- */
let lastSent = 0;
function sendState() {
  if (Date.now() - lastSent < 80) return;
  lastSent = Date.now();

  sendToRN({
    type: "state",
    state: {
      me: strip(me),
      enemy: strip(enemy),
      bullets: bullets.map(strip)
    }
  });
}

/* ---------- CLIENT STATE APPLY (SAFE) ---------- */
function applyRemoteState(state) {
  me.x = state.me.x;
  me.y = state.me.y;
  me.angle = state.me.angle;
  me.health = state.me.health;

  enemy.x = state.enemy.x;
  enemy.y = state.enemy.y;
  enemy.angle = state.enemy.angle;
  enemy.health = state.enemy.health;

  me.hp.style.width = me.health * 0.8 + "px";
  enemy.hp.style.width = enemy.health * 0.8 + "px";

  bullets.forEach(b => b.el?.remove());
  bullets = [];

  for (const sb of state.bullets || []) {
    bullets.push({
      x: sb.x,
      y: sb.y,
      angle: sb.angle,
      owner: sb.owner
    });
  }
}

/* ---------- HELPERS ---------- */
function strip(o) {
  return {
    x: o.x,
    y: o.y,
    angle: o.angle,
    health: o.health,
    owner: o.owner
  };
}

/* ---------- AIM JOYSTICK ---------- */
let aiming = false;
let centerX = 0;
let centerY = 0;
let lastAngle = 0;

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

  const angle = Math.atan2(dy, dx);
  me.angle = angle;

  if (!isHost && Math.abs(angle - lastAngle) > 0.02) {
    lastAngle = angle;
    sendToRN({ action: "aim", player: playerRole, angle });
  }
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
