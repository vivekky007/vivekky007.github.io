// Firebase setup (same as RN)
const firebaseConfig = {
  // your config here
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const roomId = "room123";

// Lane settings
const LANES = 3;
const W = window.innerWidth;
const H = window.innerHeight;
const CAR_W = 60;
const CAR_H = 90;

// Player state
let me = { lane: 1, y: H - CAR_H - 120 };
let opponent = { lane: 1, y: 150 };

// DOM references
const myCar = document.getElementById("me");
const enemyCar = document.getElementById("enemy");

// Set initial position
updatePositions();

// Listen for opponent updates
db.collection("games")
  .doc(roomId)
  .onSnapshot((snap) => {
    const data = snap.data();
    if (!data) return;

    opponent = data.opponent;
    updatePositions();
    document.getElementById("status").innerText = "Connected";
  });

// Send my state
function broadcast() {
  db.collection("games").doc(roomId).set({
    opponent: me,
  });
}

// Update visuals
function updatePositions() {
  const laneWidth = W / LANES;

  myCar.style.left = me.lane * laneWidth + (laneWidth - CAR_W) / 2 + "px";
  myCar.style.top = me.y + "px";

  enemyCar.style.left = opponent.lane * laneWidth + (laneWidth - CAR_W) / 2 + "px";
  enemyCar.style.top = opponent.y + "px";
}

// Movement
function moveLeft() {
  me.lane = Math.max(0, me.lane - 1);
  broadcast();
  updatePositions();
}

function moveRight() {
  me.lane = Math.min(LANES - 1, me.lane + 1);
  broadcast();
  updatePositions();
}

function boost() {
  me.y -= 40;
  broadcast();
  updatePositions();
}
