/************************************************************
 * Multiplayer Gun – WebView Version (Host-Authoritative)
 ************************************************************/

/* ---------- CONSTANTS ---------- */
const BOX = 80;
const BULLET_SIZE = 12;
const SPEED = 9;

let W = window.innerWidth;
let H = window.innerHeight;

/* ---------- STATE ---------- */
let mode = "lobby"; // "lobby" or "game"
let bullets = [];
let playerRole = null; // "A" or "B"

/* ---------- PLAYER DATA ---------- */
const me = { x: 50, y: 50, dx: 3, dy: 3, angle: 0, health: 100, el: null, cannon: null, hp: null };
const enemy = { x: 250, y: 400, angle: 0, health: 100, el: null, cannon: null, hp: null };

/* ---------- DOM ---------- */
const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");

/* ---------- RN ↔ WEBVIEW BRIDGE ---------- */
function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

window.onRNMessage = function (msg) {
  if (!msg) return;

  if (msg.type === "assign") {
    playerRole = msg.player;
    console.log("Assigned role:", playerRole);
    createStartButton();
  }

  if (msg.type === "start") {
    startGame();
  }

  if (msg.type === "state") {
    if (playerRole === "B") applyRemoteState(msg.state);
  }

  if (msg.action === "shoot") {
    // Only host simulates bullets
    if (playerRole === "A") {
      if (msg.player === "B") {
        bullets.push({
          x: enemy.x + BOX / 2,
          y: enemy.y + BOX / 2,
          angle: enemy.angle,
          owner: "enemy",
        });
      }
    }
  }
};

/* ---------- CREATE START BUTTON ---------- */
function createStartButton() {
  const oldBtn = document.getElementById("startBtn");
  if (oldBtn) oldBtn.remove();

  const btn = document.createElement("button");
  btn.innerText = "Start Game";
  btn.id = "startBtn";
  btn.style.position = "absolute";
  btn.style.top = "50%";
  btn.style.left = "50%";
  btn.style.transform = "translate(-50%, -50%)";
  btn.style.padding = "15px 30px";
  btn.style.fontSize = "20px";
  btn.style.cursor = "pointer";
  btn.style.zIndex = 1000;

  btn.onclick = () => {
    if (playerRole === "A") {
      startGame();
      sendToRN({ action: "start" });
    } else {
      sendToRN({ action: "requestStart" });
    }
    btn.remove();
  };

  document.body.appendChild(btn);
}

/* ---------- CREATE PLAYERS ---------- */
function createPlayer(isEnemy = false) {
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

  if (isEnemy) {
    enemy.el = p;
    enemy.cannon = cannon;
    enemy.hp = hb;
  } else {
    me.el = p;
    me.cannon = cannon;
    me.hp = hb;
    p.onclick = shoot;
  }
}

/* ---------- START GAME ---------- */
function startGame() {
  if (mode === "game") return;

  lobby.style.display = "none";
  statusEl.innerText = "Connected ✔";
  mode = "game";

  createPlayer(false);
  createPlayer(true);

  requestAnimationFrame(loop);
}

/* ---------- GAME LOOP ---------- */
function loop() {
  if (mode !== "game") return;

  if (playerRole === "A") {
    simulate();
    sendState();
  }

  render();
  requestAnimationFrame(loop);
}

/* ---------- SIMULATION (HOST ONLY) ---------- */
function simulate() {
  // Move host player (me)
  me.x += me.dx;
  me.y += me.dy;
  if (me.x < 0 || me.x > W - BOX) me.dx *= -1;
  if (me.y < 0 || me.y > H - BOX) me.dy *= -1;

  // Move enemy (simulated by host)
  enemy.angle = Math.atan2(me.y - enemy.y, me.x - enemy.x);
  me.angle = Math.atan2(enemy.y - me.y, enemy.x - me.x);

  bullets = bullets.filter(b => {
    b.x += Math.cos(b.angle) * SPEED;
    b.y += Math.sin(b.angle) * SPEED;

    if (b.owner === "me" && hit(b, enemy)) { damage(enemy); return false; }
    if (b.owner === "enemy" && hit(b, me)) { damage(me); return false; }

    return b.x > -BULLET_SIZE && b.x < W + BULLET_SIZE && b.y > -BULLET_SIZE && b.y < H + BULLET_SIZE;
  });
}

/* ---------- RENDER ---------- */
function render() {
  me.el.style.left = me.x + "px";
  me.el.style.top = me.y + "px";

  enemy.el.style.left = enemy.x + "px";
  enemy.el.style.top = enemy.y + "px";

  me.cannon.style.transform = `rotate(${me.angle}rad)`;
  enemy.cannon.style.transform = `rotate(${enemy.angle}rad)`;

  bullets.forEach(drawBullet);
}

/* ---------- BULLETS ---------- */
function drawBullet(b) {
  if (!b.el) {
    const el = document.createElement("div");
    el.className = "bullet";
    el.style.background = b.owner === "me" ? "cyan" : "yellow";
    document.body.appendChild(el);
    b.el = el;
  }
  b.el.style.left = b.x + "px";
  b.el.style.top = b.y + "px";
}

/* ---------- COLLISION ---------- */
function hit(b, p) {
  return b.x > p.x && b.x < p.x + BOX && b.y > p.y && b.y < p.y + BOX;
}

/* ---------- DAMAGE ---------- */
function damage(player) {
  player.health = Math.max(0, player.health - 10);
  player.hp.style.width = player.health * 0.8 + "px";
  flash(player.el);
}

/* ---------- SHOOT ---------- */
function shoot() {
  if (!playerRole) return;
  // Send shoot command to host
  sendToRN({ action: "shoot", player: playerRole });
}

/* ---------- SEND STATE ---------- */
let lastStateSent = 0;
function sendState() {
  const now = Date.now();
  if (now - lastStateSent < 100) return;
  lastStateSent = now;

  sendToRN({ 
    action: "state", 
    state: { me: strip(me), enemy: strip(enemy), bullets: bullets.map(strip) } 
  });
}

/* ---------- APPLY REMOTE STATE ---------- */
function applyRemoteState(state) {
  Object.assign(me, state.me);
  Object.assign(enemy, state.enemy);

  bullets.forEach(b => b.el?.remove());
  bullets = state.bullets || [];
}

/* ---------- HELPERS ---------- */
function strip(obj) {
  const copy = { ...obj };
  delete copy.el; delete copy.cannon; delete copy.hp;
  return copy;
}

/* ---------- FLASH EFFECT ---------- */
function flash(el) {
  const body = el.querySelector(".body");
  body.classList.add("flash");
  setTimeout(() => body.classList.remove("flash"), 120);
}

/* ---------- RESIZE ---------- */
window.addEventListener("resize", () => { W = window.innerWidth; H = window.innerHeight; });
