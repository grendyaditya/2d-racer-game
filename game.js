const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W, H;
let animationFrameId = null;

// resize canvas to fit window anytime window resizes
function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

const laneWidth = 80;
let roadMargin; // space on sides outside road lanes

// player car object setup
const player = {
  x: 0,
  y: 0,
  width: 50,
  height: 100,
  speedX: 0,
  maxSpeedX: 10,
  color: '#00aaff'
};

let enemies = []; // array of enemy cars/trucks
let keys = {};    // pressed keys tracker
let boosting = false;  // if player holding shift for NOS boost
let score = 0;
let highscore = 0;
let gameOverFlag = false;
let laneOffset = 0; // animates lane dash offset
let paused = false;

const scoreEl = document.getElementById('score');
const highscoreEl = document.getElementById('highscore-val');
const overlay = document.getElementById('overlay');
const overlayScore = document.getElementById('overlay-score');
const btnPause = document.getElementById('btnPause');
const btnPlay = document.getElementById('btnPlay');
const btnRestart = document.getElementById('btnRestart');
const overlayRestartBtn = document.getElementById('overlayRestartBtn');

// -------------- COOKIE HELPERS ----------------
// save a cookie with optional days expiry
function setCookie(name, value, days) {
  let expires = "";
  if(days) {
    const d = new Date();
    d.setTime(d.getTime() + days*24*60*60*1000);
    expires = "; expires=" + d.toUTCString();
  }
  document.cookie = name + "=" + (value || "") + expires + "; path=/";
}

// get cookie by name, or null if none
function getCookie(name) {
  const nameEQ = name + "=";
  const ca = document.cookie.split(';');
  for(let c of ca){
    while(c.charAt(0) === ' ') c = c.substring(1,c.length);
    if(c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length,c.length);
  }
  return null;
}

// load highscore from cookie if present
function loadHighscore() {
  const saved = getCookie('trafficRacerHighscore');
  if(saved) {
    highscore = parseInt(saved) || 0;
    highscoreEl.textContent = highscore;
  }
}
loadHighscore(); // load once on game start

// --------------------------------------------

// generate random pastel color for enemy cars/trucks
function randomPastelColor() {
  const r = Math.floor(Math.random() * 127 + 128);
  const g = Math.floor(Math.random() * 127 + 128);
  const b = Math.floor(Math.random() * 127 + 128);
  return `rgb(${r},${g},${b})`;
}

// draws a car or truck at given coords
function drawVehicle(x, y, width, height, color, type = 'car') {
  ctx.save();

  // flip vertically so cars face "up" on screen
  ctx.translate(x + width / 2, y + height / 2);
  ctx.scale(1, -1);
  ctx.translate(-(x + width / 2), -(y + height / 2));

  // car body rectangle + outline
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);

  // simple roof shape
  ctx.fillStyle = '#77ccff';
  ctx.beginPath();
  ctx.moveTo(x + width * 0.2, y + height * 0.1);
  ctx.lineTo(x + width * 0.8, y + height * 0.1);
  ctx.lineTo(x + width * 0.7, y + height * 0.4);
  ctx.lineTo(x + width * 0.3, y + height * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // wheels - bigger if truck
  ctx.fillStyle = '#222';
  let wheelHeight = height * 0.1;
  let wheelWidth = width * 0.15;
  if(type === 'truck'){
    wheelHeight = height * 0.12;
    wheelWidth = width * 0.2;
  }
  ctx.beginPath();
  ctx.ellipse(x + width * 0.25, y + height * 0.85, wheelWidth, wheelHeight, 0, 0, Math.PI*2);
  ctx.ellipse(x + width * 0.75, y + height * 0.85, wheelWidth, wheelHeight, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// check if new enemy spawn position too close vertically to existing enemies
function canSpawnAt(x, y, width, height){
  const minDistanceY = 200; // min vertical gap
  for(let enemy of enemies){
    let dx = Math.abs(enemy.x - x);
    let dy = Math.abs(enemy.y - y);
    // if horizontally close + vertically too close -> no spawn
    if(dx < width && dy < minDistanceY){
      return false;
    }
  }
  return true;
}

// spawn enemy cars/trucks randomly in lanes (max 4 enemies on screen)
function spawnEnemy(){
  if(enemies.length >= 4) return;

  const types = ['car','car','car','truck']; // trucks rarer
  const type = types[Math.floor(Math.random()*types.length)];

  let width = type === 'truck' ? 70 : 50;
  let height = type === 'truck' ? 160 : 100;

  const emptyLane = Math.floor(Math.random()*5); // leave one lane empty

  let tries = 0;
  while(tries < 15){
    let laneIndex = Math.floor(Math.random()*5);
    if(laneIndex === emptyLane){
      tries++;
      continue;
    }

    // calc x pos center in lane + jitter
    let x = roadMargin + laneIndex*laneWidth + laneWidth/2 - width/2;
    x += (Math.random()*20) - 10;

    let y = -height - Math.random()*300; // spawn above screen randomly

    if(canSpawnAt(x, y, width, height)){
      enemies.push({x,y,width,height,color:randomPastelColor(),type});
      break;
    }
    tries++;
  }
}

// simple axis-aligned bounding box collision check
function isColliding(a,b){
  return !(a.x > b.x + b.width ||
           a.x + a.width < b.x ||
           a.y > b.y + b.height ||
           a.y + a.height < b.y);
}

// draw road background + sidewalks + lane dashed lines
function drawRoad(){
  ctx.fillStyle = '#222';
  ctx.fillRect(0,0,W,H);

  roadMargin = (W - laneWidth*5)/2;

  // sidewalks on left and right side
  ctx.fillStyle = '#666';
  ctx.fillRect(0,0,roadMargin,H);
  ctx.fillRect(W-roadMargin,0,roadMargin,H);

  // lane divider lines
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 4;
  ctx.setLineDash([30,30]);
  for(let i=1; i<5; i++){
    let x = roadMargin + i*laneWidth;
    ctx.beginPath();
    // dashed lines scroll down by laneOffset for animation
    for(let y = -30 + laneOffset; y < H; y += 60){
      ctx.moveTo(x, y);
      ctx.lineTo(x, y+30);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

// draws player + enemies + road
function draw(){
  drawRoad();

  drawVehicle(player.x, player.y, player.width, player.height, player.color, 'car');

  enemies.forEach(enemy=>{
    drawVehicle(enemy.x, enemy.y, enemy.width, enemy.height, enemy.color, enemy.type);
  });
}

// game loop update - physics + input + spawn + collision + draw + request next frame
function update(){
  if(gameOverFlag || paused) return; // do nothing if game ended or paused

  // animate lane dash offset (faster if boosting)
  laneOffset += 10 + (boosting ? 10 : 0);
  if(laneOffset >= 60) laneOffset = 0;

  // move player left/right with keys A/D or arrows
  if(keys['arrowleft'] || keys['a']){
    player.speedX -= 1;
  }
  if(keys['arrowright'] || keys['d']){
    player.speedX += 1;
  }
  // no input? slow down horizontal speed (friction)
  if(!(keys['arrowleft'] || keys['a'] || keys['arrowright'] || keys['d'])){
    player.speedX *= 0.8;
  }

  // clamp max horizontal speed
  if(player.speedX > player.maxSpeedX) player.speedX = player.maxSpeedX;
  if(player.speedX < -player.maxSpeedX) player.speedX = -player.maxSpeedX;

  // move player by speedX, keep inside road margin
  player.x += player.speedX;
  if(player.x < roadMargin) player.x = roadMargin;
  if(player.x + player.width > W - roadMargin) player.x = W - roadMargin - player.width;

  // enemy cars move down, faster if boosting
  let enemySpeed = 5 + (boosting ? 5 : 0);
  for(let i = enemies.length - 1; i >= 0; i--){
    enemies[i].y += enemySpeed;
    if(enemies[i].y > H) enemies.splice(i, 1); // remove enemies off screen bottom
  }

  // random chance to spawn new enemy
  if(Math.random() < 0.02) spawnEnemy();

  // collision check player vs enemies -> end game if hit
  for(let enemy of enemies){
    if(isColliding(player, enemy)){
      endGame();
      break;
    }
  }

  // increment score every frame (speed or time based)
  score++;
  scoreEl.textContent = score;

  // if beat highscore, update & save cookie
  if(score > highscore){
    highscore = score;
    highscoreEl.textContent = highscore;
    setCookie('trafficRacerHighscore', highscore, 365); // save for 1 year
  }

  draw();

  animationFrameId = requestAnimationFrame(update);
}

// start or restart game - reset vars, hide overlay, set player pos/color, start loop
function startGame(){
  if(animationFrameId) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;

  roadMargin = (W - laneWidth * 5) / 2;
  player.x = roadMargin + laneWidth*2 + laneWidth/2 - player.width/2;
  player.y = H - 150;
  player.speedX = 0;
  enemies = [];
  score = 0;
  gameOverFlag = false;
  boosting = false;
  laneOffset = 0;
  paused = false;
  player.color = randomPastelColor();
  scoreEl.textContent = score;
  overlay.style.display = 'none';
  btnPlay.style.display = 'none';
  btnPause.style.display = 'inline-block';

  update();
}

// end game, show overlay + final scores, stop loop
function endGame(){
  gameOverFlag = true;
  overlay.style.display = 'flex';
  overlayScore.textContent = `Score: ${score}\nHighscore: ${highscore}`;
  btnPlay.style.display = 'none';
  btnPause.style.display = 'none';
  if(animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// pause game - stop loop + toggle buttons
function pauseGame(){
  paused = true;
  btnPause.style.display = 'none';
  btnPlay.style.display = 'inline-block';
  if(animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

// resume game from pause - restart loop + toggle buttons
function resumeGame(){
  if(!gameOverFlag){
    paused = false;
    btnPlay.style.display = 'none';
    btnPause.style.display = 'inline-block';
    if(!animationFrameId) update();
  }
}

// button event listeners
btnPause.addEventListener('click', pauseGame);
btnPlay.addEventListener('click', resumeGame);
btnRestart.addEventListener('click', () => {
  if(!gameOverFlag){
    startGame();
  }
});
overlayRestartBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  startGame();
});

// keyboard listeners - track keys pressed + boosting shift key
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()] = true;
  if(e.key === 'Shift') boosting = true;
});
window.addEventListener('keyup', e=>{
  keys[e.key.toLowerCase()] = false;
  if(e.key === 'Shift') boosting = false;
});

// start first game automatically on load
startGame();
