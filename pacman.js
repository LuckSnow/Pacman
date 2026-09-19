// board constants & layout
let board;
const rowCount = 21;
const columnCount = 19;
const tileSize = 32;
const headerHeight = 48;
const footerHeight = 36;
const mazeOffsetY = headerHeight;
const boardWidth = columnCount * tileSize;
const boardHeight = rowCount * tileSize + headerHeight + footerHeight;
let context;

// Speeds tuned for optimal arcade pacing & responsiveness
const PACMAN_SPEED = 2.4;
const GHOST_SPEED = 2.1;
const GHOST_SCARED_SPEED = 1.3;

// Image assets
let blueGhostImage;
let orangeGhostImage;
let pinkGhostImage;
let redGhostImage;
let scaredGhostImage;
let cherryImage;
let pacmanUpImage;
let pacmanDownImage;
let pacmanLeftImage;
let pacmanRightImage;
let pacmanAnimImage;
let wallImage;

let gameStarted = false;
let deathAnimation = false;
let deathTick = 0;

// X = wall, O = tunnel/skip, P = pac man, ' ' = food
// Ghosts: b = blue, o = orange, p = pink, r = red
const tileMap = [
    "XXXXXXXXXXXXXXXXXXX",
    "X        X        X",
    "X XX XXX X XXX XX X",
    "X                 X",
    "X XX X XXXXX X XX X",
    "X    X       X    X",
    "XXXX XXXX XXXX XXXX",
    "OOOX X       X XOOO",
    "XXXX X XXrXX X XXXX",
    "X       bpo       X",
    "XXXX X XXXXX X XXXX",
    "OOOX X       X XOOO",
    "XXXX X XXXXX X XXXX",
    "X        X        X",
    "X XX XXX X XXX XX X",
    "X  X     P     X  X",
    "XX X X XXXXX X X XX",
    "X    X   X   X    X",
    "X XXXXXX X XXXXXX X",
    "X                 X",
    "XXXXXXXXXXXXXXXXXXX" 
];

const walls = new Set();
const foods = new Set();
const ghosts = new Set();
let pacman;

const directions = ['U', 'D', 'L', 'R']; // up down left right
let score = 0;
// Dynamic high score: loads from localStorage, starts at 0 for fresh player
let highScore = parseInt(localStorage.getItem("pacman_high_score")) || 0;
let lives = 3;
let gameOver = false;
let ThemeSong;
let eatFoodAudio;

let pacmanAnimTick = 0;
let mazeCanvas = null;

// ==========================================
// 1. RETRO AUDIO SYNTHESIZER (Web Audio API)
// ==========================================
class RetroAudio {
    constructor() {
        this.ctx = null;
        this.sirenOsc = null;
        this.sirenGain = null;
        this.sirenInterval = null;
        this.isSirenPlaying = false;
        this.chompTone = 0;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    startGhostSiren() {
        if (!this.ctx || this.isSirenPlaying) return;
        try {
            this.isSirenPlaying = true;
            this.sirenOsc = this.ctx.createOscillator();
            this.sirenGain = this.ctx.createGain();
            this.sirenOsc.type = 'triangle';
            this.sirenGain.gain.setValueAtTime(0.03, this.ctx.currentTime);
            this.sirenOsc.connect(this.sirenGain);
            this.sirenGain.connect(this.ctx.destination);
            this.sirenOsc.start();
            
            let step = 0;
            this.sirenInterval = setInterval(() => {
                if (!this.ctx || !this.isSirenPlaying) return;
                step++;
                const freq = 190 + Math.sin(step * 0.35) * 40;
                this.sirenOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            }, 90);
        } catch(e) {}
    }

    stopGhostSiren() {
        this.isSirenPlaying = false;
        if (this.sirenInterval) {
            clearInterval(this.sirenInterval);
            this.sirenInterval = null;
        }
        if (this.sirenOsc) {
            try {
                this.sirenOsc.stop();
                this.sirenOsc.disconnect();
            } catch(e) {}
            this.sirenOsc = null;
        }
    }

    playChomp() {
        if (!this.ctx) return;
        try {
            this.chompTone = 1 - this.chompTone;
            const freq = this.chompTone === 0 ? 320 : 440;
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.65, now + 0.07);
            gain.gain.setValueAtTime(0.09, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.07);
        } catch(e) {}
    }

    playEatGhost() {
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.exponentialRampToValueAtTime(900, now + 0.22);
            gain.gain.setValueAtTime(0.14, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.22);
        } catch(e) {}
    }

    playPowerPellet() {
        if (!this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.exponentialRampToValueAtTime(850, now + 0.15);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.15);
        } catch(e) {}
    }

    playDeath() {
        if (!this.ctx) return;
        try {
            this.stopGhostSiren();
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(540, now);
            osc.frequency.exponentialRampToValueAtTime(65, now + 0.75);
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0.12, now + 0.55);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.8);
        } catch(e) {}
    }
}

const retroAudio = new RetroAudio();

// Helper to check walls
function isWall(c, r) {
    if (r < 0 || r >= rowCount || c < 0 || c >= columnCount) return true;
    return tileMap[r][c] === 'X';
}

// Responsive resize helper to guarantee bottom is never cut off
function resizeBoard() {
    if (!board) return;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 16;
    const scale = Math.min(maxW / boardWidth, maxH / boardHeight, 1);
    board.style.width = Math.floor(boardWidth * scale) + "px";
    board.style.height = Math.floor(boardHeight * scale) + "px";
}
window.addEventListener("resize", resizeBoard);

// ==========================================
// 2. INITIALIZATION
// ==========================================
window.onload = function() {
    board = document.getElementById("board");
    board.height = boardHeight;
    board.width = boardWidth;
    context = board.getContext("2d");

    resizeBoard();

    loadImages();
    loadMap();

    ThemeSong = document.getElementById("gameAudio");
    eatFoodAudio = document.getElementById("eatFoodAudio");

    document.addEventListener("keydown", function() {
        retroAudio.init();
        if (ThemeSong && ThemeSong.paused && !gameStarted) {
            ThemeSong.play().catch(() => {});
        }
    }, {once: true});

    if (ThemeSong) {
        ThemeSong.addEventListener("ended", function() {
            gameStarted = true;
            retroAudio.startGhostSiren();
        });
    }

    update();
    document.addEventListener("keydown", movePacman);
};

function loadImages() {
    wallImage = new Image();
    wallImage.src = "./Images/wall.png";

    blueGhostImage = new Image();
    blueGhostImage.src = "./Images/blueGhost.png";
    orangeGhostImage = new Image();
    orangeGhostImage.src = "./Images/orangeGhost.png";
    pinkGhostImage = new Image();
    pinkGhostImage.src = "./Images/pinkGhost.png";
    redGhostImage = new Image();
    redGhostImage.src = "./Images/redGhost.png";
    scaredGhostImage = new Image();
    scaredGhostImage.src = "./Images/scaredGhost.png";

    cherryImage = new Image();
    cherryImage.src = "./Images/cherry.png";

    pacmanUpImage = new Image();
    pacmanUpImage.src = "./Images/pacmanUp.png";
    pacmanDownImage = new Image();
    pacmanDownImage.src = "./Images/pacmanDown.png";
    pacmanLeftImage = new Image();
    pacmanLeftImage.src = "./Images/pacmanLeft.png";
    pacmanRightImage = new Image();
    pacmanRightImage.src = "./Images/pacmanRight.png";

    pacmanAnimImage = new Image();
    pacmanAnimImage.src = "./Images/animations.gif";
}

function loadMap() {
    walls.clear();
    foods.clear();
    ghosts.clear();

    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < columnCount; c++) {
            const row = tileMap[r];
            const tileMapChar = row[c];

            const x = c * tileSize;
            const y = r * tileSize + mazeOffsetY;

            if (tileMapChar == 'X') {
                const wall = new Block(wallImage, x, y, tileSize, tileSize);
                walls.add(wall);  
            }
            else if (tileMapChar == 'b') {
                const ghost = new GhostBlock(blueGhostImage, x, y, tileSize, tileSize, 'blue');
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'o') {
                const ghost = new GhostBlock(orangeGhostImage, x, y, tileSize, tileSize, 'orange');
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'p') {
                const ghost = new GhostBlock(pinkGhostImage, x, y, tileSize, tileSize, 'pink');
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'r') {
                const ghost = new GhostBlock(redGhostImage, x, y, tileSize, tileSize, 'red');
                ghosts.add(ghost);
            }
            else if (tileMapChar == 'P') {
                pacman = new PacmanBlock(pacmanRightImage, x, y, tileSize, tileSize);
            }
            else if (tileMapChar == ' ') {
                const isPower = (
                    (r === 1 && c === 1) ||
                    (r === 1 && c === columnCount - 2) ||
                    (r === rowCount - 2 && c === 1) ||
                    (r === rowCount - 2 && c === columnCount - 2)
                );
                const foodSize = isPower ? 14 : 6;
                const offset = (tileSize - foodSize) / 2;
                const food = new Block(null, x + offset, y + offset, foodSize, foodSize);
                food.isPowerPellet = isPower;
                foods.add(food);
            }
        }
    }

    renderMazeCanvas();
}

// Pre-render retro arcade double-blue walls matching Image 2
function renderMazeCanvas() {
    mazeCanvas = document.createElement("canvas");
    mazeCanvas.width = boardWidth;
    mazeCanvas.height = boardHeight;
    const mctx = mazeCanvas.getContext("2d");

    mctx.fillStyle = "#000000";
    mctx.fillRect(0, 0, boardWidth, boardHeight);

    mctx.strokeStyle = "#2121ff";
    mctx.lineWidth = 3;
    mctx.lineJoin = "round";

    for (let r = 0; r < rowCount; r++) {
        for (let c = 0; c < columnCount; c++) {
            if (tileMap[r][c] !== 'X') continue;

            const x = c * tileSize;
            const y = r * tileSize + mazeOffsetY;

            const top = isWall(c, r - 1);
            const bottom = isWall(c, r + 1);
            const left = isWall(c - 1, r);
            const right = isWall(c + 1, r);

            mctx.beginPath();
            if (!top) {
                mctx.moveTo(x + 2, y + 2);
                mctx.lineTo(x + tileSize - 2, y + 2);
            }
            if (!bottom) {
                mctx.moveTo(x + 2, y + tileSize - 2);
                mctx.lineTo(x + tileSize - 2, y + tileSize - 2);
            }
            if (!left) {
                mctx.moveTo(x + 2, y + 2);
                mctx.lineTo(x + 2, y + tileSize - 2);
            }
            if (!right) {
                mctx.moveTo(x + tileSize - 2, y + 2);
                mctx.lineTo(x + tileSize - 2, y + tileSize - 2);
            }
            mctx.stroke();

            // Inner retro accent line
            mctx.save();
            mctx.strokeStyle = "#1010a0";
            mctx.lineWidth = 1;
            mctx.beginPath();
            if (!top) {
                mctx.moveTo(x + 5, y + 5);
                mctx.lineTo(x + tileSize - 5, y + 5);
            }
            if (!bottom) {
                mctx.moveTo(x + 5, y + tileSize - 5);
                mctx.lineTo(x + tileSize - 5, y + tileSize - 5);
            }
            if (!left) {
                mctx.moveTo(x + 5, y + 5);
                mctx.lineTo(x + 5, y + tileSize - 5);
            }
            if (!right) {
                mctx.moveTo(x + tileSize - 5, y + 5);
                mctx.lineTo(x + tileSize - 5, y + tileSize - 5);
            }
            mctx.stroke();
            mctx.restore();
        }
    }

    // Ghost house gate (pink bar matching Image 2)
    mctx.fillStyle = "#ffb8de";
    mctx.fillRect(8 * tileSize + 8, 8 * tileSize + mazeOffsetY + tileSize - 4, tileSize * 3 - 16, 4);
}

// ==========================================
// 3. MAIN GAME LOOP
// ==========================================
function update() {
    if (gameOver) {
        draw();
        return;
    }
    requestAnimationFrame(update);

    if (deathAnimation) {
        deathTick++;
        if (deathTick > 50) {
            deathAnimation = false;
            deathTick = 0;
            resetPositions();
            if (!gameOver) {
                retroAudio.startGhostSiren();
            }
        }
        draw();
        return;
    }

    if (gameStarted) {
        move();
    }
    draw();
}

// ==========================================
// 4. RENDERING & UI (Matching Image 2)
// ==========================================
function draw() {
    context.clearRect(0, 0, board.width, board.height);

    // 1. Draw Maze
    if (mazeCanvas) {
        context.drawImage(mazeCanvas, 0, 0);
    }

    // 2. Draw Pellets
    const now = Date.now();
    const flash = Math.floor(now / 220) % 2 === 0;

    for (let food of foods.values()) {
        if (food.isPowerPellet) {
            if (flash) {
                context.fillStyle = "#ffb8ae";
                context.beginPath();
                context.arc(food.x + food.width/2, food.y + food.height/2, 6.5, 0, Math.PI * 2);
                context.fill();
            }
        } else {
            context.fillStyle = "#ffb8ae";
            context.beginPath();
            context.arc(food.x + food.width/2, food.y + food.height/2, 2.5, 0, Math.PI * 2);
            context.fill();
        }
    }

    // 3. Draw Pac-Man with Animations
    drawPacman();

    // 4. Draw Ghosts
    for (let ghost of ghosts.values()) {
        ghost.draw(context);
    }

    // 5. Retro Header (1UP & HIGH SCORE) - Matching Image 2
    context.font = '14px "Press Start 2P", monospace';
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.fillText("1UP", 36, 20);
    context.fillText(String(score).padStart(2, ' '), 36, 38);

    context.textAlign = "center";
    context.fillText("HIGH SCORE", boardWidth / 2, 20);
    context.fillText(String(Math.max(highScore, score)), boardWidth / 2, 38);

    // 6. Bottom Footer (Lives & Cherry Fruit) - Matching Image 2
    drawLivesAndFruit();

    // 7. Overlays: "READY!" or "GAME OVER"
    context.textAlign = "center";
    if (!gameStarted && !gameOver) {
        context.fillStyle = "#ffff00";
        context.font = '16px "Press Start 2P", monospace';
        context.fillText("READY!", boardWidth / 2, 11 * tileSize + mazeOffsetY + 16);
    }

    if (gameOver) {
        context.fillStyle = "#ff0000";
        context.font = '16px "Press Start 2P", monospace';
        context.fillText("GAME OVER", boardWidth / 2, 11 * tileSize + mazeOffsetY + 16);
        context.fillStyle = "#ffffff";
        context.font = '10px "Press Start 2P", monospace';
        context.fillText("PRESS ANY KEY TO RESTART", boardWidth / 2, 13 * tileSize + mazeOffsetY + 16);
    }
}

// Draw Pacman using animations.gif (7 frames, 20x20) rotated in direction
function drawPacman() {
    if (!pacman) return;

    if (deathAnimation) {
        context.save();
        context.translate(pacman.x + pacman.width / 2, pacman.y + pacman.height / 2);
        context.rotate(deathTick * 0.25);
        context.globalAlpha = Math.max(0, 1 - deathTick / 50);
        context.drawImage(pacmanRightImage, -pacman.width / 2, -pacman.height / 2, pacman.width, pacman.height);
        context.restore();
        return;
    }

    context.save();
    const cx = pacman.x + pacman.width / 2;
    const cy = pacman.y + pacman.height / 2;
    context.translate(cx, cy);

    // Default sprite in animations.gif faces RIGHT (0 deg).
    // Rotate to match direction:
    let angle = 0;
    if (pacman.direction === 'R') {
        angle = 0;
    } else if (pacman.direction === 'L') {
        angle = Math.PI;
    } else if (pacman.direction === 'D') {
        angle = Math.PI / 2;
    } else if (pacman.direction === 'U') {
        angle = -Math.PI / 2;
    }
    context.rotate(angle);

    if (pacmanAnimImage.complete && pacmanAnimImage.naturalWidth >= 140) {
        // 7 frames cycle
        const frameSequence = [0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];
        let currentFrame = 0;
        if (pacman.isMoving) {
            const seqIndex = Math.floor(pacmanAnimTick / 4) % frameSequence.length;
            currentFrame = frameSequence[seqIndex];
        } else {
            currentFrame = 0;
        }
        const frameX = currentFrame * 20;
        context.drawImage(
            pacmanAnimImage,
            frameX, 0, 20, 20,
            -pacman.width / 2, -pacman.height / 2, pacman.width, pacman.height
        );
    } else if (pacman.image) {
        context.drawImage(pacman.image, -pacman.width / 2, -pacman.height / 2, pacman.width, pacman.height);
    }
    context.restore();
}

// Draw extra lives icons (mini yellow Pacman) and cherry at bottom
function drawLivesAndFruit() {
    const iconY = boardHeight - 20;

    // Remaining extra lives (lives - 1)
    const extraLives = Math.max(0, lives - 1);
    for (let i = 0; i < extraLives; i++) {
        const iconX = 36 + i * 26;
        context.fillStyle = "#ffff00";
        context.beginPath();
        // Mini Pac-Man facing left matching Image 2
        context.arc(iconX, iconY, 9, 1.25 * Math.PI, 0.75 * Math.PI, false);
        context.lineTo(iconX, iconY);
        context.fill();
    }

    // Cherry icon at bottom right
    if (cherryImage && cherryImage.complete) {
        context.drawImage(cherryImage, boardWidth - 54, boardHeight - 32, 24, 24);
    }
}

// ==========================================
// 5. MOVEMENT, RESPONSIVENESS & CORNERING
// ==========================================
function move() {
    // 1. Process Pacman input buffer / cornering
    if (pacman.nextDirection) {
        tryTurnPacman(pacman.nextDirection);
    }

    // 2. Move Pacman
    pacman.x += pacman.velocityX;
    pacman.y += pacman.velocityY;

    // Wrap tunnel check for Pacman
    if (pacman.x < -tileSize / 2) {
        pacman.x = boardWidth - tileSize / 2;
    } else if (pacman.x > boardWidth - tileSize / 2) {
        pacman.x = -tileSize / 2;
    }

    // Check wall collision for Pacman
    let wallHit = false;
    for (let wall of walls.values()) {
        if (collision(pacman, wall)) {
            pacman.x -= pacman.velocityX;
            pacman.y -= pacman.velocityY;
            wallHit = true;
            break;
        }
    }

    pacman.isMoving = (!wallHit && (pacman.velocityX !== 0 || pacman.velocityY !== 0));
    if (pacman.isMoving) {
        pacmanAnimTick++;
    }

    // 3. Move & Check Ghosts
    for (let ghost of ghosts.values()) {
        ghost.update();

        // Check ghost collision with Pac-Man
        if (collision(ghost, pacman)) {
            if (ghost.isScared) {
                // Eat ghost
                score += 200;
                updateHighScore();
                retroAudio.playEatGhost();
                ghost.reset();
            } else {
                // Pac-Man death
                lives -= 1;
                retroAudio.playDeath();
                deathAnimation = true;
                deathTick = 0;
                pacman.isMoving = false;
                if (lives <= 0) {
                    gameOver = true;
                    updateHighScore();
                }
                return;
            }
        }
    }

    // 4. Food & Pellet Collision
    let foodEaten = null;
    for (let food of foods.values()) {
        if (collision(pacman, food)) {
            foodEaten = food;
            if (food.isPowerPellet) {
                score += 50;
                retroAudio.playPowerPellet();
                // Scare ghosts
                for (let g of ghosts.values()) {
                    g.makeScared(360); // ~6 seconds
                }
            } else {
                score += 10;
                retroAudio.playChomp();
                if (eatFoodAudio && eatFoodAudio.paused) {
                    eatFoodAudio.currentTime = 0;
                    eatFoodAudio.play().catch(() => {});
                }
            }

            updateHighScore();
            break;
        }
    }
    if (foodEaten) {
        foods.delete(foodEaten);
    }

    // Next Level
    if (foods.size === 0) {
        loadMap();
        resetPositions();
    }
}

function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem("pacman_high_score", highScore);
    }
}

// Responsive Cornering / Pre-turn helper
function tryTurnPacman(newDir) {
    const tolerance = 8; // cornering alignment tolerance in pixels

    if (newDir === 'U' || newDir === 'D') {
        const targetX = Math.round(pacman.x / tileSize) * tileSize;
        if (Math.abs(pacman.x - targetX) <= tolerance) {
            const testBlock = {
                x: targetX,
                y: pacman.y + (newDir === 'U' ? -PACMAN_SPEED : PACMAN_SPEED),
                width: pacman.width,
                height: pacman.height
            };
            if (!collidesWithAnyWall(testBlock)) {
                pacman.x = targetX;
                pacman.direction = newDir;
                pacman.updateVelocity();
                pacman.nextDirection = null;
                updatePacmanImage();
            }
        }
    } else if (newDir === 'L' || newDir === 'R') {
        const gridY = Math.round((pacman.y - mazeOffsetY) / tileSize) * tileSize + mazeOffsetY;
        if (Math.abs(pacman.y - gridY) <= tolerance) {
            const testBlock = {
                x: pacman.x + (newDir === 'L' ? -PACMAN_SPEED : PACMAN_SPEED),
                y: gridY,
                width: pacman.width,
                height: pacman.height
            };
            if (!collidesWithAnyWall(testBlock)) {
                pacman.y = gridY;
                pacman.direction = newDir;
                pacman.updateVelocity();
                pacman.nextDirection = null;
                updatePacmanImage();
            }
        }
    }
}

function collidesWithAnyWall(box) {
    for (let wall of walls.values()) {
        if (collision(box, wall)) return true;
    }
    return false;
}

function movePacman(e) {
    retroAudio.init();

    if (e.code.startsWith("Arrow")) {
        e.preventDefault();
    }

    if (gameOver) {
        loadMap();
        resetPositions();
        lives = 3;
        score = 0;
        gameOver = false;
        gameStarted = true;
        retroAudio.startGhostSiren();
        update();
        return;
    }

    if (!gameStarted) {
        gameStarted = true;
        if (ThemeSong && ThemeSong.paused) {
            ThemeSong.play().catch(() => {});
        }
        retroAudio.startGhostSiren();
    }

    let targetDir = null;
    if (e.code === "ArrowUp" || e.code === "KeyW") {
        targetDir = 'U';
    } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        targetDir = 'D';
    } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        targetDir = 'L';
    } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        targetDir = 'R';
    }

    if (!targetDir) return;

    // 180-degree instant reversal (immediate turn around when going straight)
    const isOpposite = (
        (targetDir === 'L' && pacman.direction === 'R') ||
        (targetDir === 'R' && pacman.direction === 'L') ||
        (targetDir === 'U' && pacman.direction === 'D') ||
        (targetDir === 'D' && pacman.direction === 'U')
    );

    if (isOpposite) {
        pacman.direction = targetDir;
        pacman.updateVelocity();
        pacman.nextDirection = null;
        updatePacmanImage();
        return;
    }

    // Buffer perpendicular turns for smooth cornering
    pacman.nextDirection = targetDir;
    tryTurnPacman(targetDir);
}

function updatePacmanImage() {
    if (pacman.direction == 'U') {
        pacman.image = pacmanUpImage;
    } else if (pacman.direction == 'D') {
        pacman.image = pacmanDownImage;
    } else if (pacman.direction == 'L') {
        pacman.image = pacmanLeftImage;
    } else if (pacman.direction == 'R') {
        pacman.image = pacmanRightImage;
    }
}

function collision(a, b) {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
}

function resetPositions() {
    pacman.reset();
    pacman.direction = 'R';
    pacman.nextDirection = null;
    pacman.isMoving = false;
    pacman.updateVelocity();
    updatePacmanImage();

    for (let ghost of ghosts.values()) {
        ghost.reset();
    }
}

// ==========================================
// 6. CORE BLOCK & SMART GHOST CLASSES
// ==========================================
class Block {
    constructor(image, x, y, width, height) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;

        this.startX = x;
        this.startY = y;

        this.direction = 'R';
        this.velocityX = 0;
        this.velocityY = 0;
    }

    updateDirection(direction) {
        this.direction = direction;
        this.updateVelocity();
    }

    updateVelocity() {
        if (this.direction == 'U') {
            this.velocityX = 0;
            this.velocityY = -PACMAN_SPEED;
        } else if (this.direction == 'D') {
            this.velocityX = 0;
            this.velocityY = PACMAN_SPEED;
        } else if (this.direction == 'L') {
            this.velocityX = -PACMAN_SPEED;
            this.velocityY = 0;
        } else if (this.direction == 'R') {
            this.velocityX = PACMAN_SPEED;
            this.velocityY = 0;
        }
    }

    reset() {
        this.x = this.startX;
        this.y = this.startY;
    }
}

class PacmanBlock extends Block {
    constructor(image, x, y, width, height) {
        super(image, x, y, width, height);
        this.nextDirection = null;
        this.isMoving = false;
        this.updateVelocity();
    }
}

class GhostBlock extends Block {
    constructor(image, x, y, width, height, ghostType) {
        super(image, x, y, width, height);
        this.baseImage = image;
        this.ghostType = ghostType; // 'red', 'pink', 'blue', 'orange'
        this.isScared = false;
        this.scaredTimer = 0;
        this.inPen = true;
        
        // Spawn delays for natural wave emergence
        if (ghostType === 'red') this.penTimer = 0;
        else if (ghostType === 'pink') this.penTimer = 60;
        else if (ghostType === 'blue') this.penTimer = 140;
        else if (ghostType === 'orange') this.penTimer = 220;
    }

    makeScared(duration) {
        this.isScared = true;
        this.scaredTimer = duration;
    }

    updateVelocityWithSpeed(spd) {
        if (this.direction === 'U') { this.velocityX = 0; this.velocityY = -spd; }
        else if (this.direction === 'D') { this.velocityX = 0; this.velocityY = spd; }
        else if (this.direction === 'L') { this.velocityX = -spd; this.velocityY = 0; }
        else if (this.direction === 'R') { this.velocityX = spd; this.velocityY = 0; }
    }

    update() {
        if (this.isScared) {
            this.scaredTimer--;
            if (this.scaredTimer <= 0) {
                this.isScared = false;
            }
        }

        const spd = this.isScared ? GHOST_SCARED_SPEED : GHOST_SPEED;

        // Exit house logic
        if (this.inPen) {
            this.penTimer--;
            if (this.penTimer <= 0) {
                const gateX = 9 * tileSize;
                const gateY = 8 * tileSize + mazeOffsetY;
                if (Math.abs(this.x - gateX) > 2) {
                    this.x += this.x < gateX ? spd : -spd;
                } else {
                    this.x = gateX;
                    this.y -= spd;
                    if (this.y <= gateY) {
                        this.y = gateY;
                        this.inPen = false;
                        this.direction = Math.random() < 0.5 ? 'L' : 'R';
                        this.updateVelocityWithSpeed(spd);
                    }
                }
            } else {
                // Bob gently inside pen
                if (this.y <= 9 * tileSize + mazeOffsetY - 4) this.velocityY = spd * 0.5;
                if (this.y >= 9 * tileSize + mazeOffsetY + 4) this.velocityY = -spd * 0.5;
                if (this.velocityY === 0) this.velocityY = spd * 0.5;
                this.y += this.velocityY;
            }
            return;
        }

        // Active chase movement with smart pathfinding
        this.updateVelocityWithSpeed(spd);
        this.x += this.velocityX;
        this.y += this.velocityY;

        // Wrap tunnel
        if (this.x < -tileSize / 2) {
            this.x = boardWidth - tileSize / 2;
        } else if (this.x > boardWidth - tileSize / 2) {
            this.x = -tileSize / 2;
        }

        // Decision point at grid intersections
        const col = Math.round(this.x / tileSize);
        const row = Math.round((this.y - mazeOffsetY) / tileSize);
        const tileCenterX = col * tileSize;
        const tileCenterY = row * tileSize + mazeOffsetY;

        const dist = Math.hypot(this.x - tileCenterX, this.y - tileCenterY);
        if (dist <= spd * 0.75) {
            this.x = tileCenterX;
            this.y = tileCenterY;

            const nextDir = this.chooseNextDirection(col, row);
            if (nextDir) {
                this.direction = nextDir;
                this.updateVelocityWithSpeed(spd);
            }
        }
    }

    chooseNextDirection(col, row) {
        const opposites = { 'U': 'D', 'D': 'U', 'L': 'R', 'R': 'L' };
        const deltas = {
            'U': { dc: 0, dr: -1 },
            'D': { dc: 0, dr: 1 },
            'L': { dc: -1, dr: 0 },
            'R': { dc: 1, dr: 0 }
        };

        const validDirs = [];
        for (let d of directions) {
            const nc = col + deltas[d].dc;
            const nr = row + deltas[d].dr;
            if (!isWall(nc, nr)) {
                validDirs.push(d);
            }
        }

        if (validDirs.length === 0) return this.direction;

        let nonReverseDirs = validDirs.filter(d => d !== opposites[this.direction]);
        if (nonReverseDirs.length === 0) {
            nonReverseDirs = validDirs;
        }

        const pacCol = Math.round(pacman.x / tileSize);
        const pacRow = Math.round((pacman.y - mazeOffsetY) / tileSize);

        // When scared: run away from Pac-Man
        if (this.isScared) {
            let bestDir = nonReverseDirs[0];
            let maxDist = -1;
            for (let d of nonReverseDirs) {
                const nc = col + deltas[d].dc;
                const nr = row + deltas[d].dr;
                const dist = (nc - pacCol)*(nc - pacCol) + (nr - pacRow)*(nr - pacRow);
                if (dist > maxDist) {
                    maxDist = dist;
                    bestDir = d;
                }
            }
            return bestDir;
        }

        // Personality target calculation
        let targetCol = pacCol;
        let targetRow = pacRow;

        if (this.ghostType === 'red') {
            // Blinky: aggressively chases Pacman directly
            targetCol = pacCol;
            targetRow = pacRow;
        } else if (this.ghostType === 'pink') {
            // Pinky: ambushes 4 tiles ahead of Pacman
            const pd = deltas[pacman.direction] || { dc: 0, dr: 0 };
            targetCol = pacCol + pd.dc * 4;
            targetRow = pacRow + pd.dr * 4;
        } else if (this.ghostType === 'blue') {
            // Inky: flanker
            const pd = deltas[pacman.direction] || { dc: 0, dr: 0 };
            targetCol = pacCol + pd.dc * 2;
            targetRow = pacRow + pd.dr * 2;
        } else if (this.ghostType === 'orange') {
            // Clyde: chases if far, retreats to corner if close
            const dToPac = Math.hypot(col - pacCol, row - pacRow);
            if (dToPac > 7) {
                targetCol = pacCol;
                targetRow = pacRow;
            } else {
                targetCol = 1;
                targetRow = rowCount - 2;
            }
        }

        // Pick direction minimizing distance to target
        let bestDir = nonReverseDirs[0];
        let minDist = Infinity;
        for (let d of nonReverseDirs) {
            const nc = col + deltas[d].dc;
            const nr = row + deltas[d].dr;
            const dist = (nc - targetCol)*(nc - targetCol) + (nr - targetRow)*(nr - targetRow);
            if (dist < minDist) {
                minDist = dist;
                bestDir = d;
            }
        }
        return bestDir;
    }

    draw(ctx) {
        let img = this.isScared ? scaredGhostImage : this.baseImage;
        if (img && img.complete) {
            ctx.drawImage(img, this.x, this.y, this.width, this.height);
        } else {
            ctx.drawImage(this.baseImage, this.x, this.y, this.width, this.height);
        }
    }

    reset() {
        super.reset();
        this.isScared = false;
        this.scaredTimer = 0;
        this.inPen = true;
        if (this.ghostType === 'red') this.penTimer = 0;
        else if (this.ghostType === 'pink') this.penTimer = 60;
        else if (this.ghostType === 'blue') this.penTimer = 140;
        else if (this.ghostType === 'orange') this.penTimer = 220;
    }
}