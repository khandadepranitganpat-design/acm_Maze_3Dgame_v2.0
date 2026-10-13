/**
 * Vercel Serverless Function: Real-Time Room State Manager
 * Powered by high-speed global Redis persistence + in-memory warm cache.
 * Eliminates serverless split-brain: all 300 players share the exact same room state
 * across all cellular networks (4G/5G) and Wi-Fi connections worldwide.
 */

// Persistent Redis backend configuration (free serverless cloud store)
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || "https://grateful-walleye-229146.upstash.io";
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "gQAAAAAAA38aAQIgcDI5MmU3Y2I1ZGVhMjc0MzA2YmE5NmEwYWRiM2UyMWE5Yg";

// Local fallback in case of network timeout
if (!global.__ACM_ROOMS__) {
    global.__ACM_ROOMS__ = {};
}
const localMemoryRooms = global.__ACM_ROOMS__;

function getDefaultRoom(id) {
    return {
        id,
        status: "LOBBY", // LOBBY | COUNTDOWN | STARTED | ENDED
        timeLimit: 120,
        startTime: null,
        countdownStart: null,
        players: {},
        lastUpdated: Date.now()
    };
}

async function redisCommand(commandArray) {
    if (!REDIS_URL || !REDIS_TOKEN) return null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2500);

        const response = await fetch(REDIS_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${REDIS_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(commandArray),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            return data.result;
        }
    } catch (e) {
        // Fallback to local memory gracefully if Redis is momentarily unreachable
        console.warn("Redis fetch error:", e.message);
    }
    return null;
}

async function getRoomState(roomId) {
    const id = (roomId || "ACM2026").toUpperCase();
    const redisKey = `acm_room_${id}`;

    // Fetch from persistent Redis
    const raw = await redisCommand(["GET", redisKey]);
    if (raw) {
        try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            if (parsed && parsed.id) {
                localMemoryRooms[id] = parsed;
                return parsed;
            }
        } catch (e) {}
    }

    // Fallback to memory or create new
    if (!localMemoryRooms[id]) {
        localMemoryRooms[id] = getDefaultRoom(id);
        await saveRoomState(id, localMemoryRooms[id]);
    }
    return localMemoryRooms[id];
}

async function saveRoomState(roomId, room) {
    const id = (roomId || "ACM2026").toUpperCase();
    room.lastUpdated = Date.now();
    localMemoryRooms[id] = room;

    const redisKey = `acm_room_${id}`;
    // Save to Redis with 24-hour expiration (86400 seconds)
    await redisCommand(["SET", redisKey, JSON.stringify(room), "EX", "86400"]);
}

module.exports = async function handler(req, res) {
    // Enable CORS for all devices & origins
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");

    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }

    const roomId = ((req.query && req.query.roomId) || (req.body && req.body.roomId) || "ACM2026").toUpperCase();
    let room = await getRoomState(roomId);

    // Auto-advance from COUNTDOWN to STARTED once the 3-second countdown duration finishes
    if (room.status === "COUNTDOWN" && room.countdownStart) {
        if (Date.now() >= room.countdownStart + 3000) {
            room.status = "STARTED";
            if (!room.startTime) room.startTime = room.countdownStart + 3000;
            await saveRoomState(roomId, room);
        }
    }

    // Auto-advance from STARTED to ENDED if all players are finished or time limit expired
    if (room.status === "STARTED") {
        const playerList = Object.values(room.players || {});
        const allFinished = playerList.length > 0 && playerList.every(p => p.finished);
        const timeExpired = room.startTime && room.timeLimit && (Date.now() >= room.startTime + (room.timeLimit * 1000));
        if (allFinished || timeExpired) {
            room.status = "ENDED";
            await saveRoomState(roomId, room);
        }
    }

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

            // Case-insensitive duplicate name check
            const cleanName = name.toLowerCase();
            const existingPlayers = Object.values(room.players || {});
            const isTaken = existingPlayers.some(p => p.name && p.name.toLowerCase() === cleanName);
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

            if (!room.players) room.players = {};
            room.players[playerId] = playerObj;
            await saveRoomState(roomId, room);

            return res.status(200).json({ success: true, playerId, player: playerObj, room });
        }

        if (action === "countdown") {
            const timeLimit = Math.max(10, parseInt(body.timeLimit) || 120);
            const now = Date.now();
            room.status = "COUNTDOWN";
            room.timeLimit = timeLimit;
            room.countdownStart = now;
            room.startTime = now + 3000;

            // Reset player finisher stats for new round
            if (room.players) {
                Object.values(room.players).forEach(p => {
                    p.finished = false;
                    p.finishTimeSeconds = null;
                    p.finishTimeFormatted = null;
                });
            }

            await saveRoomState(roomId, room);
            return res.status(200).json({ success: true, room });
        }

        if (action === "start") {
            const timeLimit = Math.max(10, parseInt(body.timeLimit) || 120);
            room.status = "STARTED";
            room.timeLimit = timeLimit;
            if (!room.startTime) room.startTime = Date.now();

            // Ensure player finisher stats are clean if start triggered without countdown
            if (room.players && !room.countdownStart) {
                Object.values(room.players).forEach(p => {
                    p.finished = false;
                    p.finishTimeSeconds = null;
                    p.finishTimeFormatted = null;
                });
            }

            await saveRoomState(roomId, room);
            return res.status(200).json({ success: true, room });
        }

        if (action === "finish") {
            const playerId = body.playerId;
            if (playerId && room.players && room.players[playerId]) {
                room.players[playerId].finished = true;
                room.players[playerId].finishTimeSeconds = body.seconds;
                room.players[playerId].finishTimeFormatted = body.formatted;

                // Auto-end the game when all players have finished playing
                const playerList = Object.values(room.players);
                if (room.status === "STARTED" && playerList.length > 0 && playerList.every(p => p.finished)) {
                    room.status = "ENDED";
                }

                await saveRoomState(roomId, room);
            }
            return res.status(200).json({ success: true, room });
        }

        if (action === "end") {
            room.status = "ENDED";
            await saveRoomState(roomId, room);
            return res.status(200).json({ success: true, room });
        }

        if (action === "reset") {
            room.status = "LOBBY";
            room.startTime = null;
            room.countdownStart = null;
            room.players = {};
            await saveRoomState(roomId, room);
            return res.status(200).json({ success: true, room });
        }

        return res.status(400).json({ success: false, error: "Invalid action." });
    }

    return res.status(405).json({ success: false, error: "Method not allowed." });
};
