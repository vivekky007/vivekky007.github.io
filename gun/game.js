/************************************************************
 * Multiplayer Gun – WebView Version (MANUAL AIM + SHOOT BTN)
 * FIXED: Proper Aim Sync (rotation == aim)
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

/* ---------- AIM STORAGE (HOST) ---------- */
let aimA = 0;
let aimB = 0;

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

  if (msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
  }

  if (msg.type === "start") startGame();

  if (msg.action === "aim" && isHost) {
    if (msg.player === "A") aimA = msg.angle;
    if (msg.player === "B") aimB = msg.angle;
  }

  if (msg.type === "state" && !isHost) {
    applyRemoteState(msg.state);
  }

  if (msg.action === "shoot" && isHost) {
    bullets.push({
      x: msg.x + BOX / 2,
      y: msg.y + BOX / 2,
      angle: msg.player === "A" ? aimA : aimB,
      owner: msg.player
    });
  }
};

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

/* ---------- SHOOT ---------- */
function shoot() {
  if (!playerRole || mode !== "game") return;

  sendToRN({ action: "shoot", player: playerRole });

  if (isHost) {
    bullets.push({
      x: me.x + BOX / 2,
      y: me.y + BOX / 2,
      angle: playerRole === "A" ? aimA : aimB,
      owner: playerRole
    });
  }
}
shootBtn.onclick = shoot;

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
      bullets: bullets.map(strip),
      aim: { A: aimA, B: aimB }
    }
  });
}

function applyRemoteState(state) {
  if (!state) return;

  Object.assign(me, state.enemy);
  Object.assign(enemy, state.me);

  if (playerRole === "A") enemy.angle = state.aim.B;
  else enemy.angle = state.aim.A;

  bullets.forEach(b => b.el?.remove());
  bullets = state.bullets || [];
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

  me.angle = Math.atan2(dy, dx);

  sendToRN({
    action: "aim",
    player: playerRole,
    angle: me.angle
  });

  stick.style.transform = `translate(${dx}px, ${dy}px)`;
});

window.addEventListener("pointerup", () => {
  aiming = false;
  stick.style.transform = "translate(0,0)";
});

/* ---------- HELPERS ---------- */
function strip(o) {
  const c = { ...o };
  delete c.el; delete c.cannon; delete c.hp;
  return c;
}
