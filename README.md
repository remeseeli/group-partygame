# Groupchat Party Game

A local party game inspired by Jackbox, where friends guess who sent anonymous quotes from their shared group chats (or inside jokes, get creative!). One device acts as the game screen while players join using their phones by scanning a QR code. After choosing their profile, everyone votes in real time to guess who wrote each message.

---

## Features

- TV dashboard for hosting the game
- Mobile phones used as controllers
- QR code joining system
- Automatic 4-letter room codes
- Custom player profiles including profile pictures
- Real-time multiplayer using WebSockets
- 30-second voting timer
- Simple synthesized sound effects using the Web Audio API
- Togglable drink penalties for a fun evening
- Simple separate form to add questions to the game deck

---

## Customizing for Your Friend Group

You can easily adapt this game for your own friends without changing any code!

1. **Set Player Names:** Open `game-backend/roster.json` and replace the default names with your friends' names.
2. **Write Your Quotes:** Open `game-backend/questions.json` and add your favorite group chat quotes. Make sure the `"author"` field perfectly matches a name from your `roster.json`.
3. **Add Custom Avatars (Optional):** Drop square `.png` images into `game-frontend/public/images/`. The file name must match the player's name exactly (e.g., `Andy.png`). If no image is provided, the game automatically falls back to a clean default icon.

---

## Content Editor

If you do not want to edit JSON files by hand, you can run the built-in editor in `game-backend/editor.js`.

It lets you:
- Add new players to the roster
- Upload profile images for players
- Add new quote or trivial questions to the game deck

### Run the editor

```bash
cd game-backend
node editor.js
```
---

## Project Structure

```text
groupchat-party-game/
├── game-backend/
│   ├── server.js
│   ├── package.json
│   └── ...
│
└── game-frontend/
    ├── src/
    │   ├── config.js
    │   ├── views/
    │   ├── components/
    │   └── ...
    ├── package.json
    └── vite.config.js
```

---

## Tech Stack

### Backend (`game-backend`)

- Node.js (ES Modules)
- Express
- Socket.IO
- cors

### Frontend (`game-frontend`)

- Vue 3
- Vite
- Vue Router
- Socket.IO Client
- qrcode.vue
- Web Audio API

---

## Getting Started

### Prerequisites

Make sure the computer running the game and all player devices are connected to the same Wi-Fi network.

### Configure the Server IP

The frontend needs to know the local IP address of the computer running the backend.

Find your local IPv4 address:

**Windows**

```bash
ipconfig
```

**macOS / Linux**

```bash
ifconfig
```

Then open:

```text
game-frontend/src/config.js
```

Update the `SERVER_IP` value:

```javascript
export const SERVER_IP = "192.168.1.45";
```

Replace the example IP with your own local IP address.

---

## Running the Project

Open two terminal windows.

### Start the Backend

```bash
cd game-backend
npm install
node server.js
```

The backend runs on port **3000**.

### Start the Frontend

```bash
cd game-frontend
pnpm install
pnpm run dev
```

Or, if you're using npm:

```bash
npm install
npm run dev
```

The frontend will be available at:

```text
http://localhost:5173
```
Note: Dependencies may behave differently on your machine

---

## Playing the Game

### 1. Open the Game Screen

On the host computer, open:

```text
http://localhost:5173/tv
```

A four-letter room code and a QR code will appear.

### 2. Join the Room

Players scan the QR code with their phones or manually open the frontend URL in a browser. They'll automatically join the room and choose a profile.

### 3. Start Playing

Once everyone has joined, start the game from the TV screen.

Each round:

1. A group chat quote or trivia question is shown.
2. Players vote on who they think sent it/who is it about.
3. Everyone has 30 seconds (configurable) to submit their answer.
4. The correct sender is revealed before moving to the next round.

---

## Future Improvements

Some ideas for future versions:

- More game settings
- Custom profile creation
- Image-based questions
- More sound effects and animations
- Database support
- Online multiplayer (Instead of local)

---

## License

This project was made for personal entertainment.

Feel free to fork it, adapt it for your own friend group, or build on top of it!