/* A light interface to add new quotes and players to the game 
This is a simple web server that serves a form and handles submissions, so that we don't need to edit JSON manually.
(or add images manually to the folder)
run with node editor.js and visit http://localhost:4000 */

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.urlencoded({ extended: true }));

// Path definitions bridging your backend and frontend structures
const rosterFile = path.join(__dirname, 'roster.json');
const questionsFile = path.join(__dirname, 'questions.json');
const imagesDir = path.join(__dirname, '../game-frontend/public/images');

// Ensure the frontend images directory exists before trying to save to it
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

// Configure Multer to intercept image uploads and rename them perfectly
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, imagesDir);
  },
  filename: function (req, file, cb) {
    const safeName = req.body.playerName.trim();
    cb(null, `${safeName}.png`);
  }
});
const upload = multer({ storage: storage });

const getRoster = () => {
  try { return JSON.parse(fs.readFileSync(rosterFile, 'utf8')); }
  catch { return ["Player 1", "Player 2"]; } 
};

// 1. Serve the Dual Web UI
app.get('/', (req, res) => {
  const roster = getRoster();
  const options = roster.map(n => `<option value="${n}">${n}</option>`).join('');
  
  res.send(`
    <html>
      <head>
        <title>Game Editor</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0c0a17; color: white; padding: 40px; display: flex; flex-direction: column; align-items: center; gap: 30px; }
          .card { background: #1c1836; padding: 40px; border-radius: 12px; width: 100%; max-width: 500px; border: 2px solid #231f3f; box-sizing: border-box; }
          h2 { color: #00fff0; margin-top: 0; }
          label { font-size: 0.9rem; color: #8c88a5; text-transform: uppercase; font-weight: bold; display: block; margin-top: 15px; }
          input[type="text"], select, input[type="file"] { width: 100%; padding: 12px; margin: 8px 0 24px; border-radius: 8px; background: #141126; color: white; border: 1px solid #36305a; font-size: 1.1rem; box-sizing: border-box; }
          button { width: 100%; padding: 16px; background: #ff007f; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 1.2rem; font-weight: bold; text-transform: uppercase; }
          .success { color: #00fff0; text-align: center; display: none; margin-bottom: 20px; font-weight: bold; padding: 15px; background: rgba(0, 255, 240, 0.1); border-radius: 8px; width: 100%; max-width: 500px; box-sizing: border-box; border: 1px solid #00fff0; }
        </style>
      </head>
      <body>
        
        <div id="msg" class="success">Data saved successfully!</div>

        <!-- ADD PLAYER PANEL -->
        <div class="card">
          <h2>Add New Player</h2>
          <form method="POST" id="addPlayerForm" enctype="multipart/form-data">
            <label>Player Name</label>
            <input type="text" name="playerName" placeholder="E.g. Sarah" required autocomplete="off" />
            
            <label>Profile Picture (.png)</label>
            <input type="file" name="profileImage" accept="image/png" required />
            
            <button type="submit">Add to Roster</button>
          </form>
        </div>

        <!-- ADD QUOTE PANEL -->
        <div class="card">
          <h2>Add New Quote</h2>
          <form method="POST" id="addQuoteForm">
            <label>Prompt Type</label>
            <select name="type">
              <option value="quote">Direct Quote (with " ")</option>
              <option value="question">Trivia Question (no quotes)</option>
            </select>

            <label>Content</label>
            <input type="text" name="content" placeholder="Type the message or question here..." required autocomplete="off" />
            
            <label>Who sent it / Who is it about?</label>
            <select name="author">
              ${options}
            </select>
            
            <button type="submit">Add to Deck</button>
          </form>
        </div>

        <script>
          const showSuccess = () => {
            const msg = document.getElementById('msg');
            msg.style.display = 'block';
            setTimeout(() => { msg.style.display = 'none'; }, 2000);
          };

          // Handle Player Submission
          document.getElementById('addPlayerForm').addEventListener('submit', async (e) => {
            e.preventDefault(); // Stops the page from refreshing
            const formData = new FormData(e.target);
            
            await fetch('/add-player', {
              method: 'POST',
              body: formData
            });
            
            e.target.reset(); // Clears the input fields for the next one
            showSuccess();
          });

          // Handle Quote Submission
          document.getElementById('addQuoteForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const urlEncoded = new URLSearchParams(formData).toString();
            
            await fetch('/add-quote', {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: urlEncoded
            });
            
            // Only clear the text input so the author/type dropdowns stay the same!
            e.target.querySelector('input[name="content"]').value = ''; 
            showSuccess();
          });
        </script>
      </body>
    </html>
  `);
});

// 2. Process Quote Submissions
app.post('/add-quote', (req, res) => {
  const { content, author, type } = req.body;
  let questions = [];
  
  try {
    const rawData = fs.readFileSync(questionsFile, 'utf8');
    questions = JSON.parse(rawData);
  } catch (e) {} 
  
  questions.push({
    type: type,
    content: content.trim(),
    author: author
  });
  
  fs.writeFileSync(questionsFile, JSON.stringify(questions, null, 2));
  res.json({success: true }); // Prevents the form from refreshing the page
});

// 3. Process Player Submissions & File Uploads
app.post('/add-player', upload.single('profileImage'), (req, res) => {
  const playerName = req.body.playerName.trim();
  let roster = getRoster();
  
  // Update the roster JSON array if the player doesn't already exist
  if (!roster.includes(playerName)) {
    roster.push(playerName);
    fs.writeFileSync(rosterFile, JSON.stringify(roster, null, 2));
  }
  
  res.json({ success: true }); // Prevents the form from refreshing the page
});

const PORT = 4000;
app.listen(PORT, () => console.log(`Game Manager running at http://localhost:${PORT}`));