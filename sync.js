/**
 * ACM Spell Maze - Universal Real-Time Synchronization Engine
 * Automatically selects the best sync provider:
 * 1. Vercel Serverless API (/api/room) with Cloud Persistence
 * 2. Firebase Cloud Firestore
 * 3. Local BroadcastChannel + LocalStorage (Offline testing fallback)
 */

class GameSync {
    constructor(roomId = "ACM2026") {
        this.roomId = (roomId || "ACM2026").toUpperCase();
        this.provider = null; // Will resolve via initPromise
        this.db = null;
        this.listeners = [];
        this.isPolling = false;
        this.cachedState = {
            status: "LOBBY", // LOBBY | COUNTDOWN | STARTED | ENDED
            timeLimit: 120, // seconds
            startTime: null,
            countdownStart: null,
            players: {}
        };

        this.initPromise = this.init();
    }

    async init() {
        // Priority 1: Firebase if configured
        if (typeof window.isFirebaseConfigured === 'function' && window.isFirebaseConfigured()) {
            this.provider = "FIREBASE";
            await this.initFirebase();
            return;
        }

        // Priority 2: Check if Vercel /api/room is reachable
        const hasVercelApi = await this.checkVercelApi();
        if (hasVercelApi) {
            this.provider = "VERCEL";
            this.initVercelSync();
            return;
        }

        // Priority 3: Local cross-tab sync fallback
        this.provider = "LOCAL";
        this.initLocalSync();
    }

    async checkVercelApi() {
        if (window.location.protocol === "file:") return false;
        try {
            const res = await fetch(`/api/room?roomId=${this.roomId}`, {
                method: "GET",
                cache: "no-store"
            });
            if (res.ok) {
                const data = await res.json();
                if (data && data.room) {
                    this.cachedState = Object.assign(this.cachedState, data.room);
                    this.notifyListeners();
                }
                return true;
            }
        } catch (e) {}
        return false;
    }

    /* -----------------------------------------------------
       PROVIDER 1: VERCEL SERVERLESS API SYNC
       ----------------------------------------------------- */
    initVercelSync() {
        console.log("⚡ Vercel Cloud Serverless Sync Active for Room:", this.roomId);
        if (this.isPolling) return;
        this.isPolling = true;

        const pollRoom = async () => {
            try {
                const res = await fetch(`/api/room?roomId=${this.roomId}`, {
                    cache: "no-store"
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.room) {
                        this.cachedState = Object.assign(this.cachedState, data.room);
                        if (this.cachedState.status === "COUNTDOWN" && this.cachedState.countdownStart) {
                            if (Date.now() >= this.cachedState.countdownStart + 3000) {
                                this.cachedState.status = "STARTED";
                                if (!this.cachedState.startTime) {
                                    this.cachedState.startTime = this.cachedState.countdownStart + 3000;
                                }
                            }
                        }
                        this.notifyListeners();
                    }
                }
            } catch (e) {}
        };

        pollRoom();
        setInterval(pollRoom, 400); // Poll every 400ms for tight sync
    }

    async vercelAction(action, payload = {}) {
        try {
            const res = await fetch(`/api/room`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, roomId: this.roomId, ...payload })
            });
            const data = await res.json();
            if (data && data.room) {
                this.cachedState = Object.assign(this.cachedState, data.room);
                this.notifyListeners();
            }
            return data;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /* -----------------------------------------------------
       PROVIDER 2: FIREBASE FIRESTORE SYNC
       ----------------------------------------------------- */
    async initFirebase() {
        try {
            const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js");
            const { getFirestore, doc, onSnapshot } = 
                await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");

            const app = initializeApp(window.FIREBASE_CONFIG);
            this.db = getFirestore(app);

            const roomRef = doc(this.db, "acm_rooms", this.roomId);

            onSnapshot(roomRef, (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    this.cachedState.status = data.status || "LOBBY";
                    this.cachedState.timeLimit = data.timeLimit || 120;
                    this.cachedState.startTime = data.startTime ? (data.startTime.toMillis ? data.startTime.toMillis() : data.startTime) : null;
                    this.cachedState.countdownStart = data.countdownStart || null;
                    this.cachedState.players = data.players || {};
                    this.notifyListeners();
                }
            });
        } catch (err) {
            console.warn("Firebase init failed, falling back to Local Sync:", err);
            this.provider = "LOCAL";
            this.initLocalSync();
        }
    }

    /* -----------------------------------------------------
       PROVIDER 3: LOCAL TAB SYNC
       ----------------------------------------------------- */
    initLocalSync() {
        try {
            this.bc = new BroadcastChannel(`acm_sync_${this.roomId}`);
            this.bc.onmessage = (e) => {
                if (e.data && e.data.type === "STATE_UPDATE" && e.data.state) {
                    this.cachedState = e.data.state;
                    this.notifyListeners();
                }
            };
        } catch (e) {}

        window.addEventListener("storage", (e) => {
            if (e.key === `acm_state_${this.roomId}` && e.newValue) {
                try {
                    this.cachedState = JSON.parse(e.newValue);
                    this.notifyListeners();
                } catch (err) {}
            }
        });

        try {
            const saved = localStorage.getItem(`acm_state_${this.roomId}`);
            if (saved) {
                this.cachedState = Object.assign(this.cachedState, JSON.parse(saved));
            } else {
                this.saveLocalState();
            }
        } catch (e) {}

        setInterval(() => {
            try {
                const saved = localStorage.getItem(`acm_state_${this.roomId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (JSON.stringify(parsed) !== JSON.stringify(this.cachedState)) {
                        this.cachedState = parsed;
                        this.notifyListeners();
                    }
                }
            } catch (e) {}
        }, 150);

        this.notifyListeners();
    }

    saveLocalState() {
        try {
            localStorage.setItem(`acm_state_${this.roomId}`, JSON.stringify(this.cachedState));
            localStorage.setItem(`acm_state_ts_${this.roomId}`, Date.now().toString());
            if (this.bc) {
                this.bc.postMessage({ type: "STATE_UPDATE", state: this.cachedState });
            }
        } catch (e) {}
        this.notifyListeners();
    }

    onUpdate(callback) {
        this.listeners.push(callback);
        try {
            callback(this.cachedState);
        } catch (e) {}
    }

    notifyListeners() {
        for (const cb of this.listeners) {
            try {
                cb(this.cachedState);
            } catch (e) {}
        }
    }

    // Check if nickname is unique (case-insensitive)
    isNameAvailable(name) {
        if (this.provider === "LOCAL") {
            try {
                const saved = localStorage.getItem(`acm_state_${this.roomId}`);
                if (saved) {
                    const parsed = JSON.parse(saved);
                    if (parsed.players) {
                        this.cachedState.players = Object.assign({}, this.cachedState.players, parsed.players);
                    }
                }
            } catch (e) {}
        }

        const clean = name.trim().toLowerCase();
        for (const pid in this.cachedState.players) {
            const p = this.cachedState.players[pid];
            if (p.name && p.name.trim().toLowerCase() === clean) {
                return false;
            }
        }
        return true;
    }

    async joinPlayer(name) {
        // Ensure provider initialization has finished
        if (this.initPromise) {
            await this.initPromise;
        }

        const trimmed = name.trim();
        if (!trimmed) {
            return { success: false, error: "Please enter a valid nickname." };
        }

        if (this.provider === "VERCEL") {
            return await this.vercelAction("join", { name: trimmed });
        }

        if (this.provider === "FIREBASE" && this.db) {
            if (!this.isNameAvailable(trimmed)) {
                return { success: false, error: `The name "${trimmed}" is already taken! Please enter a different name.` };
            }
            try {
                const playerId = "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
                const playerObj = {
                    id: playerId,
                    name: trimmed,
                    joinedAt: Date.now(),
                    finished: false,
                    finishTimeSeconds: null,
                    finishTimeFormatted: null
                };
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                const roomRef = doc(this.db, "acm_rooms", this.roomId);
                await setDoc(roomRef, {
                    players: { [playerId]: playerObj }
                }, { merge: true });
                return { success: true, playerId, player: playerObj };
            } catch (e) {
                return { success: false, error: "Cloud sync error: " + e.message };
            }
        }

        // Local fallback
        if (!this.isNameAvailable(trimmed)) {
            return { success: false, error: `The name "${trimmed}" is already taken! Please enter a different name.` };
        }
        const playerId = "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
        const playerObj = {
            id: playerId,
            name: trimmed,
            joinedAt: Date.now(),
            finished: false,
            finishTimeSeconds: null,
            finishTimeFormatted: null
        };
        this.cachedState.players[playerId] = playerObj;
        this.saveLocalState();
        return { success: true, playerId, player: playerObj };
    }

    async markPlayerFinished(playerId, seconds, formatted) {
        if (this.initPromise) await this.initPromise;

        if (this.provider === "VERCEL") {
            return await this.vercelAction("finish", { playerId, seconds, formatted });
        }

        if (this.provider === "FIREBASE" && this.db) {
            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                const roomRef = doc(this.db, "acm_rooms", this.roomId);
                const updatedPlayer = {
                    ...this.cachedState.players[playerId],
                    finished: true,
                    finishTimeSeconds: seconds,
                    finishTimeFormatted: formatted
                };

                const updatePayload = {
                    players: {
                        [playerId]: updatedPlayer
                    }
                };

                // Check if all players finished
                const allPlayers = { ...this.cachedState.players, [playerId]: updatedPlayer };
                const pList = Object.values(allPlayers);
                if (this.cachedState.status === "STARTED" && pList.length > 0 && pList.every(p => p.finished)) {
                    updatePayload.status = "ENDED";
                }

                await setDoc(roomRef, updatePayload, { merge: true });
            } catch (e) {}
            return;
        }

        // Local fallback
        if (this.cachedState.players[playerId]) {
            this.cachedState.players[playerId].finished = true;
            this.cachedState.players[playerId].finishTimeSeconds = seconds;
            this.cachedState.players[playerId].finishTimeFormatted = formatted;

            // Check if all players have completed the game
            const pList = Object.values(this.cachedState.players);
            if (this.cachedState.status === "STARTED" && pList.length > 0 && pList.every(p => p.finished)) {
                this.cachedState.status = "ENDED";
            }

            this.saveLocalState();
        }
    }

    async startHostGame(timeLimitSeconds) {
        if (this.initPromise) await this.initPromise;
        const timeLimit = Math.max(10, parseInt(timeLimitSeconds) || 120);

        if (this.provider === "VERCEL") {
            // Trigger 3s countdown on server
            await this.vercelAction("countdown", { timeLimit });
            setTimeout(async () => {
                await this.vercelAction("start", { timeLimit });
            }, 3000);
            return;
        }

        if (this.provider === "FIREBASE" && this.db) {
            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                const roomRef = doc(this.db, "acm_rooms", this.roomId);
                const now = Date.now();

                // Reset finisher stats in cached players
                if (this.cachedState.players) {
                    Object.values(this.cachedState.players).forEach(p => {
                        p.finished = false;
                        p.finishTimeSeconds = null;
                        p.finishTimeFormatted = null;
                    });
                }

                await setDoc(roomRef, {
                    status: "COUNTDOWN",
                    timeLimit: timeLimit,
                    countdownStart: now,
                    startTime: now + 3000,
                    players: this.cachedState.players || {}
                }, { merge: true });

                setTimeout(async () => {
                    const { serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                    await setDoc(roomRef, {
                        status: "STARTED",
                        startTime: serverTimestamp()
                    }, { merge: true });
                }, 3000);
            } catch (e) {}
            return;
        }

        // Local fallback
        this.cachedState.status = "COUNTDOWN";
        this.cachedState.timeLimit = timeLimit;
        this.cachedState.countdownStart = Date.now();
        if (this.cachedState.players) {
            Object.values(this.cachedState.players).forEach(p => {
                p.finished = false;
                p.finishTimeSeconds = null;
                p.finishTimeFormatted = null;
            });
        }
        this.saveLocalState();

        setTimeout(() => {
            if (this.cachedState.status === "COUNTDOWN") {
                this.cachedState.status = "STARTED";
                this.cachedState.startTime = Date.now();
                this.saveLocalState();
            }
        }, 3500);
    }

    async endHostGame() {
        if (this.initPromise) await this.initPromise;
        if (this.provider === "VERCEL") {
            return await this.vercelAction("end");
        }
        if (this.provider === "FIREBASE" && this.db) {
            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                const roomRef = doc(this.db, "acm_rooms", this.roomId);
                await setDoc(roomRef, { status: "ENDED" }, { merge: true });
            } catch (e) {}
            return;
        }
        this.cachedState.status = "ENDED";
        this.saveLocalState();
    }

    async resetRoom() {
        if (this.initPromise) await this.initPromise;
        if (this.provider === "VERCEL") {
            return await this.vercelAction("reset");
        }
        if (this.provider === "FIREBASE" && this.db) {
            try {
                const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js");
                const roomRef = doc(this.db, "acm_rooms", this.roomId);
                await setDoc(roomRef, {
                    status: "LOBBY",
                    startTime: null,
                    countdownStart: null,
                    players: {}
                });
            } catch (e) {}
            return;
        }
        this.cachedState = {
            status: "LOBBY",
            timeLimit: 120,
            startTime: null,
            countdownStart: null,
            players: {}
        };
        this.saveLocalState();
    }
}
