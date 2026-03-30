import * as fs from 'fs'
import * as path from 'path'

// Load .env file manually (no dotenv dependency)
function loadEnv(): void {
  const envPath = path.join(__dirname, '..', '.env')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIndex = trimmed.indexOf('=')
    if (eqIndex === -1) continue
    const key = trimmed.slice(0, eqIndex).trim()
    const value = trimmed.slice(eqIndex + 1).trim().replace(/^["']|["']$/g, '')
    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

loadEnv()

function requireEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    console.error(`Missing required environment variable: ${key}`)
    process.exit(1)
  }
  return value
}

export const config = {
  anthropicApiKey: requireEnv('ANTHROPIC_API_KEY'),
  spotify: {
    clientId: requireEnv('SPOTIFY_CLIENT_ID'),
    clientSecret: requireEnv('SPOTIFY_CLIENT_SECRET'),
    redirectUri: process.env['SPOTIFY_REDIRECT_URI'] || 'http://127.0.0.1:8888/callback',
    tokenPath: path.join(__dirname, '..', '.spotify-token.json'),
  },
  phoneNumber: requireEnv('PHONE_NUMBER'),
  debug: process.env['DEBUG'] === 'true',
}
