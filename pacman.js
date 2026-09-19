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

// Game state variables
let gameStarted = false;
let isIntroPlaying = false;
let isPaused = false;
let isMuted = false;
let gameOver = false;
let gameWon = false;
let winReason = "";
let deathAnimation = false;
let deathTick = 0;

// Scared ghost music & multiplier
let isScaredMusicPlaying = false;
let ghostStreak = 0;

// Cherry bonus & win condition tracking
let cherriesEaten = 0;
const cherryFruit = {
    x: 9 * tileSize,
    y: 11 * tileSize + mazeOffsetY,
    width: tileSize,
    height: tileSize,
    active: false,
    timer: 0
};
let floatingTexts = [];

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
    "O      XbpoX      O",
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
let ThemeSong;
let eatFoodAudio;
let ghostMoveAudio;
let pacmanDeathAudio;

let pacmanAnimTick = 0;
let mazeCanvas = null;

// ==========================================
// 1. AUDIO MANAGEMENT
// ==========================================
function startGhostMovementAudio() {
    if (isMuted || !gameStarted || isPaused || gameOver || deathAnimation || gameWon || isScaredMusicPlaying) return;
    if (ghostMoveAudio) {
        ghostMoveAudio.volume = 0.5;
        ghostMoveAudio.play().catch(() => { });
    }
    retroAudio.startGhostSiren();
}

function stopGhostMovementAudio() {
    if (ghostMoveAudio) {
        ghostMoveAudio.pause();
        ghostMoveAudio.currentTime = 0;
    }
    retroAudio.stopGhostSiren();
}

function startScaredAudio() {
    stopGhostMovementAudio();
    if (!isMuted) {
        retroAudio.startEnergizerMusic();
    }
}

function stopScaredAudio() {
    retroAudio.stopEnergizerMusic();
    if (gameStarted && !isPaused && !gameOver && !deathAnimation && !gameWon) {
        startGhostMovementAudio();
    }
}

function playDeathAudio() {
    stopGhostMovementAudio();
    stopScaredAudio();
    isScaredMusicPlaying = false;
    if (!isMuted && pacmanDeathAudio) {
        pacmanDeathAudio.currentTime = 0;
        pacmanDeathAudio.volume = 0.85;
        pacmanDeathAudio.play().catch(() => { });
    }
    if (!isMuted) {
        retroAudio.playDeath();
    }
}

// Toggle Pause / Resume
function togglePause() {
    if (gameOver || gameWon) return;
    isPaused = !isPaused;

    const pauseBtn = document.getElementById("pauseBtn");
    if (pauseBtn) {
        if (isPaused) {
            pauseBtn.textContent = "▶️ RESUME";
            pauseBtn.classList.add("active");
        } else {
            pauseBtn.textContent = "⏸️ PAUSE";
            pauseBtn.classList.remove("active");
        }
    }

    if (isPaused) {
        if (ThemeSong && !ThemeSong.paused) {
            ThemeSong.pause();
        }
        stopGhostMovementAudio();
        retroAudio.stopEnergizerMusic();
    } else {
        if (isIntroPlaying && ThemeSong && ThemeSong.paused) {
            ThemeSong.play().catch(() => { });
        } else if (isScaredMusicPlaying) {
            startScaredAudio();
        } else if (gameStarted) {
            startGhostMovementAudio();
        }
    }
}

// Toggle Mute / Unmute Sound
function toggleMute() {
    isMuted = !isMuted;
    const muteBtn = document.getElementById("muteBtn");
    if (muteBtn) {
        if (isMuted) {
            muteBtn.textContent = "🔇 SOUND: OFF";
            muteBtn.classList.add("active");
        } else {
            muteBtn.textContent = "🔊 SOUND: ON";
            muteBtn.classList.remove("active");
        }
    }

    if (ThemeSong) ThemeSong.muted = isMuted;
    if (eatFoodAudio) eatFoodAudio.muted = isMuted;
    if (ghostMoveAudio) ghostMoveAudio.muted = isMuted;
    if (pacmanDeathAudio) pacmanDeathAudio.muted = isMuted;

    if (isMuted) {
        retroAudio.stopGhostSiren();
        retroAudio.stopEnergizerMusic();
    } else {
        if (isScaredMusicPlaying) {
            retroAudio.startEnergizerMusic();
        } else if (gameStarted && !isPaused && !gameOver && !deathAnimation && !gameWon) {
            startGhostMovementAudio();
        }
    }
}

// ==========================================
// 2. RETRO AUDIO SYNTHESIZER (Web Audio API)
// ==========================================
class RetroAudio {
    constructor() {
        this.ctx = null;
        this.sirenOsc = null;
        this.sirenGain = null;
        this.sirenInterval = null;
        this.isSirenPlaying = false;

        this.energizerOsc = null;
        this.energizerGain = null;
        this.energizerInterval = null;
        this.isEnergizerPlaying = false;

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
        if (isMuted || !this.ctx || this.isSirenPlaying) return;
        try {
            this.isSirenPlaying = true;
            this.sirenOsc = this.ctx.createOscillator();
            this.sirenGain = this.ctx.createGain();
            this.sirenOsc.type = 'triangle';
            this.sirenGain.gain.setValueAtTime(0.06, this.ctx.currentTime);
            this.sirenOsc.connect(this.sirenGain);
            this.sirenGain.connect(this.ctx.destination);
            this.sirenOsc.start();

            let step = 0;
            this.sirenInterval = setInterval(() => {
                if (!this.ctx || !this.isSirenPlaying) return;
                step++;
                const freq = 190 + Math.sin(step * 0.35) * 45;
                this.sirenOsc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            }, 90);
        } catch (e) { }
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
            } catch (e) { }
            this.sirenOsc = null;
        }
    }

    startEnergizerMusic() {
        if (isMuted || !this.ctx || this.isEnergizerPlaying) return;
        try {
            this.stopGhostSiren();
            this.isEnergizerPlaying = true;
            this.energizerOsc = this.ctx.createOscillator();
            this.energizerGain = this.ctx.createGain();
            this.energizerOsc.type = 'sawtooth';
            this.energizerGain.gain.setValueAtTime(0.07, this.ctx.currentTime);
            this.energizerOsc.connect(this.energizerGain);
            this.energizerGain.connect(this.ctx.destination);
            this.energizerOsc.start();

            // Distinct pulsating dual-pulse arcade energizer loop
            let step = 0;
            const riff = [240, 340, 440, 340];
            this.energizerInterval = setInterval(() => {
                if (!this.ctx || !this.isEnergizerPlaying) return;
                step = (step + 1) % riff.length;
                this.energizerOsc.frequency.setValueAtTime(riff[step], this.ctx.currentTime);
            }, 105);
        } catch (e) { }
    }

    stopEnergizerMusic() {
        this.isEnergizerPlaying = false;
        if (this.energizerInterval) {
            clearInterval(this.energizerInterval);
            this.energizerInterval = null;
        }
        if (this.energizerOsc) {
            try {
                this.energizerOsc.stop();
                this.energizerOsc.disconnect();
            } catch (e) { }
            this.energizerOsc = null;
        }
    }

    playChomp() {
        if (isMuted || !this.ctx) return;
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
        } catch (e) { }
    }

    playEatGhost() {
        if (isMuted || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(1050, now + 0.28);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.28);
        } catch (e) { }
    }

    playGhostRetreat() {
        if (isMuted || !this.ctx) return;
        try {
            const now = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(360, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.35);
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.35);
        } catch (e) { }
    }

    playPowerPellet() {
        if (isMuted || !this.ctx) return;
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
        } catch (e) { }
    }

    playDeath() {
        if (isMuted || !this.ctx) return;
        try {
            this.stopGhostSiren();
            this.stopEnergizerMusic();
            const now = this.ctx.currentTime;
            const deathSteps = [
                { f: 680, d: 0.08 },
                { f: 620, d: 0.08 },
                { f: 570, d: 0.08 },
                { f: 520, d: 0.08 },
                { f: 480, d: 0.08 },
                { f: 440, d: 0.08 },
                { f: 400, d: 0.08 },
                { f: 360, d: 0.08 },
                { f: 320, d: 0.08 },
                { f: 280, d: 0.08 },
                { f: 240, d: 0.09 },
                { f: 200, d: 0.10 },
                { f: 160, d: 0.12 },
                { f: 105, d: 0.14 },
                { f: 60, d: 0.20 }
            ];
            let curTime = now;
            for (let step of deathSteps) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(step.f, curTime);
                osc.frequency.exponentialRampToValueAtTime(step.f * 0.72, curTime + step.d);
                gain.gain.setValueAtTime(0.16, curTime);
                gain.gain.exponentialRampToValueAtTime(0.001, curTime + step.d);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(curTime);
                osc.stop(curTime + step.d);
                curTime += step.d;
            }
        } catch (e) { }
    }
}

const retroAudio = new RetroAudio();

// Helper to check walls (row 9 tunnel openings are passable)
function isWall(c, r) {
    if (r === 9 && (c < 0 || c >= columnCount)) return false;
    if (r < 0 || r >= rowCount || c < 0 || c >= columnCount) return true;
    return tileMap[r][c] === 'X';
}

// Responsive resize helper to guarantee bottom is never cut off
function resizeBoard() {
    if (!board) return;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 56;
    const scale = Math.min(maxW / boardWidth, maxH / boardHeight, 1);
    board.style.width = Math.floor(boardWidth * scale) + "px";
    board.style.height = Math.floor(boardHeight * scale) + "px";
}
window.addEventListener("resize", resizeBoard);

// ==========================================
// 3. INITIALIZATION
// ==========================================
window.onload = function () {
    board = document.getElementById("board");
    board.height = boardHeight;
    board.width = boardWidth;
    context = board.getContext("2d");

    resizeBoard();

    loadImages();
    loadMap();

    ThemeSong = document.getElementById("gameAudio");
    eatFoodAudio = document.getElementById("eatFoodAudio");
    ghostMoveAudio = document.getElementById("ghostMoveAudio");
    pacmanDeathAudio = document.getElementById("pacmanDeathAudio");

    if (ghostMoveAudio) ghostMoveAudio.volume = 0.5;
    if (pacmanDeathAudio) pacmanDeathAudio.volume = 0.85;

    // Hook buttons
    const pauseBtn = document.getElementById("pauseBtn");
    if (pauseBtn) {
        pauseBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            togglePause();
        });
    }

    const muteBtn = document.getElementById("muteBtn");
    if (muteBtn) {
        muteBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleMute();
        });
    }

    // Board click can start intro or unpause
    board.addEventListener("click", function () {
        if (isPaused) {
            togglePause();
        } else if (!gameStarted && !isIntroPlaying) {
            startIntroGame();
        }
    });

    if (ThemeSong) {
        ThemeSong.addEventListener("ended", onIntroMusicEnded);
    }

    update();
    document.addEventListener("keydown", movePacman);
};

function startIntroGame() {
    if (gameStarted || isIntroPlaying) return;
    retroAudio.init();
    isIntroPlaying = true;

    if (ThemeSong) {
        ThemeSong.currentTime = 0;
        ThemeSong.muted = isMuted;
        const playPromise = ThemeSong.play();
        if (playPromise !== undefined) {
            playPromise.then(() => {
                // Intro music successfully started; movement unlocked only on 'ended'
            }).catch(() => {
                // Autoplay blocked: start game directly after 2s fallback
                setTimeout(onIntroMusicEnded, 2000);
            });
        }
    } else {
        setTimeout(onIntroMusicEnded, 2000);
    }
}

function onIntroMusicEnded() {
    isIntroPlaying = false;
    gameStarted = true;
    startGhostMovementAudio();
}

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

// Pre-render retro arcade double-blue walls matching arcade standard
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

    // Ghost house gate (pink bar)
    mctx.fillStyle = "#ffb8de";
    mctx.fillRect(8 * tileSize + 8, 8 * tileSize + mazeOffsetY + tileSize - 4, tileSize * 3 - 16, 4);
}

// ==========================================
// 4. MAIN GAME LOOP
// ==========================================
function update() {
    if (gameOver || gameWon) {
        draw();
        return;
    }
    requestAnimationFrame(update);

    // If paused, render paused frame and skip movement logic
    if (isPaused) {
        draw();
        return;
    }

    // Pac-man death animation sequence
    if (deathAnimation) {
        deathTick++;
        if (deathTick > 90) {
            deathAnimation = false;
            deathTick = 0;
            resetPositions();
            if (!gameOver && !gameWon) {
                startGhostMovementAudio();
            }
        }
        draw();
        return;
    }

    // Mobs and Pacman only move once start music finishes (gameStarted = true)
    if (gameStarted) {
        move();
    }
    draw();
}

// ==========================================
// 5. RENDERING & UI
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
                context.arc(food.x + food.width / 2, food.y + food.height / 2, 6.5, 0, Math.PI * 2);
                context.fill();
            }
        } else {
            context.fillStyle = "#ffb8ae";
            context.beginPath();
            context.arc(food.x + food.width / 2, food.y + food.height / 2, 2.5, 0, Math.PI * 2);
            context.fill();
        }
    }

    // 3. Draw Active Cherry Fruit in Center below Ghost Pen
    if (cherryFruit.active) {
        if (cherryImage && cherryImage.complete) {
            context.save();
            const pulse = 1 + Math.sin(now * 0.008) * 0.12;
            const cx = cherryFruit.x + cherryFruit.width / 2;
            const cy = cherryFruit.y + cherryFruit.height / 2;
            context.translate(cx, cy);
            context.scale(pulse, pulse);

            // Glow circle behind cherry
            context.fillStyle = "rgba(255, 0, 85, 0.25)";
            context.beginPath();
            context.arc(0, 0, 16, 0, Math.PI * 2);
            context.fill();

            context.drawImage(cherryImage, -14, -14, 28, 28);
            context.restore();
        }
    }

    // 4. Draw Pac-Man with Animations
    drawPacman();

    // 5. Draw Ghosts (including spirit pull-back animation)
    for (let ghost of ghosts.values()) {
        ghost.draw(context);
    }

    // 6. Floating Score Texts (+100, +200, +400, +800, +1600)
    for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i];
        context.save();
        context.globalAlpha = ft.alpha;
        context.fillStyle = ft.color || "#00ffff";
        context.font = '11px "Press Start 2P", monospace';
        context.textAlign = "center";
        context.shadowColor = ft.color || "#00ffff";
        context.shadowBlur = 8;
        context.fillText(ft.text, ft.x, ft.y);
        context.restore();

        ft.y -= 0.65;
        ft.life--;
        ft.alpha = ft.life / 60;
        if (ft.life <= 0) {
            floatingTexts.splice(i, 1);
        }
    }

    // 7. Retro Header (1UP & HIGH SCORE)
    context.font = '14px "Press Start 2P", monospace';
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.fillText("1UP", 36, 20);
    context.fillText(String(score).padStart(2, ' '), 36, 38);

    context.textAlign = "center";
    context.fillText("HIGH SCORE", boardWidth / 2, 20);
    context.fillText(String(Math.max(highScore, score)), boardWidth / 2, 38);

    // 8. Bottom Footer (Lives & Cherry Fruits Status)
    drawLivesAndFruit();

    // 9. Overlays: "READY!", "PAUSED", "GAME OVER", "YOU WIN!"
    context.textAlign = "center";
    if (!gameStarted && !gameOver && !gameWon) {
        context.fillStyle = "#ffff00";
        context.font = '16px "Press Start 2P", monospace';
        context.fillText("READY!", boardWidth / 2, 11 * tileSize + mazeOffsetY + 16);
    }

    // PAUSED OVERLAY
    if (isPaused) {
        context.save();
        context.fillStyle = "rgba(0, 0, 0, 0.72)";
        context.fillRect(0, 0, boardWidth, boardHeight);

        context.font = '28px "Press Start 2P", monospace';
        context.fillStyle = "#ffff00";
        context.shadowColor = "#ff0055";
        context.shadowBlur = 18;
        context.fillText("PAUSED", boardWidth / 2, boardHeight / 2 - 12);

        context.shadowBlur = 0;
        context.font = '10px "Press Start 2P", monospace';
        context.fillStyle = "#00ffff";
        context.fillText("CLICK OR PRESS 'P' TO RESUME", boardWidth / 2, boardHeight / 2 + 28);
        context.restore();
    }

    // GAME OVER OVERLAY
    if (gameOver) {
        context.save();
        context.fillStyle = "rgba(0, 0, 0, 0.75)";
        context.fillRect(0, 0, boardWidth, boardHeight);

        context.fillStyle = "#ff0000";
        context.font = '20px "Press Start 2P", monospace';
        context.shadowColor = "#ff0000";
        context.shadowBlur = 15;
        context.fillText("GAME OVER", boardWidth / 2, boardHeight / 2 - 20);

        context.shadowBlur = 0;
        context.fillStyle = "#ffffff";
        context.font = '10px "Press Start 2P", monospace';
        context.fillText("SCORE: " + score, boardWidth / 2, boardHeight / 2 + 15);
        context.fillStyle = "#ffff00";
        context.fillText("PRESS ANY KEY TO RESTART", boardWidth / 2, boardHeight / 2 + 45);
        context.restore();
    }

    // VICTORY OVERLAY
    if (gameWon) {
        context.save();
        context.fillStyle = "rgba(0, 0, 0, 0.82)";
        context.fillRect(0, 0, boardWidth, boardHeight);

        context.fillStyle = "#00ff66";
        context.font = '24px "Press Start 2P", monospace';
        context.shadowColor = "#00ff66";
        context.shadowBlur = 20;
        context.fillText("YOU WIN!", boardWidth / 2, boardHeight / 2 - 35);

        context.shadowBlur = 0;
        context.fillStyle = "#ff0055";
        context.font = '11px "Press Start 2P", monospace';
        context.fillText(winReason, boardWidth / 2, boardHeight / 2);

        context.fillStyle = "#ffffff";
        context.font = '12px "Press Start 2P", monospace';
        context.fillText("FINAL SCORE: " + score, boardWidth / 2, boardHeight / 2 + 35);

        context.fillStyle = "#ffff00";
        context.font = '10px "Press Start 2P", monospace';
        context.fillText("PRESS ANY KEY TO PLAY AGAIN", boardWidth / 2, boardHeight / 2 + 70);
        context.restore();
    }
}

// Draw Pacman using animations.gif rotated in direction
function drawPacman() {
    if (!pacman) return;

    if (deathAnimation) {
        context.save();
        context.translate(pacman.x + pacman.width / 2, pacman.y + pacman.height / 2);
        const progress = Math.min(1, deathTick / 80);
        context.rotate(deathTick * 0.22);
        const scale = Math.max(0.05, 1 - progress);
        context.scale(scale, scale);
        context.drawImage(pacmanRightImage, -pacman.width / 2, -pacman.height / 2, pacman.width, pacman.height);
        context.restore();
        return;
    }

    context.save();
    const cx = pacman.x + pacman.width / 2;
    const cy = pacman.y + pacman.height / 2;
    context.translate(cx, cy);

    // Sprite in animations.gif faces RIGHT (0 deg)
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

// Draw ghost returning eyes looking towards return target
function drawGhostEyes(ctx, x, y, width, height, dx, dy) {
    const angle = Math.atan2(dy, dx);
    const pupilOffsetDist = 3;
    const pupilOffsetX = Math.cos(angle) * pupilOffsetDist;
    const pupilOffsetY = Math.sin(angle) * pupilOffsetDist;

    const eye1X = x + width * 0.32;
    const eye1Y = y + height * 0.45;
    const eye2X = x + width * 0.68;
    const eye2Y = y + height * 0.45;
    const eyeRadius = 5;
    const pupilRadius = 2.4;

    ctx.save();
    // Ghostly cyan aura circle
    ctx.fillStyle = "rgba(0, 255, 255, 0.16)";
    ctx.beginPath();
    ctx.arc(x + width / 2, y + height / 2, 15, 0, Math.PI * 2);
    ctx.fill();

    // Sclera (white)
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(eye1X, eye1Y, eyeRadius, 0, Math.PI * 2);
    ctx.arc(eye2X, eye2Y, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Pupils (dark blue)
    ctx.fillStyle = "#1111ee";
    ctx.beginPath();
    ctx.arc(eye1X + pupilOffsetX, eye1Y + pupilOffsetY, pupilRadius, 0, Math.PI * 2);
    ctx.arc(eye2X + pupilOffsetX, eye2Y + pupilOffsetY, pupilRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

// Draw extra lives icons & 3 cherry progress slots at bottom
function drawLivesAndFruit() {
    const iconY = boardHeight - 20;

    // Remaining extra lives
    const extraLives = Math.max(0, lives - 1);
    for (let i = 0; i < extraLives; i++) {
        const iconX = 36 + i * 26;
        context.fillStyle = "#ffff00";
        context.beginPath();
        context.arc(iconX, iconY, 9, 1.25 * Math.PI, 0.75 * Math.PI, false);
        context.lineTo(iconX, iconY);
        context.fill();
    }

    // 3 Cherry Progress Slots at bottom right
    const cherryStartX = boardWidth - 100;
    for (let i = 0; i < 3; i++) {
        const cx = cherryStartX + i * 28;
        if (cherryImage && cherryImage.complete) {
            if (i < cherriesEaten) {
                // Eaten cherry: fully visible and vibrant
                context.drawImage(cherryImage, cx, boardHeight - 32, 24, 24);
            } else {
                // Slot waiting for cherry: translucent silhouette
                context.save();
                context.globalAlpha = 0.22;
                context.drawImage(cherryImage, cx, boardHeight - 32, 24, 24);
                context.restore();
            }
        }
    }
}

// ==========================================
// 6. MOVEMENT, RESPONSIVENESS & WRAP TUNNEL
// ==========================================
function move() {
    // 1. Process Pacman input buffer / cornering
    if (pacman.nextDirection) {
        tryTurnPacman(pacman.nextDirection);
    }

    // 2. Move Pacman
    pacman.x += pacman.velocityX;
    pacman.y += pacman.velocityY;

    // Wrap tunnel on Row 9 (col 0 <-> col 18)
    const tunnelY = 9 * tileSize + mazeOffsetY;
    const isAtTunnelRow = Math.abs(pacman.y - tunnelY) < tileSize / 2;

    if (isAtTunnelRow) {
        // Entering left hole moving left -> appear at right hole and continue moving left into map
        if (pacman.x <= -tileSize) {
            pacman.x = boardWidth;
            pacman.y = tunnelY;
            pacman.direction = 'L';
            pacman.updateVelocity();
            updatePacmanImage();
        }
        // Entering right hole moving right -> appear at left hole and continue moving right into map
        else if (pacman.x >= boardWidth) {
            pacman.x = -tileSize;
            pacman.y = tunnelY;
            pacman.direction = 'R';
            pacman.updateVelocity();
            updatePacmanImage();
        }
    }

    // Check wall collision for Pacman (bypass check if Pacman is passing outside tunnel borders)
    let wallHit = false;
    const inTunnelPassage = isAtTunnelRow && (pacman.x < 0 || pacman.x + pacman.width > boardWidth);
    if (!inTunnelPassage) {
        for (let wall of walls.values()) {
            if (collision(pacman, wall)) {
                pacman.x -= pacman.velocityX;
                pacman.y -= pacman.velocityY;
                wallHit = true;
                break;
            }
        }
    }

    pacman.isMoving = (!wallHit && (pacman.velocityX !== 0 || pacman.velocityY !== 0));
    if (pacman.isMoving) {
        pacmanAnimTick++;
    }

    // 3. Move & Check Ghosts
    for (let ghost of ghosts.values()) {
        ghost.update();

        // If ghost is returning, it cannot hurt Pac-Man and cannot be eaten again
        if (ghost.isReturning) {
            continue;
        }

        // Check ghost collision with Pac-Man (only when physically touching in the same tile)
        if (isGhostCollidingWithPacman(ghost, pacman)) {
            if (ghost.isScared) {
                // Eat ghost: progressive point multiplier (200, 400, 800, 1600)
                ghostStreak++;
                const pointValues = [200, 400, 800, 1600];
                const pointsEarned = pointValues[Math.min(ghostStreak - 1, 3)] || 1600;
                score += pointsEarned;
                updateHighScore();
                retroAudio.playEatGhost();
                retroAudio.playGhostRetreat();

                // Floating score popup (+200, +400, +800, +1600)
                floatingTexts.push({
                    text: "+" + pointsEarned,
                    x: ghost.x + tileSize / 2,
                    y: ghost.y,
                    alpha: 1.0,
                    life: 60,
                    color: "#ffff00"
                });

                // Ghost starts animated pull back to spawn pen
                ghost.eat();
            } else {
                // Pac-Man death
                lives -= 1;
                playDeathAudio();
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

    // Check if any ghosts are still scared. If all returned to normal, revert energizer music!
    const anyScared = Array.from(ghosts.values()).some(g => g.isScared && !g.isReturning);
    if (isScaredMusicPlaying && !anyScared) {
        isScaredMusicPlaying = false;
        stopScaredAudio();
    }

    // 4. Food & Pellet Collision
    let foodEaten = null;
    for (let food of foods.values()) {
        if (collision(pacman, food)) {
            foodEaten = food;
            if (food.isPowerPellet) {
                score += 50;
                retroAudio.playPowerPellet();

                // Reset ghost streak for 200, 400, 800, 1600 bonus chaining
                ghostStreak = 0;

                // Start Scared / Energizer music!
                isScaredMusicPlaying = true;
                startScaredAudio();

                // Spawn Cherry Fruit in Center below Ghost Pen
                cherryFruit.active = true;
                cherryFruit.x = 9 * tileSize;
                cherryFruit.y = 11 * tileSize + mazeOffsetY;
                cherryFruit.timer = 900; // ~15s active

                // Scare all active ghosts
                for (let g of ghosts.values()) {
                    g.makeScared(360); // ~6 seconds
                }
            } else {
                score += 10;
                retroAudio.playChomp();
                if (!isMuted && eatFoodAudio && eatFoodAudio.paused) {
                    eatFoodAudio.currentTime = 0;
                    eatFoodAudio.play().catch(() => { });
                }
            }

            updateHighScore();
            break;
        }
    }
    if (foodEaten) {
        foods.delete(foodEaten);
    }

    // 5. Cherry Fruit Collision & Timeout
    if (cherryFruit.active) {
        cherryFruit.timer--;
        if (cherryFruit.timer <= 0) {
            cherryFruit.active = false;
        } else if (collision(pacman, cherryFruit)) {
            cherryFruit.active = false;
            cherriesEaten++;
            score += 100;
            updateHighScore();
            retroAudio.playEatGhost();

            floatingTexts.push({
                text: "+100",
                x: cherryFruit.x + tileSize / 2,
                y: cherryFruit.y,
                alpha: 1.0,
                life: 60,
                color: "#ff0055"
            });

            // Win condition 1: Ate 3 cherries
            if (cherriesEaten >= 3) {
                triggerVictory("3 CHERRIES COLLECTED!");
                return;
            }
        }
    }

    // Win condition 2: All pellets on map cleared
    if (foods.size === 0) {
        triggerVictory("ALL PELLETS CLEARED!");
        return;
    }
}

function triggerVictory(reason) {
    gameWon = true;
    winReason = reason;
    stopGhostMovementAudio();
    stopScaredAudio();
    isScaredMusicPlaying = false;
    updateHighScore();
    retroAudio.playPowerPellet();
}

function updateHighScore() {
    if (score > highScore) {
        highScore = score;
        localStorage.setItem("pacman_high_score", highScore);
    }
}

// Responsive Cornering / Pre-turn helper
function tryTurnPacman(newDir) {
    const tolerance = 8;

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

function restartGame() {
    loadMap();
    resetPositions();
    lives = 3;
    score = 0;
    cherriesEaten = 0;
    cherryFruit.active = false;
    gameOver = false;
    gameWon = false;
    isPaused = false;
    isIntroPlaying = false;
    isScaredMusicPlaying = false;
    ghostStreak = 0;
    gameStarted = false;
    stopScaredAudio();
    startIntroGame();
    update();
}

function movePacman(e) {
    retroAudio.init();

    // Pause toggle via key 'P' or 'Space'
    if (e.code === "KeyP" || (e.code === "Space" && gameStarted && !gameOver && !gameWon)) {
        e.preventDefault();
        togglePause();
        return;
    }

    // Mute toggle via key 'M'
    if (e.code === "KeyM") {
        e.preventDefault();
        toggleMute();
        return;
    }

    if (e.code.startsWith("Arrow")) {
        e.preventDefault();
    }

    if (gameOver || gameWon) {
        restartGame();
        return;
    }

    if (isPaused) {
        return;
    }

    // Before game starts or during intro music: start music on first press & buffer direction
    if (!gameStarted) {
        if (!isIntroPlaying) {
            startIntroGame();
        }
        let targetDir = null;
        if (e.code === "ArrowUp" || e.code === "KeyW") targetDir = 'U';
        else if (e.code === "ArrowDown" || e.code === "KeyS") targetDir = 'D';
        else if (e.code === "ArrowLeft" || e.code === "KeyA") targetDir = 'L';
        else if (e.code === "ArrowRight" || e.code === "KeyD") targetDir = 'R';
        if (targetDir) {
            pacman.nextDirection = targetDir;
        }
        return; // Movement remains locked until intro music completes
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

// Accurate ghost hitbox: only collide when bodies physically touch in the same tile (eliminates 9-tile / diagonal bug)
function isGhostCollidingWithPacman(ghost, pacman) {
    const pCenterX = pacman.x + pacman.width / 2;
    const pCenterY = pacman.y + pacman.height / 2;
    const gCenterX = ghost.x + ghost.width / 2;
    const gCenterY = ghost.y + ghost.height / 2;

    const dist = Math.hypot(pCenterX - gCenterX, pCenterY - gCenterY);
    // With tileSize = 32, centers must be within 16px (sharing the same tile and visibly touching)
    return dist < tileSize * 0.52; // ~16.6px
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
// 7. CORE BLOCK & SMART GHOST CLASSES
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

        // Spirit pull-back animation state
        this.isReturning = false;
        this.returnTargetX = x;
        this.returnTargetY = y;
        this.returnTrail = [];

        // Spawn delays for natural wave emergence
        if (ghostType === 'red') this.penTimer = 0;
        else if (ghostType === 'pink') this.penTimer = 60;
        else if (ghostType === 'blue') this.penTimer = 140;
        else if (ghostType === 'orange') this.penTimer = 220;
    }

    makeScared(duration) {
        if (this.isReturning) return; // Don't scare if already returning to pen
        this.isScared = true;
        this.scaredTimer = duration;
    }

    eat() {
        this.isScared = false;
        this.scaredTimer = 0;
        this.isReturning = true;
        this.returnTargetX = this.startX;
        this.returnTargetY = this.startY;
        this.returnTrail = [];
    }

    updateVelocityWithSpeed(spd) {
        if (this.direction === 'U') { this.velocityX = 0; this.velocityY = -spd; }
        else if (this.direction === 'D') { this.velocityX = 0; this.velocityY = spd; }
        else if (this.direction === 'L') { this.velocityX = -spd; this.velocityY = 0; }
        else if (this.direction === 'R') { this.velocityX = spd; this.velocityY = 0; }
    }

    update() {
        // 1. Spirit pull-back animation to spawn point
        if (this.isReturning) {
            const dx = this.returnTargetX - this.x;
            const dy = this.returnTargetY - this.y;
            const dist = Math.hypot(dx, dy);
            const pullSpeed = 5.6;

            // Record trail
            this.returnTrail.unshift({ x: this.x + this.width / 2, y: this.y + this.height / 2 });
            if (this.returnTrail.length > 8) this.returnTrail.pop();

            if (dist <= pullSpeed) {
                this.x = this.returnTargetX;
                this.y = this.returnTargetY;
                this.isReturning = false;
                this.inPen = true;
                this.penTimer = 90; // Stays 1.5s in pen before re-emerging
                this.returnTrail = [];
            } else {
                this.x += (dx / dist) * pullSpeed;
                this.y += (dy / dist) * pullSpeed;
            }
            return;
        }

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
                const gateY = 7 * tileSize + mazeOffsetY;
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

        // Wrap tunnel on Row 9
        const tunnelY = 9 * tileSize + mazeOffsetY;
        const isAtTunnelRow = Math.abs(this.y - tunnelY) < tileSize / 2;
        if (isAtTunnelRow) {
            if (this.x <= -this.width) {
                this.x = boardWidth;
                this.y = tunnelY;
                this.direction = 'L';
                this.updateVelocityWithSpeed(spd);
            } else if (this.x >= boardWidth) {
                this.x = -this.width;
                this.y = tunnelY;
                this.direction = 'R';
                this.updateVelocityWithSpeed(spd);
            }
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
                const dist = (nc - pacCol) * (nc - pacCol) + (nr - pacRow) * (nr - pacRow);
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
            const dist = (nc - targetCol) * (nc - targetCol) + (nr - targetRow) * (nr - targetRow);
            if (dist < minDist) {
                minDist = dist;
                bestDir = d;
            }
        }
        return bestDir;
    }

    draw(ctx) {
        // Spirit pull-back animation
        if (this.isReturning) {
            ctx.save();
            // Motion streaks / pull trail
            if (this.returnTrail.length > 1) {
                ctx.beginPath();
                ctx.moveTo(this.returnTrail[0].x, this.returnTrail[0].y);
                for (let i = 1; i < this.returnTrail.length; i++) {
                    ctx.lineTo(this.returnTrail[i].x, this.returnTrail[i].y);
                }
                ctx.strokeStyle = "rgba(0, 255, 255, 0.45)";
                ctx.lineWidth = 3;
                ctx.lineCap = "round";
                ctx.stroke();

                // Dashed guide beam straight to spawn
                ctx.beginPath();
                ctx.moveTo(this.x + this.width / 2, this.y + this.height / 2);
                ctx.lineTo(this.returnTargetX + this.width / 2, this.returnTargetY + this.height / 2);
                ctx.strokeStyle = "rgba(255, 255, 255, 0.22)";
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.stroke();
            }

            // Draw eyes looking towards target
            drawGhostEyes(ctx, this.x, this.y, this.width, this.height, this.returnTargetX - this.x, this.returnTargetY - this.y);
            ctx.restore();
            return;
        }

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
        this.isReturning = false;
        this.returnTrail = [];
        this.inPen = true;
        if (this.ghostType === 'red') this.penTimer = 0;
        else if (this.ghostType === 'pink') this.penTimer = 60;
        else if (this.ghostType === 'blue') this.penTimer = 140;
        else if (this.ghostType === 'orange') this.penTimer = 220;
    }
}
