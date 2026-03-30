import * as http from 'http'
import * as fs from 'fs'
import * as crypto from 'crypto'
import { config } from './config'

interface SpotifyTokens {
  access_token: string
  refresh_token: string
  expires_at: number
}

interface SpotifyTrack {
  title: string
  artist: string
  uri?: string
}

interface SpotifyArtist {
  name: string
  genres: string[]
}

interface SpotifyUserTaste {
  topArtists: SpotifyArtist[]
  topTracks: { title: string; artist: string }[]
  recentTracks: { title: string; artist: string }[]
}

let tokens: SpotifyTokens | null = null

// Load saved tokens from disk
function loadTokens(): SpotifyTokens | null {
  try {
    if (fs.existsSync(config.spotify.tokenPath)) {
      const data = JSON.parse(fs.readFileSync(config.spotify.tokenPath, 'utf-8'))
      return data as SpotifyTokens
    }
  } catch {
    // ignore
  }
  return null
}

function saveTokens(t: SpotifyTokens): void {
  fs.writeFileSync(config.spotify.tokenPath, JSON.stringify(t, null, 2))
}

// Exchange authorization code for tokens
async function exchangeCode(code: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.spotify.redirectUri,
  })

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64'),
    },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Spotify token exchange failed: ${resp.status} ${text}`)
  }

  const data = await resp.json() as any
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

// Refresh the access token
async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })

  const resp = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64'),
    },
    body: body.toString(),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Spotify token refresh failed: ${resp.status} ${text}`)
  }

  const data = await resp.json() as any
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

// Get a valid access token, refreshing if needed
async function getAccessToken(): Promise<string> {
  if (!tokens) {
    throw new Error('Not authenticated with Spotify. Run authenticate() first.')
  }

  // Refresh if expiring within 60 seconds
  if (Date.now() > tokens.expires_at - 60_000) {
    if (config.debug) console.log('[spotify] Refreshing access token...')
    tokens = await refreshAccessToken(tokens.refresh_token)
    saveTokens(tokens)
  }

  return tokens.access_token
}

// OAuth2 Authorization Code flow — opens browser, runs local callback server
export async function authenticate(): Promise<void> {
  // Try loading existing tokens
  tokens = loadTokens()
  if (tokens) {
    // Test if token still works
    try {
      await getAccessToken()
      if (config.debug) console.log('[spotify] Authenticated with saved tokens')
      return
    } catch {
      if (config.debug) console.log('[spotify] Saved tokens invalid, re-authenticating...')
      tokens = null
    }
  }

  const scopes = [
    'user-read-private',
    'user-read-email',
    'user-top-read',
    'user-read-recently-played',
    'playlist-modify-public',
    'playlist-modify-private',
  ]

  const state = crypto.randomBytes(16).toString('hex')
  const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: scopes.join(' '),
    redirect_uri: config.spotify.redirectUri,
    state,
    show_dialog: 'true',
  }).toString()}`

  // Start local server to receive the callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://127.0.0.1:8888`)
      if (url.pathname !== '/callback') return

      const code = url.searchParams.get('code')
      const returnedState = url.searchParams.get('state')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400)
        res.end(`Authorization failed: ${error}`)
        server.close()
        reject(new Error(`Spotify auth error: ${error}`))
        return
      }

      if (returnedState !== state || !code) {
        res.writeHead(400)
        res.end('Invalid state or missing code')
        server.close()
        reject(new Error('Invalid OAuth state'))
        return
      }

      try {
        tokens = await exchangeCode(code)
        saveTokens(tokens)
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<html><body><h1>✅ Spotify connected!</h1><p>You can close this tab and go back to your terminal.</p></body></html>')
        server.close()
        if (config.debug) console.log('[spotify] Authenticated successfully')
        resolve()
      } catch (err) {
        res.writeHead(500)
        res.end('Token exchange failed')
        server.close()
        reject(err)
      }
    })

    server.listen(8888, () => {
      console.log('\n🎵 Open this URL to connect your Spotify account:\n')
      console.log(authUrl)
      console.log('\nWaiting for authorization...\n')

      // Try to open browser automatically
      const { exec } = require('child_process')
      exec(`open "${authUrl}"`)
    })
  })
}

// Spotify API helper
async function spotifyApi(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken()
  const resp = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Spotify API error ${resp.status}: ${text}`)
  }

  return resp.json()
}

// Fetch user's music taste for personalization
export async function getUserTaste(): Promise<SpotifyUserTaste> {
  const [topArtistsData, topTracksData, recentData] = await Promise.all([
    spotifyApi('/me/top/artists?time_range=medium_term&limit=20'),
    spotifyApi('/me/top/tracks?time_range=short_term&limit=20'),
    spotifyApi('/me/player/recently-played?limit=20'),
  ])

  const topArtists: SpotifyArtist[] = topArtistsData.items.map((a: any) => ({
    name: a.name,
    genres: a.genres,
  }))

  const topTracks = topTracksData.items.map((t: any) => ({
    title: t.name,
    artist: t.artists[0]?.name || 'Unknown',
  }))

  const recentTracks = recentData.items.map((item: any) => ({
    title: item.track.name,
    artist: item.track.artists[0]?.name || 'Unknown',
  }))

  return { topArtists, topTracks, recentTracks }
}

// Search for a track on Spotify, return its URI
export async function searchTrack(title: string, artist: string): Promise<string | null> {
  const query = encodeURIComponent(`track:${title} artist:${artist}`)
  try {
    const data = await spotifyApi(`/search?q=${query}&type=track&limit=1`)
    const tracks = data.tracks?.items
    if (tracks && tracks.length > 0) {
      return tracks[0].uri as string
    }
  } catch (err) {
    if (config.debug) console.log(`[spotify] Search failed for "${title}" by ${artist}:`, err)
  }
  return null
}

// Create a playlist and add tracks, return the playlist URL
export async function createPlaylist(
  name: string,
  tracks: { title: string; artist: string }[]
): Promise<{ url: string; resolvedCount: number }> {
  // Resolve track URIs in parallel
  const uriResults = await Promise.all(
    tracks.map((t) => searchTrack(t.title, t.artist))
  )
  const uris = uriResults.filter((uri): uri is string => uri !== null)

  if (uris.length === 0) {
    throw new Error('Could not find any of the suggested tracks on Spotify')
  }

  try {
    // Create the playlist
    const playlist = await spotifyApi(`/me/playlists`, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: `Created by Vibe Agent 🎵`,
        public: true,
      }),
    })

    // Add tracks
    await spotifyApi(`/playlists/${playlist.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ uris }),
    })

    return {
      url: playlist.external_urls.spotify,
      resolvedCount: uris.length,
    }
  } catch {
    // Fallback: return a Spotify search link for the first track as entry point
    // Extract track ID from URI (spotify:track:XXXX -> XXXX)
    const trackIds = uris.map(uri => uri.split(':')[2])
    return {
      url: `https://open.spotify.com/track/${trackIds[0]}`,
      resolvedCount: uris.length,
    }
  }
}

export type { SpotifyUserTaste, SpotifyTrack }
