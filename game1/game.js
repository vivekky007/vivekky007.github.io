// snake.net.js
// Host-authoritative multiplayer over RN <-> WebRTC (host = Player A).
// WebView <-> RN messages:
//   -> RN receives: { action: 'ready' } (on load), { action: 'dir', player: 'A'|'B', dir: 'up'|'left'... }
//   -> RN should forward dir/state over datachannel to peer and inject peer messages into window.onPeerMessage
// RN -> WebView injection points:
//   window.onRNMessage(msg)   // messages coming from RN (assign/start etc.)
//   window.onPeerMessage(msg) // messages coming from the remote peer (via RN's setOnMessage)

(() => {
  /* ------- Helpers ------- */
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
    if (!el) return;
    const d = document.createElement("div");
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  /* ------- Announce ready to RN ------- */
  postToNative({ action: "ready" });
  log("READY sent to RN");

  /* ------- Canvas & config (unchanged) ------- */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  const p1ScoreEl = document.getElementById("p1Score");
  const p2ScoreEl = document.getElementById("p2Score");
  const startBtn = document.getElementById("startBtn");
  const gridSelect = document.getElementById("gridSize");
  const speedSelect = document.getElementById("speed");

  let GRID = parseInt(gridSelect.value, 10);
  let CELL = 0;
  let TICK_MS = parseInt(speedSelect.value, 10);

  gridSelect.addEventListener("change", () => { GRID = parseInt(gridSelect.value, 10); restart(); });
  speedSelect.addEventListener("change", () => { TICK_MS = parseInt(speedSelect.value, 10); restart(); });

  /* ------- Game state ------- */
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

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

  // network role: 'A' | 'B' | null
  let role = null;
  let isHost = false; // role === 'A'
  let players = [];
  let food = null;
  let running = false;
  let gameInterval = null;
  let lastTick = 0;
  let localPlayerIndex = null; // 0 if A, 1 if B

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
    food = { x: 0, y: 0 };
  }

  /* ------- Host: full simulation ------- */
  function startAsHost() {
    resizeCanvas();
    CELL = Math.floor(canvas.width / GRID);

    players = [
      makePlayer(Math.floor(GRID * 0.25), Math.floor(GRID / 2), "#2db0ff"), // A -> index 0
      makePlayer(Math.floor(GRID * 0.75), Math.floor(GRID / 2), "#7fff9c"), // B -> index 1
    ];
    players[0].dir = DIRS.right; players[0].nextDir = DIRS.right;
    players[1].dir = DIRS.left;  players[1].nextDir = DIRS.left;

    placeFood();
    players.forEach(p => { p.score = 0; p.alive = true; });

    running = true;
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(hostTick, TICK_MS);

    log("Host started game");
    postToNative({ action: "startedAsHost" });

    // send an initial full state so client can render before first tick
    sendStateToPeer();
  }

  /* ------- Client: render-only ------- */
  function startAsClient() {
    resizeCanvas();
    CELL = Math.floor(canvas.width / GRID);

    // client waits for states from host
    running = true;
    log("Client ready, awaiting host state");
  }

  function restart() {
    if (gameInterval) clearInterval(gameInterval);
    if (isHost) startAsHost(); else startAsClient();
  }

  startBtn.addEventListener("click", () => {
    // If host, starting is authoritative; client relies on host's start.
    if (isHost) {
      // inform RN to broadcast a start to the peer (so both sides sync)
      postToNative({ action: "start" }); // RN should forward as {type:'start'} to remote peer
      // also start locally
      startAsHost();
    } else {
      // request host to start (send a start request)
      postToNative({ action: "requestStart" });
      log("Requested host to start");
    }
  });

  /* ------- Inputs & sending dirs to RN (which forwards to peer) ------- */
  function sendLocalDir(dirKey) {
    if (!role) return;
    // send to RN to forward to remote peer
    postToNative({ action: "dir", player: role, dir: dirKey });

    // apply immediately if host (low latency)
    if (isHost) {
      trySetDir(localPlayerIndex, DIRS[dirKey]);
    }
  }

  window.addEventListener("keydown", (ev) => {
    const k = ev.key.toLowerCase();
    if (k === "w") sendLocalDir("up");
    if (k === "s") sendLocalDir("down");
    if (k === "a") sendLocalDir("left");
    if (k === "d") sendLocalDir("right");
    if (ev.key === "ArrowUp") sendLocalDir("up");
    if (ev.key === "ArrowDown") sendLocalDir("down");
    if (ev.key === "ArrowLeft") sendLocalDir("left");
    if (ev.key === "ArrowRight") sendLocalDir("right");
  });

  document.querySelectorAll("#touchControls .pad").forEach(pad => {
    const playerId = parseInt(pad.dataset.player, 10);
    pad.querySelectorAll(".btn").forEach(btn => {
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        const dir = btn.dataset.dir;
        sendLocalDir(dir);
      });
      btn.addEventListener("click", (e) => {
        const dir = btn.dataset.dir;
        sendLocalDir(dir);
      });
    });
  });

  function trySetDir(playerIndex, dir) {
    const p = players[playerIndex];
    if (!p || !p.alive) return;
    if (p.dir.x + dir.x === 0 && p.dir.y + dir.y === 0) return;
    p.nextDir = dir;
  }

  /* ------- Host tick: authoritative update & broadcast ------- */
  function hostTick() {
    if (!running) return;
    lastTick++;

    // move players
    players.forEach(p => {
      if (!p.alive) return;
      p.dir = p.nextDir;
      const head = { x: p.body[0].x + p.dir.x, y: p.body[0].y + p.dir.y };
      if (head.x < 0) head.x = GRID - 1;
      if (head.x >= GRID) head.x = 0;
      if (head.y < 0) head.y = GRID - 1;
      if (head.y >= GRID) head.y = 0;
      p.body.unshift(head);
    });

    // food / score
    players.forEach((p, idx) => {
      if (!p.alive) return;
      if (p.body[0].x === food.x && p.body[0].y === food.y) {
        p.score += 1;
        postToNative({ type: "score", player: idx + 1, score: p.score });
        log(`P${idx + 1} ate food. Score: ${p.score}`);
        placeFood();
      } else {
        p.body.pop();
      }
    });

    // collisions
    const occupied = new Map();
    players.forEach((p, idx) => {
      p.body.forEach((seg, segi) => {
        const key = `${seg.x},${seg.y}`;
        if (!occupied.has(key)) occupied.set(key, []);
        occupied.get(key).push({ player: idx, segmentIndex: segi });
      });
    });

    players.forEach((p, idx) => {
      if (!p.alive) return;
      const headKey = `${p.body[0].x},${p.body[0].y}`;
      const occupants = occupied.get(headKey) || [];
      const hits = occupants.filter(o => !(o.player === idx && o.segmentIndex === 0));
      if (hits.length > 0) {
        p.alive = false;
        postToNative({ type: "died", player: idx + 1, reason: 'collision' });
        log(`P${idx + 1} collided`);
      }
    });

    const bothHeadsSame = players[0].alive && players[1].alive &&
                          players[0].body[0].x === players[1].body[0].x &&
                          players[0].body[0].y === players[1].body[0].y;
    if (bothHeadsSame) {
      players[0].alive = players[1].alive = false;
      postToNative({ type: "gameOver", reason: "headOn", winner: 0 });
      log("Head-on: both died");
    }

    const aliveCount = players.filter(p => p.alive).length;
    if (aliveCount <= 1) {
      running = false;
      clearInterval(gameInterval);
      let winner = 0;
      if (aliveCount === 1) {
        winner = players.findIndex(p => p.alive) + 1;
        postToNative({ type: "gameOver", winner });
        log(`Game Over - Winner: P${winner}`);
      } else {
        postToNative({ type: "gameOver", winner: 0 });
        log("Game Over - No winners");
      }
    }

    // broadcast authoritative state to peer
    sendStateToPeer();

    // draw locally (host)
    draw();
    updateScoreUI();
  }

  function sendStateToPeer() {
    // deep copy minimal state (bodies, scores, alive, food)
    const state = {
      tick: lastTick,
      food,
      players: players.map(p => ({
        body: p.body,
        score: p.score,
        alive: p.alive,
        color: p.color
      }))
    };
    // Post to RN so RN can forward to remote peer over datachannel
    postToNative({ action: "state", state });
  }

  /* ------- When client receives authoritative state from host ------- */
  function applyStateFromHost(state) {
    if (!state || !state.players) return;
    // Replace local players state (client is render-only)
    players = state.players.map(p => ({
      body: p.body.slice(),
      dir: DIRS.right,
      nextDir: DIRS.right,
      color: p.color || "#999",
      score: p.score || 0,
      alive: p.alive !== false,
    }));
    food = state.food;
    // render
    CELL = Math.floor(canvas.width / GRID);
    draw();
    updateScoreUI();
  }

  /* ------- Draw routine (same as before) ------- */
  function drawCell(x, y, color, border = true) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
    if (border) {
      ctx.strokeStyle = "rgba(0,0,0,0.2)";
      ctx.strokeRect(x * CELL + 0.5, y * CELL + 0.5, CELL - 1, CELL - 1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let gx = 0; gx < GRID; gx++) {
      for (let gy = 0; gy < GRID; gy++) {
        ctx.fillStyle = ((gx + gy) % 2 === 0) ? "rgba(255,255,255,0.01)" : "rgba(255,255,255,0.015)";
        ctx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
      }
    }

    if (food) drawCell(food.x, food.y, "#ffcc00", false);

    players.forEach((p, idx) => {
      if (p.body.length > 0) drawCell(p.body[0].x, p.body[0].y, p.color);
      for (let i = 1; i < p.body.length; i++) {
        const b = p.body[i];
        drawCell(b.x, b.y, shadeColor(p.color, -12));
      }
      if (!p.alive) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    });
  }

  function shadeColor(hex, percent) {
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

  function createRoom(s){
    
  }

  /* ------- Message entry points from RN and peer ------- */

  // RN injects important control messages here:
  // - { type: 'assign', player: 'A'|'B' }  <- assign role
  // - { type: 'start' }                    <- start game (host & client)
  window.onRNMessage = function (msg) {
    try {
      if (!msg) return;
      if (msg.type === "assign") {
        role = msg.player; // "A" or "B"
        isHost = role === "A";
        localPlayerIndex = role === "A" ? 0 : 1;
        log(`Assigned role: ${role} (${isHost ? "host" : "client"})`);
        draw();
        // client waits for host; host may auto-start if requested
      } else if (msg.type === "start") {
        if (isHost) {
          startAsHost();
        } else {
          startAsClient();
        }
      } else if (msg.type === "setGrid") {
        if (typeof msg.grid === "number") {
          GRID = msg.grid;
        }
      }
    } catch (e) {
      console.warn("onRNMessage error", e);
    }
  };

  // Messages coming from the remote peer (forwarded by RN via setOnMessage)
  // Expected shapes:
  //  { type: 'dir', player: 'A'|'B', dir: 'up'|'left'...' }    // input forwarded
  //  { type: 'state', state: { players: [...], food: {...}, tick } } // host -> client authoritative state
  //  { type: 'start' }  // optional start forwarded
  window.onPeerMessage = function (msg) {
    try {
      if (!msg || !msg.type) return;

      if (msg.type === "dir") {
        // remote player's input; if host, apply it to the simulation immediately
        const remotePlayer = msg.player === "A" ? 0 : 1;
        const dirKey = msg.dir;
        if (isHost) {
          trySetDir(remotePlayer, DIRS[dirKey]);
        } else {
          // clients don't run simulation; optionally you could show input prediction
        }
      } else if (msg.type === "state") {
        // authoritative state from host
        if (!isHost) {
          applyStateFromHost(msg.state);
        } else {
          // if host receives its own state echoed back, ignore
        }
      } else if (msg.type === "start") {
        if (!isHost) {
          startAsClient();
        }
      }
    } catch (e) {
      console.warn("onPeerMessage error", e);
    }
  };

  /* ------- Initialize (auto-start small demo only for local testing) ------- */
  function init() {
    // keep paused — real start happens after assign + start
    // However for local debugging we can auto-start as host if nobody assigns.
    // We'll keep it paused here and rely on RN to assign roles.
    log("Snake network module initialized, awaiting role assignment and start");
  }

  
  function joinRoom(roomId) {
    if (!roomId || roomId.trim() === "") {
      log("❌ Join Room: Room ID cannot be empty");
      return;
    }
    log("Joining room: " + roomId);
    postToNative({ action: "joinRoom", roomId });
  }

  function createRoom(roomId) {
    if (!roomId || roomId.trim() === "") {
      log("❌ Create Room: Room ID cannot be empty");
      return;
    }
    log("Creating room: " + roomId);
    postToNative({ action: "createRoom", roomId });
  }

  /* ---------------- EVENT LISTENERS FOR BUTTONS ---------------- */

  document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const id = document.getElementById("joinRoomInput").value;
    joinRoom(id);
  });

  document.getElementById("createRoomBtn").addEventListener("click", () => {
    const id = document.getElementById("createRoomInput").value;
    createRoom(id);
  });

  init();

  // expose restart for debug
  window.__snake_restart = restart;

})();

