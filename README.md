# 🏆 ACM Maze Quest — Vercel-Ready Multiplayer Platform

A turnkey, Kahoot-style real-time web game designed for players on **different internet connections** (cellular 4G/5G, foreign Wi-Fi, remote locations) to scan a QR code, join with unique nicknames, wait in a lobby, and race through a dark fog-of-war maze to discover letters **A**, **C**, and **M**.

---

## 🚀 How to Deploy to Vercel (Free in 2 Minutes)

Because this repository already contains [`vercel.json`](file:///C:/Users/athar/.gemini/antigravity/scratch/acm-maze-game/vercel.json), [`package.json`](file:///C:/Users/athar/.gemini/antigravity/scratch/acm-maze-game/package.json), and [`api/room.js`](file:///C:/Users/athar/.gemini/antigravity/scratch/acm-maze-game/api/room.js), it is 100% pre-configured for Vercel deployment!

### Step 1: Push to GitHub
1. Create a new empty repository on [GitHub](https://github.com/new) named `acm-maze-game`.
2. In your terminal inside this folder, run:
   ```bash
   git remote add origin https://github.com/<your-github-username>/acm-maze-game.git
   git branch -M main
   git push -u origin main
   ```

### Step 2: Deploy on Vercel
1. Log in to [vercel.com](https://vercel.com) (free).
2. Click **Add New... > Project**.
3. Select your `acm-maze-game` repository and click **Deploy**.
4. In ~15 seconds, Vercel gives you a live global HTTPS domain (e.g. `https://acm-maze-game.vercel.app`).

---

## 🎮 How to Run the Game Live for Everyone

1. **Host Screen**:
   - Open `https://<your-app>.vercel.app/host.html` on your laptop or projector.
2. **Players Join**:
   - The QR code on screen **automatically generates your live Vercel URL**!
   - Anyone in the room (or across the world on 4G/5G mobile data) can scan the QR code with their phone camera.
   - Their phone opens `https://<your-app>.vercel.app/index.html?room=ACM2026`.
3. **Play**:
   - Players enter unique nicknames and land in the Kahoot waiting room.
   - Host chooses round duration (e.g., 2 Minutes) and clicks **🚀 START GAME (3S TIMER)**.
   - A dramatic **3... 2... 1... GO!** countdown fires across all devices simultaneously!
   - Players hunt letters **A**, **C**, and **M**.
   - As soon as a player collects all letters, they land on the post-finish waiting page.
   - When the timer ends or the host ends the round, the **Grand Podium (1st, 2nd, 3rd)** and full rankings appear on all screens!

---

## 📁 Project Architecture

- `api/room.js` — Vercel Serverless Function enabling global real-time synchronization across different networks and cellular connections.
- `host.html` — Kahoot-style Big Screen / Projector control with dynamic QR code, player counter, timer picker, live finisher tracker, and podium.
- `index.html` — Player mobile/desktop client with unique nickname validation, waiting room, countdown overlay, maze game, and rankings.
- `maze.js` — Procedural 25×25 medium labyrinth, faint walls, travel fog-of-war, and randomized ACM placement.
- `game.js` — Canvas rendering engine, player lantern, particle bursts, and touch/keyboard controls.
- `sync.js` — Universal sync engine supporting Vercel Serverless API, Firebase, and local storage fallback.
- `audio.js` — Zero-dependency Web Audio API procedural sound synthesizer (footsteps, bumps, countdown beeps, victory fanfare).
- `vercel.json` — Vercel routing rules, CORS headers, and clean URLs.
