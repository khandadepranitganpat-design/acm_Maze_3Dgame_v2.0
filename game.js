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

        // Visual effects & atmospheric lighting state
        this.animTime = 0;
        this.torchFlicker = 1.0;
        this.wisps = [
            { angle: 0, orbitRadius: 0.36, speed: 1.8, size: 2.2, color: '#fef08a' },
            { angle: 1.05, orbitRadius: 0.45, speed: -2.3, size: 2.6, color: '#f97316' },
            { angle: 2.1, orbitRadius: 0.32, speed: 2.0, size: 2.0, color: '#fbbf24' },
            { angle: 3.14, orbitRadius: 0.48, speed: -1.7, size: 2.4, color: '#ef4444' },
            { angle: 4.2, orbitRadius: 0.38, speed: 2.5, size: 2.1, color: '#fde047' },
            { angle: 5.25, orbitRadius: 0.42, speed: -2.1, size: 2.5, color: '#fb923c' }
        ];
        this.vignetteGrad = null;
        this.vignetteWidth = 0;
        this.vignetteHeight = 0;
        this.noiseCanvas = null;
        this.noisePattern = null;

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

        // Initialize ambient particles with rich dungeon variety (dust motes, embers, fireflies)
        for (let i = 0; i < 135; i++) {
            const roll = Math.random();
            const type = roll < 0.45 ? 'dust' : (roll < 0.78 ? 'ember' : 'firefly');
            this.ambientParticles.push({
                x: Math.random() * (this.maze.cols * this.cellSize),
                y: Math.random() * (this.maze.rows * this.cellSize),
                vx: (Math.random() - 0.5) * (type === 'ember' ? 0.28 : 0.42),
                vy: type === 'ember' ? -(Math.random() * 0.42 + 0.16) : (Math.random() - 0.5) * 0.38,
                alpha: Math.random() * 0.5 + 0.3,
                baseAlpha: Math.random() * 0.5 + 0.3,
                size: type === 'ember' ? Math.random() * 2 + 1.2 : (type === 'firefly' ? Math.random() * 2.2 + 1.5 : Math.random() * 1.8 + 0.8),
                type: type,
                phase: Math.random() * Math.PI * 2
            });
        }

        // Only start timer when game actually launches (resetGame)
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
                // When playerApp is managing the countdown, let playerApp handle #timerVal exclusively.
                // In standalone fallback, strictly display the 2:00 -> 0:00 countdown timer!
                if (!window.playerApp || !window.playerApp.gameStarted) {
                    const timerEl = document.getElementById('timerVal');
                    if (timerEl) {
                        const remaining = Math.max(0, 120 - this.elapsedSeconds);
                        const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
                        const secs = String(remaining % 60).padStart(2, '0');
                        timerEl.textContent = `${mins}:${secs}`;
                    }
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

    update(timestamp) {
        // Smoothly interpolate player visual position towards grid position
        this.player.drawX += (this.player.targetX - this.player.drawX) * 0.28;
        this.player.drawY += (this.player.targetY - this.player.drawY) * 0.28;
        this.player.pulse = (this.player.pulse + 0.05) % (Math.PI * 2);

        // Update animation time and dynamic torch flicker simulation
        this.animTime = (this.animTime || 0) + 0.035;
        const f1 = Math.sin(this.animTime * 7.3) * 0.035;
        const f2 = Math.sin(this.animTime * 13.9) * 0.02;
        const f3 = Math.cos(this.animTime * 3.7) * 0.03;
        this.torchFlicker = 1.0 + f1 + f2 + f3;

        // Orbiting flame wisps around player
        if (this.wisps) {
            for (const w of this.wisps) {
                w.angle += w.speed * 0.025;
            }
        }

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
        const cw = this.canvas.clientWidth;
        const ch = this.canvas.clientHeight;

        // Deep dungeon obsidian backdrop
        ctx.fillStyle = '#030611';
        ctx.fillRect(0, 0, cw, ch);

        ctx.save();
        ctx.translate(-this.camera.x, -this.camera.y);

        // 1. Draw maze walls - procedural ancient stone blocks, 3D top-lit bevels, AO, and moss
        this.renderFaintWalls(ctx, cs);

        // 2. Draw traveled paths - worn flagstone slabs, cracks, mortar, torch glow, specular
        this.renderTraveledPaths(ctx, cs);

        // 3. Render player trail - fading ember footprints & dissipating smoke
        this.renderPlayerTrail(ctx, cs);

        // 4. Draw ACM letters - ancient runic glyphs, volumetric light beams, energy rings
        this.renderLetters(ctx, cs);

        // 5. Draw ambient particles - dust motes, floating embers, and fireflies
        this.renderAmbientParticles(ctx, cs);

        // 6. Draw player beacon & lantern light aura (molten core, lens flares, dancing wisps)
        this.renderPlayer(ctx, cs);

        // 7. Overlay darkness layer & Fog of War with torchlight visibility circle
        this.renderDarknessLayer(ctx, cs);

        // 8. Render particle bursts and floating text (bloom over fog for maximum brilliance)
        this.renderParticlesAndFX(ctx, cs);

        ctx.restore();

        // 9. Post-processing: Vignette and cinematic film grain texture
        this.renderPostProcessing(ctx, cw, ch);
    }

    renderFaintWalls(ctx, cs) {
        const cols = this.maze.cols;
        const rows = this.maze.rows;

        // Frustum culling bounds in grid coordinates
        const minCol = Math.max(0, Math.floor(this.camera.x / cs) - 1);
        const maxCol = Math.min(cols - 1, Math.ceil((this.camera.x + this.canvas.clientWidth) / cs) + 1);
        const minRow = Math.max(0, Math.floor(this.camera.y / cs) - 1);
        const maxRow = Math.min(rows - 1, Math.ceil((this.camera.y + this.canvas.clientHeight) / cs) + 1);

        ctx.save();
        // Faintly visible labyrinth wall opacity (spec: moderate 0.35 - 0.55 range)
        ctx.globalAlpha = 0.48;

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (this.maze.grid[r][c] === 1) {
                    const px = c * cs;
                    const py = r * cs;

                    // 1. Procedural stone fill color variation per wall cell
                    const hVal = this.cellHash(c, r, 11);
                    const hue = 216 + Math.floor(hVal * 12);
                    const sat = 18 + Math.floor(hVal * 12);
                    const light = 13 + Math.floor(hVal * 6);
                    ctx.fillStyle = `hsl(${hue}, ${sat}%, ${light}%)`;
                    ctx.fillRect(px, py, cs, cs);

                    // 2. Inner shadow / ambient occlusion gradient
                    const aoGrad = ctx.createLinearGradient(px, py, px, py + cs);
                    aoGrad.addColorStop(0, 'rgba(255, 255, 255, 0.04)');
                    aoGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
                    aoGrad.addColorStop(1, 'rgba(2, 6, 18, 0.45)');
                    ctx.fillStyle = aoGrad;
                    ctx.fillRect(px, py, cs, cs);

                    // 3. Simulated stone brick courses & mortar joints
                    const midY = py + Math.floor(cs * 0.5);
                    ctx.strokeStyle = 'rgba(8, 14, 26, 0.65)';
                    ctx.lineWidth = 1;
                    // Horizontal mortar line
                    ctx.beginPath();
                    ctx.moveTo(px, midY + 0.5);
                    ctx.lineTo(px + cs, midY + 0.5);
                    ctx.stroke();

                    // Staggered vertical mortar joints
                    const splitTop = px + Math.floor(cs * (0.35 + hVal * 0.3));
                    const splitBottom = px + Math.floor(cs * (0.68 - hVal * 0.3));
                    ctx.beginPath();
                    ctx.moveTo(splitTop + 0.5, py);
                    ctx.lineTo(splitTop + 0.5, midY);
                    ctx.moveTo(splitBottom + 0.5, midY);
                    ctx.lineTo(splitBottom + 0.5, py + cs);
                    ctx.stroke();

                    // 4. Subtle stone grain / micro-fleck texture
                    const grain1 = this.cellHash(c, r, 21);
                    const grain2 = this.cellHash(c, r, 22);
                    ctx.fillStyle = 'rgba(148, 163, 184, 0.12)';
                    ctx.fillRect(px + Math.floor(grain1 * (cs - 4)) + 2, py + Math.floor(grain2 * (cs - 4)) + 2, 2, 1);

                    // 5. Check neighbors for 3D top-lit bevel & cast shadows
                    const hasTopWall = r > 0 && this.maze.grid[r - 1][c] === 1;
                    const hasBottomWall = r < rows - 1 && this.maze.grid[r + 1][c] === 1;
                    const hasLeftWall = c > 0 && this.maze.grid[r][c - 1] === 1;
                    const hasRightWall = c < cols - 1 && this.maze.grid[r][c + 1] === 1;

                    // Top-lit bevel: bright top edge when corridor or boundary above
                    if (!hasTopWall) {
                        ctx.strokeStyle = 'rgba(148, 185, 235, 0.65)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(px, py + 0.75);
                        ctx.lineTo(px + cs, py + 0.75);
                        ctx.stroke();
                    }

                    // Bottom shadow: deep bottom edge when corridor below
                    if (!hasBottomWall) {
                        ctx.strokeStyle = 'rgba(2, 6, 20, 0.85)';
                        ctx.lineWidth = 1.5;
                        ctx.beginPath();
                        ctx.moveTo(px, py + cs - 0.75);
                        ctx.lineTo(px + cs, py + cs - 0.75);
                        ctx.stroke();
                    }

                    // Left & right edge definition
                    if (!hasLeftWall) {
                        ctx.strokeStyle = 'rgba(125, 160, 210, 0.35)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px + 0.5, py);
                        ctx.lineTo(px + 0.5, py + cs);
                        ctx.stroke();
                    }
                    if (!hasRightWall) {
                        ctx.strokeStyle = 'rgba(2, 6, 20, 0.6)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px + cs - 0.5, py);
                        ctx.lineTo(px + cs - 0.5, py + cs);
                        ctx.stroke();
                    }

                    // 6. Occasional ancient moss / discoloration patch
                    const mossRoll = this.cellHash(c, r, 77);
                    if (mossRoll > 0.74) {
                        const mossX = px + Math.floor((mossRoll * 0.6 + 0.1) * cs);
                        const mossY = py + Math.floor((this.cellHash(c, r, 78) * 0.6 + 0.1) * cs);
                        const mossGrad = ctx.createRadialGradient(mossX, mossY, 1, mossX, mossY, cs * 0.42);
                        mossGrad.addColorStop(0, 'rgba(20, 184, 166, 0.28)');
                        mossGrad.addColorStop(0.6, 'rgba(34, 197, 94, 0.15)');
                        mossGrad.addColorStop(1, 'rgba(34, 197, 94, 0)');
                        ctx.fillStyle = mossGrad;
                        ctx.beginPath();
                        ctx.arc(mossX, mossY, cs * 0.42, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    // 7. Subtle boundary mortar stroke
                    ctx.strokeStyle = 'rgba(74, 115, 178, 0.22)';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1);
                }
            }
        }
        ctx.restore();
    }

    renderTraveledPaths(ctx, cs) {
        const cols = this.maze.cols;
        const rows = this.maze.rows;

        // Frustum culling
        const minCol = Math.max(0, Math.floor(this.camera.x / cs) - 1);
        const maxCol = Math.min(cols - 1, Math.ceil((this.camera.x + this.canvas.clientWidth) / cs) + 1);
        const minRow = Math.max(0, Math.floor(this.camera.y / cs) - 1);
        const maxRow = Math.min(rows - 1, Math.ceil((this.camera.y + this.canvas.clientHeight) / cs) + 1);

        const playerX = this.player.drawX;
        const playerY = this.player.drawY;
        const flicker = this.torchFlicker || 1.0;

        for (let r = minRow; r <= maxRow; r++) {
            for (let c = minCol; c <= maxCol; c++) {
                if (this.maze.grid[r][c] === 0 && this.maze.traveled[r][c]) {
                    const px = c * cs;
                    const py = r * cs;

                    // 1. Mortar recess backdrop
                    ctx.fillStyle = '#060a14';
                    ctx.fillRect(px, py, cs, cs);

                    // 2. Worn stone slab face with procedural color variation
                    const fHash = this.cellHash(c, r, 33);
                    const slabHue = 218 + Math.floor(fHash * 10);
                    const slabSat = 16 + Math.floor(fHash * 8);
                    const slabLight = 9 + Math.floor(fHash * 5);
                    ctx.fillStyle = `hsl(${slabHue}, ${slabSat}%, ${slabLight}%)`;
                    ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);

                    // 3. Beveled slab edges
                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
                    ctx.lineWidth = 1;
                    // Top and left inner highlight
                    ctx.beginPath();
                    ctx.moveTo(px + 1, py + cs - 2);
                    ctx.lineTo(px + 1, py + 1);
                    ctx.lineTo(px + cs - 2, py + 1);
                    ctx.stroke();

                    // Bottom and right groove shadow
                    ctx.strokeStyle = 'rgba(2, 6, 18, 0.55)';
                    ctx.beginPath();
                    ctx.moveTo(px + cs - 1.5, py + 1);
                    ctx.lineTo(px + cs - 1.5, py + cs - 1.5);
                    ctx.lineTo(px + 1, py + cs - 1.5);
                    ctx.stroke();

                    // 4. Subtle slab division / inner paving joint
                    const splitRoll = this.cellHash(c, r, 44);
                    ctx.strokeStyle = 'rgba(6, 10, 20, 0.65)';
                    ctx.lineWidth = 1;
                    if (splitRoll > 0.5) {
                        const divX = px + Math.floor(cs * (0.38 + splitRoll * 0.24));
                        ctx.beginPath();
                        ctx.moveTo(divX + 0.5, py + 2);
                        ctx.lineTo(divX + 0.5, py + cs - 2);
                        ctx.stroke();
                    } else {
                        const divY = py + Math.floor(cs * (0.38 + splitRoll * 0.24));
                        ctx.beginPath();
                        ctx.moveTo(px + 2, divY + 0.5);
                        ctx.lineTo(px + cs - 2, divY + 0.5);
                        ctx.stroke();
                    }

                    // 5. Subtle stone cracks
                    const crackRoll = this.cellHash(c, r, 55);
                    if (crackRoll > 0.45) {
                        const cMidX = px + cs * (0.3 + (crackRoll * 0.4));
                        const cMidY = py + cs * (0.4 + (this.cellHash(c, r, 56) * 0.3));
                        ctx.strokeStyle = 'rgba(4, 7, 16, 0.85)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(px + 2, py + cs * 0.35);
                        ctx.lineTo(cMidX, cMidY);
                        ctx.lineTo(px + cs - 3, py + cs * 0.65);
                        ctx.stroke();

                        // Crack highlight rim
                        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
                        ctx.beginPath();
                        ctx.moveTo(px + 2, py + cs * 0.35 + 0.75);
                        ctx.lineTo(cMidX + 0.5, cMidY + 0.75);
                        ctx.lineTo(px + cs - 3, py + cs * 0.65 + 0.75);
                        ctx.stroke();
                    }

                    // 6. Warm torch light glow emanating onto traveled floor
                    const distToPlayer = Math.hypot(c - playerX, r - playerY);
                    if (distToPlayer < 6.0) {
                        const glowFalloff = Math.max(0, 1 - distToPlayer / 6.0);
                        const warmAlpha = glowFalloff * glowFalloff * 0.42 * flicker;
                        ctx.fillStyle = `rgba(245, 158, 11, ${warmAlpha.toFixed(3)})`;
                        ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);

                        // 7. Specular highlight where lantern light hits stone slab
                        if (distToPlayer < 3.8) {
                            const specStrength = Math.pow(Math.max(0, 1 - distToPlayer / 3.8), 2.2) * 0.28 * flicker;
                            const specGrad = ctx.createRadialGradient(
                                px + cs * 0.5, py + cs * 0.5, 0,
                                px + cs * 0.5, py + cs * 0.5, cs * 0.7
                            );
                            specGrad.addColorStop(0, `rgba(254, 243, 199, ${specStrength.toFixed(3)})`);
                            specGrad.addColorStop(1, 'rgba(254, 243, 199, 0)');
                            ctx.fillStyle = specGrad;
                            ctx.fillRect(px + 1, py + 1, cs - 2, cs - 2);
                        }
                    }
                }
            }
        }
    }

    renderPlayerTrail(ctx, cs) {
        for (let i = 0; i < this.player.trail.length; i++) {
            const t = this.player.trail[i];
            const tx = (t.x + 0.5) * cs;
            const ty = (t.y + 0.5) * cs;
            const alpha = Math.max(0, Math.min(1, t.alpha));

            // Smooth color transition from bright amber to warm orange to smoldering red
            let coreColor, glowRgba;
            if (alpha > 0.65) {
                coreColor = `rgba(254, 240, 138, ${(alpha * 0.8).toFixed(3)})`;
                glowRgba = '251, 191, 36';
            } else if (alpha > 0.3) {
                coreColor = `rgba(251, 146, 60, ${(alpha * 0.6).toFixed(3)})`;
                glowRgba = '249, 115, 22';
            } else {
                coreColor = `rgba(239, 68, 68, ${(alpha * 0.4).toFixed(3)})`;
                glowRgba = '185, 28, 28';
            }

            // 1. Soft dissipating smoke puff for aging footprints
            if (alpha < 0.75) {
                const smokeAge = 1.0 - alpha;
                const smokeRadius = cs * (0.16 + smokeAge * 0.28);
                const smokeY = ty - smokeAge * cs * 0.32;
                const smokeAlpha = alpha * smokeAge * 0.32;
                ctx.fillStyle = `rgba(100, 116, 139, ${smokeAlpha.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(tx, smokeY, smokeRadius, 0, Math.PI * 2);
                ctx.fill();
            }

            // 2. Outer ember footprint radial glow
            const footprintGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, cs * 0.38);
            footprintGrad.addColorStop(0, `rgba(${glowRgba}, ${(alpha * 0.5).toFixed(3)})`);
            footprintGrad.addColorStop(0.5, `rgba(${glowRgba}, ${(alpha * 0.18).toFixed(3)})`);
            footprintGrad.addColorStop(1, `rgba(${glowRgba}, 0)`);
            ctx.fillStyle = footprintGrad;
            ctx.beginPath();
            ctx.arc(tx, ty, cs * 0.38, 0, Math.PI * 2);
            ctx.fill();

            // 3. Bright glowing ember core
            ctx.fillStyle = coreColor;
            ctx.beginPath();
            ctx.arc(tx, ty, cs * 0.14 * (0.6 + alpha * 0.4), 0, Math.PI * 2);
            ctx.fill();

            // 4. Subtle drifting spark fleck
            const sparkOffset = Math.sin((this.animTime || 0) * 4 + t.x * 7) * cs * 0.14;
            const sparkY = ty - (1.0 - alpha) * cs * 0.35;
            ctx.fillStyle = `rgba(254, 215, 170, ${(alpha * 0.85).toFixed(3)})`;
            ctx.fillRect(tx + sparkOffset - 1, sparkY - 1, 2, 2);
        }
    }

    renderLetters(ctx, cs) {
        // "ACM letters are not visible unless they are reached"
        for (const letter of this.maze.letters) {
            if (!letter.revealed) {
                continue; // Strictly NEVER render unreached letters
            }

            const px = (letter.x + 0.5) * cs;
            const py = (letter.y + 0.5) * cs;

            const letterConfig = {
                'A': { glow: '#f59e0b', core: '#fffbeb', glyph: '#fde047', rgb: '245, 158, 11' },
                'C': { glow: '#06b6d4', core: '#ecfeff', glyph: '#67e8f9', rgb: '6, 182, 212' },
                'M': { glow: '#db2777', core: '#fdf2f8', glyph: '#f472b6', rgb: '219, 39, 119' }
            };
            const cfg = letterConfig[letter.id] || { glow: '#38bdf8', core: '#f0f9ff', glyph: '#bae6fd', rgb: '56, 189, 248' };

            const time = this.animTime || 0;
            const floatOffset = Math.sin(time * 2.5 + letter.x * 3) * 3.5;

            // 1. Dramatic volumetric light beam shooting upward
            const beamHeight = cs * 4.2;
            const beamGrad = ctx.createLinearGradient(px, py, px, py - beamHeight);
            beamGrad.addColorStop(0, `rgba(${cfg.rgb}, 0.36)`);
            beamGrad.addColorStop(0.3, `rgba(${cfg.rgb}, 0.20)`);
            beamGrad.addColorStop(0.7, `rgba(${cfg.rgb}, 0.06)`);
            beamGrad.addColorStop(1, `rgba(${cfg.rgb}, 0)`);

            ctx.save();
            ctx.fillStyle = beamGrad;
            ctx.beginPath();
            ctx.moveTo(px - cs * 0.38, py);
            ctx.lineTo(px - cs * 0.72, py - beamHeight);
            ctx.lineTo(px + cs * 0.72, py - beamHeight);
            ctx.lineTo(px + cs * 0.38, py);
            ctx.closePath();
            ctx.fill();
            ctx.restore();

            // 2. Ancient carved stone runic circle pedestal on floor
            ctx.save();
            ctx.strokeStyle = `rgba(${cfg.rgb}, 0.35)`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, cs * 0.44, 0, Math.PI * 2);
            ctx.stroke();

            // 4 runic notches on the pedestal rim
            for (let a = 0; a < 4; a++) {
                const notchAngle = a * (Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(px + Math.cos(notchAngle) * cs * 0.38, py + Math.sin(notchAngle) * cs * 0.38);
                ctx.lineTo(px + Math.cos(notchAngle) * cs * 0.48, py + Math.sin(notchAngle) * cs * 0.48);
                ctx.stroke();
            }
            ctx.restore();

            // 3. Pulsing energy rings emanating outward
            for (let k = 0; k < 2; k++) {
                const ringPhase = ((time * 0.75 + k * 0.5) % 1.0);
                const ringRadius = cs * (0.32 + ringPhase * 0.58);
                const ringAlpha = (1.0 - ringPhase) * 0.45;
                ctx.strokeStyle = `rgba(${cfg.rgb}, ${ringAlpha.toFixed(3)})`;
                ctx.lineWidth = 1.8 * (1.0 - ringPhase * 0.4);
                ctx.beginPath();
                ctx.arc(px, py, ringRadius, 0, Math.PI * 2);
                ctx.stroke();
            }

            // 4. Floating sparkle particles orbiting the letter (tilted elliptical orbit)
            for (let i = 0; i < 5; i++) {
                const sparkAngle = time * 2.2 + i * (Math.PI * 2 / 5);
                const sx = px + Math.cos(sparkAngle) * cs * 0.52;
                const sy = py + floatOffset * 0.5 + Math.sin(sparkAngle) * cs * 0.26;

                ctx.save();
                ctx.shadowColor = cfg.glow;
                ctx.shadowBlur = 8;
                ctx.fillStyle = cfg.core;
                ctx.beginPath();
                ctx.arc(sx, sy, 1.8, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // 5. Letter medallion with intense aura and embossed/engraved glyph
            ctx.save();
            ctx.shadowColor = cfg.glow;
            ctx.shadowBlur = 20;

            // Medallion disk
            const medGrad = ctx.createRadialGradient(px, py + floatOffset, 0, px, py + floatOffset, cs * 0.38);
            medGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
            medGrad.addColorStop(0.7, 'rgba(15, 23, 42, 0.90)');
            medGrad.addColorStop(1, `rgba(${cfg.rgb}, 0.4)`);

            ctx.beginPath();
            ctx.arc(px, py + floatOffset, cs * 0.38, 0, Math.PI * 2);
            ctx.fillStyle = medGrad;
            ctx.fill();

            // Outer glowing runic border
            ctx.lineWidth = 2.5;
            ctx.strokeStyle = cfg.glow;
            ctx.stroke();

            // Embossed letter: carved inner shadow + bright engraved face
            const fontSize = Math.floor(cs * 0.52);
            ctx.font = `900 ${fontSize}px 'Segoe UI', system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            // Inner recess shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
            ctx.fillText(letter.id, px + 1.5, py + floatOffset + 2);

            // Upper highlight bevel
            ctx.fillStyle = cfg.core;
            ctx.fillText(letter.id, px - 0.5, py + floatOffset);

            // Bright glowing rune glyph
            ctx.fillStyle = cfg.glyph;
            ctx.shadowColor = cfg.glow;
            ctx.shadowBlur = 14;
            ctx.fillText(letter.id, px, py + floatOffset + 0.5);

            ctx.restore();
        }
    }

    renderPlayer(ctx, cs) {
        const px = (this.player.drawX + 0.5) * cs;
        const py = (this.player.drawY + 0.5) * cs;
        const radius = cs * this.player.radius;
        const flicker = this.torchFlicker || 1.0;
        const time = this.animTime || 0;

        // 1. Large multi-layered radial light system
        // Layer A: Outer ambient light radius (5-6 cells) with warm golden falloff
        const outerRadius = cs * 5.8 * flicker;
        const outerGrad = ctx.createRadialGradient(px, py, cs * 1.5, px, py, outerRadius);
        outerGrad.addColorStop(0, `rgba(245, 158, 11, ${(0.24 * flicker).toFixed(3)})`);
        outerGrad.addColorStop(0.45, `rgba(217, 119, 6, ${(0.11 * flicker).toFixed(3)})`);
        outerGrad.addColorStop(0.8, `rgba(180, 83, 9, ${(0.03 * flicker).toFixed(3)})`);
        outerGrad.addColorStop(1, 'rgba(180, 83, 9, 0)');
        ctx.fillStyle = outerGrad;
        ctx.beginPath();
        ctx.arc(px, py, outerRadius, 0, Math.PI * 2);
        ctx.fill();

        // Layer B: Mid light radius (3-4 cells) with brighter warm orange
        const midRadius = cs * 3.6 * flicker;
        const midGrad = ctx.createRadialGradient(px, py, cs * 0.6, px, py, midRadius);
        midGrad.addColorStop(0, `rgba(251, 146, 60, ${(0.38 * flicker).toFixed(3)})`);
        midGrad.addColorStop(0.5, `rgba(234, 88, 12, ${(0.16 * flicker).toFixed(3)})`);
        midGrad.addColorStop(1, 'rgba(194, 65, 12, 0)');
        ctx.fillStyle = midGrad;
        ctx.beginPath();
        ctx.arc(px, py, midRadius, 0, Math.PI * 2);
        ctx.fill();

        // Layer C: Inner bright core (1-2 cells) with near-white hot center
        const innerRadius = cs * 1.8 * flicker;
        const innerGrad = ctx.createRadialGradient(px, py, 0, px, py, innerRadius);
        innerGrad.addColorStop(0, `rgba(255, 255, 240, ${(0.65 * flicker).toFixed(3)})`);
        innerGrad.addColorStop(0.4, `rgba(253, 186, 116, ${(0.35 * flicker).toFixed(3)})`);
        innerGrad.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = innerGrad;
        ctx.beginPath();
        ctx.arc(px, py, innerRadius, 0, Math.PI * 2);
        ctx.fill();

        // 2. Animated fire-like wisps dancing around the player
        if (this.wisps) {
            for (const wisp of this.wisps) {
                const wispDist = cs * wisp.orbitRadius * (1.0 + Math.sin(time * 3 + wisp.angle) * 0.18);
                const wx = px + Math.cos(wisp.angle) * wispDist;
                const wy = py + Math.sin(wisp.angle) * wispDist;

                ctx.save();
                ctx.shadowColor = wisp.color;
                ctx.shadowBlur = 9;
                ctx.fillStyle = wisp.color;
                ctx.beginPath();
                ctx.arc(wx, wy, wisp.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }

        // 3. Lens flare spikes radiating from center (6 thin bright lines)
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(time * 0.16);
        ctx.strokeStyle = `rgba(255, 250, 220, ${(0.48 * flicker).toFixed(3)})`;
        ctx.lineWidth = 1.2;

        for (let s = 0; s < 6; s++) {
            const spikeAngle = s * (Math.PI / 3);
            const spikeLen = (s % 2 === 0 ? cs * 1.35 : cs * 0.85) * flicker;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(spikeAngle) * spikeLen, Math.sin(spikeAngle) * spikeLen);
            ctx.stroke();
        }
        ctx.restore();

        // 4. Molten core with corona effect
        const pulseSize = Math.sin(this.player.pulse) * 1.5;

        ctx.save();
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 22;

        // Outer corona halo ring
        ctx.beginPath();
        ctx.arc(px, py, radius + pulseSize, 0, Math.PI * 2);
        const coronaGrad = ctx.createRadialGradient(px, py, radius * 0.5, px, py, radius + pulseSize);
        coronaGrad.addColorStop(0, '#f97316');
        coronaGrad.addColorStop(0.8, '#ea580c');
        coronaGrad.addColorStop(1, '#c2410c');
        ctx.fillStyle = coronaGrad;
        ctx.fill();

        ctx.lineWidth = 2.2;
        ctx.strokeStyle = '#fef08a';
        ctx.stroke();

        // Inner white-hot molten core
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.58, 0, Math.PI * 2);
        const coreGrad = ctx.createRadialGradient(px, py, 0, px, py, radius * 0.58);
        coreGrad.addColorStop(0, '#ffffff');
        coreGrad.addColorStop(0.4, '#fef08a');
        coreGrad.addColorStop(0.8, '#f97316');
        coreGrad.addColorStop(1, '#ea580c');
        ctx.fillStyle = coreGrad;
        ctx.fill();

        // Center highlight pinpoint
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px - 1, py - 1, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    renderAmbientParticles(ctx, cs) {
        const playerX = (this.player.drawX + 0.5) * cs;
        const playerY = (this.player.drawY + 0.5) * cs;
        const lightRange = cs * 6.5;
        const totalW = this.maze.cols * cs;
        const totalH = this.maze.rows * cs;
        const time = this.animTime || 0;

        for (const p of this.ambientParticles) {
            p.x += p.vx;
            p.y += p.vy;

            // Extra organic oscillation based on particle type
            if (p.type === 'ember') {
                p.x += Math.sin(time * 2.5 + p.phase) * 0.22;
            } else if (p.type === 'firefly') {
                p.y += Math.sin(time * 3.0 + p.phase) * 0.28;
                p.x += Math.cos(time * 1.5 + p.phase) * 0.22;
            }

            // Loop smoothly inside maze bounds
            if (p.x < 0) p.x += totalW;
            if (p.x > totalW) p.x -= totalW;
            if (p.y < 0) p.y += totalH;
            if (p.y > totalH) p.y -= totalH;

            // Check if particle is over traveled cell OR near player lantern
            const cellX = Math.floor(p.x / cs);
            const cellY = Math.floor(p.y / cs);
            const isTraveled = this.maze.traveled[cellY] && this.maze.traveled[cellY][cellX];
            const distToPlayer = Math.hypot(p.x - playerX, p.y - playerY);
            const isNearPlayer = distToPlayer < lightRange;

            if (isTraveled || isNearPlayer) {
                // Particles near player are brighter and more active
                let brightness = 1.0;
                if (isNearPlayer) {
                    brightness = 1.0 + (1.0 - distToPlayer / lightRange) * 1.8;
                }
                const alpha = Math.min(1.0, (p.baseAlpha || p.alpha) * brightness);

                // Render particle according to type
                ctx.save();
                if (p.type === 'ember') {
                    ctx.shadowColor = '#f97316';
                    ctx.shadowBlur = 6;
                    ctx.fillStyle = `rgba(251, 146, 60, ${alpha.toFixed(3)})`;
                } else if (p.type === 'firefly') {
                    const pulse = 0.5 + 0.5 * Math.sin(time * 4.0 + p.phase);
                    ctx.shadowColor = '#34d399';
                    ctx.shadowBlur = 7;
                    ctx.fillStyle = `rgba(52, 211, 153, ${(alpha * pulse).toFixed(3)})`;
                } else {
                    // Dust motes
                    ctx.fillStyle = `rgba(203, 213, 225, ${(alpha * 0.55).toFixed(3)})`;
                }

                // Subtle motion blur for faster moving particles
                const speed = Math.hypot(p.vx, p.vy);
                if (speed > 0.25) {
                    ctx.strokeStyle = ctx.fillStyle;
                    ctx.lineWidth = Math.max(1, p.size * 0.7);
                    ctx.beginPath();
                    ctx.moveTo(p.x - p.vx * 2.8, p.y - p.vy * 2.8);
                    ctx.lineTo(p.x, p.y);
                    ctx.stroke();
                } else {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
        }
    }

    renderParticlesAndFX(ctx, cs) {
        // Render explosion sparks with bloom, streaks & trails
        for (const p of this.particles) {
            const lifeAlpha = Math.max(0, Math.min(1, p.life));

            // 1. Spark trail streak behind particle
            ctx.save();
            ctx.strokeStyle = p.color;
            ctx.globalAlpha = lifeAlpha * 0.55;
            ctx.lineWidth = Math.max(1, p.size * 0.7);
            ctx.beginPath();
            ctx.moveTo(p.x - p.vx * 3.2, p.y - p.vy * 3.2);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            ctx.restore();

            // 2. Glowing bloom halo
            ctx.save();
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 14 * lifeAlpha;
            ctx.fillStyle = p.color;
            ctx.globalAlpha = lifeAlpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();

            // 3. Bright white-hot core
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = lifeAlpha * 0.85;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Render floating text popups with dramatic shadow and arcane glow
        for (const ft of this.floatingText) {
            const textAlpha = Math.max(0, Math.min(1, ft.life));
            const ftx = (ft.x + 0.5) * cs;
            const fty = (ft.y + 0.2) * cs;

            ctx.save();
            ctx.font = "900 16px 'Segoe UI', system-ui, sans-serif";
            ctx.textAlign = 'center';
            ctx.globalAlpha = textAlpha;

            // Deep shadow stroke outline
            ctx.strokeStyle = 'rgba(2, 6, 23, 0.95)';
            ctx.lineWidth = 4;
            ctx.strokeText(ft.text, ftx, fty);

            // Arcane turquoise luminous text with glow halo
            ctx.shadowColor = '#00f5d4';
            ctx.shadowBlur = 15;
            ctx.fillStyle = '#ffffff';
            ctx.fillText(ft.text, ftx, fty);
            ctx.restore();
        }
    }

    renderDarknessLayer(ctx, cs) {
        const camX = this.camera.x;
        const camY = this.camera.y;
        const cw = this.canvas.clientWidth;
        const ch = this.canvas.clientHeight;

        const px = (this.player.drawX + 0.5) * cs;
        const py = (this.player.drawY + 0.5) * cs;
        const flicker = this.torchFlicker || 1.0;

        // Large radial gradient centered on the player for torchlight circle of visibility
        const darkGrad = ctx.createRadialGradient(
            px, py, cs * 1.8 * flicker,
            px, py, cs * 8.5 * flicker
        );
        darkGrad.addColorStop(0.0, 'rgba(3, 6, 15, 0.0)');
        darkGrad.addColorStop(0.28, 'rgba(3, 6, 15, 0.0)');
        darkGrad.addColorStop(0.55, 'rgba(3, 6, 15, 0.38)');
        darkGrad.addColorStop(0.76, 'rgba(3, 6, 15, 0.72)');
        darkGrad.addColorStop(0.92, 'rgba(3, 6, 15, 0.85)');
        darkGrad.addColorStop(1.0, 'rgba(3, 6, 15, 0.90)');

        ctx.fillStyle = darkGrad;
        ctx.fillRect(camX, camY, cw, ch);

        // Discovered letters cut through distant darkness like celestial guide beacons
        for (const letter of this.maze.letters) {
            if (letter.revealed) {
                const lx = (letter.x + 0.5) * cs;
                const ly = (letter.y + 0.5) * cs;
                const distToPlayer = Math.hypot(lx - px, ly - py);

                if (distToPlayer > cs * 4.5) {
                    const runeBeacon = ctx.createRadialGradient(lx, ly, 0, lx, ly, cs * 2.8);
                    const beaconColor = letter.id === 'A' ? '245, 158, 11' : (letter.id === 'C' ? '6, 182, 212' : '219, 39, 119');
                    runeBeacon.addColorStop(0, `rgba(${beaconColor}, 0.28)`);
                    runeBeacon.addColorStop(0.5, `rgba(${beaconColor}, 0.09)`);
                    runeBeacon.addColorStop(1, 'rgba(0, 0, 0, 0)');
                    ctx.fillStyle = runeBeacon;
                    ctx.beginPath();
                    ctx.arc(lx, ly, cs * 2.8, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    renderPostProcessing(ctx, cw, ch) {
        // 1. Subtle vignette effect (darkened corners and edges)
        if (!this.vignetteGrad || this.vignetteWidth !== cw || this.vignetteHeight !== ch) {
            this.vignetteWidth = cw;
            this.vignetteHeight = ch;
            const cx = cw * 0.5;
            const cy = ch * 0.5;
            const maxRadius = Math.hypot(cx, cy);
            this.vignetteGrad = ctx.createRadialGradient(cx, cy, maxRadius * 0.42, cx, cy, maxRadius);
            this.vignetteGrad.addColorStop(0.0, 'rgba(0, 0, 0, 0)');
            this.vignetteGrad.addColorStop(0.65, 'rgba(2, 6, 18, 0.22)');
            this.vignetteGrad.addColorStop(0.88, 'rgba(1, 3, 10, 0.62)');
            this.vignetteGrad.addColorStop(1.0, 'rgba(0, 2, 8, 0.85)');
        }
        ctx.fillStyle = this.vignetteGrad;
        ctx.fillRect(0, 0, cw, ch);

        // 2. Subtle film grain noise overlay for tactile dungeon texture
        if (!this.noiseCanvas) {
            this.noiseCanvas = document.createElement('canvas');
            this.noiseCanvas.width = 128;
            this.noiseCanvas.height = 128;
            const nCtx = this.noiseCanvas.getContext('2d');
            const imgData = nCtx.createImageData(128, 128);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const v = Math.floor(Math.random() * 255);
                data[i] = v;
                data[i + 1] = v;
                data[i + 2] = v;
                data[i + 3] = Math.floor(Math.random() * 20 + 8);
            }
            nCtx.putImageData(imgData, 0, 0);
            this.noisePattern = ctx.createPattern(this.noiseCanvas, 'repeat');
        }

        if (this.noisePattern) {
            ctx.save();
            ctx.globalCompositeOperation = 'overlay';
            ctx.globalAlpha = 0.04;
            ctx.fillStyle = this.noisePattern;
            ctx.translate(Math.random() * 64, Math.random() * 64);
            ctx.fillRect(-64, -64, cw + 128, ch + 128);
            ctx.restore();
        }
    }

    cellHash(c, r, seed = 0) {
        let h = (c * 374761393 + r * 668265263 + seed * 961748941) ^ 0x5bf03635;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});
