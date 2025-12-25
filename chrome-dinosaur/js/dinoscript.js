//char = 89x94
//char 1 @ 1514
//char 2 @ 1603
isGameOver = false;
scoreInterval = 0;
frameInterval = 0;
groundscroll = 0;
groundscroll2 = 0;
tempstart = 0;
groundbool = false;
frame = 0;
bool = false;
grav = 0.6;

gamespeed = 0;
let onG2 = false;

multiS = -1;
picS = 0;
obsS = {
  x: 20,
  y: 230,
  w: 34,
  h: 70,
  scroll: -100,
  on: false,
  multi: -1,
  pic: 0
};

multiB = -1;
picB = 0;
obsB = {
  x: 20,
  y: 201,
  w: 49,
  h: 100,
  scroll: -200,
  on: false,
  multi: -1,
  pic: 0
};

obsF = { x: 20, y: 250, w: 93, h: 69, scroll: -100 };

p = { x: 100, y: 500, w: 89, h: 94, yv: 0, score: 0, hscore: 0, jump: 15 };
p2 = { x: 200, y: 500, w: 89, h: 94, yv: 0, jump: 15 };

pbox = { x: p.x, y: 0, w: 80, h: 75 };
p2box = { x: p2.x, y: p2.y, w: 80, h: 75 };

let mode = "lobby";
let onG = false;
let isHost = false;
let playerRole = null;

sprImg = new Image();
let lastTouch = 0;

const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

/* ================= RN MESSAGE ================= */

window.onRNMessage = function (msg) {
  if (!msg) return;
  if (typeof msg === "string") {
    try { msg = JSON.parse(msg); } catch { return; }
  }

  if (msg.action === "assign" || msg.type === "assign") {
    playerRole = msg.player;
    isHost = playerRole === "A";
    createStartButton();
    return;
  }

  if (msg.action === "start" || msg.type === "start") {
    startGame();
    return;
  }

  if (msg.type === "stateDino" && !isHost) {

    // 🔧 FIX 1: FORCE CLIENT INTO GAME MODE
    if (mode !== "game") {
      mode = "game";
      lobby.style.display = "none";
      gameUI.classList.remove("hidden");
    }

    const s = msg.state;

    // players
    p.x = s.p1.x;
    p.y = s.p1.y;
    p.yv = s.p1.yv;

    p2.x = s.p2.x;
    p2.y = s.p2.y;
    p2.yv = s.p2.yv;

    // obstacles (authoritative)
    obsS = s.obsS;
    obsB = s.obsB;

    // world
    groundscroll = s.groundscroll;
    frame = s.frame;
    gamespeed = s.gamespeed;

    p.score = s.score;
    isGameOver = s.isGameOver;
  }
};

/* ================= PEER INPUT ================= */

window.onPeerMessage = (msg) => {
  if (!isHost) return;

  if (msg.type === "jump") {
    if (msg.player === "A" && onG) p.yv = -p.jump;
    if (msg.player === "B" && onG2) p2.yv = -p2.jump;
  }
};

/* ================= GAME START ================= */

function startGame() {
  if (mode === "game") return;
  restartGame();
  mode = "game";
  lobby.style.display = "none";
  gameUI.classList.remove("hidden");
  statusEl.innerText = "Connected ✔";
}

function createStartButton() {
  if (!startBtn) return;
  startBtn.style.display = "block";
  startBtn.onclick = () => {
    startBtn.style.display = "none";
    sendToRN({ action: isHost ? "start" : "requestStart" });
    if (isHost) startGame();
  };
}

/* ================= INIT ================= */

window.onload = function () {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');

  setInterval(update, 1000 / 60);

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    tryJump();
  }, { passive: false });

  sprImg.src = "sprite.png";

  plat = { x: 0, y: canvas.height - 100, w: canvas.width, h: 5 };
};

/* ================= DRAW ONLY ================= */

function drawOnly() {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.drawImage(sprImg, 0, 104, 2404, 18, -groundscroll, plat.y - 24, 2404, 18);
  ctx.drawImage(sprImg, 0, 104, 2404, 18, 2404 - groundscroll, plat.y - 24, 2404, 18);

  if (obsS.on)
    ctx.drawImage(sprImg, obsS.pic, 2, obsS.w * obsS.multi, obsS.h,
      canvas.width - obsS.scroll, obsS.y, obsS.w * obsS.multi, obsS.h);

  if (obsB.on)
    ctx.drawImage(sprImg, obsB.pic, 2, obsB.w * obsB.multi, obsB.h,
      canvas.width - obsB.scroll, obsB.y, obsB.w * obsB.multi, obsB.h);

  ctx.drawImage(sprImg, frame, 0, 88, 94, p.x, p.y, p.w, p.h);
  ctx.drawImage(sprImg, frame, 0, 88, 94, p2.x, p2.y, p2.w, p2.h);
}

/* ================= UPDATE LOOP ================= */

function update() {

  // 🔧 FIX 2: CLIENT = DRAW ONLY
  if (!isHost && mode === "game") {
    drawOnly();
    if (isGameOver) drawGameOver();
    return;
  }

  /* -------- HOST GAME LOGIC (UNCHANGED) -------- */

  if (!onG) p.yv += grav;
  p.y += p.yv;
  if (!onG2) p2.yv += grav;
  p2.y += p2.yv;

  onG = p.y + p.h >= plat.y;
  onG2 = p2.y + p2.h >= plat.y;

  if (onG) p.y = plat.y - p.h;
  if (onG2) p2.y = plat.y - p2.h;

  scoreInterval++;
  if (scoreInterval > 6 && gamespeed !== 0) {
    p.score++;
    scoreInterval = 0;
  }

  if (gamespeed < 17 && gamespeed !== 0)
    gamespeed = 7 + (p.score / 100);

  if (!obsS.on && !obsB.on) {
    Math.random() < 0.5 ? (obsS.on = true, rngS()) : (obsB.on = true, rngB());
  }

  if (obsS.on) {
    obsS.scroll += gamespeed;
    if (obsS.scroll > canvas.width + obsS.w * obsS.multi) obsS.on = false;
  }

  if (obsB.on) {
    obsB.scroll += gamespeed;
    if (obsB.scroll > canvas.width + obsB.w * obsB.multi) obsB.on = false;
  }

  frameInterval++;
  if (frameInterval > 5) { bool = !bool; frameInterval = 0; }
  frame = onG ? (bool ? 1514 : 1602) : 1338;

  groundscroll += gamespeed;
  if (groundscroll >= 2404) groundscroll = 0;

  drawOnly();

  sendToRN({
    type: "stateDino",
    state: {
      p1: { x: p.x, y: p.y, yv: p.yv },
      p2: { x: p2.x, y: p2.y, yv: p2.yv },
      obsS,
      obsB,
      groundscroll,
      frame,
      gamespeed,
      score: p.score,
      isGameOver
    }
  });
}

/* ================= INPUT ================= */

function tryJump() {
  if (isGameOver) return restartGame();

  if (!isHost) {
    sendToRN({ type: "jump", player: playerRole });
    return;
  }

  if (onG) p.yv = -p.jump;
  if (gamespeed === 0) gamespeed = 7;
}

/* ================= HELPERS ================= */

function rngS() {
  obsS.multi = Math.floor(Math.random() * 3) + 1;
  obsS.pic = 446 + Math.floor(Math.random() * 2) * 102;
  obsS.y = plat.y - obsS.h;
  obsS.scroll = -obsS.w * obsS.multi;
}

function rngB() {
  obsB.multi = Math.floor(Math.random() * 3) + 1;
  obsB.pic = 652 + Math.floor(Math.random() * 2) * 150;
  obsB.y = plat.y - obsB.h;
  obsB.scroll = -obsB.w * obsB.multi;
}

function restartGame() {
  isGameOver = false;
  gamespeed = 7;
  p.score = 0;
  obsS.on = obsB.on = false;
  groundscroll = 0;
}
