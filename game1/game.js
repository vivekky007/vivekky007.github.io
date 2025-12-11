// snake.net.js
(() => {
  /* ------- Helpers ------- */
  function postToNative(obj) {
    try {
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(obj));
      }
    } catch (e) {}
  }

  function showGameScreen() {
    const login = document.getElementById("loginScreen");
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

  let GRID = 20;
  let TICK_MS = 120;
  let CELL = 20;

  let players = [];
  let food = null;

  let running = false;
  let isHost = false;
  let role = null;
  let localPlayerIndex = 0;
  let remotePlayer = 1;

  let gameInterval = null;

  function drawCell(x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x * CELL, y * CELL, CELL, CELL);
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let p of players) {
      if (!p.alive) continue;
      for (let seg of p.body) {
        drawCell(seg.x, seg.y, p.color);
      }
    }

    if (food) drawCell(food.x, food.y, "yellow");
  }

  function makePlayer(x, y, color) {
    return {
      color,
      alive: true,
      score: 0,
      body: [{ x, y }],
      dir: { x: 0, y: 0 },
      pending: null,
    };
  }

  function placeFood() {
    food = {
      x: Math.floor(Math.random() * GRID),
      y: Math.floor(Math.random() * GRID),
    };
  }

  function trySetDir(p, d) {
    if (!p) return;
    p.pending = d;
  }

  function tickPlayer(p) {
    if (!p.alive) return;

    if (p.pending) {
      p.dir = p.pending;
      p.pending = null;
    }

    const head = { ...p.body[0] };
    head.x += p.dir.x;
    head.y += p.dir.y;

    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) {
      p.alive = false;
      return;
    }

    p.body.unshift(head);

    if (food && head.x === food.x && head.y === food.y) {
      p.score += 1;
      postToNative({ type: "score", player: players.indexOf(p) + 1, score: p.score });
      placeFood();
    } else {
      p.body.pop();
    }
  }

  function hostTick() {
    tickPlayer(players[0]);
    tickPlayer(players[1]);

    let aliveCount = players.filter((p) => p.alive).length;
    let bothHeadsSame =
      players[0].body[0].x === players[1].body[0].x &&
      players[0].body[0].y === players[1].body[0].y;

    if (bothHeadsSame) {
      players[0].alive = players[1].alive = false;
      postToNative({ type: "gameOver", reason: "headOn", winner: 0 });
      aliveCount = 0;
    }

    if (aliveCount <= 1) {
      let winner = players.findIndex((p) => p.alive) + 1;
      postToNative({ type: "gameOver", winner });
    }

    postToNative({
      type: "state",
      state: {
        players,
        food,
        grid: GRID,
      },
    });

    draw();
  }

  function applyStateFromHost(s) {
    players = s.players;
    food = s.food;
    GRID = s.grid;
    draw();
  }

  function restart() {
    running = true;

    players = [
      makePlayer(5, Math.floor(GRID / 2), "red"),
      makePlayer(GRID - 5, Math.floor(GRID / 2), "green"),
    ];

    placeFood();
    draw();
  }

  function startAsHost() {
    restart();
    if (gameInterval) clearInterval(gameInterval);
    gameInterval = setInterval(hostTick, TICK_MS);
    postToNative({ action: "startedAsHost" });
  }

  function startAsClient() {
    running = true;
    showGameScreen();
  }

  /* ------- RN messaging ------- */
  window.onRNMessage = function (msg) {
    try {
      if (!msg) return;
      try {
        msg = JSON.parse(msg);
      } catch (e) {}

      if (msg.type === "assign") {
        role = msg.player;
        isHost = role === "A";
        localPlayerIndex = isHost ? 0 : 1;

        if (!isHost) {
          players = [
            makePlayer(5, Math.floor(GRID / 2), "red"),
            makePlayer(GRID - 5, Math.floor(GRID / 2), "green"),
          ];
          draw();
        }

        showGameScreen();
      } else if (msg.type === "start") {
        if (isHost) startAsHost();
        else startAsClient();
      } else if (msg.type === "grid") {
        GRID = msg.grid;
        restart();
      }
    } catch (e) {}
  };

  /* ------- Peer messaging ------- */
  window.onPeerMessage = function (msg) {
    try {
      if (!msg) return;
      try {
        msg = JSON.parse(msg);
      } catch (e) {}

      if (msg.type === "start") {
        if (!isHost) startAsClient();
        return;
      }

      if (msg.type === "dir") {
        let dirKey = msg.dir;
        const DIRS = {
          up: { x: 0, y: -1 },
          down: { x: 0, y: 1 },
          left: { x: -1, y: 0 },
          right: { x: 1, y: 0 },
        };
        if (isHost) trySetDir(players[1], DIRS[dirKey]);
      } else if (msg.type === "state") {
        if (!isHost) applyStateFromHost(msg.state);
      }
    } catch (e) {}
  };

  /* ------- Room management ------- */
  function joinRoom(roomId) {
    if (!roomId) return;

    const label = document.getElementById("roomLabel");
    if (label) label.textContent = "Room: " + roomId;

    postToNative({ action: "joinRoom", roomId });
  }

  function createRoom(roomId) {
    if (!roomId) return;

    const label = document.getElementById("roomLabel");
    if (label) label.textContent = "Room: " + roomId;

    postToNative({ action: "createRoom", roomId });
  }

  document.getElementById("joinRoomBtn")?.addEventListener("click", () => {
    const id = document.getElementById("joinRoomInput")?.value.trim();
    joinRoom(id);
  });

  document.getElementById("createRoomBtn")?.addEventListener("click", () => {
    const id = document.getElementById("createRoomInput")?.value.trim();
    createRoom(id);
  });

  window.__snake_restart = restart;
})();
