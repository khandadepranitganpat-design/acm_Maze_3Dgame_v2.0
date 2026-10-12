/**
 * Maze Generator & Manager
 * Implements Medium Difficulty Maze Generation via Randomized Depth-First Search (Recursive Backtracker)
 */
class Maze {
    constructor(cols = 25, rows = 25) {
        // Must be odd numbers for wall/corridor grid
        this.cols = cols % 2 === 0 ? cols + 1 : cols;
        this.rows = rows % 2 === 0 ? rows + 1 : rows;
        this.grid = []; // 1 = Wall, 0 = Path
        this.traveled = []; // Boolean 2D array: true if player walked here
        this.letters = []; // [ { id: 'A', x, y, collected: false, revealed: false, animTime: 0 } ]
        this.startPos = { x: 1, y: 1 };
        this.init();
    }

    init() {
        // Initialize grid full of walls (1)
        this.grid = Array.from({ length: this.rows }, () => Array(this.cols).fill(1));
        this.traveled = Array.from({ length: this.rows }, () => Array(this.cols).fill(false));

        // Generate medium-hardness maze using recursive backtracker
        this.generateMaze();

        // Mark player start as traveled
        this.startPos = { x: 1, y: 1 };
        this.grid[this.startPos.y][this.startPos.x] = 0;
        this.traveled[this.startPos.y][this.startPos.x] = true;

        // Spawn ACM spell letters randomly on path cells
        this.spawnLetters();
    }

    generateMaze() {
        // Depth-First Search carving with occasional loop factor for medium navigation
        const stack = [];
        const startX = 1;
        const startY = 1;
        this.grid[startY][startX] = 0;
        stack.push([startX, startY]);

        const directions = [
            [0, -2], // North
            [2, 0],  // East
            [0, 2],  // South
            [-2, 0]  // West
        ];

        while (stack.length > 0) {
            const [cx, cy] = stack[stack.length - 1];
            // Find unvisited neighbors at step 2
            const neighbors = [];

            // Shuffle directions randomly
            const shuffledDirs = [...directions].sort(() => Math.random() - 0.5);

            for (const [dx, dy] of shuffledDirs) {
                const nx = cx + dx;
                const ny = cy + dy;

                if (nx > 0 && nx < this.cols - 1 && ny > 0 && ny < this.rows - 1) {
                    if (this.grid[ny][nx] === 1) {
                        neighbors.push([nx, ny, dx, dy]);
                    }
                }
            }

            if (neighbors.length > 0) {
                // Pick one random neighbor
                const [nx, ny, dx, dy] = neighbors[Math.floor(Math.random() * neighbors.length)];
                // Carve wall between
                this.grid[cy + dy / 2][cx + dx / 2] = 0;
                // Carve cell
                this.grid[ny][nx] = 0;
                stack.push([nx, ny]);
            } else {
                stack.pop();
            }
        }

        // Add a few subtle braids/loops (medium difficulty features instead of pure strict tree)
        // This gives multiple navigation choices and reduces frustration while keeping maze challenging
        const loopCount = Math.floor((this.cols * this.rows) * 0.015);
        for (let i = 0; i < loopCount; i++) {
            const rx = 1 + 2 * Math.floor(Math.random() * ((this.cols - 2) / 2));
            const ry = 1 + 2 * Math.floor(Math.random() * ((this.rows - 2) / 2));
            const [dx, dy] = directions[Math.floor(Math.random() * directions.length)];
            const wx = rx + dx / 2;
            const wy = ry + dy / 2;
            if (wx > 0 && wx < this.cols - 1 && wy > 0 && wy < this.rows - 1) {
                this.grid[wy][wx] = 0;
            }
        }
    }

    spawnLetters() {
        // Find all walkable empty path cells except start area
        const pathCells = [];
        for (let r = 1; r < this.rows - 1; r++) {
            for (let c = 1; c < this.cols - 1; c++) {
                if (this.grid[r][c] === 0) {
                    // Avoid immediate start vicinity (manhattan distance > 6)
                    const distFromStart = Math.abs(c - this.startPos.x) + Math.abs(r - this.startPos.y);
                    if (distFromStart > 6) {
                        pathCells.push({ x: c, y: r });
                    }
                }
            }
        }

        // Shuffle path cells
        pathCells.sort(() => Math.random() - 0.5);

        // Pick distinct positions for letters 'A', 'C', 'M'
        // Ensure distance between each letter is significant
        const spellLetters = ['A', 'C', 'M'];
        this.letters = [];

        for (const char of spellLetters) {
            let chosenIndex = -1;

            for (let i = 0; i < pathCells.length; i++) {
                const cell = pathCells[i];
                // Check distance against already picked letters
                const tooClose = this.letters.some(l => {
                    const dist = Math.abs(l.x - cell.x) + Math.abs(l.y - cell.y);
                    return dist < 8; // At least 8 tiles away from each other
                });

                if (!tooClose) {
                    chosenIndex = i;
                    break;
                }
            }

            // Fallback to first available if distance constraint couldn't be met
            if (chosenIndex === -1 && pathCells.length > 0) {
                chosenIndex = 0;
            }

            if (chosenIndex !== -1) {
                const [picked] = pathCells.splice(chosenIndex, 1);
                this.letters.push({
                    id: char,
                    x: picked.x,
                    y: picked.y,
                    collected: false,
                    revealed: false,
                    animScale: 1,
                    burstParticles: []
                });
            }
        }
    }

    isWall(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return true;
        return this.grid[y][x] === 1;
    }

    markTraveled(x, y) {
        if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
            this.traveled[y][x] = true;
        }
    }

    checkLetterAt(x, y) {
        for (const letter of this.letters) {
            if (!letter.collected && letter.x === x && letter.y === y) {
                letter.revealed = true;
                letter.collected = true;
                return letter;
            }
        }
        return null;
    }

    getRemainingLettersCount() {
        return this.letters.filter(l => !l.collected).length;
    }

    isComplete() {
        return this.letters.every(l => l.collected);
    }
}
