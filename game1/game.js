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

  function log(msg) {
    const el = document.getElementById("log");
    if (!el) return;
    const d = document.createElement("div");
    d.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }
  function logMsg(prefix, obj) {
    try {
      log(`${prefix} ${typeof obj === "string" ? obj : JSON.stringify(obj)}`);
    } catch (e) {
      log(`${prefix} (unserializable)`);
    }
  }


  function showGameScreen() {
    const login = document.getElementById("loginScreen");
    const game = document.getElementById("gameScreen");

    if (login) login.style.display = "none";
    if (game) game.style.display = "block";
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("gameArea").style.display = "block";
  }

  /* ------- Announce ready to RN ------- */
  postToNative({ action: "ready" });
  log("READY sent to RN");


  /* ------- Canvas & config ------- */
  const canvas = document.getElementById("gameCanvas");
  @@ -164, 7 + 147, 7 @@
if (gameInterval) clearInterval(gameInterval);
  gameInterval = setInterval(hostTick, TICK_MS);

  log("Host started game");

  postToNative({ action: "startedAsHost" });

  sendStateToPeer();
  @@ -178, 7 + 161, 7 @@

  // client waits for states from host
  running = true;
  log("Client ready, awaiting host state");

  showGameScreen();
}

@@ -193, 7 + 176, 7 @@
startAsHost();
} else {
  postToNative({ action: "requestStart" });
  log("Requested host to start");

}
});

@@ -253, 7 + 236, 6 @@
if (p.body[0].x === food.x && p.body[0].y === food.y) {
  p.score += 1;
  postToNative({ type: "score", player: idx + 1, score: p.score });
  log(`P${idx + 1} ate food. Score: ${p.score}`);
  placeFood();
} else {
  p.body.pop();
  @@ -277, 7 + 259, 7 @@
if (hits.length > 0) {
    p.alive = false;
    postToNative({ type: "died", player: idx + 1, reason: 'collision' });
    log(`P${idx + 1} collided`);

  }
});

@@ -287, 7 + 269, 7 @@
if (bothHeadsSame) {
  players[0].alive = players[1].alive = false;
  postToNative({ type: "gameOver", reason: "headOn", winner: 0 });
  log("Head-on: both died");

}

const aliveCount = players.filter(p => p.alive).length;
@@ -298, 10 + 280, 10 @@
if (aliveCount === 1) {
  winner = players.findIndex(p => p.alive) + 1;
  postToNative({ type: "gameOver", winner });
  log(`Game Over - Winner: P${winner}`);

} else {
  postToNative({ type: "gameOver", winner: 0 });
  log("Game Over - No winners");

}
}

@@ -394, 7 + 376, 7 @@
window.onRNMessage = function (msg) {
  try {
    if (!msg) {
      log("onRNMessage: empty msg");

      return;
    }

    @@ -403, 13 + 385, 13 @@
try { msg = JSON.parse(msg); } catch (e) { /* keep as string */ }
  }

      logMsg("RN →", msg);


  if (msg.type === "assign") {
    role = msg.player;
    isHost = role === "A";
    localPlayerIndex = role === "A" ? 0 : 1;
    log(`Assigned role: ${role} (${isHost ? "host" : "client"})`);


    if (!isHost) {
      // initialize placeholder players for client
      @@ -422, 7 + 404, 7 @@
      showGameScreen();

    } else if (msg.type === "start") {
      log("RN requested start");

      // Always ensure correct client start even if isHost flag confused
      if (isHost) {
        startAsHost();
        @@ -434, 20 + 416, 18 @@
        GRID = msg.grid;
        restart();
      }
    } else {
      logMsg("RN → unknown type", msg);
    }
  }
} catch (e) {
  console.warn("onRNMessage error", e);
  log("onRNMessage error: " + String(e));

}
};

/* ------- Peer message handler ------- */
window.onPeerMessage = function (msg) {
  try {
    if (!msg) {
      log("onPeerMessage: empty msg");

      return;
    }

    @@ -456, 11 + 436, 11 @@
try { msg = JSON.parse(msg); } catch (e) { /* leave as string */ }
  }

      logMsg("Peer →", msg);


  // If peer sends a start, always start client
  if (msg.type === "start") {
    log("Peer requested start");

    // If this device is host but somehow also got start (rare), ignore client start
    if (!isHost) startAsClient();
    return;
    @@ -472, 26 + 452, 17 @@
if (isHost) trySetDir(remotePlayer, DIRS[dirKey]);
  } else if (msg.type === "state") {
    if (!isHost) applyStateFromHost(msg.state);
  } else if (msg.type === "message") {
    // optional: display in log
    logMsg("Peer message text:", msg.text);
  } else {
    logMsg("Unhandled peer message:", msg);
  }
} 
} catch (e) {
  console.warn("onPeerMessage error", e);
  log("onPeerMessage error: " + String(e));

}
};
/* ------- Room management ------- */
function joinRoom(roomId) {
  if (!roomId) {
    log("❌ Room ID is empty");
    return;
  }

  log("Joined Room: " + roomId);

  const label = document.getElementById("roomLabel");
  if (label) label.textContent = "Room: " + roomId;

  @@ -500, 11 + 471, 10 @@

  function createRoom(roomId) {
    if (!roomId) {
      log("❌ Room ID is empty");
      return;
    }

    log("Created Room: " + roomId);


    const label = document.getElementById("roomLabel");
    if (label) label.textContent = "Room: " + roomId;
    @@ -523, 12 + 493, 9 @@
    createRoom(id);
  });

  function init() {
    log("Snake network module initialized, awaiting role assignment and start");
  }


  init();
  window.__snake_restart = restart;
}) ();

