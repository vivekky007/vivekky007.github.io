const dino = document.getElementById("dino");
const cactus = document.getElementById("cactus");
const scoreDisplay = document.getElementById("score");

let isJumping = false;
let score = 0;

function jump() {
  if (isJumping) return;
  isJumping = true;
  
  let position = 0;
  const upInterval = setInterval(() => {
    if (position >= 150) {
      clearInterval(upInterval);
      const downInterval = setInterval(() => {
        if (position <= 0) {
          clearInterval(downInterval);
          isJumping = false;
        }
        position -= 20;
        dino.style.bottom = position + "px";
      }, 20);
    }
    position += 20;
    dino.style.bottom = position + "px";
  }, 20);
}

document.addEventListener("keydown", (e) => {
  if (e.code === "Space") jump();
});

function checkCollision() {
  const dinoTop = parseInt(window.getComputedStyle(dino).getPropertyValue("bottom"));
  const cactusLeft = parseInt(window.getComputedStyle(cactus).getPropertyValue("right"));
  
  if (cactusLeft > 730 && cactusLeft < 770 && dinoTop < 40) {
    alert("Game Over! Your score: " + score);
    window.location.reload();
  }
}

setInterval(() => {
  score++;
  scoreDisplay.textContent = "Score: " + score;
  checkCollision();
}, 100);
