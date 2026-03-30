# Vibe-to-Playlist iMessage Agent

An AI-powered agent that listens to your iMessages and creates personalized Spotify playlists from natural language "vibe" descriptions. Text it something like *"driving on PCH at sunset"* and get back a curated playlist in seconds.

## How It Works

1. Send an iMessage describing a vibe or mood
2. The agent uses Claude to generate a playlist tailored to your Spotify listening history
3. A real Spotify playlist is created and the link is sent back via iMessage

Playlists aim for ~60% songs from your existing taste and ~40% discovery picks, ensuring musical coherence across tempo, energy, and mood.

## Tech Stack

- **TypeScript** / **Node.js**
- **Claude API** — playlist generation and message classification
- **Spotify Web API** — listening history, track search, playlist creation
- **iMessage Kit** — message listening and sending (macOS only)

## Prerequisites

- macOS (required for iMessage integration)
- Node.js
- A [Spotify Developer](https://developer.spotify.com/dashboard) app (Client ID & Secret)
- An [Anthropic API key](https://console.anthropic.com)

## Setup

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

   Fill in your `.env`:

   ```
   ANTHROPIC_API_KEY=your_anthropic_api_key
   SPOTIFY_CLIENT_ID=your_spotify_client_id
   SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
   SPOTIFY_REDIRECT_URI=http://127.0.0.1:8888/callback
   PHONE_NUMBER=+1234567890
   DEBUG=false
   ```

3. **Run the agent:**

   ```bash
   npm start
   ```

   On first run, a browser window will open for Spotify OAuth authorization. Tokens are cached locally and auto-refreshed on subsequent runs.

## Project Structure

```
src/
├── index.ts    # Entry point — iMessage listener loop
├── config.ts   # Environment variable loading
├── spotify.ts  # Spotify OAuth & API integration
├── vibe.ts     # Claude integration for playlist generation
└── format.ts   # Message formatting utilities
```

## License

MIT
