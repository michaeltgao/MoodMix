import Anthropic from '@anthropic-ai/sdk'
import { config } from './config'
import type { SpotifyUserTaste } from './spotify'

const client = new Anthropic({ apiKey: config.anthropicApiKey })

interface PlaylistSuggestion {
  name: string
  comment: string
  tracks: { title: string; artist: string }[]
}

const SYSTEM_PROMPT = `You're that friend who always has the perfect song for every moment. Someone texts you a vibe — a mood, a memory, what they're doing right now — and you just get it. You live for this.

You'll also see what they've been listening to on Spotify (top artists, top tracks, recently played). Use this to make it personal:
- ~60% songs from artists/genres they already love or adjacent to their taste
- ~40% discovery picks that match the vibe but push them somewhere new

Rules:
- Only suggest REAL songs by REAL artists. Never make up songs.
- No more than 1 song per artist.
- Give the playlist a short, creative name that captures the vibe (2-4 words).
- Consider tempo, energy, mood, lyrics vs instrumental, era, and genre.
- Decide the number of tracks based on the vibe:
  - If they mention a duration (e.g. "3 hours"), scale accordingly (~15 songs per hour).
  - If they mention a number (e.g. "give me 20 songs"), use that number.
  - If the vibe implies a short moment (e.g. "one song for walking to class"), use fewer tracks (3-5).
  - If the vibe implies a long session (e.g. "all day coding"), use more tracks (20-30).
  - Default to 10 songs if no duration or quantity cues are present.

Include a "comment" — a short, casual message like you'd text a friend. React to their vibe, explain a pick, reference what they've been listening to. Keep it 1-2 sentences, lowercase is fine, be natural. Examples:
- "heavy on the dream-pop for this one — threw in some khruangbin since you've been playing them nonstop"
- "ok this is a vibe. went no-lyrics since you said you need to lock in"
- "you've been on a massive drake kick so i leaned into that but snuck in some frank ocean too"

Respond with ONLY valid JSON in this exact format, no markdown:
{"name": "Playlist Name", "comment": "your casual comment here", "tracks": [{"title": "Song Title", "artist": "Artist Name"}, ...]}`

export async function generatePlaylist(
  vibeText: string,
  taste: SpotifyUserTaste
): Promise<PlaylistSuggestion> {
  const tasteContext = formatTasteContext(taste)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Vibe: "${vibeText}"

User's Spotify taste:
${tasteContext}

Generate a playlist. Decide the right number of tracks based on the vibe.`,
      },
    ],
  })

  const responseText = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const parsed = JSON.parse(responseText) as PlaylistSuggestion
    if (!parsed.name || !Array.isArray(parsed.tracks) || parsed.tracks.length === 0) {
      throw new Error('Invalid playlist format')
    }
    return parsed
  } catch {
    throw new Error(`Failed to parse Claude response: ${responseText.slice(0, 200)}`)
  }
}

function formatTasteContext(taste: SpotifyUserTaste): string {
  const sections: string[] = []

  if (taste.topArtists.length > 0) {
    const artists = taste.topArtists
      .slice(0, 10)
      .map((a) => `${a.name}${a.genres?.length ? ` (${a.genres.slice(0, 3).join(', ')})` : ''}`)
      .join(', ')
    sections.push(`Top artists: ${artists}`)
  }

  if (taste.topTracks.length > 0) {
    const tracks = taste.topTracks
      .slice(0, 10)
      .map((t) => `"${t.title}" by ${t.artist}`)
      .join(', ')
    sections.push(`Recent top tracks: ${tracks}`)
  }

  if (taste.recentTracks.length > 0) {
    const recent = taste.recentTracks
      .slice(0, 10)
      .map((t) => `"${t.title}" by ${t.artist}`)
      .join(', ')
    sections.push(`Recently played: ${recent}`)
  }

  return sections.join('\n')
}

// Check if a message is a valid vibe request (not empty, not gibberish)
export function classifyMessage(text: string): 'vibe' | 'empty' | 'too_vague' {
  const trimmed = text.trim()
  if (!trimmed) return 'empty'
  if (trimmed.length <= 2) return 'too_vague'
  return 'vibe'
}
