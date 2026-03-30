interface PlaylistTrack {
  title: string
  artist: string
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function formatPlaylistMessage(
  name: string,
  tracks: PlaylistTrack[],
  playlistUrl: string,
  resolvedCount: number,
  totalCount: number,
  comment?: string
): string {
  const lines: string[] = []

  lines.push(`🎵 ${name}`)
  lines.push('')

  tracks.slice(0, resolvedCount).forEach((track, i) => {
    lines.push(`${i + 1}. ${track.artist} — ${track.title}`)
  })

  lines.push('')
  lines.push(`🎧 ${playlistUrl}`)

  if (comment) {
    lines.push('')
    lines.push(comment)
  }

  return lines.join('\n')
}

export function formatErrorMessage(type: 'empty' | 'too_vague' | 'error'): string {
  switch (type) {
    case 'empty':
      return pick([
        "send me a vibe and i'll make you a playlist 🎵\n\ntry something like:\n• \"driving on PCH at sunset\"\n• \"need to lock in for 3 hours\"\n• \"feeling nostalgic about high school summers\"",
        "hey — just tell me the vibe 🎵\n\nlike:\n• \"rainy day coding\"\n• \"pregame energy\"\n• \"sad but in a good way\"",
      ])
    case 'too_vague':
      return pick([
        "give me a bit more to work with — what are you doing right now? that'll help me pick the right songs 🎵",
        "i need more than that lol — describe the mood, what you're doing, or a memory 🎵",
        "cmon give me something to work with 😂 what's the vibe?",
      ])
    case 'error':
      return pick([
        "ah something broke on my end — try sending another vibe 🎵",
        "that one tripped me up — send it again or try a different vibe? 🎵",
        "my bad, something went wrong — hit me with another vibe 🎵",
      ])
  }
}

export function getWorkingMessage(): string {
  return pick([
    '🎵 cooking up your playlist...',
    '🎵 on it — give me a sec...',
    '🎵 ooh good one. let me think...',
    '🎵 i got you, one sec...',
    '🎵 love this vibe. working on it...',
    '🎵 say less. putting it together...',
  ])
}
