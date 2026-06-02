# MeetNow - Video Conferencing App

A full-featured video conferencing application combining the best features from Google Meet, Zoom, and Microsoft Teams.

## Features

### From Google Meet
- Clean, simple UI with dark theme
- Screen Sharing
- Meeting Timer
- Background Blur
- Meeting Info Panel
- Live Captions toggle

### From Zoom
- Gallery View / Speaker View / Sidebar Layout
- Emoji Reactions
- Waiting Room with Host approval
- Password Protected Meetings
- Recording indicator
- Meeting Lock/Unlock
- Copy Meeting Link

### From Microsoft Teams
- Raise Hand
- Participants Panel
- Chat Panel with timestamps
- Host Controls (Mute All, Remove Participant, End Meeting)
- Auto Host Transfer
- Participant status indicators

## Deployment

### Step 1: Deploy Signaling Server on Render

1. Go to [Render.com](https://render.com) and create an account
2. Click **New** → **Web Service**
3. Connect your GitHub repo: `Abilaaacg/LIVE_CHAT`
4. Configure:
   - **Name:** `meetnow-signaling`
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node signaling-server.js`
   - **Environment Variable:** `PORT` = `3001`
5. Click **Create Web Service**
6. Wait for deployment to complete
7. Copy the URL (e.g., `https://meetnow-signaling.onrender.com`)

### Step 2: Deploy Frontend on Netlify

1. Go to [Netlify](https://netlify.com) and create an account
2. Click **Add new site** → **Import an existing project**
3. Connect your GitHub repo: `Abilaaacg/LIVE_CHAT`
4. Configure:
   - **Build command:** `npm run build`
   - **Publish directory:** `.next`
5. Add Environment Variable:
   - **Key:** `NEXT_PUBLIC_SIGNALING_SERVER`
   - **Value:** `https://meetnow-signaling.onrender.com` (your Render URL)
6. Click **Deploy site**
7. Wait for deployment to complete

### Step 3: Update Signaling Server URL

1. Go to Render dashboard → your signaling service
2. Add environment variable:
   - **Key:** `NEXT_PUBLIC_SIGNALING_SERVER`
   - **Value:** `https://meetnow-signaling.onrender.com`
3. Trigger a new deploy on Netlify with the updated environment variable

## Local Development

```bash
# Install dependencies
npm install

# Start Next.js dev server
npm run dev

# In another terminal, start signaling server
npm run signaling
```

Open http://localhost:3000

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| M | Toggle Microphone |
| V | Toggle Camera |
| H | Raise/Lower Hand |
| C | Toggle Chat Panel |
| P | Toggle Participants Panel |
| L | Change Layout |
| ? | Show Shortcuts |

## Tech Stack

- **Frontend:** Next.js 12, React 17
- **Styling:** CSS with CSS Variables
- **Real-time:** Socket.io
- **Video/Audio:** WebRTC
- **Signaling:** Custom WebSocket server
- **Deployment:** Netlify (Frontend) + Render (Signaling)

## License

MIT