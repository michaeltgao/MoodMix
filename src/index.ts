import { IMessageSDK } from '@photon-ai/imessage-kit'
import { config } from './config'
import { authenticate, getUserTaste, createPlaylist } from './spotify'
import { generatePlaylist, classifyMessage } from './vibe'
import { formatPlaylistMessage, formatErrorMessage } from './format'

async function main() {
  console.log('🎵 Vibe Agent starting up...\n')

  // 1. Authenticate with Spotify
  await authenticate()
  console.log('✅ Spotify connected')

  // 2. Initialize iMessage SDK
  const sdk = new IMessageSDK({
    debug: config.debug,
    watcher: {
      pollInterval: 3000,
      unreadOnly: false,
      excludeOwnMessages: false,
    },
  })

  console.log(`✅ Watching for messages from: ${config.phoneNumber}`)
  console.log('\nSend a vibe to get a playlist! (e.g. "driving on PCH at sunset")\n')

  // Track state
  const processedMessages = new Set<string>()
  const startupTime = new Date()
  let lastReplyTime = 0

  // 3. Start watching for incoming messages
  await sdk.startWatching({
    onMessage: async (message) => {
      const msgTime = new Date(message.date).getTime()

      // Ignore messages from before the agent started
      if (msgTime < startupTime.getTime()) return
      // Skip messages we already processed
      if (processedMessages.has(message.id)) return
      // Skip reactions
      if (message.isReaction) return
      // Skip any message that arrived within 5 seconds of our last reply
      // (these are our own replies appearing in the chat)
      if (lastReplyTime > 0 && Math.abs(msgTime - lastReplyTime) < 5000) {
        processedMessages.add(message.id)
        return
      }

      // Only respond to messages from the configured phone number
      if (message.sender !== config.phoneNumber) return

      const text = message.text || ''

      // Skip messages that look like agent responses
      const lower = text.toLowerCase()
      if (text.startsWith('🎵') || lower.includes('open.spotify.com') ||
          lower.startsWith('send me a vibe') || lower.startsWith('hey — just tell me') ||
          lower.startsWith('give me a bit more') || lower.startsWith('i need more than') ||
          lower.startsWith('cmon give me') || lower.startsWith('ah something broke') ||
          lower.startsWith('that one tripped') || lower.startsWith('my bad')) {
        processedMessages.add(message.id)
        return
      }

      console.log(`[incoming] "${text.slice(0, 50)}" from ${message.sender}`)
      processedMessages.add(message.id)

      // Classify the message
      const type = classifyMessage(text)

      if (type === 'empty') {
        await sdk.send(message.sender, formatErrorMessage('empty'))
        lastReplyTime = Date.now()
        return
      }

      if (type === 'too_vague') {
        await sdk.send(message.sender, formatErrorMessage('too_vague'))
        lastReplyTime = Date.now()
        return
      }

      try {
        // Fetch user's Spotify taste
        const taste = await getUserTaste()

        // Generate playlist with Claude
        const suggestion = await generatePlaylist(text, taste)
        console.log(`[claude] Playlist: "${suggestion.name}" with ${suggestion.tracks.length} tracks`)

        // Create real Spotify playlist
        const { url, resolvedCount } = await createPlaylist(suggestion.name, suggestion.tracks)
        console.log(`[spotify] Created playlist: ${url} (${resolvedCount}/${suggestion.tracks.length} resolved)`)

        // Format and send the response
        const response = formatPlaylistMessage(
          suggestion.name,
          suggestion.tracks,
          url,
          resolvedCount,
          suggestion.tracks.length,
          suggestion.comment
        )

        await sdk.send(message.sender, response)
        lastReplyTime = Date.now()
      } catch (err) {
        console.error('[error]', err)
        await sdk.send(message.sender, formatErrorMessage('error'))
        lastReplyTime = Date.now()
      }
    },
    onError: (error) => {
      console.error('[watcher error]', error)
    },
  })

  // Keep the process running
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...')
    sdk.stopWatching()
    await sdk.close()
    process.exit(0)
  })
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
