/**
 * ACM Spell Maze - 3D Follow-Camera Engine (v2)
 * Inspired by the perspective & camera mechanics of Hunter Assassin.
 * Features:
 * - Low-poly 3D dungeon labyrinth with modeled stone walls & flagstone floors
 * - Slanted top-down / isometric follow-camera locked smoothly to the player
 * - Localized phone viewport with distant corridors shrouded in darkness and fog
 * - Dynamic line-of-sight shadows cast in real-time by player torch & vision spotlight
 * - Stylized 3D operative character avatar with walking sway & rotation physics
 * - 3D floating, rotating, glowing collectibles for letters A, C, and N
 * - Smooth mobile virtual floating joystick, D-Pad, touch-to-move, and WASD/Arrow keys
 * - Clean wall-collision sliding physics and minimal HUD (A: [ ], C: [ ], N: [ ])
 */

const CELL_SIZE = 2.4;
const WALL_HEIGHT = 2.6;
const HALF_CELL = CELL_SIZE * 0.5;
const PLAYER_COLLISION_RADIUS = 0.58;

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.sound = new SoundManager();

        // Maze settings (25x25 medium difficulty)
        this.mazeSize = 25;
        this.maze = new Maze(this.mazeSize, this.mazeSize);

        // Game stats
        this.steps = 0;
        this.startTime = Date.now();
        this.elapsedSeconds = 0;
        this.timerInterval = null;
        this.isGameOver = false;
        this.collectedSequence = [];

        // Player physics & transform
        this.player = {
            gridX: this.maze.startPos.x,
            gridY: this.maze.startPos.y,
            x: this.maze.startPos.x * CELL_SIZE,
            z: this.maze.startPos.y * CELL_SIZE,
            vx: 0,
            vz: 0,
            angle: 0,
            targetAngle: 0,
            speed: 5.4,
            walkCycle: 0,
            isMoving: false
        };

        // Camera follow target
        this.camTarget = {
            x: this.player.x,
            z: this.player.z
        };

        // Three.js core objects
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Scene meshes
        this.wallsGroup = null;
        this.floorMesh = null;
        this.playerGroup = null;
        this.playerLegL = null;
        this.playerLegR = null;
        this.playerTorch = null;
        this.torchLight = null;
        this.visionSpotLight = null;
        this.spotTarget = null;
        this.wisps = [];

        // Letter collectibles
        this.letterGroups = []; // [ { id, group, mesh, light, collected, baseY } ]
        this.particles = [];    // 3D collection burst & ambient particles

        // Controls
        this.keys = {};
        this.inputVector = { x: 0, y: 0 };
        this.lastStepTile = { x: this.maze.startPos.x, y: this.maze.startPos.y };

        // Virtual Joystick for touch
        this.touchActive = false;
        this.touchOrigin = { x: 0, y: 0 };
        this.joystickBase = document.getElementById('virtualJoystickBase');
        this.joystickKnob = document.getElementById('virtualJoystickKnob');

        // Animation timing
        this.lastTimestamp = 0;
        this.animTime = 0;

        this.init();
    }

    init() {
        if (typeof THREE === 'undefined') {
            console.error("Three.js not loaded. Retrying in 100ms...");
            setTimeout(() => this.init(), 100);
            return;
        }

        this.initThree();
        this.buildDungeonMaze();
        this.buildPlayerAvatar();
        this.buildLetterCollectibles();
        this.buildAmbientDust();

        this.bindInputEvents();
        this.updateHUD();

        // Start render loop
        requestAnimationFrame((t) => this.loop(t));
    }

    /* -----------------------------------------------------
       1. THREE.JS SCENE, CAMERA & LIGHTING
       ----------------------------------------------------- */
    initThree() {
        // Scene with deep dungeon fog of war
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05070e);
        this.scene.fog = new THREE.FogExp2(0x05070e, 0.082);

        // Localized Follow-Camera (Slanted Top-Down / Isometric perspective)
        const aspect = this.canvas.clientWidth / (this.canvas.clientHeight || 1);
        this.camera = new THREE.PerspectiveCamera(46, aspect, 0.2, 80);
        this.camera.position.set(this.player.x, 14.5, this.player.z + 8.2);
        this.camera.lookAt(this.player.x, 0.5, this.player.z);

        // WebGL Renderer with soft shadows
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight || 580, false);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.35;

        // Ambient Light (Keeps distant unlit corridors deep in shadow)
        const ambient = new THREE.AmbientLight(0x0a1024, 0.32);
        this.scene.add(ambient);

        // Faint overhead moonlit fill (gives subtle contour to wall tops)
        const moonLight = new THREE.DirectionalLight(0x1e293b, 0.42);
        moonLight.position.set(30, 45, 20);
        this.scene.add(moonLight);

        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    resizeCanvas() {
        if (!this.renderer || !this.camera) return;
        const container = this.canvas.parentElement;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const width = rect.width || window.innerWidth;
        const height = rect.height || 580;

        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    /* -----------------------------------------------------
       2. 3D DUNGEON MAZE BUILDER (WALLS & FLOOR)
       ----------------------------------------------------- */
    buildDungeonMaze() {
        // Floor Plane
        const mazeWidth = this.maze.cols * CELL_SIZE;
        const mazeDepth = this.maze.rows * CELL_SIZE;

        const floorGeo = new THREE.PlaneGeometry(mazeWidth + 30, mazeDepth + 30, 32, 32);
        const floorMat = new THREE.MeshStandardMaterial({
            color: 0x0a0f1d,
            roughness: 0.85,
            metalness: 0.15
        });
        this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
        this.floorMesh.rotation.x = -Math.PI / 2;
        this.floorMesh.position.set(mazeWidth / 2 - HALF_CELL, -0.01, mazeDepth / 2 - HALF_CELL);
        this.floorMesh.receiveShadow = true;
        this.scene.add(this.floorMesh);

        // Floor Flagstone Tile Accents (Low-poly corridor floor tiles)
        const tileGeo = new THREE.BoxGeometry(CELL_SIZE - 0.08, 0.04, CELL_SIZE - 0.08);
        const pathTileMat = new THREE.MeshStandardMaterial({
            color: 0x0f172a,
            roughness: 0.75,
            metalness: 0.2
        });

        // Walls Group (Optimized InstancedMesh for silky 60 FPS performance)
        let wallCount = 0;
        for (let r = 0; r < this.maze.rows; r++) {
            for (let c = 0; c < this.maze.cols; c++) {
                if (this.maze.grid[r][c] === 1) wallCount++;
            }
        }

        const wallGeo = new THREE.BoxGeometry(CELL_SIZE, WALL_HEIGHT, CELL_SIZE);
        const wallMat = new THREE.MeshStandardMaterial({
            color: 0x1b2438,
            roughness: 0.72,
            metalness: 0.22
        });

        const wallInstanced = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
        wallInstanced.castShadow = true;
        wallInstanced.receiveShadow = true;

        const dummy = new THREE.Object3D();
        let idx = 0;

        for (let r = 0; r < this.maze.rows; r++) {
            for (let c = 0; c < this.maze.cols; c++) {
                const wx = c * CELL_SIZE;
                const wz = r * CELL_SIZE;

                if (this.maze.grid[r][c] === 1) {
                    dummy.position.set(wx, WALL_HEIGHT * 0.5, wz);
                    dummy.rotation.set(0, 0, 0);
                    dummy.scale.set(1, 1, 1);
                    dummy.updateMatrix();
                    wallInstanced.setMatrixAt(idx++, dummy.matrix);
                } else {
                    // Walkable corridor flagstone slab
                    const tile = new THREE.Mesh(tileGeo, pathTileMat);
                    tile.position.set(wx, 0.01, wz);
                    tile.receiveShadow = true;
                    this.scene.add(tile);
                }
            }
        }

        wallInstanced.instanceMatrix.needsUpdate = true;
        this.scene.add(wallInstanced);
        this.wallsGroup = wallInstanced;
    }

    /* -----------------------------------------------------
       3. STYLIZED 3D CHARACTER AVATAR (PLAYER)
       ----------------------------------------------------- */
    buildPlayerAvatar() {
        this.playerGroup = new THREE.Group();
        this.playerGroup.position.set(this.player.x, 0, this.player.z);

        // Soft Circular Shadow Beneath Player
        const shadowGeo = new THREE.CircleGeometry(0.55, 18);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.52
        });
        const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
        shadowMesh.rotation.x = -Math.PI / 2;
        shadowMesh.position.y = 0.02;
        this.playerGroup.add(shadowMesh);

        // Dual Walking Boots
        const bootMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.6 });
        const bootGeo = new THREE.BoxGeometry(0.18, 0.36, 0.28);

        this.playerLegL = new THREE.Mesh(bootGeo, bootMat);
        this.playerLegL.position.set(-0.16, 0.18, 0);
        this.playerLegL.castShadow = true;
        this.playerGroup.add(this.playerLegL);

        this.playerLegR = new THREE.Mesh(bootGeo, bootMat);
        this.playerLegR.position.set(0.16, 0.18, 0);
        this.playerLegR.castShadow = true;
        this.playerGroup.add(this.playerLegR);

        // Stealth Operative Torso / Armor
        const torsoMat = new THREE.MeshStandardMaterial({
            color: 0x1e293b,
            roughness: 0.45,
            metalness: 0.3
        });
        const torsoGeo = new THREE.BoxGeometry(0.58, 0.65, 0.38);
        const torsoMesh = new THREE.Mesh(torsoGeo, torsoMat);
        torsoMesh.position.y = 0.62;
        torsoMesh.castShadow = true;
        torsoMesh.receiveShadow = true;
        this.playerGroup.add(torsoMesh);

        // Glowing Cyan Core Trim on Chest
        const coreGeo = new THREE.BoxGeometry(0.18, 0.18, 0.06);
        const coreMat = new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x38bdf8,
            emissiveIntensity: 1.2
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        coreMesh.position.set(0, 0.66, 0.2);
        this.playerGroup.add(coreMesh);

        // Operative Head / Mask with Illuminated Neon Visor
        const headGeo = new THREE.BoxGeometry(0.42, 0.4, 0.42);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = 1.1;
        headMesh.castShadow = true;
        this.playerGroup.add(headMesh);

        // Glowing Visor
        const visorGeo = new THREE.BoxGeometry(0.34, 0.1, 0.08);
        const visorMat = new THREE.MeshStandardMaterial({
            color: 0x00f5d4,
            emissive: 0x00f5d4,
            emissiveIntensity: 1.8
        });
        const visorMesh = new THREE.Mesh(visorGeo, visorMat);
        visorMesh.position.set(0, 1.1, 0.21);
        this.playerGroup.add(visorMesh);

        // Handheld Torch / Tactical Lantern
        const lanternGeo = new THREE.CylinderGeometry(0.08, 0.1, 0.26, 8);
        const lanternMat = new THREE.MeshStandardMaterial({
            color: 0xffb703,
            emissive: 0xffaa00,
            emissiveIntensity: 1.5
        });
        this.playerTorch = new THREE.Mesh(lanternGeo, lanternMat);
        this.playerTorch.position.set(0.38, 0.65, 0.24);
        this.playerGroup.add(this.playerTorch);

        // -----------------------------------------------------
        // DYNAMIC VISION LIGHTING & LINE-OF-SIGHT SHADOWS
        // -----------------------------------------------------
        // 1. Warm Player Torch PointLight (Dynamic localized illumination)
        this.torchLight = new THREE.PointLight(0xffa826, 2.8, 17, 2);
        this.torchLight.position.set(0.38, 0.9, 0.25);
        this.torchLight.castShadow = true;
        this.torchLight.shadow.mapSize.width = 1024;
        this.torchLight.shadow.mapSize.height = 1024;
        this.torchLight.shadow.bias = -0.002;
        this.playerGroup.add(this.torchLight);

        // 2. Forward Tactical Vision Spotlight (Hunter Assassin sweeping vision cone)
        this.visionSpotLight = new THREE.SpotLight(0xfff5ea, 3.4, 21, Math.PI / 4.2, 0.5, 1.8);
        this.visionSpotLight.position.set(0, 1.0, 0.2);
        this.visionSpotLight.castShadow = true;
        this.visionSpotLight.shadow.mapSize.width = 1024;
        this.visionSpotLight.shadow.mapSize.height = 1024;
        this.visionSpotLight.shadow.bias = -0.002;

        this.spotTarget = new THREE.Object3D();
        this.spotTarget.position.set(0, 0.5, 5);
        this.playerGroup.add(this.spotTarget);
        this.visionSpotLight.target = this.spotTarget;
        this.playerGroup.add(this.visionSpotLight);

        // Orbiting Firefly Wisps
        for (let i = 0; i < 4; i++) {
            const wispGeo = new THREE.SphereGeometry(0.04, 6, 6);
            const wispMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffb703 : 0x00f5d4 });
            const wisp = new THREE.Mesh(wispGeo, wispMat);
            this.wisps.push({
                mesh: wisp,
                angle: (i * Math.PI) / 2,
                radius: 0.65 + i * 0.1,
                speed: 2.2 * (i % 2 === 0 ? 1 : -1)
            });
            this.playerGroup.add(wisp);
        }

        this.scene.add(this.playerGroup);
    }

    /* -----------------------------------------------------
       4. 3D COLLECTIBLES (LETTERS A, C, N)
       ----------------------------------------------------- */
    buildLetterCollectibles() {
        this.letterGroups.forEach(l => {
            if (l.group) this.scene.remove(l.group);
        });
        this.letterGroups = [];

        const letterDefs = {
            'A': { color: 0xffb703, lightColor: 0xffb703, hex: '#ffb703' },
            'C': { color: 0x00f5d4, lightColor: 0x00f5d4, hex: '#00f5d4' },
            'N': { color: 0xff006e, lightColor: 0xff006e, hex: '#ff006e' }
        };

        this.maze.letters.forEach(letter => {
            const def = letterDefs[letter.id] || letterDefs['A'];
            const group = new THREE.Group();
            const wx = letter.x * CELL_SIZE;
            const wz = letter.y * CELL_SIZE;
            group.position.set(wx, 0, wz);

            // 1. Runic Stone Floor Medallion
            const ringGeo = new THREE.RingGeometry(0.55, 0.78, 24);
            const ringMat = new THREE.MeshBasicMaterial({
                color: def.color,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.6
            });
            const ringMesh = new THREE.Mesh(ringGeo, ringMat);
            ringMesh.rotation.x = -Math.PI / 2;
            ringMesh.position.y = 0.03;
            group.add(ringMesh);

            // 2. Procedural 3D Extruded Letter Mesh
            const letterGeo = this.create3DLetterGeometry(letter.id);
            const letterMat = new THREE.MeshStandardMaterial({
                color: def.color,
                emissive: def.color,
                emissiveIntensity: 0.65,
                roughness: 0.25,
                metalness: 0.6
            });
            const letterMesh = new THREE.Mesh(letterGeo, letterMat);
            letterMesh.castShadow = true;
            group.add(letterMesh);

            // 3. Local Glowing PointLight for Rune
            const light = new THREE.PointLight(def.lightColor, 2.0, 7.5, 2);
            light.position.set(0, 1.0, 0);
            group.add(light);

            this.scene.add(group);

            this.letterGroups.push({
                id: letter.id,
                gridX: letter.x,
                gridY: letter.y,
                group: group,
                mesh: letterMesh,
                ring: ringMesh,
                light: light,
                collected: letter.collected,
                baseY: 0.85
            });
        });
    }

    create3DLetterGeometry(char) {
        const shape = new THREE.Shape();
        const extrudeSettings = {
            depth: 0.16,
            bevelEnabled: true,
            bevelThickness: 0.04,
            bevelSize: 0.03,
            bevelSegments: 2
        };

        if (char === 'A') {
            // Letter A outline
            shape.moveTo(-0.35, -0.45);
            shape.lineTo(0, 0.45);
            shape.lineTo(0.35, -0.45);
            shape.lineTo(0.18, -0.45);
            shape.lineTo(0.1, -0.15);
            shape.lineTo(-0.1, -0.15);
            shape.lineTo(-0.18, -0.45);
            shape.closePath();

            // Inner hole for A
            const hole = new THREE.Path();
            hole.moveTo(0, 0.25);
            hole.lineTo(-0.08, -0.02);
            hole.lineTo(0.08, -0.02);
            hole.closePath();
            shape.holes.push(hole);
        } else if (char === 'C') {
            // Letter C outline
            shape.moveTo(0.32, 0.32);
            shape.lineTo(0.35, 0.45);
            shape.lineTo(-0.35, 0.45);
            shape.lineTo(-0.35, -0.45);
            shape.lineTo(0.35, -0.45);
            shape.lineTo(0.32, -0.32);
            shape.lineTo(-0.18, -0.32);
            shape.lineTo(-0.18, 0.32);
            shape.closePath();
        } else {
            // Letter N outline
            shape.moveTo(-0.34, -0.45);
            shape.lineTo(-0.34, 0.45);
            shape.lineTo(-0.14, 0.45);
            shape.lineTo(0.14, -0.15);
            shape.lineTo(0.14, 0.45);
            shape.lineTo(0.34, 0.45);
            shape.lineTo(0.34, -0.45);
            shape.lineTo(0.14, -0.45);
            shape.lineTo(-0.14, 0.15);
            shape.lineTo(-0.14, -0.45);
            shape.closePath();
        }

        const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geo.center(); // Center geometry for clean rotation
        return geo;
    }

    /* -----------------------------------------------------
       5. 3D AMBIENT ATMOSPHERIC MOTES
       ----------------------------------------------------- */
    buildAmbientDust() {
        const dustCount = 80;
        const dustGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(dustCount * 3);

        const range = 24;
        for (let i = 0; i < dustCount; i++) {
            positions[i * 3] = (Math.random() - 0.5) * range;
            positions[i * 3 + 1] = Math.random() * 3.5 + 0.2;
            positions[i * 3 + 2] = (Math.random() - 0.5) * range;
        }

        dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const dustMat = new THREE.PointsMaterial({
            color: 0x38bdf8,
            size: 0.12,
            transparent: true,
            opacity: 0.45
        });

        this.dustPoints = new THREE.Points(dustGeo, dustMat);
        this.scene.add(this.dustPoints);
    }

    /* -----------------------------------------------------
       6. INPUT BINDINGS (KEYBOARD, VIRTUAL JOYSTICK, D-PAD)
       ----------------------------------------------------- */
    bindInputEvents() {
        // Keyboard inputs
        window.addEventListener('keydown', (e) => {
            this.sound.init();
            this.keys[e.key.toLowerCase()] = true;
            this.updateInputVector();
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
            this.updateInputVector();
        });

        // UI header buttons
        const restartBtn = document.getElementById('restartBtn');
        if (restartBtn) restartBtn.addEventListener('click', () => this.resetGame());

        const soundBtn = document.getElementById('soundToggleBtn');
        if (soundBtn) {
            soundBtn.addEventListener('click', () => {
                this.sound.init();
                this.sound.enabled = !this.sound.enabled;
                soundBtn.textContent = this.sound.enabled ? '🔊 Audio: On' : '🔇 Audio: Off';
                soundBtn.classList.toggle('muted', !this.sound.enabled);
            });
        }

        // On-Screen D-Pad buttons
        this.bindDPadButtons();

        // Touch & Virtual Floating Joystick
        this.bindTouchJoystick();
    }

    updateInputVector() {
        let ix = 0;
        let iz = 0;

        if (this.keys['arrowup'] || this.keys['w']) iz -= 1;
        if (this.keys['arrowdown'] || this.keys['s']) iz += 1;
        if (this.keys['arrowleft'] || this.keys['a']) ix -= 1;
        if (this.keys['arrowright'] || this.keys['d']) ix += 1;

        // If joystick is active, it takes priority or blends smoothly
        if (this.touchActive) {
            ix = this.inputVector.x;
            iz = this.inputVector.z;
        } else {
            const len = Math.hypot(ix, iz);
            if (len > 0) {
                this.inputVector.x = ix / len;
                this.inputVector.z = iz / len;
            } else {
                this.inputVector.x = 0;
                this.inputVector.z = 0;
            }
        }
    }

    bindDPadButtons() {
        const dpadMap = [
            { id: 'btnUp', x: 0, z: -1 },
            { id: 'btnDown', x: 0, z: 1 },
            { id: 'btnLeft', x: -1, z: 0 },
            { id: 'btnRight', x: 1, z: 0 }
        ];

        dpadMap.forEach(({ id, x, z }) => {
            const btn = document.getElementById(id);
            if (!btn) return;

            const handlePress = (e) => {
                e.preventDefault();
                this.sound.init();
                this.inputVector.x = x;
                this.inputVector.z = z;
            };

            const handleRelease = (e) => {
                e.preventDefault();
                this.inputVector.x = 0;
                this.inputVector.z = 0;
            };

            btn.addEventListener('touchstart', handlePress, { passive: false });
            btn.addEventListener('touchend', handleRelease, { passive: false });
            btn.addEventListener('mousedown', handlePress);
            btn.addEventListener('mouseup', handleRelease);
        });
    }

    bindTouchJoystick() {
        const container = this.canvas.parentElement;
        if (!container) return;

        const onTouchStart = (e) => {
            if (e.target.closest('.mobile-dpad') || e.target.closest('button')) return;
            this.sound.init();
            const touch = e.touches ? e.touches[0] : e;
            const rect = container.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            this.touchActive = true;
            this.touchOrigin = { x, y };

            if (this.joystickBase && this.joystickKnob) {
                this.joystickBase.style.left = `${x}px`;
                this.joystickBase.style.top = `${y}px`;
                this.joystickBase.style.display = 'block';
                this.joystickKnob.style.transform = `translate(-50%, -50%)`;
            }
        };

        const onTouchMove = (e) => {
            if (!this.touchActive) return;
            const touch = e.touches ? e.touches[0] : e;
            const rect = container.getBoundingClientRect();
            const curX = touch.clientX - rect.left;
            const curY = touch.clientY - rect.top;

            const dx = curX - this.touchOrigin.x;
            const dy = curY - this.touchOrigin.y;
            const dist = Math.hypot(dx, dy);
            const maxRadius = 45;

            if (dist > 0) {
                const clamped = Math.min(dist, maxRadius);
                const normX = dx / dist;
                const normY = dy / dist;

                this.inputVector.x = normX * (clamped / maxRadius);
                this.inputVector.z = normY * (clamped / maxRadius);

                if (this.joystickKnob) {
                    const knobX = normX * clamped;
                    const knobY = normY * clamped;
                    this.joystickKnob.style.transform = `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`;
                }
            }
        };

        const onTouchEnd = () => {
            this.touchActive = false;
            this.inputVector.x = 0;
            this.inputVector.z = 0;
            if (this.joystickBase) this.joystickBase.style.display = 'none';
            this.updateInputVector();
        };

        container.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: true });
        window.addEventListener('touchend', onTouchEnd, { passive: true });

        // Mouse drag simulation for desktop testing
        container.addEventListener('mousedown', onTouchStart);
        window.addEventListener('mousemove', onTouchMove);
        window.addEventListener('mouseup', onTouchEnd);
    }

    /* -----------------------------------------------------
       7. CLEAN WALL COLLISION & SLIDING PHYSICS
       ----------------------------------------------------- */
    updatePlayerPhysics(dt) {
        const inputLen = Math.hypot(this.inputVector.x, this.inputVector.z);
        this.player.isMoving = inputLen > 0.05 && !this.isGameOver;

        if (this.player.isMoving) {
            const moveSpeed = this.player.speed * Math.min(1.0, inputLen);
            const moveX = this.inputVector.x * moveSpeed * dt;
            const moveZ = this.inputVector.z * moveSpeed * dt;

            // Target facing angle
            this.player.targetAngle = Math.atan2(this.inputVector.x, this.inputVector.z);

            // Separate Axis Collision Resolution (Enables smooth sliding around corners)
            const nextX = this.player.x + moveX;
            if (!this.checkWallCollision(nextX, this.player.z)) {
                this.player.x = nextX;
            }

            const nextZ = this.player.z + moveZ;
            if (!this.checkWallCollision(this.player.x, nextZ)) {
                this.player.z = nextZ;
            }

            // Slerp player rotation
            let angleDiff = this.player.targetAngle - this.player.angle;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            this.player.angle += angleDiff * Math.min(1, dt * 14);

            // Walk cycle animation
            this.player.walkCycle += dt * 12;
            if (this.playerLegL && this.playerLegR) {
                const swing = Math.sin(this.player.walkCycle) * 0.28;
                this.playerLegL.rotation.x = swing;
                this.playerLegR.rotation.x = -swing;
            }

            // Footstep sound cadence
            if (Math.sin(this.player.walkCycle) > 0.95 && !this.stepping) {
                this.sound.playStep();
                this.stepping = true;
            } else if (Math.sin(this.player.walkCycle) < 0) {
                this.stepping = false;
            }
        } else {
            // Idle breathing oscillation
            if (this.playerLegL && this.playerLegR) {
                this.playerLegL.rotation.x = 0;
                this.playerLegR.rotation.x = 0;
            }
        }

        // Apply transform to player group
        if (this.playerGroup) {
            this.playerGroup.position.x = this.player.x;
            this.playerGroup.position.z = this.player.z;
            this.playerGroup.rotation.y = this.player.angle;
            // Subtle vertical walk bounce
            this.playerGroup.position.y = this.player.isMoving ? Math.abs(Math.sin(this.player.walkCycle)) * 0.05 : 0;
        }

        // Check grid step & collectible discovery
        const curCellX = Math.round(this.player.x / CELL_SIZE);
        const curCellY = Math.round(this.player.z / CELL_SIZE);

        if (curCellX !== this.lastStepTile.x || curCellY !== this.lastStepTile.y) {
            this.lastStepTile = { x: curCellX, y: curCellY };
            this.steps++;
            this.updateHUD();
            this.maze.markTraveled(curCellX, curCellY);

            // Check if player stepped onto letter collectible
            this.checkLetterPickup(curCellX, curCellY);
        }
    }

    checkWallCollision(px, pz) {
        const radius = PLAYER_COLLISION_RADIUS;
        const minC = Math.max(0, Math.floor((px - radius) / CELL_SIZE));
        const maxC = Math.min(this.maze.cols - 1, Math.floor((px + radius) / CELL_SIZE));
        const minR = Math.max(0, Math.floor((pz - radius) / CELL_SIZE));
        const maxR = Math.min(this.maze.rows - 1, Math.floor((pz + radius) / CELL_SIZE));

        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                if (this.maze.isWall(c, r)) {
                    // Wall AABB bounds
                    const minX = c * CELL_SIZE - HALF_CELL;
                    const maxX = c * CELL_SIZE + HALF_CELL;
                    const minZ = r * CELL_SIZE - HALF_CELL;
                    const maxZ = r * CELL_SIZE + HALF_CELL;

                    // Closest point on wall AABB
                    const closeX = Math.max(minX, Math.min(px, maxX));
                    const closeZ = Math.max(minZ, Math.min(pz, maxZ));

                    const distX = px - closeX;
                    const distZ = pz - closeZ;
                    if (distX * distX + distZ * distZ < radius * radius) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /* -----------------------------------------------------
       8. LETTER PICKUP & WIN SEQUENCE
       ----------------------------------------------------- */
    checkLetterPickup(cellX, cellY) {
        const letter = this.maze.checkLetterAt(cellX, cellY);
        if (!letter) return;

        this.collectedSequence.push(letter.id);
        this.sound.playLetterCollect(letter.id);

        // Find 3D letter mesh & trigger collection burst
        const found = this.letterGroups.find(l => l.id === letter.id);
        if (found) {
            found.collected = true;
            this.spawnCollectionParticles(found.group.position.x, 0.8, found.group.position.z, found.light.color);
            // Hide or scale-out collectible
            found.group.visible = false;
        }

        // Update minimal HUD badge: A: [✓], C: [✓], N: [✓]
        const badge = document.getElementById(`badge${letter.id}`);
        if (badge) {
            badge.classList.add('collected');
            badge.innerHTML = `${letter.id}: [✓]`;
        }

        this.updateHUD();
        this.notify(`Spelling ACM: Discovered letter '${letter.id}'! (${this.collectedSequence.length}/3)`);

        // Check victory condition: all target letters collected
        if (this.maze.isComplete()) {
            this.triggerVictory();
        }
    }

    spawnCollectionParticles(x, y, z, threeColor) {
        const count = 32;
        const colorHex = threeColor ? threeColor.getHex() : 0x00f5d4;

        for (let i = 0; i < count; i++) {
            const geo = new THREE.SphereGeometry(Math.random() * 0.08 + 0.04, 6, 6);
            const mat = new THREE.MeshBasicMaterial({ color: colorHex });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(x, y, z);

            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 3.5 + 1.2;
            this.particles.push({
                mesh: mesh,
                vx: Math.cos(angle) * speed,
                vy: Math.random() * 3.0 + 2.0,
                vz: Math.sin(angle) * speed,
                life: 1.0,
                decay: Math.random() * 0.8 + 0.7
            });
            this.scene.add(mesh);
        }
    }

    triggerVictory() {
        if (this.isGameOver) return;
        this.isGameOver = true;
        clearInterval(this.timerInterval);
        this.sound.playVictory();

        // Victory firework burst on player
        this.spawnCollectionParticles(this.player.x, 1.2, this.player.z, new THREE.Color(0xffb703));
        this.spawnCollectionParticles(this.player.x, 1.6, this.player.z, new THREE.Color(0x00f5d4));

        if (typeof this.onSpellComplete === 'function') {
            setTimeout(() => {
                this.onSpellComplete({
                    seconds: this.elapsedSeconds,
                    steps: this.steps,
                    sequence: this.collectedSequence
                });
            }, 500);
        }
    }

    /* -----------------------------------------------------
       9. SMOOTH CAMERA TRACKING & SCENE UPDATES
       ----------------------------------------------------- */
    updateCameraFollow(dt) {
        if (!this.camera) return;

        // Slanted Top-Down Follow (Hunter Assassin Perspective)
        const camElevation = 14.2;
        const camZOffset = 7.8;

        const targetCamX = this.player.x;
        const targetCamZ = this.player.z + camZOffset;

        // Smooth camera dampening
        const factor = 1 - Math.exp(-9.0 * dt);
        this.camTarget.x += (targetCamX - this.camTarget.x) * factor;
        this.camTarget.z += (targetCamZ - this.camTarget.z) * factor;

        this.camera.position.set(this.camTarget.x, camElevation, this.camTarget.z);
        this.camera.lookAt(this.camTarget.x, 0.45, this.camTarget.z - camZOffset);

        // Keep dust points centered on player viewport
        if (this.dustPoints) {
            this.dustPoints.position.x = this.player.x;
            this.dustPoints.position.z = this.player.z;
        }
    }

    updateSceneAnimations(dt, time) {
        // Torch flicker modulation
        if (this.torchLight) {
            this.torchLight.intensity = 2.6 + Math.sin(time * 14) * 0.22 + Math.sin(time * 26) * 0.12;
        }

        // Orbiting wisps around player
        this.wisps.forEach(w => {
            w.angle += w.speed * dt;
            w.mesh.position.x = Math.cos(w.angle) * w.radius;
            w.mesh.position.z = Math.sin(w.angle) * w.radius;
            w.mesh.position.y = 0.85 + Math.sin(time * 4 + w.angle) * 0.2;
        });

        // 3D Letter collectibles bobbing & rotation
        this.letterGroups.forEach(l => {
            if (!l.collected && l.mesh) {
                l.mesh.rotation.y += dt * 1.8;
                l.mesh.position.y = l.baseY + Math.sin(time * 3.2 + l.gridX) * 0.18;
                if (l.ring) {
                    l.ring.rotation.z += dt * 0.9;
                }
            }
        });

        // Particle physics update
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= p.decay * dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                if (p.mesh.geometry) p.mesh.geometry.dispose();
                this.particles.splice(i, 1);
            } else {
                p.mesh.position.x += p.vx * dt;
                p.mesh.position.y += p.vy * dt;
                p.mesh.position.z += p.vz * dt;
                p.vy -= 9.8 * dt; // gravity
                p.mesh.scale.setScalar(p.life);
            }
        }
    }

    /* -----------------------------------------------------
       10. MAIN GAME LOOP
       ----------------------------------------------------- */
    loop(timestamp) {
        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        const dt = Math.min((timestamp - this.lastTimestamp) / 1000, 0.1);
        this.lastTimestamp = timestamp;
        this.animTime += dt;

        this.updatePlayerPhysics(dt);
        this.updateCameraFollow(dt);
        this.updateSceneAnimations(dt, this.animTime);

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }

        requestAnimationFrame((t) => this.loop(t));
    }

    /* -----------------------------------------------------
       11. HUD, TIMERS & RESET FLOW
       ----------------------------------------------------- */
    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.elapsedSeconds = 0;
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            this.elapsedSeconds++;
            this.updateHUD();
        }, 1000);
    }

    updateHUD() {
        const stepVal = document.getElementById('stepVal');
        if (stepVal) stepVal.textContent = this.steps;

        const orderVal = document.getElementById('orderVal');
        if (orderVal) {
            orderVal.textContent = this.collectedSequence.length > 0
                ? this.collectedSequence.join(' ➔ ')
                : 'None yet (Any sequence allowed)';
        }

        // Minimal HUD Letter Badges: A: [ ], C: [ ], N: [ ]
        ['A', 'C', 'N'].forEach(id => {
            const badge = document.getElementById(`badge${id}`);
            if (badge) {
                const isFound = this.collectedSequence.includes(id);
                badge.classList.toggle('collected', isFound);
                badge.innerHTML = isFound ? `${id}: [✓]` : `${id}: [ ]`;
            }
        });
    }

    notify(msg) {
        const banner = document.getElementById('statusBanner');
        if (banner) {
            banner.textContent = msg;
            banner.classList.remove('pulse');
            void banner.offsetWidth;
            banner.classList.add('pulse');
        }
    }

    resetGame() {
        // Generate fresh maze & randomized A, C, N positions
        this.maze = new Maze(this.mazeSize, this.mazeSize);

        // Reset player transform
        this.player.x = this.maze.startPos.x * CELL_SIZE;
        this.player.z = this.maze.startPos.y * CELL_SIZE;
        this.player.angle = 0;
        this.player.targetAngle = 0;
        this.lastStepTile = { x: this.maze.startPos.x, y: this.maze.startPos.y };
        this.camTarget.x = this.player.x;
        this.camTarget.z = this.player.z;

        this.steps = 0;
        this.isGameOver = false;
        this.collectedSequence = [];

        // Clear and rebuild 3D maze & collectibles
        if (this.wallsGroup) this.scene.remove(this.wallsGroup);
        this.buildDungeonMaze();
        this.buildLetterCollectibles();

        this.startTimer();
        this.updateHUD();
        this.notify("Explore the 3D labyrinth to uncover hidden spell letters A, C, and N!");
    }
}

// Start game when DOM is loaded
window.addEventListener('DOMContentLoaded', () => {
    window.gameInstance = new Game();
});
