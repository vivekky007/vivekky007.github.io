
// snake.net.js
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



  function showGameScreen() {
    const login = document.getElementById("lobby");
    const game = document.getElementById("gameScreen");
    if (login) login.style.display = "none";
    if (game) game.style.display = "block";

    const area = document.getElementById("gameArea");
    if (area) area.style.display = "block";
  }

  /* ------- Announce ready to RN ------- */
  postToNative({ action: "ready" });


  /* ------- Canvas & config ------- */
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.width;
  }
  window.addEventListener("resize", resizeCanvas);
  resizeCanvas();

  let touchStartX = 0;
  let touchStartY = 0;
  const SWIPE_THRESHOLD = 30; 
  /* ------- Edge Touch Controls ------- */
  canvas.addEventListener("touchstart", (e) => {
    const t = e.changedTouches[0];
    touchStartX = t.clientX;
    touchStartY = t.clientY;
  });

  canvas.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX;
    const dy = t.clientY - touchStartY;

    // Determine if it's a valid swipe
    if (Math.abs(dx) < SWIPE_THRESHOLD && Math.abs(dy) < SWIPE_THRESHOLD) {
      return; // Ignore tiny touches
    }

    let dir = null;

    // Horizontal vs Vertical detection
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal swipe
      dir = dx > 0 ? "right" : "left";
    } else {
      // Vertical swipe
      dir = dy > 0 ? "down" : "up";
    }

    if (dir) {
      sendLocalDir(dir); // send to RN/WebRTC
      e.preventDefault();
    }
  });


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

  let role = null;
  let isHost = false;
  let players = [];
  let food = null;
  let running = false;
  let gameInterval = null;
  let lastTick = 0;
  let localPlayerIndex = null;

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


    postToNative({ action: "startedAsHost" });

    sendStateToPeer();
    showGameScreen();
  }

  /* ------- Client: render-only ------- */
  function startAsClient() {
    resizeCanvas();
    CELL = Math.floor(canvas.width / GRID);

    // client waits for states from host
    running = true;
  
    showGameScreen();
  }

  function restart() {
    if (gameInterval) clearInterval(gameInterval);
    if (isHost) startAsHost(); else startAsClient();
  }

  startBtn.addEventListener("click", () => {
    if (isHost) {
      postToNative({ action: "start" });
      startAsHost();
    } else {
      postToNative({ action: "requestStart" });
   
    }
  });

  /* ------- Inputs ------- */
  function sendLocalDir(dirKey) {
    if (!role) return;
    postToNative({ action: "dir", player: role, dir: dirKey });
    if (isHost) trySetDir(localPlayerIndex, DIRS[dirKey]);
  }

  window.addEventListener("keydown", (ev) => {
    const k = ev.key.toLowerCase();
    if (k === "w" || ev.key === "ArrowUp") sendLocalDir("up");
    if (k === "s" || ev.key === "ArrowDown") sendLocalDir("down");
    if (k === "a" || ev.key === "ArrowLeft") sendLocalDir("left");
    if (k === "d" || ev.key === "ArrowRight") sendLocalDir("right");
  });

  document.querySelectorAll("#touchControls .pad").forEach(pad => {
    const playerId = parseInt(pad.dataset.player, 10);
    pad.querySelectorAll(".btn").forEach(btn => {
      btn.addEventListener("touchstart", (e) => {
        e.preventDefault();
        sendLocalDir(btn.dataset.dir);
      });
      btn.addEventListener("click", (e) => {
        sendLocalDir(btn.dataset.dir);
      });
    });
  });

  function trySetDir(playerIndex, dir) {
    const p = players[playerIndex];
    if (!p || !p.alive) return;
    if (p.dir.x + dir.x === 0 && p.dir.y + dir.y === 0) return;
    p.nextDir = dir;
  }

  /* ------- Host tick ------- */
  function hostTick() {
    if (!running) return;
    lastTick++;

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

    players.forEach((p, idx) => {
      if (!p.alive) return;
      if (p.body[0].x === food.x && p.body[0].y === food.y) {
        p.score += 1;
        postToNative({ type: "score", player: idx + 1, score: p.score });
        placeFood();
      } else {
        p.body.pop();
      }
    });

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
     
      }
    });

    const bothHeadsSame = players[0].alive && players[1].alive &&
                          players[0].body[0].x === players[1].body[0].x &&
                          players[0].body[0].y === players[1].body[0].y;
    if (bothHeadsSame) {
      players[0].alive = players[1].alive = false;
      postToNative({ type: "gameOver", reason: "headOn", winner: 0 });
     
    }

    const aliveCount = players.filter(p => p.alive).length;
    if (aliveCount <= 1) {
      running = false;
      clearInterval(gameInterval);
      let winner = 0;
      if (aliveCount === 1) {
        winner = players.findIndex(p => p.alive) + 1;
        postToNative({ type: "gameOver", winner });
    
      } else {
        postToNative({ type: "gameOver", winner: 0 });
       
      }
    }

    sendStateToPeer();
    draw();
    updateScoreUI();
  }

  function sendStateToPeer() {
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
    postToNative({ action: "state", state });
  }

  function applyStateFromHost(state) {
    if (!state || !state.players) return;
    players = state.players.map(p => ({
      body: p.body.slice(),
      dir: DIRS.right,
      nextDir: DIRS.right,
      color: p.color || "#999",
      score: p.score || 0,
      alive: p.alive !== false,
    }));
    food = state.food;
    CELL = Math.floor(canvas.width / GRID);
    draw();
    updateScoreUI();
  }

  /* ------- Draw ------- */
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

    players.forEach((p) => {
      if (p.body.length > 0) drawCell(p.body[0].x, p.body[0].y, p.color);
      for (let i = 1; i < p.body.length; i++) drawCell(p.body[i].x, p.body[i].y, shadeColor(p.color, -12));
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

  

  /* ------- RN message handler ------- */
  window.onRNMessage = function (msg) {
    try {
      if (!msg) {
     
        return;
      }

      // Defensive: If RN accidentally passes a JSON string, parse it
      if (typeof msg === "string") {
        try { msg = JSON.parse(msg); } catch(e) { /* keep as string */ }
      }

 

      if (msg.type === "assign") {
        role = msg.player;
        isHost = role === "A";
        localPlayerIndex = role === "A" ? 0 : 1;


        if (!isHost) {
          // initialize placeholder players for client
          players = [
            makePlayer(Math.floor(GRID * 0.25), Math.floor(GRID / 2), "#2db0ff"),
            makePlayer(Math.floor(GRID * 0.75), Math.floor(GRID / 2), "#7fff9c"),
          ];
          draw(); // render immediately
        }
        showGameScreen();

      } else if (msg.type === "start") {
     
        // Always ensure correct client start even if isHost flag confused
        if (isHost) {
          startAsHost();
        } else {
          startAsClient();
        }
      } else if (msg.type === "setGrid") {
        if (typeof msg.grid === "number") {
          GRID = msg.grid;
          restart();
        }
      } 
    } catch (e) {
      console.warn("onRNMessage error", e);
   
    }
  };

  /* ------- Peer message handler ------- */
  window.onPeerMessage = function (msg) {
    try {
      if (!msg) {
     
        return;
      }

      // Defensive parse if a string comes through
      if (typeof msg === "string") {
        try { msg = JSON.parse(msg); } catch (e) { /* leave as string */ }
      }

     

      // If peer sends a start, always start client
      if (msg.type === "start") {
       
        // If this device is host but somehow also got start (rare), ignore client start
        if (!isHost) startAsClient();
        return;
      }

      if (msg.type === "dir") {
        const remotePlayer = msg.player === "A" ? 0 : 1;
        const dirKey = msg.dir;
        if (isHost) trySetDir(remotePlayer, DIRS[dirKey]);
      } else if (msg.type === "state") {
        if (!isHost) applyStateFromHost(msg.state);
      } 
    } catch (e) {
      console.warn("onPeerMessage error", e);

    }
  };
  /* ------- Room management ------- */
  function joinRoom(roomId) {
    if (!roomId) {
      return;
    }
    const label = document.getElementById("roomLabel");
    if (label) label.textContent = "Room: " + roomId;
  
    postToNative({ action: "joinRoom", roomId });
  }

  function createRoom(roomId) {
    if (!roomId) {
      return;
    }
  
   
  
    const label = document.getElementById("roomLabel");
    if (label) label.textContent = "Room: " + roomId;
  
    postToNative({ action: "createRoom", roomId });
  }


  document.getElementById("joinRoomBtn").addEventListener("click", () => {
    const id = document.getElementById("roomid").value;
    joinRoom(id);
  });

  document.getElementById("createRoomBtn").addEventListener("click", () => {
    const id = document.getElementById("roomid").value;
    createRoom(id);
  });



  init();
  window.__snake_restart = restart;
})();


