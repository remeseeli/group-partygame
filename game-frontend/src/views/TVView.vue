<template>
  <div class="tv-container">
    <!-- STATE 1: THE LOBBY (COMPACT TWIN-COLUMN SYSTEM) -->
    <div v-if="gameState === 'LOBBY'" class="lobby-layout-wrapper">
      
      <!-- LEFT SIDEBAR: CONNECTION CONTROLS -->
      <div class="lobby-sidebar">
        <h1 class="game-logo">Get ready...</h1>
        
        <div v-if="roomCode" class="lobby-code-card">
          <p class="connect-instruction">Scan to Join or use code:</p>
          <div class="room-code-display">{{ roomCode }}</div>
          
          <!-- DYNAMIC QR CODE INJECTION COMPONENT -->
          <div class="qr-wrapper-box">
            <qrcode-vue :value="qrCodeUrl" :size="160" level="H" background="#1c1836" foreground="#00fff0" />
          </div>
        </div>

        <div class="settings-widget">
          <h3>Match Options</h3>
          <div class="setting-input-group">
            <label for="duration-slider">Round Timer: <strong>{{ configDuration }}s</strong></label>
            <input id="duration-slider" v-model="configDuration" type="range" min="5" max="60" step="5" class="custom-slider" />
          </div>
          <div class="setting-input-group checkbox-alignment">
            <input id="drinking-checkbox" v-model="configDrinking" type="checkbox" class="custom-checkbox" />
            <label for="drinking-checkbox">Enable Penalties</label>
          </div>
        </div>

        <button v-if="players.length >= 1" @click="startGame" class="launch-btn">
          Start Match
        </button>
        <div v-else class="waiting-notice">Waiting for players to join...</div>
      </div>

      <!-- RIGHT PANEL: EXPANDING PLAYER GRID -->
      <div class="lobby-roster-panel">
        <h2 class="roster-headline">Players Connected ({{ players.length }})</h2>
        
        <div v-if="players.length === 0" class="empty-roster-state">
          <div class="pulsing-circle"></div>
          <p>Waiting for the first player to join...</p>
        </div>
        
        <div v-else class="dynamic-roster-grid">
          <div v-for="player in players" :key="player.name" class="player-join-card">
            <img :src="`/images/${player.name}.png`" class="player-card-avatar" :alt="player.name" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'50\' height=\'50\' viewBox=\'0 0 24 24\' fill=\'%2300fff0\'><circle cx=\'12\' cy=\'8\' r=\'4\'/><path d=\'M12 14c-6.1 0-10 4-10 10h20c0-6-3.9-10-10-10z\'/></svg>'"/>
            <div class="player-card-name">{{ player.name }}</div>
          </div>
        </div>
      </div>

    </div>

    <!-- STATE 2: ACTIVE QUESTION ROUND -->
    <div v-if="gameState === 'QUESTION'" class="gameplay-viewport">
      <div class="round-top-bar">
        <span class="round-counter">Round {{ currentRound.round }} / {{ currentRound.totalRounds }}</span>
        <div class="countdown-clock" :class="{ 'timer-critical': currentRound.timeLeft <= 10 }">
          {{ currentRound.timeLeft }}s
        </div>
      </div>
      <div class="prompt-billboard">
        <p class="billboard-quote">
            <template v-if="currentRound.type === 'quote'">“</template>
          {{ currentRound.content }}
          <template v-if="currentRound.type === 'quote'">”</template>
        </p>
      </div>
      <div class="gameplay-footer-hint">Lock in your answer on your phone!</div>
    </div>

    <!-- STATE 3: ROUND RESULTS REVEAL PANEL -->
    <div v-if="gameState === 'REVEAL'" class="gameplay-viewport">
      <h1 class="reveal-header-tag">The Culprit Is...</h1>
      <div class="culprit-identity-banner">
        <img :src="`/images/${roundResults.author}.png`" class="culprit-large-avatar" :alt="roundResults.author" />
        <div class="culprit-text-name">{{ roundResults.author }}</div>
      </div>
      
      <div class="results-table-container">
        <h3 class="table-headline">Round results</h3>
        <div class="table-grid-zone">
          <div v-for="res in roundResults.results" :key="res.name" class="score-audit-row">
            <span class="audit-player-name">{{ res.name }}</span>
            <span class="audit-action-verdict" :class="res.action">
              Guessed: <strong>{{ res.guess }}</strong> 
              <template v-if="roundResults.drinkingEnabled">
                ({{ res.isCorrect ? '✓ Correct' : '✗ Drink!' }})
              </template>
              <template v-else>
                ({{ res.isCorrect ? '✓ Correct' : '✗ Incorrect' }})
              </template>
            </span>
          </div>
        </div>
      </div>
      <button @click="triggerNextRound" class="continue-match-btn">Continue</button>
    </div>

    <!-- STATE 4: THE FINAL LEADERBOARD -->
    <div v-if="gameState === 'LEADERBOARD'" class="gameplay-viewport centered-layout">
      <h1 class="podium-title">👑 Final Standings 👑</h1>
      <p class="podium-subtitle">The group chat legends</p>
      
      <div class="podium-list-wrapper">
        <div v-for="(player, idx) in sortedPlayers" :key="player.name" class="podium-item-row">
          <span class="podium-rank">#{{ idx + 1 }}</span>
          <span class="podium-name">{{ player.name }}</span>
          <span class="podium-score">{{ player.score }} pts</span>
        </div>
      </div>
      
      <p class="final-punishment-box" v-if="sortedPlayers.length > 0 && roundResults.drinkingEnabled">
        Last place: <strong>{{ sortedPlayers[sortedPlayers.length - 1].name }}</strong> finishes their whole drink!
      </p>
      <p class="final-punishment-box peaceful-box" v-else-if="sortedPlayers.length > 0">
        Winner: ✨ <strong>{{ sortedPlayers[0].name }}</strong> wins the game! ✨
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { io } from 'socket.io-client'
import QrcodeVue from 'qrcode.vue'
import { BACKEND_URL, FRONTEND_URL } from '../config.js'

const gameState = ref('LOBBY')
const roomCode = ref('')
const players = ref([])

const configDuration = ref(30)
const configDrinking = ref(true)

const currentRound = ref({ content: '', type: 'text', round: 1, totalRounds: 3, timeLeft: 30 })
const roundResults = ref({ author: '', results: [], drinkingEnabled: true })

let socket = null
let audioCtx = null

// Computes the exact address phone cameras need to navigate to
const qrCodeUrl = computed(() => {
  return `${FRONTEND_URL}/?room=${roomCode.value}`
})

const initAudio = () => {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
}

const playTickSound = () => {
  try {
    initAudio()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(800, audioCtx.currentTime)
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.06)
  } catch (e) {}
}

const playBuzzerSound = () => {
  try {
    initAudio()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(150, audioCtx.currentTime)
    osc.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + 0.6)
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.6)
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.6)
  } catch (e) {}
}

const sortedPlayers = computed(() => {
  return [...players.value].sort((a, b) => b.score - a.score)
})

onMounted(() => {
  // Config Driven Pipeline Initialization
  socket = io(BACKEND_URL)

  socket.on('connect', () => {
    socket.emit('create-room')
  })

  socket.on('room-created', (code) => {
    roomCode.value = code
  })

  socket.on('update-players', (playerList) => {
    players.value = playerList
  })

  socket.on('show-prompt', (promptData) => {
    gameState.value = 'QUESTION'
    currentRound.value = promptData
  })

  socket.on('timer-tick', (secondsLeft) => {
    currentRound.value.timeLeft = secondsLeft
    if (secondsLeft <= 10 && secondsLeft > 0) {
      playTickSound()
    } else if (secondsLeft === 0) {
      playBuzzerSound()
    }
  })

  socket.on('round-results', (data) => {
    gameState.value = 'REVEAL'
    roundResults.value = data
  })

  socket.on('game-over', (finalPlayers) => {
    gameState.value = 'LEADERBOARD'
    players.value = finalPlayers
  })
})

const startGame = () => {
  if (socket) {
    initAudio()
    socket.emit('start-game', {
      roomCode: roomCode.value,
      roundDuration: configDuration.value,
      drinkingEnabled: configDrinking.value
    })
  }
}

const triggerNextRound = () => {
  if (socket) socket.emit('trigger-next-round', roomCode.value)
}

onUnmounted(() => {
  if (socket) socket.disconnect()
})
</script>

<style scoped>
/* VIEWPORT MASTER CONTAINER */
.tv-container {
  min-height: 100vh;
  width: 100vw;
  background-color: #0c0a17;
  font-family: system-ui, -apple-system, sans-serif;
  color: #fff;
  box-sizing: border-box;
  display: flex;
  overflow: hidden;
}

/* LOBBY TWIN COLUMN ARCHITECTURE */
.lobby-layout-wrapper {
  display: flex;
  width: 100vw;
  height: 100vh;
}

/* LEFT CONTROL PANEL SIDEBAR */
.lobby-sidebar { 
  width: 380px; 
  min-width: 380px; 
  background-color: #141126; 
  border-right: 2px solid #231f3f; 
  padding: 30px; 
  display: flex; 
  flex-direction: column; 
  box-sizing: border-box; 
  height: 100%; 
  overflow-y: auto; /* CRITICAL: Enables scrolling if the screen is short */
}
/* Custom sleek scrollbar for the sidebar */
.lobby-sidebar::-webkit-scrollbar { width: 6px; }
.lobby-sidebar::-webkit-scrollbar-thumb { background: #36305a; border-radius: 4px; }
.game-logo {
  font-size: 2.2rem;
  font-weight: 900;
  color: #ff007f;
  margin: 0 0 30px 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.lobby-code-card {
  background: #1c1836;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #00fff0;
  margin-bottom: 30px;
  text-align: center;
}
.connect-instruction {
  margin: 0 0 8px 0;
  color: #8c88a5;
  font-size: 0.95rem;
  text-align: left;
}
.room-code-display { 
  font-size: 3.5rem; /* Shrunk down from 4.5rem */
  font-weight: 900; 
  color: #00fff0; 
  letter-spacing: 2px; 
  line-height: 1; 
  margin-bottom: 15px; 
  text-align: center; 
}
.qr-wrapper-box {
  background: #1c1836;
  padding: 10px;
  border-radius: 8px;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  border: 1px dashed #36305a;
  margin-top: 5px;
}

/* CONFIGURATION STYLES */
.settings-widget {
  background: #1c1836;.settings-widget { 
  background: #1c1836; 
  padding: 20px; 
  border-radius: 12px; 
  margin-bottom: 20px; /* Removed margin-bottom: auto */
}
  padding: 20px;
  border-radius: 12px;
  margin-bottom: auto; /* Pushes the start button to the bottom */
}
.settings-widget h3 {
  margin: 0 0 20px 0;
  color: #a5a1b8;
  font-size: 1rem;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.setting-input-group {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.setting-input-group label {
  font-size: 0.95rem;
  color: #bfaec2;
}
.custom-slider {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #0c0a17;
  outline: none;
}
.custom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #ff007f;
  cursor: pointer;
}
.checkbox-alignment {
  flex-direction: row !important;
  align-items: center;
  gap: 12px;
  margin-bottom: 0;
}
.custom-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #ff007f;
  cursor: pointer;
}
.launch-btn { 
  background: #ff007f; 
  color: white; 
  border: none; 
  padding: 20px; 
  font-size: 1.4rem; 
  font-weight: bold; 
  border-radius: 10px; 
  cursor: pointer; 
  width: 100%; 
  text-transform: uppercase; 
  letter-spacing: 1px; 
  box-shadow: 0 5px 15px rgba(255, 0, 127, 0.3);
  margin-top: auto; /* Pushes button to bottom safely */
  flex-shrink: 0; /* Prevents button from being crushed */
}
.waiting-notice {
  text-align: center;
  color: #555170;
  font-style: italic;
  font-size: 1rem;
}

/* RIGHT PANEL: DISPLAY GRID SYSTEM */
.lobby-roster-panel {
  flex-grow: 1;
  padding: 40px;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  background-color: #0c0a17;
}
.roster-headline {
  font-size: 1.6rem;
  margin: 0 0 30px 0;
  color: #b1afc5;
}
.empty-roster-state {
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 20px;
  color: #555170;
  font-size: 1.2rem;
}
.pulsing-circle {
  width: 60px;
  height: 60px;
  background-color: rgba(0, 255, 240, 0.1);
  border: 2px solid #00fff0;
  border-radius: 50%;
  animation: pulse-ring 2s infinite ease-in-out;
}
.dynamic-roster-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  grid-auto-rows: max-content;
  gap: 20px;
  overflow-y: auto;
}
.player-join-card {
  background: #141126;
  border: 2px solid #231f3f;
  border-radius: 16px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 4px 10px rgba(0,0,0,0.2);
}
.player-card-avatar {
  width: 90px;
  height: 90px;
  border-radius: 50%;
  object-fit: cover;
  border: 3px solid #0c0a17;
  background: #0c0a17;
}
.player-card-name {
  font-weight: 800;
  font-size: 1.2rem;
  text-transform: uppercase;
  color: #fff;
  letter-spacing: 0.5px;
}

/* GENERAL GAMEPLAY RUNNING VIEWPORT LAYOUTS */
.gameplay-viewport {
  width: 100vw;
  height: 100vh;
  padding: 50px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.centered-layout {
  justify-content: center;
  align-items: center;
}
.round-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 1.6rem;
  font-weight: bold;
  color: #8c88a5;
  margin-bottom: 30px;
}
.countdown-clock {
  background: #00fff0;
  color: #0c0a17;
  padding: 8px 24px;
  border-radius: 30px;
  font-size: 2.2rem;
  font-weight: 900;
}
.timer-critical {
  background: #ff3366 !important;
  color: white;
  animation: jitter 0.1s infinite alternate;
}
.prompt-billboard {
  background: #141126;
  border: 2px solid #231f3f;
  padding: 80px 40px;
  border-radius: 20px;
  text-align: center;
  margin-bottom: 30px;
  border-top: 5px solid #ff007f;
  flex-grow: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}
.billboard-quote {
  font-size: 2.6rem;
  font-style: italic;
  line-height: 1.5;
  color: #f1f0f7;
  margin: 0;
}
.gameplay-footer-hint {
  text-align: center;
  font-size: 1.3rem;
  color: #555170;
}

/* REVEAL LAYER COMPONENTS */
.reveal-header-tag { font-size: 1.5rem; color: #8c88a5; margin: 0 0 10px 0; }
.culprit-identity-banner { display: flex; align-items: center; gap: 20px; margin-bottom: 25px; }

/* Scaled down slightly to save vertical room for the grid */
.culprit-large-avatar { width: 90px; height: 90px; border-radius: 50%; object-fit: cover; border: 4px solid #ff007f; box-shadow: 0 0 20px rgba(255, 0, 127, 0.4); }
.culprit-text-name { font-size: 3.5rem; font-weight: 900; color: #ff007f; text-transform: uppercase; }

.results-table-container { 
  background: #141126; 
  border-radius: 16px; 
  padding: 25px; 
  border: 2px solid #231f3f; 
  flex-grow: 1; 
  display: flex; 
  flex-direction: column; 
  margin-bottom: 30px; 
}
.table-headline { margin: 0 0 15px 0; color: #8c88a5; font-size: 1.1rem; text-transform: uppercase; }

/* NEW: The 2-column grid layout replacing the scrolling column */
.table-grid-zone { 
  display: grid; 
  grid-template-columns: repeat(2, 1fr); 
  gap: 12px; 
  width: 100%;
}

/* Compacted rows to comfortably stack 4 high */
.score-audit-row { 
  display: flex; 
  justify-content: space-between; 
  align-items: center;
  padding: 12px 18px; 
  background: #1c1836; 
  border-radius: 10px; 
  font-size: 1.15rem; 
}

.audit-player-name { font-weight: bold; }
.audit-action-verdict.assign-1 { color: #00fff0; }
.audit-action-verdict.drink-2 { color: #ff3366; }
.audit-action-verdict.drink-1 { color: #ff9900; }

.continue-match-btn {
  background: #00fff0;
  color: #0c0a17;
  border: none;
  padding: 16px 40px;
  font-size: 1.3rem;
  font-weight: bold;
  border-radius: 8px;
  cursor: pointer;
  align-self: flex-end;
  text-transform: uppercase;
}

/* PODIUM LEADERBOARD LAYOUT */
.podium-title { font-size: 3rem; margin: 0 0 10px 0; color: #ffd700; }
.podium-subtitle { font-size: 1.2rem; color: #8c88a5; margin: 0 0 30px 0; }
.podium-list-wrapper { background: #141126; border: 2px solid #231f3f; border-radius: 16px; padding: 25px; max-width: 550px; width: 100%; display: flex; flex-direction: column; gap: 12px; }
.podium-item-row { display: flex; justify-content: space-between; background: #1c1836; padding: 16px 25px; border-radius: 10px; font-size: 1.3rem; font-weight: bold; }
.podium-rank { color: #ff007f; }
.podium-score { color: #00fff0; }
.final-punishment-box { margin-top: 35px; font-size: 1.3rem; background: rgba(255, 51, 102, 0.08); padding: 20px 40px; border-radius: 10px; border: 1px dashed #ff3366; text-align: center; }
.peaceful-box { border-color: #00fff0 !important; background: rgba(0, 255, 240, 0.05) !important; color: #00fff0; }

/* REUSABLE ANIMATIONS */
@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 0.5; }
  50% { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.5; }
}
@keyframes jitter {
  0% { transform: translate(1px, 1px) rotate(0deg); }
  100% { transform: translate(-1px, -1px) rotate(0.5deg); }
}
</style>