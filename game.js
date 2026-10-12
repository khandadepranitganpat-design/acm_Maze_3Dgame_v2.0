/**
 * ACM Maze Game - Main Game Controller & Canvas Renderer
 */
class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.sound = new SoundManager();

        // Maze settings (25x25 medium difficulty)
        this.mazeSize = 25;
        this.maze = new Maze(this.mazeSize, this.mazeSize);

        // Player state
        this.player = {
            gridX: this.maze.startPos.x,
            gridY: this.maze.startPos.y,
            drawX: this.maze.startPos.x,
            drawY: this.maze.startPos.y,
            targetX: this.maze.startPos.x,
            targetY: this.maze.startPos.y,
            radius: 0.38,
            pulse: 0,
            trail: [] // Array of recent positions for glowing trail
        };

        // Game stats
        this.steps = 0;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.timerInterval = null;
        this.isGameOver = false;
        this.collectedSequence = []; // tracks random collection order e.g. ['M', 'A', 'C']

        // Visual effects
        this.particles = [];
        this.floatingText = [];
        this.ambientParticles = [];

        // Camera / Viewport
        this.cellSize = 32;
        this.camera = { x: 0, y: 0 };

        // Input handling
        this.keys = {};
        this.moveQueue = null;
        this.lastMoveTime = 0;
        this.moveCooldown = 130; // ms between grid steps for responsive feel

        this.init();
    }

    init() {
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Keyboard inputs
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));
        window.addEventListener('keyup', (e) => this.handleKeyUp(e));

        // Touch / Click on D-pad
        this.bindTouchControls();

        // UI buttons
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) restartBtn.addEventListener('click', () => this.resetGame());

        const playAgainBtn = document.getElementById('playAgainBtn');
        if (playAgainBtn) playAgainBtn.addEventListener('click', () => this.resetGame());

        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                this.sound.init();
                this.sound.enabled = !this.sound.enabled;
                soundBtn.textContent = this.sound.enabled ? '🔊 Audio: On' : '🔇 Audio: Off';
                soundBtn.classList.toggle('muted', !this.sound.enabled);
            });
        }

        // Initialize ambient particles
        for (let i = 0; i < 40; i++) {
            this.ambientParticles.push({
                x: Math.random() * (this.maze.cols * this.cellSize),
                y: Math.random() * (this.maze.rows * this.cellSize),
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.3,
                alpha: Math.random() * 0.5 + 0.1,
                size: Math.random() * 2 + 1
            });
        }

        this.startTimer();
        this.updateHUD();

        // Start render loop
        requestAnimationFrame((timestamp) => this.loop(timestamp));
    }

    resizeCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        const displayWidth = Math.min(rect.width, window.innerWidth - 30);
        const displayHeight = Math.min(rect.height || 600, window.innerHeight - 220);

        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;
        this.canvas.style.width = `${displayWidth}px`;
        this.canvas.style.height = `${displayHeight}px`;

        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // reset scale
        this.ctx.scale(dpr, dpr);

        // Optimal cell size based on screen
        const minCell = Math.max(22, Math.min(36, Math.floor(Math.min(displayWidth, displayHeight) / 22)));
        this.cellSize = minCell;
    }

    resetGame() {
        this.maze = new Maze(this.mazeSize, this.mazeSize);
        this.player.gridX = this.maze.startPos.x;
        this.player.gridY = this.maze.startPos.y;
        this.player.drawX = this.maze.startPos.x;
        this.player.drawY = this.maze.startPos.y;
        this.player.targetX = this.maze.startPos.x;
        this.player.targetY = this.maze.startPos.y;
        this.player.trail = [];

        this.steps = 0;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.isGameOver = false;
        this.collectedSequence = [];
        this.particles = [];
        this.floatingText = [];

        // Hide win modal
        const modal = document.getElementById('victoryModal');
        if (modal) modal.classList.remove('active');

        this.startTimer();
        this.updateHUD();
        this.notify("Explore the dark maze to uncover hidden letters A, C, M!");
    }

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            if (!this.isGameOver) {
                this.elapsedSeconds = Math.floor((Date.now() - this.startTime) / 1000);
                const timerEl = document.getElementById('timerVal');
                if (timerEl) {
                    const mins = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
                    const secs = String(this.elapsedSeconds % 60).padStart(2, '0');
                    timerEl.textContent = `${mins}:${secs}`;
                }
            }
        }, 1000);
    }

    handleKeyDown(e) {
        this.sound.init();
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            e.preventDefault();
        }
        this.keys[e.code] = true;
    }

    handleKeyUp(e) {
        this.keys[e.code] = false;
    }

    bindTouchControls() {
        const bindButton = (id, dx, dy) => {
            const btn = document.getElementById(id);
            if (!btn) return;
            const trigger = (e) => {
                e.preventDefault();
                this.sound.init();
                this.attemptMove(dx, dy);
            };
            btn.addEventListener('touchstart', trigger, { passive: false });
            btn.addEventListener('mousedown', trigger);
        };

        bindButton('btnUp', 0, -1);
        bindButton('btnDown', 0, 1);
        bindButton('btnLeft', -1, 0);
        bindButton('btnRight', 1, 0);

        // Touch swipe support on canvas
        let touchStartX = 0;
        let touchStartY = 0;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length > 0) {
                touchStartX = e.touches[0].clientX;
                touchStartY = e.touches[0].clientY;
                this.sound.init();
            }
        }, { passive: true });

        this.canvas.addEventListener('touchend', (e) => {
            if (e.changedTouches.length > 0) {
                const diffX = e.changedTouches[0].clientX - touchStartX;
                const diffY = e.changedTouches[0].clientY - touchStartY;
                const absX = Math.abs(diffX);
                const absY = Math.abs(diffY);

                if (Math.max(absX, absY) > 24) {
                    if (absX > absY) {
                        this.attemptMove(diffX > 0 ? 1 : -1, 0);
                    } else {
                        this.attemptMove(0, diffY > 0 ? 1 : -1);
                    }
                }
            }
        }, { passive: true });
    }

    processInput(now) {
        if (this.isGameOver) return;
        if (now - this.lastMoveTime < this.moveCooldown) return;

        let dx = 0;
        let dy = 0;

        if (this.keys['ArrowUp'] || this.keys['KeyW']) dy = -1;
        else if (this.keys['ArrowDown'] || this.keys['KeyS']) dy = 1;
        else if (this.keys['ArrowLeft'] || this.keys['KeyA']) dx = -1;
        else if (this.keys['ArrowRight'] || this.keys['KeyD']) dx = 1;

        if (dx !== 0 || dy !== 0) {
            this.attemptMove(dx, dy);
            this.lastMoveTime = now;
        }
    }

    attemptMove(dx, dy) {
        if (this.isGameOver) return;

        const nextX = this.player.gridX + dx;
        const nextY = this.player.gridY + dy;

        if (this.maze.isWall(nextX, nextY)) {
            this.sound.playBump();
            // Create minor spark on wall bump
            this.spawnWallBumpSparks(this.player.gridX + dx * 0.45, this.player.gridY + dy * 0.45);
            return;
        }

        // Valid move to next path tile
        this.player.gridX = nextX;
        this.player.gridY = nextY;
        this.player.targetX = nextX;
        this.player.targetY = nextY;
        this.steps++;

        // Add trail point
        this.player.trail.push({ x: nextX, y: nextY, alpha: 1.0 });
        if (this.player.trail.length > 18) this.player.trail.shift();

        // Mark path as traveled: Path renders only when travelled
        this.maze.markTraveled(nextX, nextY);

        // Also subtly reveal immediate adjacent step for natural visibility
        const adjs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
        for (const [ax, ay] of adjs) {
            const adjX = nextX + ax;
            const adjY = nextY + ay;
            if (!this.maze.isWall(adjX, adjY)) {
                this.maze.markTraveled(adjX, adjY);
            }
        }

        this.sound.playStep();

        // Check if letter reached
        const foundLetter = this.maze.checkLetterAt(nextX, nextY);
        if (foundLetter) {
            this.handleLetterFound(foundLetter);
        }

        this.updateHUD();
    }

    handleLetterFound(letter) {
        this.collectedSequence.push(letter.id);
        this.sound.playLetterCollect(letter.id);

        // Particle explosion effect
        this.spawnLetterCollectionParticles(letter.x, letter.y, letter.id);

        // Floating popup notification
        this.floatingText.push({
            text: `★ Discovered '${letter.id}'!`,
            x: letter.x,
            y: letter.y,
            life: 1.0,
            vy: -0.04
        });

        this.notify(`Spelling ACM: Discovered letter '${letter.id}'! (${this.collectedSequence.length}/3)`);

        // Check victory condition: all letters (A, C, M) gathered in any random sequence
        if (this.maze.isComplete()) {
            this.triggerVictory();
        }
    }

    triggerVictory() {
        this.isGameOver = true;
        clearInterval(this.timerInterval);
        this.sound.playVictory();

        if (typeof this.onSpellComplete === 'function') {
            setTimeout(() => {
                this.onSpellComplete({
                    seconds: this.elapsedSeconds,
                    steps: this.steps,
                    sequence: this.collectedSequence
                });
            }, 500);
            return;
        }

        setTimeout(() => {
            const modal = document.getElementById('victoryModal');
            const seqEl = document.getElementById('modalSequence');
            const timeEl = document.getElementById('modalTime');
            const stepsEl = document.getElementById('modalSteps');

            if (seqEl) seqEl.textContent = this.collectedSequence.join(' ➔ ');
            if (timeEl) {
                const mins = String(Math.floor(this.elapsedSeconds / 60)).padStart(2, '0');
                const secs = String(this.elapsedSeconds % 60).padStart(2, '0');
                timeEl.textContent = `${mins}:${secs}`;
            }
            if (stepsEl) stepsEl.textContent = this.steps;
            if (modal) modal.classList.add('active');
        }, 600);
    }

    spawnLetterCollectionParticles(x, y, char) {
        const colors = {
            'A': '#ffb703',
            'C': '#00f5d4',
            'M': '#ff006e'
        };
        const color = colors[char] || '#fb8500';

        for (let i = 0; i < 45; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 2.8 + 0.8;
            this.particles.push({
                x: (x + 0.5) * this.cellSize,
                y: (y + 0.5) * this.cellSize,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                color: color,
                size: Math.random() * 5 + 2,
                life: 1.0,
                decay: Math.random() * 0.02 + 0.015
            });
        }
    }

    spawnWallBumpSparks(gx, gy) {
        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            this.particles.push({
                x: (gx + 0.5) * this.cellSize,
                y: (gy + 0.5) * this.cellSize,
                vx: Math.cos(angle) * 1.2,
                vy: Math.sin(angle) * 1.2,
                color: '#64dfdf',
                size: 2,
                life: 0.6,
                decay: 0.05
            });
        }
    }

    notify(message) {
        const banner = document.getElementById('statusBanner');
        if (banner) {
            banner.textContent = message;
            banner.classList.remove('pulse');
            void banner.offsetWidth; // retrigger animation
            banner.classList.add('pulse');
        }
    }

    updateHUD() {
        const stepsEl = document.getElementById('stepVal');
        if (stepsEl) stepsEl.textContent = this.steps;

        // Update badge states for A, C, M
        const badgeA = document.getElementById('badgeA');
        const badgeC = document.getElementById('badgeC');
        const badgeM = document.getElementById('badgeM');

        const collectedA = this.collectedSequence.includes('A');
        const collectedC = this.collectedSequence.includes('C');
        const collectedM = this.collectedSequence.includes('M');

        if (badgeA) badgeA.classList.toggle('collected', collectedA);
        if (badgeC) badgeC.classList.toggle('collected', collectedC);
        if (badgeM) badgeM.classList.toggle('collected', collectedM);

        const orderEl = document.getElementById('orderVal');
        if (orderEl) {
            if (this.collectedSequence.length === 0) {
                orderEl.textContent = "None yet (Any sequence allowed)";
            } else {
                orderEl.textContent = this.collectedSequence.join(' ➔ ');
            }
        }
    }

    loop(timestamp) {
        this.processInput(timestamp);
        this.update(timestamp);
        this.render();
        requestAnimationFrame((t) => this.loop(t));
    }

    update() {
        // Smoothly interpolate player visual position towards grid position
        this.player.drawX += (this.player.targetX - this.player.drawX) * 0.28;
        this.player.drawY += (this.player.targetY - this.player.drawY) * 0.28;
        this.player.pulse = (this.player.pulse + 0.05) % (Math.PI * 2);

        // Fade player trail
        for (let i = this.player.trail.length - 1; i >= 0; i--) {
            this.player.trail[i].alpha -= 0.02;
            if (this.player.trail[i].alpha <= 0) {
                this.player.trail.splice(i, 1);
            }
        }

        // Camera follow player smoothly centered
        const targetCamX = (this.player.drawX + 0.5) * this.cellSize - (this.canvas.clientWidth / 2);
        const targetCamY = (this.player.drawY + 0.5) * this.cellSize - (this.canvas.clientHeight / 2);
        this.camera.x += (targetCamX - this.camera.x) * 0.12;
        this.camera.y += (targetCamY - this.camera.y) * 0.12;

        // Bound camera inside reasonable margin
        const totalW = this.maze.cols * this.cellSize;
        const totalH = this.maze.rows * this.cellSize;
        const maxCamX = Math.max(0, totalW - this.canvas.clientWidth);
        const maxCamY = Math.max(0, totalH - this.canvas.clientHeight);

        if (totalW < this.canvas.clientWidth) {
            this.camera.x = (totalW - this.canvas.clientWidth) / 2;
        } else {
            this.camera.x = Math.max(0, Math.min(this.camera.x, maxCamX));
        }

        if (totalH < this.canvas.clientHeight) {
            this.camera.y = (totalH - this.canvas.clientHeight) / 2;
        } else {
            this.camera.y = Math.max(0, Math.min(this.camera.y, maxCamY));
        }

        // Update particle physics
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.94;
            p.vy *= 0.94;
            p.life -= p.decay;
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update floating texts
        for (let i = this.floatingText.length - 1; i >= 0; i--) {
            const ft = this.floatingText[i];
            ft.y += ft.vy;
            ft.life -= 0.015;
            if (ft.life <= 0) {
                this.floatingText.splice(i, 1);
            }
        }
    }

    render() {
        const ctx = this.ctx;
        const cs = this.cellSize;

        // Clear canvas with deep void backdrop
        ctx.fillStyle = '#060913';
        ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // 1. Draw maze walls - "maze walls have to be fadely visible"
        // Faint outline and ethereal translucent body across the entire labyrinth
        this.renderFaintWalls(ctx, cs);

        // 2. Draw traveled paths - "path of the maze renders only when it is travelled"
        // Tiles the player has NOT visited remain hidden in void darkness
        this.renderTraveledPaths(ctx, cs);

        // 3. Draw ambient dust particles in illuminated areas
        this.renderAmbientParticles(ctx, cs);

        // 4. Render player trail
        this.renderPlayerTrail(ctx, cs);

        // 5. Draw ACM letters: "ACM letters are not visible unless they are reached"
        // Revealed letters draw glowing letter beacon; unreached letters are NEVER drawn
        this.renderLetters(ctx, cs);

        // 6. Draw player beacon / lantern
        this.renderPlayer(ctx, cs);

        // 7. Render dynamic particle bursts and floating text
        this.renderParticlesAndFX(ctx, cs);

        ctx.restore();
    }

    renderFaintWalls(ctx, cs) {
        const cols = this.maze.cols;
        const rows = this.maze.rows;

        // Faint fill for wall blocks so the user can perceive the labyrinth silhouette
        ctx.fillStyle = 'rgba(28, 42, 68, 0.32)';
        // Faint stroke outline for wall grid edges
        ctx.strokeStyle = 'rgba(74, 115, 178, 0.28)';
        ctx.lineWidth = 1;

        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this.maze.grid[r][c] === 1) {
                    const px = c * cs;
                    const py = r * cs;

                    ctx.fillRect(px, py, cs, cs);
                    ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
                }
            }
        }
    }

    renderTraveledPaths(ctx, cs) {
        const cols = this.maze.cols;
        const rows = this.maze.rows;

        // Render each floor tile ONLY IF it is marked traveled
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (this.maze.grid[r][c] === 0 && this.maze.traveled[r][c]) {
                    const px = c * cs;
                    const py = r * cs;

                    // Floor slab background
                    ctx.fillStyle = '#111827';
                    ctx.fillRect(px, py, cs, cs);

                    // Subtle illuminated path borders
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + 1, py + 1, cs - 2, cs - 2);

                    // Inner floor pattern (stone tile dots)
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
                    ctx.fillRect(px + 4, py + 4, cs - 8, cs - 8);
                }
            }
        }
    }

    renderPlayerTrail(ctx, cs) {
        for (const t of this.player.trail) {
            ctx.fillStyle = `rgba(56, 189, 248, ${t.alpha * 0.25})`;
            ctx.beginPath();
            ctx.arc((t.x + 0.5) * cs, (t.y + 0.5) * cs, cs * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    renderLetters(ctx, cs) {
        // "ACM letters are not visible unless they are reached"
        for (const letter of this.maze.letters) {
            // Strictly check revealed state
            if (!letter.revealed) {
                continue; // Do NOT render until player reaches it!
            }

            const px = (letter.x + 0.5) * cs;
            const py = (letter.y + 0.5) * cs;

            const letterColors = {
                'A': { glow: '#ffb703', fill: '#ffe6a7' },
                'C': { glow: '#00f5d4', fill: '#cbf3f0' },
                'M': { glow: '#ff006e', fill: '#ffcbf2' }
            };
            const col = letterColors[letter.id] || { glow: '#38bdf8', fill: '#ffffff' };

            // Floating bobbing effect
            const floatOffset = Math.sin(Date.now() * 0.005 + letter.x) * 3;

            // Outer glowing ring
            ctx.save();
            ctx.shadowColor = col.glow;
            ctx.shadowBlur = 15;

            ctx.beginPath();
            ctx.arc(px, py + floatOffset, cs * 0.38, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            ctx.fill();
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = col.glow;
            ctx.stroke();

            // Letter text
            ctx.fillStyle = col.fill;
            ctx.font = `900 ${Math.floor(cs * 0.52)}px 'Segoe UI', system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(letter.id, px, py + floatOffset + 1);

            ctx.restore();
        }
    }

    renderPlayer(ctx, cs) {
        const px = (this.player.drawX + 0.5) * cs;
        const py = (this.player.drawY + 0.5) * cs;
        const radius = cs * this.player.radius;

        // Player dynamic illumination lantern aura
        const gradient = ctx.createRadialGradient(px, py, radius * 0.5, px, py, cs * 2.8);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
        gradient.addColorStop(0.5, 'rgba(14, 165, 233, 0.15)');
        gradient.addColorStop(1, 'rgba(14, 165, 233, 0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(px, py, cs * 2.8, 0, Math.PI * 2);
        ctx.fill();

        // Pulsing core
        const pulseSize = Math.sin(this.player.pulse) * 1.5;

        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 18;

        // Outer player ring
        ctx.beginPath();
        ctx.arc(px, py, radius + pulseSize, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#e0f2fe';
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        ctx.restore();
    }

    renderAmbientParticles(ctx, cs) {
        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;

            // Loop inside maze bounds
            if (p.x < 0) p.x = this.maze.cols * cs;
            if (p.x > this.maze.cols * cs) p.x = 0;
            if (p.y < 0) p.y = this.maze.rows * cs;
            if (p.y > this.maze.rows * cs) p.y = 0;

            // Only show if the particle is over an illuminated/traveled cell or near player
            const cellX = Math.floor(p.x / cs);
            const cellY = Math.floor(p.y / cs);

            if (this.maze.traveled[cellY] && this.maze.traveled[cellY][cellX]) {
                ctx.fillStyle = `rgba(186, 230, 253, ${p.alpha * 0.5})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    renderParticlesAndFX(ctx, cs) {
        // Render explosion sparks
        for (const p of this.particles) {
            ctx.save();
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 8;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = Math.max(0, p.life);
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Render floating text popups
        for (const ft of this.floatingText) {
            ctx.save();
            ctx.font = "bold 15px 'Segoe UI', system-ui, sans-serif";
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00f5d4';
            ctx.shadowBlur = 10;
            ctx.textAlign = 'center';
            ctx.globalAlpha = Math.max(0, ft.life);
            ctx.fillText(ft.text, (ft.x + 0.5) * cs, (ft.y + 0.2) * cs);
            ctx.restore();
        }
    }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});
