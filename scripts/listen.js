// Listen to a tournament's Pusher channel and log every frame.
//
//    node scripts/listen.js <tournamentId> [seconds]
//
// Written to close the documented gaps in content/realtime.html: several events
// Match Play names have never been observed, so their payloads are marked
// unverified. Capturing one means listening to a tournament while it is actually
// being played.
//
// Frames are appended to samples/raw/ws-<tournamentId>.jsonl. Nothing here uses
// the REST API, so it consumes no rate budget — the channel is public and needs
// no authentication at all.
//
// Finding a live tournament is the hard part. `status: "started"` is unreliable
// (most such tournaments are finished but unmarked), so check for genuinely
// recent game activity before settling in to listen.

const fs = require('node:fs')
const path = require('node:path')

const APP_KEY = 'tnrxzkahdeullnwje83e'
const WS_URL = `wss://ws.app.matchplay.events/app/${APP_KEY}?protocol=7&client=js&version=8.5.0&flash=false`
const EVENT_NAMESPACE = 'App\\Events\\'
const DEFAULT_SECONDS = 120
const PING_MARGIN_MS = 5000
const FALLBACK_ACTIVITY_TIMEOUT_MS = 30000

const tournamentId = process.argv[2]
const seconds = Number(process.argv[3]) || DEFAULT_SECONDS

if (!tournamentId) {
   console.error('usage: node scripts/listen.js <tournamentId> [seconds]')
   process.exit(1)
}

const logPath = path.join(__dirname, '..', 'samples', 'raw', `ws-${tournamentId}.jsonl`)
fs.mkdirSync(path.dirname(logPath), { recursive: true })

const counts = new Map()
let pingTimer = null

// Event payloads arrive as a JSON string on some events and an object on others.
function decode(data) {
   if (typeof data !== 'string') return data
   try { return JSON.parse(data) } catch { return data }
}

const socket = new WebSocket(WS_URL)

socket.addEventListener('open', () => {
   console.log(`connected — subscribing to tournaments.${tournamentId}`)
   socket.send(JSON.stringify({
      event: 'pusher:subscribe',
      data: { auth: '', channel: `tournaments.${tournamentId}` }
   }))
})

socket.addEventListener('message', event => {
   const frame = decode(event.data)
   const name = (frame.event || '').replace(EVENT_NAMESPACE, '')
   const payload = decode(frame.data)

   counts.set(name, (counts.get(name) || 0) + 1)
   fs.appendFileSync(logPath, JSON.stringify({ at: new Date().toISOString(), event: name, payload }) + '\n')

   if (name === 'pusher:connection_established') {
      // Honour the server's activity_timeout rather than assuming one.
      const timeout = Number(payload?.activity_timeout) * 1000 || FALLBACK_ACTIVITY_TIMEOUT_MS
      console.log(`  connection established, activity_timeout ${timeout / 1000}s`)
      pingTimer = setInterval(() => {
         socket.send(JSON.stringify({ event: 'pusher:ping', data: {} }))
      }, Math.max(timeout - PING_MARGIN_MS, PING_MARGIN_MS))
      return
   }

   if (name === 'pusher_internal:subscription_succeeded') {
      console.log('  subscribed — listening')
      return
   }

   if (name === 'pusher:pong') return

   console.log(`  ${name}: ${JSON.stringify(payload).slice(0, 200)}`)
})

socket.addEventListener('error', event => console.error('socket error:', event.message || event))

socket.addEventListener('close', event => {
   // 4000-4099 do not reconnect, 4100-4199 back off, 4200-4299 reconnect at once.
   console.log(`closed: code ${event.code} ${event.reason || ''}`.trim())
})

setTimeout(() => {
   if (pingTimer) clearInterval(pingTimer)
   socket.close()
   console.log(`\nlistened ${seconds}s. Frames by type:`)
   for (const [name, count] of [...counts].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(count).padStart(4)}  ${name}`)
   }
   console.log(`\nlog: ${logPath}`)
   process.exit(0)
}, seconds * 1000)
