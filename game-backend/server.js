import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

// Load the dynamic group roster
let MASTER_ROSTER = [];
try {
  const rosterData = fs.readFileSync(path.join(__dirname, 'roster.json'), 'utf8');
  MASTER_ROSTER = JSON.parse(rosterData);
} catch (err) {
  console.warn("No roster.json found. Falling back to default player names.");
  MASTER_ROSTER = ["Player 1", "Player 2", "Player 3", "Player 4"];
}

let GAME_DECK = [];
try {
  const rawData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
  GAME_DECK = JSON.parse(rawData);
} catch (err) {
  GAME_DECK = [{ type: 'question', content: "No questions available.", author: "none" }];
}

const rooms = {};

// Utility function to randomly shuffle an array
const shuffleArray = (array) => {
  const newArray = [...array]; // Create a copy so we don't mutate the original
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  } while (rooms[code]);
  return code;
}

io.on('connection', (socket) => {
  
  // Existing room creation code...
  socket.on('create-room', () => {
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      tvSocketId: socket.id,
      players: {}, // Keyed by profile name, not socket ID
      gameState: 'LOBBY',
      currentRound: 0,
      answersSubmitted: 0,
      timerInterval: null,
      roundDuration: 30,
      drinkingEnabled: true,
      claimedProfiles: {} // name -> socket.id
    };
    socket.join(roomCode);
    socket.emit('room-created', roomCode);
  });

  socket.on('get-available-profiles', (roomCode) => {
    const cleanCode = roomCode.toUpperCase().trim();
    const room = rooms[cleanCode];
    if (!room) return socket.emit('error-message', 'Room not found!');
    
    const statusList = MASTER_ROSTER.map(name => ({
      name,
      isClaimed: !!room.claimedProfiles[name]
    }));
    socket.emit('profile-list-update', statusList);
  });

  // --- RECOVERY & REJOIN LOGIC ---
  socket.on('join-room-with-profile', ({ roomCode, selectedProfile }) => {
    const cleanCode = roomCode.toUpperCase().trim();
    const room = rooms[cleanCode];
    if (!room) return socket.emit('error-message', 'Room not found!');

    // RECOVERY CHECK: If this player already exists in the room, they are just reconnecting!
    if (room.players[selectedProfile]) {
      console.log(`[SERVER] Reconnecting disconnected player: ${selectedProfile}`);
      room.claimedProfiles[selectedProfile] = socket.id;
      socket.join(cleanCode);
      socket.emit('joined-successfully', { roomCode: cleanCode, playerName: selectedProfile });
      io.to(room.tvSocketId).emit('update-players', Object.values(room.players));
      return;
    }

    if (room.gameState !== 'LOBBY') return socket.emit('error-message', 'Game already started!');
    if (room.claimedProfiles[selectedProfile]) {
      return socket.emit('error-message', 'This profile is already taken!');
    }

    // Fresh login session setup
    socket.join(cleanCode);
    room.claimedProfiles[selectedProfile] = socket.id;
    room.players[selectedProfile] = { 
      name: selectedProfile, 
      score: 0, 
      lastGuess: null 
    };

    socket.emit('joined-successfully', { roomCode: cleanCode, playerName: selectedProfile });
    
    const statusList = MASTER_ROSTER.map(name => ({ name, isClaimed: !!room.claimedProfiles[name] }));
    io.to(cleanCode).emit('profile-list-update', statusList);
    io.to(room.tvSocketId).emit('update-players', Object.values(room.players));
  });

  socket.on('submit-guess', ({ roomCode, guess }) => {
    const cleanCode = roomCode.toUpperCase().trim();
    const room = rooms[cleanCode];
    if (!room) return;

    // Find the player profile that owns this specific socket connection
    const playerName = Object.keys(room.claimedProfiles).find(key => room.claimedProfiles[key] === socket.id);
    
    if (playerName && room.players[playerName]) {
      room.players[playerName].lastGuess = guess;
      room.answersSubmitted++;
      socket.emit('guess-locked');

      const totalPlayers = Object.keys(room.players).length;
      if (room.answersSubmitted >= totalPlayers) {
        clearInterval(room.timerInterval);
        evaluateRoundResults(cleanCode);
      }
    }
  });

  socket.on('start-game', ({ roomCode, roundDuration, drinkingEnabled }) => {
    const room = rooms[roomCode];
    if (!room) return;
    // 1. Read the questions from the JSON file
    let rawQuestions = [];
    try {
      const rawData = fs.readFileSync(path.join(__dirname, 'questions.json'), 'utf8');
      rawQuestions = JSON.parse(rawData);
    } catch (err) {
      console.log("Error loading questions.json:", err);
      return;
    }

    // 2. Shuffle the questions in memory
    const randomizedDeck = shuffleArray(rawQuestions);

    room.questions = randomizedDeck;
    room.totalRounds = randomizedDeck.length;
    room.currentRound = 0;
    room.roundDuration = parseInt(roundDuration) || 30;
    room.drinkingEnabled = drinkingEnabled;

    // 4. Trigger first round
    nextRound(roomCode);
  });

  function nextRound(roomCode) {
    const room = rooms[roomCode];
    if (!room || room.currentRound >= room.questions.length) {
      if (room) room.gameState = 'LEADERBOARD';
      io.to(roomCode).emit('game-over', Object.values(room.players));
      return;
    }

    room.gameState = 'QUESTION';
    room.answersSubmitted = 0;
    const prompt = room.questions[room.currentRound];
    
    // Clear previous player guesses
    Object.keys(room.players).forEach(id => room.players[id].lastGuess = null);

    // Get a list of ALL players currently connected in this lobby room
    const connectedPlayerNames = Object.values(room.players).map(p => p.name);

    // 1. Establish the correct answer pool
    const correctAuthor = prompt.author;
    
    // 2. Filter out the correct author to get a clean pool of potential wrong choices
    const incorrectPool = connectedPlayerNames.filter(name => name !== correctAuthor);

    // 3. Shuffle the incorrect pool randomly
    const shuffledIncorrect = incorrectPool.sort(() => 0.5 - Math.random());

    // 4. Take up to 3 random wrong answers
    const selectedIncorrect = shuffledIncorrect.slice(0, 3);

    // 5. Build our master 4-option array (Correct + up to 3 random incorrects)
    const options = [correctAuthor, ...selectedIncorrect];

    // If there aren't enough players in the lobby to fill 4 slots, 
    // fall back to unjoined members of the MASTER_ROSTER to pad the buttons
    if (options.length < 4) {
      const backupPool = MASTER_ROSTER.filter(name => !options.includes(name));
      const shuffledBackup = backupPool.sort(() => 0.5 - Math.random());
      while (options.length < 4 && shuffledBackup.length > 0) {
        options.push(shuffledBackup.pop());
      }
    }

    // 6. Final shuffle so the correct author isn't always the first button!
    const finalShuffledOptions = options.sort(() => 0.5 - Math.random());

    // Broadcast configurations to endpoints
    io.to(room.tvSocketId).emit('show-prompt', {
      content: prompt.content,
      type: prompt.type,
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      timeLeft: room.roundDuration
    });

    // Send the custom 4-option array directly to mobile controllers
    io.to(roomCode).emit('mobile-start-guessing', { options: finalShuffledOptions });

    let timeLeft = room.roundDuration;
    clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
      timeLeft--;
      io.to(room.tvSocketId).emit('timer-tick', timeLeft);
      if (timeLeft <= 0) {
        clearInterval(room.timerInterval);
        evaluateRoundResults(roomCode);
      }
    }, 1000);
  }

  function evaluateRoundResults(roomCode) {
    const room = rooms[roomCode];
    if (!room) return;
    room.gameState = 'REVEAL';

    const prompt = room.questions[room.currentRound];
    const results = [];

    Object.keys(room.players).forEach(id => {
      const player = room.players[id];
      const isCorrect = player.lastGuess === prompt.author;
      const isSelf = player.name === prompt.author;

      let action = 'Correct! ✓';
      if (!room.drinkingEnabled) {
        if (isCorrect) { player.score += 1; action = 'Correct! (+1 pt)'; }
        else { action = 'Incorrect ✗'; }
      } else {
        if (isCorrect) { player.score += 1; action = 'assign-1'; }
        else if (isSelf) { action = 'drink-1'; }
        else { action = 'drink-2'; }
      }

      results.push({ name: player.name, guess: player.lastGuess || 'No Answer', isCorrect, action });
    });

    io.to(room.tvSocketId).emit('round-results', {
      author: prompt.author,
      results: results,
      players: Object.values(room.players),
      drinkingEnabled: room.drinkingEnabled
    });
    io.to(roomCode).emit('mobile-round-results', { author: prompt.author });
  }


  socket.on('trigger-next-round', (roomCode) => {
    const room = rooms[roomCode];
    if (!room || room.gameState !== 'REVEAL') return;
    room.currentRound++;
    nextRound(roomCode);
  });

  socket.on('disconnect', () => {
    for (const roomCode in rooms) {
      const room = rooms[roomCode];
      
      if (room.tvSocketId === socket.id) {
        clearInterval(room.timerInterval);
        delete rooms[roomCode];
        break;
      }

      // Find if a player socket went dark
      const disconnectedPlayer = Object.keys(room.claimedProfiles).find(key => room.claimedProfiles[key] === socket.id);
      if (disconnectedPlayer) {
        console.log(`[SERVER] Player ${disconnectedPlayer} backgrounded app or dropped connection.`);
        
        // Remove active socket reference but DO NOT delete them from room.players!
        // This keeps their score and position intact in memory.
        room.claimedProfiles[disconnectedPlayer] = null; 
        
        // Wait 300 seconds before permanently removing them, just in case they completely closed the tab
        setTimeout(() => {
          if (rooms[roomCode] && room.claimedProfiles[disconnectedPlayer] === null) {
            delete room.players[disconnectedPlayer];
            delete room.claimedProfiles[disconnectedPlayer];
            
            const statusList = MASTER_ROSTER.map(name => ({ name, isClaimed: !!room.claimedProfiles[name] }));
            io.to(roomCode).emit('profile-list-update', statusList);
            io.to(room.tvSocketId).emit('update-players', Object.values(room.players));
          }
        }, 300000); // <--- Configure timeout duration in ms
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`DD Game Backend running on port ${PORT}`);
});