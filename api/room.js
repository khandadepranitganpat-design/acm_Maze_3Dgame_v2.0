/**
 * Vercel Serverless Function: Real-Time Room State Manager
 * Enables seamless cross-network multiplayer across 4G/5G/Wi-Fi worldwide.
 */

// Global room state container (persisted across warm serverless invocations)
if (!global.__ACM_ROOMS__) {
    global.__ACM_ROOMS__ = {};
}
const rooms = global.__ACM_ROOMS__;

function getOrCreateRoom(roomId) {
    const id = (roomId || "ACM2026").toUpperCase();
    if (!rooms[id]) {
        rooms[id] = {
            id,
            status: "LOBBY", // LOBBY | COUNTDOWN | STARTED | ENDED
            timeLimit: 120,
            startTime: null,
            countdownStart: null,
            players: {},
            lastUpdated: Date.now()
        };
    }
    return rooms[id];
}

module.exports = function handler(req, res) {
    // Enable CORS for all devices & origins
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const roomId = (req.query.roomId || (req.body && req.body.roomId) || "ACM2026").toUpperCase();
    const room = getOrCreateRoom(roomId);

    if (req.method === "GET") {
        return res.status(200).json({ success: true, room });
    }

    if (req.method === "POST") {
        const body = req.body || {};
        const action = body.action;

        if (action === "join") {
            const name = (body.name || "").trim();
            if (!name) {
                return res.status(400).json({ success: false, error: "Please enter a nickname." });
            }

            // Check if name is already taken (case-insensitive)
            const cleanName = name.toLowerCase();
            const isTaken = Object.values(room.players).some(p => p.name && p.name.toLowerCase() === cleanName);
            if (isTaken) {
                return res.status(400).json({ success: false, error: `The name "${name}" is already taken! Please enter a different name.` });
            }

            const playerId = "p_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
            const playerObj = {
                id: playerId,
                name: name,
                joinedAt: Date.now(),
                finished: false,
                finishTimeSeconds: null,
                finishTimeFormatted: null
            };

            room.players[playerId] = playerObj;
            room.lastUpdated = Date.now();

            return res.status(200).json({ success: true, playerId, player: playerObj, room });
        }

        if (action === "countdown") {
            const timeLimit = Math.max(10, parseInt(body.timeLimit) || 120);
            room.status = "COUNTDOWN";
            room.timeLimit = timeLimit;
            room.countdownStart = Date.now();
            room.startTime = null;
            room.lastUpdated = Date.now();

            // Reset player finisher stats
            Object.values(room.players).forEach(p => {
                p.finished = false;
                p.finishTimeSeconds = null;
                p.finishTimeFormatted = null;
            });

            return res.status(200).json({ success: true, room });
        }

        if (action === "start") {
            const timeLimit = Math.max(10, parseInt(body.timeLimit) || 120);
            room.status = "STARTED";
            room.timeLimit = timeLimit;
            room.startTime = Date.now();
            room.lastUpdated = Date.now();

            return res.status(200).json({ success: true, room });
        }

        if (action === "finish") {
            const playerId = body.playerId;
            if (playerId && room.players[playerId]) {
                room.players[playerId].finished = true;
                room.players[playerId].finishTimeSeconds = body.seconds;
                room.players[playerId].finishTimeFormatted = body.formatted;
                room.lastUpdated = Date.now();
            }
            return res.status(200).json({ success: true, room });
        }

        if (action === "end") {
            room.status = "ENDED";
            room.lastUpdated = Date.now();
            return res.status(200).json({ success: true, room });
        }

        if (action === "reset") {
            room.status = "LOBBY";
            room.startTime = null;
            room.countdownStart = null;
            room.players = {};
            room.lastUpdated = Date.now();
            return res.status(200).json({ success: true, room });
        }

        return res.status(400).json({ success: false, error: "Invalid action." });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });
};
