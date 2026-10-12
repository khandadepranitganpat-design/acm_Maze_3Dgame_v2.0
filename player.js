/**
 * Player Client Controller (Kahoot-Style Flow)
 */

class PlayerController {
    constructor() {
        const urlParams = new URLSearchParams(window.location.search);
        this.roomId = (urlParams.get("room") || "ACM2026").toUpperCase();
        this.sync = new GameSync(this.roomId);

        this.currentPlayer = null; // { id, name }
        this.timeLimitSeconds = 120;
        this.timerCountdownInterval = null;
        this.remainingSeconds = 120;
        this.gameStarted = false;
        this.gameFinished = false;

        this.initDOM();
        this.bindEvents();
        this.listenToSync();
    }

    initDOM() {
        const roomBadge = document.getElementById("displayRoomCode");
        if (roomBadge) roomBadge.textContent = this.roomId;

        // Restore saved player session if reloaded in same room
        try {
            const saved = sessionStorage.getItem(`acm_player_${this.roomId}`);
            if (saved) {
                this.currentPlayer = JSON.parse(saved);
            }
        } catch (e) {}
    }

    bindEvents() {
        const joinBtn = document.getElementById("btnJoinLobby");
        const nameInput = document.getElementById("inputNickname");

        const submitJoin = async () => {
            const name = nameInput.value.trim();
            this.showError("");

            if (!name) {
                this.showError("Please enter your nickname.");
                return;
            }

            if (name.length > 20) {
                this.showError("Nickname must be 20 characters or less.");
                return;
            }

            joinBtn.disabled = true;
            joinBtn.textContent = "Joining...";

            try {
                const res = await this.sync.joinPlayer(name);
                if (!res.success) {
                    this.showError(res.error || "Could not join lobby.");
                    joinBtn.disabled = false;
                    joinBtn.textContent = "Join Game";
                    return;
                }

                this.currentPlayer = { id: res.playerId, name: res.player.name };
                try {
                    sessionStorage.setItem(`acm_player_${this.roomId}`, JSON.stringify(this.currentPlayer));
                } catch (e) {}

                // Immediately transition to waiting room (Ready)
                this.showLobbyWaiting();
            } catch (err) {
                console.error("Join error:", err);
                this.showError("Network error joining lobby. Please try again.");
            } finally {
                joinBtn.disabled = false;
                joinBtn.textContent = "Join Game";
            }
        };

        if (joinBtn) joinBtn.addEventListener("click", submitJoin);
        if (nameInput) {
            nameInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") submitJoin();
            });
        }
    }

    showError(msg) {
        const el = document.getElementById("joinErrorBanner");
        if (!el) return;
        if (!msg) {
            el.style.display = "none";
            el.textContent = "";
        } else {
            el.style.display = "block";
            el.textContent = msg;
        }
    }

    switchScreen(screenId) {
        document.querySelectorAll(".app-screen").forEach(el => el.classList.remove("active"));
        const target = document.getElementById(screenId);
        if (target) target.classList.add("active");
    }

    showLobbyWaiting() {
        const nameDisplay = document.getElementById("waitingPlayerName");
        if (nameDisplay && this.currentPlayer) {
            nameDisplay.textContent = this.currentPlayer.name;
        }
        this.switchScreen("screenLobbyWaiting");
    }

    showCountdownOverlay() {
        const overlay = document.getElementById("countdownOverlay");
        const numEl = document.getElementById("countdownNumber");
        const subEl = document.getElementById("countdownSubtitle");
        if (!overlay || !numEl) return;

        overlay.classList.add("active");
        let count = 3;
        numEl.textContent = count;
        if (subEl) subEl.textContent = "GET READY!";

        if (window.gameInstance && window.gameInstance.sound) {
            window.gameInstance.sound.init();
            window.gameInstance.sound.playCountdownBeep(false);
        }

        if (this.countdownTimerInterval) clearInterval(this.countdownTimerInterval);
        this.countdownTimerInterval = setInterval(() => {
            count--;
            if (count > 0) {
                numEl.textContent = count;
                if (window.gameInstance && window.gameInstance.sound) {
                    window.gameInstance.sound.playCountdownBeep(false);
                }
            } else if (count === 0) {
                numEl.textContent = "GO!";
                if (subEl) subEl.textContent = "FIND LETTERS A, C, M!";
                if (window.gameInstance && window.gameInstance.sound) {
                    window.gameInstance.sound.playCountdownBeep(true);
                }
            } else {
                clearInterval(this.countdownTimerInterval);
                overlay.classList.remove("active");
            }
        }, 1000);
    }

    hideCountdownOverlay() {
        if (this.countdownTimerInterval) clearInterval(this.countdownTimerInterval);
        const overlay = document.getElementById("countdownOverlay");
        if (overlay) overlay.classList.remove("active");
    }

    listenToSync() {
        this.sync.onUpdate((state) => {
            // If host triggers 3-second countdown
            if (state.status === "COUNTDOWN") {
                if (this.currentPlayer && !this.gameStarted) {
                    this.showCountdownOverlay();
                }
            } else if (state.status === "STARTED") {
                this.hideCountdownOverlay();
                if (this.currentPlayer && !this.gameStarted && !this.gameFinished) {
                    this.launchGame(state.timeLimit, state.startTime);
                }
            } else if (state.status === "ENDED") {
                this.hideCountdownOverlay();
                if (this.currentPlayer) {
                    this.showLeaderboard(state);
                }
            } else if (state.status === "LOBBY") {
                this.hideCountdownOverlay();
                this.gameStarted = false;
                this.gameFinished = false;
                if (this.timerCountdownInterval) clearInterval(this.timerCountdownInterval);

                // If player has joined, keep them in the waiting room!
                if (this.currentPlayer) {
                    this.showLobbyWaiting();
                } else {
                    this.switchScreen("screenJoin");
                }
            }
        });
    }

    launchGame(timeLimit, startTime) {
        this.gameStarted = true;
        this.gameFinished = false;
        this.timeLimitSeconds = timeLimit || 120;
        this.remainingSeconds = this.timeLimitSeconds;

        this.switchScreen("screenGame");

        // Start countdown timer
        const timerVal = document.getElementById("timerVal");
        const statusBanner = document.getElementById("statusBanner");
        if (statusBanner) {
            statusBanner.textContent = `Race to find letters A, C, M! You have ${this.timeLimitSeconds}s!`;
        }

        if (this.timerCountdownInterval) clearInterval(this.timerCountdownInterval);

        // Adjust remaining time based on server start time if available
        if (startTime) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            this.remainingSeconds = Math.max(0, this.timeLimitSeconds - elapsed);
        }

        this.updateTimerDisplay();

        this.timerCountdownInterval = setInterval(() => {
            this.remainingSeconds--;
            this.updateTimerDisplay();

            if (this.remainingSeconds <= 0) {
                clearInterval(this.timerCountdownInterval);
                // Timer expired!
                this.handleTimeExpired();
            }
        }, 1000);

        // Reset game instance maze
        if (window.gameInstance) {
            window.gameInstance.resizeCanvas();
            window.gameInstance.resetGame();
            // Hook completion callback:
            // "after collecting all letters people automatically land on waiting page again until timer goes off or host end game"
            window.gameInstance.onSpellComplete = (stats) => {
                this.onPlayerCompletedSpell(stats);
            };
        }
    }

    updateTimerDisplay() {
        const timerVal = document.getElementById("timerVal");
        if (timerVal) {
            const mins = String(Math.floor(this.remainingSeconds / 60)).padStart(2, '0');
            const secs = String(this.remainingSeconds % 60).padStart(2, '0');
            timerVal.textContent = `${mins}:${secs}`;
            if (this.remainingSeconds <= 15) {
                timerVal.style.color = '#ef4444';
            } else {
                timerVal.style.color = '#38bdf8';
            }
        }
    }

    onPlayerCompletedSpell(stats) {
        if (this.gameFinished) return;
        this.gameFinished = true;
        if (this.timerCountdownInterval) clearInterval(this.timerCountdownInterval);

        const timeTaken = stats.seconds;
        const mins = String(Math.floor(timeTaken / 60)).padStart(2, '0');
        const secs = String(timeTaken % 60).padStart(2, '0');
        const formatted = `${mins}:${secs}`;

        // Sync to host/cloud
        if (this.currentPlayer) {
            this.sync.markPlayerFinished(this.currentPlayer.id, timeTaken, formatted);
        }

        // Show player finished waiting page:
        // "after collecting all letters people automatically land on waiting page again until timer goes off or host end game."
        const finishTimeDisplay = document.getElementById("finishedTimeDisplay");
        const finishStepsDisplay = document.getElementById("finishedStepsDisplay");
        const finishOrderDisplay = document.getElementById("finishedOrderDisplay");

        if (finishTimeDisplay) finishTimeDisplay.textContent = formatted;
        if (finishStepsDisplay) finishStepsDisplay.textContent = stats.steps;
        if (finishOrderDisplay) finishOrderDisplay.textContent = stats.sequence.join(' ➔ ');

        this.switchScreen("screenFinishedWaiting");
    }

    handleTimeExpired() {
        if (this.gameFinished) return;
        this.gameFinished = true;

        // Player ran out of time without finding all letters
        this.switchScreen("screenFinishedWaiting");
        const title = document.getElementById("finishedTitle");
        const desc = document.getElementById("finishedDesc");
        if (title) title.textContent = "⏰ TIME'S UP!";
        if (desc) desc.textContent = "Round has concluded. Calculating final leaderboard rankings...";
    }

    showLeaderboard(state) {
        if (this.timerCountdownInterval) clearInterval(this.timerCountdownInterval);
        this.switchScreen("screenLeaderboard");

        // Calculate and sort rankings
        const playerList = Object.values(state.players || {});
        playerList.sort((a, b) => {
            if (a.finished && !b.finished) return -1;
            if (!a.finished && b.finished) return 1;
            if (a.finished && b.finished) {
                return (a.finishTimeSeconds || 9999) - (b.finishTimeSeconds || 9999);
            }
            return 0;
        });

        // Personal rank announcement
        const myRankEl = document.getElementById("myRankAnnouncement");
        if (myRankEl && this.currentPlayer) {
            const idx = playerList.findIndex(p => p.id === this.currentPlayer.id);
            if (idx !== -1) {
                const rankNum = idx + 1;
                const me = playerList[idx];
                if (me.finished) {
                    myRankEl.innerHTML = `🎉 You ranked <strong>#${rankNum}</strong> out of ${playerList.length} players! (Time: ${me.finishTimeFormatted})`;
                } else {
                    myRankEl.innerHTML = `You completed the round ranked <strong>#${rankNum}</strong>!`;
                }
            }
        }

        // Podium render
        const p1Name = document.getElementById("podium1Name");
        const p1Time = document.getElementById("podium1Time");
        const p2Name = document.getElementById("podium2Name");
        const p2Time = document.getElementById("podium2Time");
        const p3Name = document.getElementById("podium3Name");
        const p3Time = document.getElementById("podium3Time");

        if (playerList[0]) {
            if (p1Name) p1Name.textContent = playerList[0].name;
            if (p1Time) p1Time.textContent = playerList[0].finished ? `⏱️ ${playerList[0].finishTimeFormatted}` : 'Exploring';
        } else {
            if (p1Name) p1Name.textContent = '-';
            if (p1Time) p1Time.textContent = '-';
        }

        if (playerList[1]) {
            if (p2Name) p2Name.textContent = playerList[1].name;
            if (p2Time) p2Time.textContent = playerList[1].finished ? `⏱️ ${playerList[1].finishTimeFormatted}` : 'Exploring';
        } else {
            if (p2Name) p2Name.textContent = '-';
            if (p2Time) p2Time.textContent = '-';
        }

        if (playerList[2]) {
            if (p3Name) p3Name.textContent = playerList[2].name;
            if (p3Time) p3Time.textContent = playerList[2].finished ? `⏱️ ${playerList[2].finishTimeFormatted}` : 'Exploring';
        } else {
            if (p3Name) p3Name.textContent = '-';
            if (p3Time) p3Time.textContent = '-';
        }

        // Full rankings table
        const tbody = document.getElementById("leaderboardBody");
        if (tbody) {
            tbody.innerHTML = "";
            playerList.forEach((p, idx) => {
                const tr = document.createElement("tr");
                tr.className = `rank-row ${this.currentPlayer && p.id === this.currentPlayer.id ? 'highlight-me' : ''}`;
                tr.innerHTML = `
                    <td style="font-weight: 800;">#${idx + 1}</td>
                    <td>${this.escape(p.name)} ${this.currentPlayer && p.id === this.currentPlayer.id ? '<em>(You)</em>' : ''}</td>
                    <td>${p.finished ? `<span style="color: #00f5d4; font-weight: 700;">Completed (${p.finishTimeFormatted})</span>` : '<span style="color: #94a3b8;">Incomplete</span>'}</td>
                `;
                tbody.appendChild(tr);
            });
        }
    }

    escape(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
}

window.addEventListener("DOMContentLoaded", () => {
    window.playerClient = new PlayerController();
});
