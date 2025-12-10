// snake.js
// Multiplayer local snake (two players) with messages posted to React Native WebView.
// Player1: WASD, Player2: Arrow keys. Touch buttons are wired to both players on mobile.
// The script posts messages like {type:'score', player:1, score:2} or {type:'gameOver', winner:2}

(() => {
  /* ------- Helper: RN postMessage wrapper & logger ------- */
  function postToNative(obj) {
    try {
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    } catch (e) {
      console.warn("postMessage failed", e);
    }
  }
  function log(msg) {
    const el = document.getElementById("log");
    const d = document.createElement("div");
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  postToNative({ action: "ready" });
  log("READY sent to RN");

  /* ------- Canvas & config ------- */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // dynamic sizing
  function resizeCanvas() {
    // keep canvas square based on computed style width
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width; // square
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const p1ScoreEl = document.getElementById("p1Score");
  const p2ScoreEl = document.getElementById("p2Score");
  const startBtn = document.getElementById("startBtn");
  const gridSelect = document.getElementById("gridSize");
  const speedSelect = document.getElementById("speed");

  let GRID = parseInt(gridSelect.value, 10);   // number of cells per side
  let CELL = 0;                                // pixel size per cell
  let TICK_MS = parseInt(speedSelect.value, 10);

  gridSelect.addEventListener("change", () => { GRID = parseInt(gridSelect.value, 10); restart(); });
  speedSelect.addEventListener("change", () => { TICK_MS = parseInt(speedSelect.value, 10); restart(); });

  /* ------- Game state ------- */
  let gameInterval = null;
  let running = false;

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  // players state
  function makePlayer(startX, startY, color) {
    return {
      body: [{ x: startX, y: startY }],
      dir: DIRS.right,
      nextDir: DIRS.right,
      color,
      score: 0,
      alive: true,
    };
  }

  let players = [];
  let food = null;

  function placeFood() {
    const spots = new Set();
    players.forEach(p => p.body.forEach(s => spots.add(`${s.x},${s.y}`)));
    let attempts = 0;
    while (attempts++ < 1000) {
      const fx = Math.floor(Math.random() * GRID);
      const fy = Math.floor(Math.random() * GRID);
      if (!spots.has(`${fx},${fy}`)) {
        food = { x: fx, y: fy };
        return;
      }
    }
    // fallback
    food = { x: 0, y: 0 };
  }

  function startGame() {
    resizeCanvas();
    CELL = Math.floor(canvas.width / GRID);
    // initial players: left and right
    players = [
      makePlayer(Math.floor(GRID * 0.25), Math.floor(GRID / 2), "#2db0ff"), // p1 blue
      makePlayer(Math.floor(GRID * 0.75), Math.floor(GRID / 2), "#7fff9c"), // p2 green
    ];
    players[0].dir = DIRS.right;
    players[0].nextDir = DIRS.right;
    players[1].dir = DIRS.left;
    players[1].nextDir = DIRS.left;

    placeFood();

    players.forEach(p => { p.score = 0; p.alive = true; });

    updateScoreUI();
    running = true;
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(tick, TICK_MS);
    log("Game started");
    postToNative({ type: "gameStart" });
  }

  function restart() {
    if (gameInterval) clearInterval(gameInterval);
    startGame();
  }

  startBtn.addEventListener("click", restart);

  /* ------- Input handling ------- */
  window.addEventListener("keydown", (ev) => {
    const k = ev.key.toLowerCase();
    // Player 1: WASD
    if (k === "w") trySetDir(0, DIRS.up);
    if (k === "s") trySetDir(0, DIRS.down);
    if (k === "a") trySetDir(0, DIRS.left);
    if (k === "d") trySetDir(0, DIRS.right);
    // Player 2: arrows
    if (ev.key === "ArrowUp") trySetDir(1, DIRS.up);
    if (ev.key === "ArrowDown") trySetDir(1, DIRS.down);
    if (ev.key === "ArrowLeft") trySetDir(1, DIRS.left);
    if (ev.key === "ArrowRight") trySetDir(1, DIRS.right);
  });

  // Touch button wiring
  document.querySelectorAll("#touchControls .pad").forEach(pad => {
    const playerId = parseInt(pad.dataset.player, 10);
    pad.querySelectorAll(".btn").forEach(btn => {
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const dir = btn.dataset.dir;
        trySetDir(playerId - 1, DIRS[dir]);
      });
      // also allow click
      btn.addEventListener("click", (e) => {
        const dir = btn.dataset.dir;
        trySetDir(playerId - 1, DIRS[dir]);
      });
    });
  });

  function trySetDir(playerIndex, dir) {
    const p = players[playerIndex];
    if (!p || !p.alive) return;
    // disallow 180-degree turns
    if (p.dir.x + dir.x === 0 && p.dir.y + dir.y === 0) return;
    p.nextDir = dir;
  }

  /* ------- Game tick & rules ------- */
  function tick() {
    if (!running) return;
    // apply nextDir and move
    players.forEach(p => {
      if (!p.alive) return;
      p.dir = p.nextDir;
      const head = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };
      // wrap-around
      if (head.x < 0) head.x = GRID - 1;
      if (head.x >= GRID) head.x = 0;
      if (head.y < 0) head.y = GRID - 1;
      if (head.y >= GRID) head.y = 0;
      p.body.unshift(head);
    });

    // check food and collisions
    players.forEach((p, idx) => {
      if (!p.alive) return;
      // food
      if (p.body[0].x === food.x && p.body[0].y === food.y) {
        p.score += 1;
        postToNative({ type: "score", player: idx + 1, score: p.score });
        log(`P${idx + 1} ate food. Score: ${p.score}`);
        placeFood();
      } else {
        // normal move: pop tail
        p.body.pop();
      }
    });

    // collisions: head vs any body (including own), head vs head
    // build a map of occupied cells after movement
    const occupied = new Map();
    players.forEach((p, idx) => {
      p.body.forEach((seg, segi) => {
        const key = `${seg.x},${seg.y}`;
        if (!occupied.has(key)) occupied.set(key, []);
        occupied.get(key).push({ player: idx, segmentIndex: segi });
      });
    });

    // evaluate death: if a head shares a cell with any other segment other than its own head => death
    players.forEach((p, idx) => {
      if (!p.alive) return;
      const headKey = `${p.body[0].x},${p.body[0].y}`;
      const occupants = occupied.get(headKey) || [];
      // if more than one occupant or occupant is segmentIndex > 0 (someone's body)
      const hits = occupants.filter(o => !(o.player === idx && o.segmentIndex === 0));
      if (hits.length > 0) {
        p.alive = false;
        log(`P${idx + 1} collided and died.`);
        postToNative({ type: "died", player: idx + 1, reason: 'collision' });
      }
    });

    // special head-on collision: both heads on same cell -> both die
    const bothHeadsSame = players[0].alive && players[1].alive &&
                          players[0].body[0].x === players[1].body[0].x &&
                          players[0].body[0].y === players[1].body[0].y;
    if (bothHeadsSame) {
      players[0].alive = players[1].alive = false;
      log("Head-on collision: both died.");
      postToNative({ type: "gameOver", reason: "headOn", winner: 0 });
    }

    // check end condition: if one or zero players alive -> stop
    const aliveCount = players.filter(p => p.alive).length;
    if (aliveCount <= 1) {
      running = false;
      clearInterval(gameInterval);
      let winner = 0;
      if (aliveCount === 1) {
        winner = players.findIndex(p => p.alive) + 1;
        log(`Game Over - Winner: P${winner}`);
        postToNative({ type: "gameOver", winner });
      } else {
        log("Game Over - No winners");
        postToNative({ type: "gameOver", winner: 0 });
      }
    }

    draw();
    updateScoreUI();
  }

  /* ------- Draw routine ------- */
  function drawCell(x, y, color, border = true) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    if (border) {
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
  }

  function draw() {
    // clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // background grid (subtle)
    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        if ((gx + gy) % 2 === 0) {
          ctx.fillStyle = "rgba(255,255,255,0.01)";
        } else {
          ctx.fillStyle = "rgba(255,255,255,0.015)";
        }
        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }

    // food
    if (food) drawCell(food.x, food.y, "#ffcc00", false);

    // snakes
    players.forEach((p, idx) => {
      // head
      if (p.body.length > 0) {
        drawCell(p.body[0].x, p.body[0].y, p.color);
      }
      // body
      for (let i = 1; i < p.body.length; i++) {
        const b = p.body[i];
        drawCell(b.x, b.y, shadeColor(p.color, -12));
      }
      // if dead, overlay
      if (!p.alive) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    });
  }

  function shadeColor(hex, percent) {
    // simple shade helper (percent negative = darker)
    const num = parseInt(hex.replace("#", ""), 16);
    let r = (num >> 16) + percent;
    let g = ((num >> 8) & 0x00FF) + percent;
    let b = (num & 0x0000FF) + percent;
    r = Math.max(Math.min(255, r), 0);
    g = Math.max(Math.min(255, g), 0);
    b = Math.max(Math.min(255, b), 0);
    return `rgb(${r},${g},${b})`;
  }

  function updateScoreUI() {
    p1ScoreEl.textContent = `P1: ${players[0]?.score ?? 0}`;
    p2ScoreEl.textContent = `P2: ${players[1]?.score ?? 0}`;
  }

  /* ------- Initialize & auto-start small demo ------- */
  function init() {
    // set canvas pixel ratio for crispness
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    // We'll keep CSS size and actual pixel size; resizeCanvas already sets width/height based on CSS.
    // Start paused; user can press Start
    startGame();
  }

  init();

  // expose restart for debugging in console
  window.__snake_restart = restart;

})();
