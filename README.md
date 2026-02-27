# DUNO — Real-Time Multiplayer Card Game

A mobile-first multiplayer card game web application with real-time synchronization via Firebase Realtime Database. Play with 2–4 friends online!

![Game Preview](https://img.shields.io/badge/Players-2--4-blue) ![Status](https://img.shields.io/badge/Status-Ready-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## Features

- 🎮 **Real-time multiplayer** — 2–4 players per room
- 🃏 **108-card deck** — Numbers, Skip, Reverse, Draw Two, Wild, Wild Draw Four
- 🔗 **Room system** — Create/join with 6-character room codes
- 📱 **Mobile-first** — Optimized for phones with responsive desktop support
- 🔊 **Sound effects** — Web Audio API tones (no external files)
- 🔄 **Rejoin support** — Reconnect on page refresh
- 🎨 **Original card design** — Clean minimal cards with no copyrighted assets

## Quick Start

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click **Add project** → name it (e.g., `duno-game`) → Create
3. In the sidebar, click **Build → Realtime Database**
4. Click **Create Database** → choose a region → Start in **test mode**
5. Go to **Project Settings** (⚙️) → Scroll down → **Add app** → **Web** (</>)
6. Register the app → copy the config values

### 2. Configure the App

Open `firebase-config.js` and replace the placeholder values:

```javascript
const firebaseConfig = {
  apiKey: "your-actual-api-key",
  authDomain: "your-project.firebaseapp.com",
  databaseURL: "https://your-project-default-rtdb.firebaseio.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};
```

### 3. Set Database Rules

In Firebase Console → Realtime Database → **Rules**, paste:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": true,
        ".write": true,
        "players": {
          "$playerId": {
            ".write": "auth == null || $playerId == auth.uid"
          }
        }
      }
    }
  }
}
```

> **Note:** For production, use stricter rules with Firebase Authentication. The rules above allow open access for easy testing.

### 4. Run Locally

Just serve the files with any static server:

```bash
# Using npx (no install needed)
npx serve .

# Or Python
python3 -m http.server 3000

# Or just open index.html directly (some browsers may block Firebase)
```

## Deployment

### Firebase Hosting

```bash
# Install Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Initialize (select Hosting, choose your project, set public dir to ".")
firebase init hosting

# Deploy
firebase deploy
```

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel
```

Or just drag & drop the folder to [vercel.com/new](https://vercel.com/new).

## Game Rules

- Each player gets **7 cards**
- Match the top card by **color**, **number**, or **action**
- **Wild** cards can be played anytime — choose the next color
- **Skip** → next player loses their turn
- **Reverse** → play direction reverses
- **Draw Two** → next player draws 2 cards and loses turn
- **Wild Draw Four** → choose color + next player draws 4
- **Draw** if you have no playable card
- Call **DUNO** when you have 1 card left (or draw 2 penalty!)
- First player to empty their hand **wins**

## File Structure

```
duno/
├── index.html          # Single-page app HTML
├── style.css           # Mobile-first responsive styles
├── app.js              # Game logic, Firebase sync, UI
├── firebase-config.js  # Firebase credentials (edit this!)
└── README.md           # This file
```

## Tech Stack

- **HTML/CSS/Vanilla JS** — Zero frameworks, zero dependencies
- **Firebase Realtime Database** — Real-time multiplayer sync
- **Web Audio API** — Sound effects
- **Google Fonts (Inter)** — Modern typography

## License

MIT — Use however you like. No copyrighted game assets used.
