/************************************************************
 * Multiplayer Gun – WebView Version (FINAL FIXED)
 * Host-authoritative | Manual Aim | Shoot Button
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;
const STATE_RATE = 100;

/* ---------- VIEWPORT ---------- */
let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- GAME STATE ---------- */
let mode = "lobby";          // "lobby" | "game"
let bullets = [];
let playerRole = null;       // "A" | "B"
let isHost = false;

/* ---------- PLAYER DATA ---------- */
const me = {
  x: 50, y: 50,
  dx: 0, dy: 0,
  angle: 0,
  health: 100,
  el: null, cannon: null, hp: null
};

const enemy = {
  x: 250, y: 400,
  dx: 0, dy: 0,
  angle: 0,
  health: 100,
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

  console.log("📩 RN → WebView:", msg);

  if (msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
  }

  if (msg.type === "start") startGame();

  /* ---------- CLIENT → HOST ---------- */
  if (isHost && msg.action === "move") {
    Object.assign(enemy, msg.state);
  }

  if (isHost && msg.action === "shoot") {
    spawnBullet(msg);
  }

  /* ---------- HOST → CLIENT ---------- */
  if (!isHost && msg.action === "state") {
    applyRemoteState(msg.state);
  }
};

/* ---------- START BUTTON ---------- */
function createStartButton() {
  if (!startBtn) return;
  startBtn.style.display = "block";

  startBtn.onclick = () => {
    startBtn.style.display = "none";
    if (isHost) {
      startGame();
      sendToRN({ type: "start" });
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
  lobby && (lobby.style.display = "none");
  statusEl && (statusEl.innerText = "Connected ✔");

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

/* ---------- HOST SIMULATION ---------- */
function simulate() {
  updatePosition(me);
  updatePosition(enemy);

  bullets = bullets.filter(b => {
    b.x += Math.cos(b.angle) * SPEED;
    b.y += Math.sin(b.angle) * SPEED;

    if (b.owner === "A" && hit(b, enemy)) { damage(enemy); removeBullet(b); return false; }
    if (b.owner === "B" && hit(b, me)) { damage(me); removeBullet(b); return false; }

    if (b.x < -BULLET_SIZE || b.x > W || b.y < -BULLET_SIZE || b.y > H) {
      removeBullet(b);
      return false;
    }
    return true;
  });
}

function updatePosition(p) {
  p.x = Math.max(0, Math.min(W - BOX, p.x));
  p.y = Math.max(0, Math.min(H - BOX, p.y));
}

/* ---------- SHOOT ---------- */
function shoot() {
  if (mode !== "game") return;

  if (isHost) {
    spawnBullet({
      player: playerRole,
      x: me.x,
      y: me.y,
      angle: me.angle
    });
  } else {
    sendToRN({
      action: "shoot",
      player: playerRole,
      x: me.x,
      y: me.y,
      angle: me.angle
    });
  }
}

shootBtn && (shootBtn.onclick = shoot);

/* ---------- BULLET ---------- */
function spawnBullet(data) {
  bullets.push({
    x: data.x + BOX / 2,
    y: data.y + BOX / 2,
    angle: data.angle,
    owner: data.player,
    el: null
  });
}

function removeBullet(b) {
  b.el && b.el.remove();
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
  return b.x > p.x && b.x < p.x + BOX && b.y > p.y && b.y < p.y + BOX;
}

function damage(p) {
  p.health = Math.max(0, p.health - 10);
  p.hp && (p.hp.style.width = p.health * 0.8 + "px");
  flash(p.el);
}

function flash(el) {
  if (!el) return;
  const body = el.querySelector(".body");
  body.classList.add("flash");
  setTimeout(() => body.classList.remove("flash"), 120);
}

/* ---------- STATE SYNC ---------- */
let lastSent = 0;
function sendState() {
  const now = Date.now();
  if (now - lastSent < STATE_RATE) return;
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

  if (playerRole === "A") {
    Object.assign(me, state.me);
    Object.assign(enemy, state.enemy);
  } else {
    Object.assign(me, state.enemy);
    Object.assign(enemy, state.me);
  }

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
let centerX = 0, centerY = 0;

aimZone && aimZone.addEventListener("pointerdown", e => {
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

  stick && (stick.style.transform = `translate(${dx}px, ${dy}px)`);
  me.angle = Math.atan2(dy, dx);

  sendToRN({
    action: "move",
    state: { x: me.x, y: me.y, angle: me.angle }
  });
});

window.addEventListener("pointerup", () => {
  aiming = false;
  stick && (stick.style.transform = "translate(0,0)");
});

/* ---------- RESIZE ---------- */
window.addEventListener("resize", () => {
  W = window.innerWidth;
  H = window.innerHeight;
});
