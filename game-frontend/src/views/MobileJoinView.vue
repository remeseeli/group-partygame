<template>
  <div class="mobile-container">
    <!-- SUB-VIEW 1: ROOM CODE CHECKER -->
    <div v-if="currentMobileState === 'CODE_CHECK'" class="card-box">
      <h1 class="brand">GROUPCHAT GAME</h1>
      <div v-if="error" class="error-alert">{{ error }}</div>
      <div class="input-group">
        <label>4-Letter Room Code</label>
        <input v-model="roomCode" type="text" placeholder="ABCD" maxlength="4" class="uppercase-input" />
      </div>
      <button @click="verifyRoomCode" :disabled="!roomCode" class="action-btn join-btn">
        Find Room
      </button>
    </div>

    <!-- SUB-VIEW 2: PROFILE LOCK SELECTION GRID -->
    <div v-if="currentMobileState === 'PROFILE_SELECT'" class="card-box wide-mobile-card">
      <h2 class="status-title text-cyan text-center">Claim Your Profile</h2>
      <div v-if="error" class="error-alert">{{ error }}</div>
      
      <div class="profile-selection-grid">
        <button 
          v-for="profile in profileRoster" 
          :key="profile.name"
          @click="claimGroupProfile(profile.name)"
          :disabled="profile.isClaimed"
          class="profile-select-tile"
          :class="{ 'tile-disabled': profile.isClaimed }"
        >
          <img :src="`/images/${profile.name}.png`" class="tile-avatar" :alt="profile.name" @error="handleAvatarError"/>
          <div class="tile-name">{{ profile.name }}</div>
          <span class="claim-tag" v-if="profile.isClaimed">Taken</span>
        </button>
      </div>
    </div>

    <!-- SUB-VIEW 3: WAITING LOBBY INTERMISSION SCREEN -->
    <div v-if="currentMobileState === 'WAITING'" class="card-box text-center">
      <h2 class="status-title text-cyan">You're In!</h2>
      <div class="active-profile-card">
        <img :src="`/images/${playerName}.png`" class="tile-avatar large-avatar" :alt="playerName" @error="handleAvatarError"/>
        <p class="user-tag">Profile: <strong>{{ playerName.toUpperCase() }}</strong></p>
      </div>
      <div class="pulse-loader"></div>
      <p class="hint-text">Look up at the TV screen.<br />Waiting for the host to start...</p>
    </div>

    <!-- SUB-VIEW 4: THE GUESSING INTERFACE -->
    <div v-if="currentMobileState === 'GUESSING'" class="card-box">
      <h2 class="status-title text-pink">Who sent this?</h2>
      <div v-if="guessLocked" class="locked-box text-center">
        <div class="lock-icon">🔒</div>
        <h3>Guess Locked In!</h3>
        <p class="hint-text" v-if="isDrinkingModeActive">Watch the TV screen to see who has to drink.</p>
        <p class="hint-text" v-else>Watch the TV screen to see who scored a point!</p>
      </div>
      <div v-else class="options-vertical-grid">
        <button v-for="name in votingOptions" :key="name" @click="submitPlayerGuess(name)" class="option-btn">
          {{ name }}
        </button>
      </div>
    </div>

    <!-- SUB-VIEW 5: ROUND FINISHED REVEAL NOTIFICATION -->
    <div v-if="currentMobileState === 'REVEAL_ROUND'" class="card-box text-center" :class="localGuess === correctAuthor ? 'result-correct' : 'result-wrong'">
      <h2 class="status-title text-gold">Round Finished</h2>
      <p class="author-label">The culprit was:</p>
      <div class="big-reveal-name">{{ correctAuthor }}</div>
      <hr class="mini-divider" />
      <p class="hint-text" v-if="isDrinkingModeActive">Look up at the TV screen to calculate points and check who drinks!</p>
      <p class="hint-text" v-else>Look up at the TV screen to see the updated scores!</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { io } from 'socket.io-client'
import { BACKEND_URL } from '../config.js'

const currentMobileState = ref('CODE_CHECK')
const roomCode = ref('')
const playerName = ref('')
const error = ref('')
const guessLocked = ref(false)
const localGuess = ref('')

const profileRoster = ref([])
const votingOptions = ref([])
const correctAuthor = ref('')
const isDrinkingModeActive = ref(true)

// Handle missing profile picture (editor should ensure profiles have valid images, but might fail because of mismatch in player names)
const fallBackAvatar = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 24 24' fill='%238c88a5'%3E%3Ccircle cx='12' cy='8' r='4'/%3E%3Cpath d='M12 14c-6.1 0-10 4-10 10h20c0-6-3.9-10-10-10z'/%3E%3C/svg%3E"

const handleAvatarError = (event) => {
    event.target.onerror = null; // Prevent infinite loop if fallback also fails
    event.target.src = fallBackAvatar;
}
let socket = null
const route = useRoute()

onMounted(() => {
  // 1. Look for automatic URL parameter deep links from QR codes
  if (route.query.room) {
    roomCode.value = route.query.room.toUpperCase().trim()
    console.log(`Deep link QR parameter scanned successfully for room: ${roomCode.value}`)
    verifyRoomCode()
    return
  }

  // 2. Fall back to standard background session recovery checks
  const savedRoom = localStorage.getItem('game_room_code')
  const savedProfile = localStorage.getItem('game_player_profile')

  if (savedRoom && savedProfile) {
    roomCode.value = savedRoom
    initSocketConnection()
    socket.emit('join-room-with-profile', {
      roomCode: savedRoom,
      selectedProfile: savedProfile
    })
  }
})

const initSocketConnection = () => {
  if (!socket) {
    socket = io(BACKEND_URL) // Config Driven Pipeline Initialization
    
    socket.on('error-message', (msg) => {
      error.value = msg
    })

    socket.on('profile-list-update', (list) => {
      profileRoster.value = list
      if (currentMobileState.value === 'CODE_CHECK') {
        currentMobileState.value = 'PROFILE_SELECT'
      }
    })

    socket.on('joined-successfully', ({ roomCode: joinedRoom, playerName: joinedName }) => {
      roomCode.value = joinedRoom
      playerName.value = joinedName
      localStorage.setItem('game_room_code', joinedRoom)
      localStorage.setItem('game_player_profile', joinedName)
      currentMobileState.value = 'WAITING'
    })

    socket.on('mobile-start-guessing', (data) => {
      votingOptions.value = data.options
      guessLocked.value = false
      localGuess.value = ''
      currentMobileState.value = 'GUESSING'
    })

    socket.on('guess-locked', () => {
      guessLocked.value = true
    })

    socket.on('mobile-round-results', (data) => {
      correctAuthor.value = data.author
      isDrinkingModeActive.value = data.drinkingEnabled
      currentMobileState.value = 'REVEAL_ROUND'
    })

    socket.on('game-over', () => {
      currentMobileState.value = 'WAITING'
    })
    
    socket.on('room-destroyed', () => {
      alert('The TV room connection was closed!')
      localStorage.clear()
      currentMobileState.value = 'CODE_CHECK'
      socket.disconnect()
      socket = null
    })
  }
}

const verifyRoomCode = () => {
  error.value = ''
  initSocketConnection()
  socket.emit('get-available-profiles', roomCode.value)
}

const claimGroupProfile = (name) => {
  error.value = ''
  if (socket) {
    socket.emit('join-room-with-profile', {
      roomCode: roomCode.value.toUpperCase().trim(),
      selectedProfile: name
    })
  }
}

const submitPlayerGuess = (selectedName) => {
  if (socket) {
    localGuess.value = selectedName
    socket.emit('submit-guess', {
      roomCode: roomCode.value.toUpperCase().trim(),
      guess: selectedName
    })
  }
}

onUnmounted(() => {
  if (socket) socket.disconnect()
})
</script>

<style scoped>
.mobile-container { min-height: 100vh; background-color: #0d0a1b; font-family: system-ui, sans-serif; color: #fff; display: flex; justify-content: center; align-items: center; padding: 15px; box-sizing: border-box; }
.card-box { background: #17142b; padding: 25px; border-radius: 14px; width: 100%; max-width: 420px; box-shadow: 0 10px 25px rgba(0,0,0,0.4); box-sizing: border-box; }
.wide-mobile-card { max-width: 500px; }
.text-center { text-align: center; }
.brand { font-size: 2.2rem; margin-bottom: 25px; text-align: center; color: #ff007f; font-weight: 800; }
.status-title { font-size: 1.8rem; font-weight: 700; margin-bottom: 15px; }
.text-cyan { color: #00fff0; }
.text-pink { color: #ff007f; }
.text-gold { color: #ffd700; }
.profile-selection-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-top: 20px; }
.profile-select-tile { background: #24203e; border: 2px solid #36305a; border-radius: 10px; padding: 15px; display: flex; flex-direction: column; align-items: center; gap: 8px; color: white; position: relative; cursor: pointer; }
.profile-select-tile:active:not(.tile-disabled) { border-color: #00fff0; background: #2d274d; }
.tile-avatar { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; background: #0d0a1b; }
.large-avatar { width: 100px; height: 100px; border: 3px solid #00fff0; margin-bottom: 10px; }
.tile-name { font-weight: bold; font-size: 1.1rem; text-transform: capitalize; }
.tile-disabled { opacity: 0.3; cursor: not-allowed; border-color: #121212; }
.claim-tag { position: absolute; top: 8px; right: 8px; background: #ff3366; color: white; font-size: 0.7rem; font-weight: bold; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
.active-profile-card { display: flex; flex-direction: column; align-items: center; margin-top: 25px; }
.user-tag { color: #8e8ba7; font-size: 1.1rem; }
.author-label { font-size: 1.1rem; color: #8e8ba7; margin-bottom: 5px; }
.big-reveal-name { font-size: 2.5rem; font-weight: 900; color: #ff007f; text-transform: uppercase; }
.input-group { display: flex; flex-direction: column; margin-bottom: 20px; }
.input-group label { margin-bottom: 8px; color: #8c88a5; font-size: 0.85rem; text-transform: uppercase; font-weight: bold; }
.input-group input { background: #24203e; border: 2px solid #36305a; border-radius: 8px; padding: 14px; color: #fff; font-size: 1.1rem; outline: none; }
.uppercase-input { text-transform: uppercase; }
.action-btn { width: 100%; background: #ff007f; color: white; border: none; padding: 16px; font-size: 1.2rem; font-weight: bold; border-radius: 8px; cursor: pointer; }
.options-vertical-grid { display: flex; flex-direction: column; gap: 12px; margin-top: 10px; }
.option-btn { width: 100%; background: #24203e; border: 2px solid #36305a; border-radius: 8px; padding: 16px; color: white; font-size: 1.2rem; font-weight: bold; text-align: center; cursor: pointer; }
.error-alert { background: #ff3366; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: bold; text-align: center; }
.hint-text { color: #64607d; font-size: 1rem; line-height: 1.5; margin-top: 15px; }
.mini-divider { border: 0; height: 1px; background: #2c274d; margin: 20px 0; }
.locked-box { padding: 30px 10px; background: rgba(0, 255, 240, 0.03); border: 2px dashed #00fff0; border-radius: 10px; }
.lock-icon { font-size: 3rem; margin-bottom: 10px; }
.pulse-loader { width: 50px; height: 50px; background-color: #00fff0; border-radius: 50%; margin: 30px auto; animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0% { transform: scale(0.8); opacity: 0.5; } 50% { transform: scale(1.2); opacity: 1; } 100% { transform: scale(0.8); opacity: 0.5; } }
.result-correct { background: #1a2e25; border: 2px solid #00ff88; box-shadow: 0 5px 20px rgba(0, 255, 136, 0.15); }
.result-wrong { background: #2b1721; border: 2px solid #ff3366; box-shadow: 0 5px 20px rgba(255, 51, 102, 0.15); }
</style>