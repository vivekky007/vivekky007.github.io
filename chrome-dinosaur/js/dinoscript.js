
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
obsS = ({
  x: 20,
  y: 230,
  w: 34,
  h: 70,
  scroll: -100,
  on: false
})

multiB = -1;
picB = 0;
obsB = ({
  x: 20,
  y: 201,
  w: 49,
  h: 100,
  scroll: -200,
  on: false
})

// for flying objects if they would be added in the future
obsF = ({
  x: 20,
  y: 250,
  w: 93,
  h: 69,
  scroll: -100
})

p = ({
  x: 100,
  y: 500,
  w: 89,
  h: 94,
  yv: 0,
  score: 0,
  hscore: 0,
  jump: 15
});

p2 = ({
  x: 200,
  y: 500,
  w: 89,
  h: 94,
  yv: 0,
  jump: 15
});


//crouching for flying objects
pcrouch = ({
  x: p.x,
  y: p.y,
  w: 118,
  h: 60
});

pbox = ({
  x: p.x,
  y: 0,
  w: 80,
  h: 75
});

p2box = ({
  x: p2.x,
  y: p2.y,
  w: 80,
  h: 75
});

let mode = "lobby";
onG = false;
sprImg = new Image();
let lastTouch = 0;

const lobby = document.getElementById("lobby");
const statusEl = document.getElementById("status");
const startBtn = document.getElementById("startBtn");

function sendToRN(data) {
  window.ReactNativeWebView?.postMessage(JSON.stringify(data));
}

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
    const s = msg.state;

    // players
    p.x = s.p1.x;
    p.y = s.p1.y;
    p.yv = s.p1.yv;

    p2.x = s.p2.x;
    p2.y = s.p2.y;
    p2.yv = s.p2.yv;

        // obstacles
    Object.assign(obsS, s.obsS);
    Object.assign(obsB, s.obsB);

    // world
    groundscroll = s.groundscroll;
    frame = s.frame;
    gamespeed = s.gamespeed;

    p.score = s.score;
    isGameOver = s.isGameOver;
  }


};



window.onPeerMessage = (msg) => {
  if (!isHost) return;

  if (msg.type === "jump") {
    if (msg.player === "A" && onG) {
      p.yv = -p.jump;
    }

    if (msg.player === "B" && onG2) {
      p2.yv = -p2.jump;
    }
  }
};





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

window.onload = function () {
  canvas = document.getElementById('game');
  ctx = canvas.getContext('2d');

  setInterval(update, 1000 / 60);
  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    tryJump();
  }, { passive: false });

  sprImg.src = "sprite.png";


  plat = ({
    x: 0,
    y: canvas.height - 100,
    w: canvas.width,
    h: 5,
  })

}


function drawGameOver() {
  ctx.drawImage(
    sprImg,
    954, 30,      // source X, Y in sprite sheet (Game Over text)
    382, 70,     // source width, height
    canvas.width / 2 - 191,  // center X on canvas
    canvas.height / 2 - 50,  // center Y on canvas
    382, 70                  // destination width, height
  );
  ctx.drawImage(
    sprImg,
    0, 0,      // source X, Y in sprite sheet (Game Over text)
    80, 70,     // source width, height
    canvas.width / 2 - 40,  // center X on canvas
    canvas.height / 2 - 50 + 40,  // center Y on canvas
    80, 70                  // destination width, height
  );


}

function drawOnly() {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ground
  groundscroll = groundscroll % 2404;

  ctx.drawImage(
    sprImg, 0, 104, 2404, 18,
    -groundscroll,
    plat.y - 24,
    2404, 18
  );

  ctx.drawImage(
    sprImg, 0, 104, 2404, 18,
    -groundscroll + 2404,
    plat.y - 24,
    2404, 18
  );


  // obstacles
  ctx.drawImage(
    sprImg, picS, 2,
    obsS.w * multiS, obsS.h,
    canvas.width - obsS.scroll,
    obsS.y,
    obsS.w * multiS,
    obsS.h
  );

  ctx.drawImage(
    sprImg, 652, 2,
    obsB.w * multiB, obsB.h,
    canvas.width - obsB.scroll,
    obsB.y,
    obsB.w * multiB,
    obsB.h
  );

  // players
  ctx.drawImage(sprImg, frame, 0, 88, 94, p.x, p.y, p.w, p.h);
  ctx.drawImage(sprImg, frame, 0, 88, 94, p2.x, p2.y, p2.w, p2.h);
}


function update() {

  /* ---------- CLIENT: DRAW ONLY ---------- */
  if (!isHost && mode === "game") {
    drawOnly();
    if (isGameOver) drawGameOver();
    return;
  }

  /* ---------- PLAYER PHYSICS ---------- */
  if (!onG) p.yv += grav;
  p.y += p.yv;
  pbox.y = p.y;

  if (!onG2) p2.yv += grav;
  p2.y += p2.yv;
  p2box.y = p2.y;

  /* ---------- SCORE ---------- */
  scoreInterval++;
  if (scoreInterval > 6 && gamespeed !== 0) {
    p.score++;
    scoreInterval = 0;
  }

  if (gamespeed < 17 && gamespeed !== 0) {
    gamespeed = 7 + (p.score / 100);
  }

  /* ---------- GROUND COLLISION ---------- */
  onG = false;
  onG2 = false;

  if (p.y + p.h > plat.y) { p.y = plat.y - p.h; onG = true; }
  if (p2.y + p2.h > plat.y) { p2.y = plat.y - p2.h; onG2 = true; }
  pbox.x = p.x;
  pbox.y = p.y;

  p2box.x = p2.x;
  p2box.y = p2.y;
  const cactusSX = canvas.width - obsS.scroll;  
  const cactusBX = canvas.width - obsB.scroll;
  /* ---------- COLLISION ---------- */
  const hitBig = obsB.on && (
    (pbox.x + pbox.w > cactusBX &&
    pbox.x < cactusBX + obsB.w * multiB &&
    pbox.y + pbox.h > obsB.y)
  );

  const hitSmall = obsS.on && (
    (pbox.x + pbox.w > cactusSX &&
    pbox.x < cactusSX + obsS.w * multiS &&
    pbox.y + pbox.h > obsS.y)
  );


  if (hitBig || hitSmall) gameover();

  /* ---------- OBSTACLES HOST LOGIC ---------- */

/* ---------- OBSTACLES HOST LOGIC ---------- */
  if (!obsS.on && !obsB.on) {
    if (Math.random() < 0.5) {
      // spawn small
      obsS.on = true;
      rngS();
    } else {
      // spawn big
      obsB.on = true;
      rngB();
    }
  }

  // update scroll and deactivate when off-screen
  if (obsS.on) {
    obsS.scroll += gamespeed;
    if (obsS.scroll > canvas.width + obsS.w * multiS) {
      obsS.on = false;
      multiS = -1;
    }
  }

  if (obsB.on) {
    obsB.scroll += gamespeed;
    if (obsB.scroll > canvas.width + obsB.w * multiB) {
      obsB.on = false;
      multiB = -1;
    }
  }


  /* ---------- ANIMATION ---------- */
  frameInterval++;
  if (frameInterval > 5) { bool = !bool; frameInterval = 0; }
  if (bool && onG) frame = 1514;
  else if (!bool && onG) frame = 1602;
  else frame = 1338;

  /* ---------- CLEAR + DRAW ---------- */
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // GROUND
  groundscroll = (groundscroll + gamespeed) % 2404;

  ctx.drawImage(
    sprImg, 0, 104, 2404, 18,
    -groundscroll,
    plat.y - 24,
    2404, 18
  );

  ctx.drawImage(
    sprImg, 0, 104, 2404, 18,
    -groundscroll + 2404,
    plat.y - 24,
    2404, 18
  );


  // PLAYERS
  ctx.drawImage(sprImg, frame, 0, 88, 94, p.x, p.y, p.w, p.h);
  ctx.drawImage(sprImg, frame, 0, 88, 94, p2.x, p2.y, p2.w, p2.h);

  // OBSTACLES
  if (obsS.on) {
    ctx.drawImage(sprImg, picS, 2, obsS.w * multiS, obsS.h, canvas.width - obsS.scroll, obsS.y, obsS.w * multiS, obsS.h);
  }
  if (obsB.on) {
    ctx.drawImage(sprImg, 652, 2, obsB.w * multiB, obsB.h, canvas.width - obsB.scroll, obsB.y, obsB.w * multiB, obsB.h);
  }

  /* ---------- UI ---------- */
  ctx.fillStyle = "black";
  ctx.font = "20px verdana";
  ctx.fillText("Score:", 100, canvas.height - 40);
  ctx.fillText(p.score, 170, canvas.height - 40);
  if (isGameOver) drawGameOver();

  /* ---------- SYNC TO CLIENT ---------- */
  sendToRN({
    type: "stateDino",
    state: {
      p1: { x: p.x, y: p.y, yv: p.yv },
      p2: { x: p2.x, y: p2.y, yv: p2.yv },
      obsS: { ...obsS },
      obsB: { ...obsB },
      groundscroll,
      frame,
      gamespeed,
      score: p.score,
      isGameOver
    }
  });

}


function gameover() {
  gamespeed = 0;
  isGameOver = true;

  console.log("HIT!");
  if (p.score > p.hscore) {
    p.hscore = p.score;
  }
  p.score = 0;
  obsB.scroll = -200;
  obsS.scroll = -100;

  scoreInterval = 0;
  frameInterval = 0;
  groundscroll = 0;
  groundscroll2 = 0;
  tempstart = 0;
  groundbool = false;
  multiS = -1;
  multiB = -1;
}
function restartGame() {
  isGameOver = false;
  gamespeed = 7;

  p.score = 0;
  p.y = plat.y - p.h;
  p.yv = 0;

  obsB.scroll = -200;
  obsS.scroll = -100;
  obsB.on = false;
  obsS.on = false;

  groundscroll = 0;
  groundscroll2 = 0;
  tempstart = 0;
  groundbool = false;

  multiS = -1;
  multiB = -1;
}



function tryJump() {
  if (isGameOver) {
    restartGame();
    return;
  }

  if (!isHost) {
    sendToRN({
      type: "jump",
      player: playerRole
    });

    return;
  }

  if (onG) {
    p.yv = -p.jump;
  }

  if (gamespeed === 0) {
    gamespeed = 7;
  }
}

function rngS(){
  multiS = Math.floor(Math.random() * 3) + 1; // type
  picS = 446 + (Math.floor(Math.random() * 2) * 102); // sprite
  obsS.y = plat.y - obsS.h; // place on ground
  obsS.scroll = -obsS.w * multiS; // spawn outside canvas
}

function rngB(){
  multiB = Math.floor(Math.random() * 3) + 1; // type
  picB = 652 + (Math.floor(Math.random() * 2) * 150); // sprite
  obsB.y = plat.y - obsB.h; // place on ground
  obsB.scroll = -obsB.w * multiB; // spawn outside canvas
}
