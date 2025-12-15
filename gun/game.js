/************************************************************
 * Multiplayer Gun – WebView Version (Authoritative Host)
 * Works with React Native WebView + useFirestoreWebRTC
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
let lastStateSent = 0;

window.playerRole = null; // "A" (host) or "B" (client)

/* ---------- PLAYER DATA ---------- */
const me = {
  x: 50,
  y: 50,
  dx: 3,
  dy: 3,
  angle: 0,
  health: 100,
  el: null,
  cannon: null,
  hp: null
};

const enemy = {
  x: 250,
  y: 400,
  angle: 0,
  health: 100,
  el: null,
  cannon: null,
  hp: null
};

/* ---------- RN ↔ WEBVIEW BRIDGE ---------- */
function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

window.onRNMessage = function (msg) {
  console.log("📩 RN → WebView:", msg);

  if (msg.type === "assign") {
    window.playerRole = msg.player; // "A" or "B"
  }

  if (msg.type === "start") {
    if (mode === "lobby") startGame();
  }

  if (msg.type === "state") {
    applyRemoteState(msg.state);
  }
};

window.onPeerMessage = function (msg) {
  console.log("📩 Peer → WebView:", msg);
  if (msg.type === "state") {
    applyRemoteState(msg.state);
  }
};

/* ---------- DOM ---------- */
const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");

/* ---------- INIT ---------- */
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

  if (window.playerRole === "A") {
    simulate();
    sendState();
  }

  render();
  requestAnimationFrame(loop);
}

/* ---------- SIMULATION (HOST ONLY) ---------- */
function simulate() {
  // Move player
  me.x += me.dx;
  me.y += me.dy;

  if (me.x < 0 || me.x > W - BOX) me.dx *= -1;
  if (me.y < 0 || me.y > H - BOX) me.dy *= -1;

  // Auto aim
  me.angle = Math.atan2(enemy.y - me.y, enemy.x - me.x);
  enemy.angle = Math.atan2(me.y - enemy.y, me.x - enemy.x);

  // Bullets
  bullets = bullets.filter(b => {
    b.x += Math.cos(b.angle) * SPEED;
    b.y += Math.sin(b.angle) * SPEED;

    if (b.owner === "me" && hit(b, enemy)) {
      damage(enemy);
      return false;
    }

    if (b.owner === "enemy" && hit(b, me)) {
      damage(me);
      return false;
    }

    return (
      b.x > -BULLET_SIZE &&
      b.x < W + BULLET_SIZE &&
      b.y > -BULLET_SIZE &&
      b.y < H + BULLET_SIZE
    );
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
  return (
    b.x > p.x &&
    b.x < p.x + BOX &&
    b.y > p.y &&
    b.y < p.y + BOX
  );
}

/* ---------- DAMAGE ---------- */
function damage(player) {
  player.health = Math.max(0, player.health - 10);
  player.hp.style.width = player.health * 0.8 + "px";
  flash(player.el);
}

/* ---------- SHOOT ---------- */
function shoot() {
  if (window.playerRole !== "A") return;

  bullets.push({
    x: me.x + BOX / 2,
    y: me.y + BOX / 2,
    angle: me.angle,
    owner: "me"
  });
}

/* ---------- SEND STATE ---------- */
function sendState() {
  const now = Date.now();
  if (now - lastStateSent < 100) return; // 10 FPS
  lastStateSent = now;

  sendToRN({
    action: "state",
    state: {
      me: strip(me),
      enemy: strip(enemy),
      bullets: bullets.map(strip)
    }
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
  delete copy.el;
  delete copy.cannon;
  delete copy.hp;
  return copy;
}

/* ---------- EFFECT ---------- */
function flash(el) {
  const body = el.querySelector(".body");
  body.classList.add("flash");
  setTimeout(() => body.classList.remove("flash"), 120);
}

/* ---------- RESIZE ---------- */
window.addEventListener("resize", () => {
  W = window.innerWidth;
  H = window.innerHeight;
});
