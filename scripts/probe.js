// Rate-limited prober for the Match Play Events API.
//
// Captures one real response per endpoint into samples/raw/ so the OpenAPI spec
// can be written against observed payloads rather than guesses. Run manually --
// it is deliberately not part of the build.
//
//    node scripts/probe.js              run every probe in PROBES
//    node scripts/probe.js tournament   run only probes whose name matches
//
// GETs only, except the WPPR estimator which is a POST that computes rather
// than mutates. Requests are spaced at least CALL_INTERVAL_MS apart -- four
// times more conservative than the API's own 120/min ceiling, as a courtesy to
// a small operator.

const fs = require('node:fs')
const path = require('node:path')

process.loadEnvFile(path.join(__dirname, '..', '.env'))

const API_BASE = 'https://app.matchplay.events/api'
const CALL_INTERVAL_MS = 2000
const RAW_DIR = path.join(__dirname, '..', 'samples', 'raw')
const BODY_PREVIEW_LIMIT = 300

// Tournaments chosen to cover distinct formats, all completed so their data is
// stable. Discovered from the caches and fixtures of the sibling projects.
const KNOCKOUT_TOURNAMENT = 261001
const GROUP_KNOCKOUT_TOURNAMENT = 258562
const GOLF_TOURNAMENT = 259350
const CARD_BEST_GAME_TOURNAMENT = 239557   // completed, 530 cards
const SERIES_TOURNAMENT = 258965        // belongs to series 6140
const BEST_GAME_TOURNAMENT = 261295     // type best_game
const SAMPLE_USER = 5750
const REAL_PLAYER_ID = 135991

// Format-specific endpoints reject any tournament of the wrong type, so each
// needs a subject of its own. Both completed, found via the `type=` filter.
const FRENZY_TOURNAMENT = 153436
const MAX_MATCHPLAY_TOURNAMENT = 258970

// Item-level GETs need a known-good child id. Taken from the collection
// fixtures already in samples/ so they stay consistent with them.
const SAMPLE_GAME = 7696295             // in GROUP_KNOCKOUT_TOURNAMENT
const SAMPLE_CARD = 33857               // in CARD_BEST_GAME_TOURNAMENT
const SAMPLE_SINGLE_PLAYER_GAME = 2515032   // in GOLF_TOURNAMENT
const SAMPLE_IFPA_ID = 32819            // John Garnett
const SAMPLE_SERIES = 6140
const SERIES_ATTENDANCE_COUNT = 5

// Every expansion flag the handbook documents, requested in one call so we can
// see which ones actually change the payload.
const ALL_EXPANSIONS = [
   'includePlayers', 'includeArenas', 'includeBanks', 'includeScorekeepers',
   'includeLocation', 'includeEntryConfiguration', 'includeRsvpConfiguration',
   'includeLinkedTournaments', 'includeEvent', 'includeShortcut', 'includeSeries'
].map(flag => `${flag}=true`).join('&')

const PROBES = [
   // --- Tournaments ---------------------------------------------------------
   { name: 'tournaments-played', path: `/tournaments?played=${SAMPLE_USER}&limit=5` },
   { name: 'tournaments-status-started', path: '/tournaments?status=started&limit=3' },
   { name: 'tournaments-status-planned', path: '/tournaments?status=planned&limit=3' },
   { name: 'tournament-bare', path: `/tournaments/${KNOCKOUT_TOURNAMENT}` },
   { name: 'tournament-all-expansions', path: `/tournaments/${KNOCKOUT_TOURNAMENT}?${ALL_EXPANSIONS}` },
   { name: 'tournament-players-only', path: `/tournaments/${KNOCKOUT_TOURNAMENT}?includePlayers=true` },
   { name: 'tournament-bogus-expansion', path: `/tournaments/${KNOCKOUT_TOURNAMENT}?includeRounds=true&includeGames=true` },

   // --- Rounds, games, standings -------------------------------------------
   { name: 'rounds', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/rounds` },
   { name: 'games-tournament-scoped', path: `/tournaments/${GROUP_KNOCKOUT_TOURNAMENT}/games` },
   { name: 'games-global', path: `/games?tournaments=${GROUP_KNOCKOUT_TOURNAMENT}` },
   { name: 'standings', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/standings` },

   // --- Single-player formats ----------------------------------------------
   { name: 'single-player-games', path: `/tournaments/${GOLF_TOURNAMENT}/single-player-games?limit=5` },
   // A golf tournament has no cards; 239557 is the real card_best_game example.
   { name: 'cards-empty', path: `/tournaments/${GOLF_TOURNAMENT}/cards?limit=5` },
   { name: 'cards', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/cards?limit=3` },

   // --- Summaries (completed tournaments only) ------------------------------
   { name: 'summary-arenas', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/summary/arenas` },
   { name: 'summary-player-arenas', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/summary/player-arenas` },
   { name: 'summary-matches', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/summary/matches` },

   // --- Resolvers -----------------------------------------------------------
   { name: 'resolve-players-scoped', path: `/tournaments/${GROUP_KNOCKOUT_TOURNAMENT}/players/resolve-unknown?players=135991` },
   { name: 'resolve-arenas-scoped', path: `/tournaments/${GROUP_KNOCKOUT_TOURNAMENT}/arenas/resolve-unknown?arenas=56443` },
   { name: 'resolve-players-global', path: '/players/resolve-unknown?players=135991' },
   { name: 'resolve-users-global', path: `/users/resolve-unknown?users=${SAMPLE_USER}` },

   // --- Profile, search, ratings -------------------------------------------
   { name: 'user', path: `/users/${SAMPLE_USER}` },
   { name: 'user-self-profile', path: '/users/profile' },
   { name: 'search-users', path: '/search?query=Jones&type=users' },
   { name: 'players-global', path: '/players?players=5750&status=active' },
   { name: 'ratings-by-user', path: '/ratings/users/5750' },
   { name: 'ratings-by-ifpa', path: '/ratings/ifpa/31811' },

   // --- OPDB / PinTips ------------------------------------------------------
   { name: 'pintips', path: '/pintips?opdbId=G4do5-MDlN7' },
   { name: 'opdb-entry', path: '/opdb/entries/G4do5-MDlN7' },

   // --- Series and format-specific expansions -------------------------------
   // 261001 has no series, so includeSeries cannot be judged from it alone.
   { name: 'tournament-series-expansions', path: `/tournaments/${SERIES_TOURNAMENT}?${ALL_EXPANSIONS}` },
   { name: 'tournament-bestgame-expansions', path: `/tournaments/${BEST_GAME_TOURNAMENT}?${ALL_EXPANSIONS}` },
   { name: 'tournaments-by-series', path: '/tournaments?series=6140&limit=5' },
   { name: 'series', path: '/series/6224' },
   { name: 'series-list', path: '/series' },
   // Expansions are ignored here — this returns the same bytes as the bare request.
   { name: 'series-expansions', path: '/series/6224?includeTournaments=true&includePlayers=true' },
   { name: 'games-live-tournament', path: `/tournaments/${BEST_GAME_TOURNAMENT}/single-player-games?status=started&limit=5` },

   // --- Search parameter validation ----------------------------------------
   { name: 'search-tournaments', path: '/search?query=Monday&type=tournaments' },
   { name: 'search-arenas', path: '/search?query=Godzilla&type=arenas' },
   { name: 'search-locations', path: '/search?query=Seattle&type=locations' },
   { name: 'search-notype', path: '/search?query=Jones' },
   { name: 'search-bogus-type', path: '/search?query=Jones&type=bananas' },

   // The `players` param wants tournament playerIds, not userIds.
   { name: 'players-global-real', path: `/players?players=${REAL_PLAYER_ID}` },

   { name: 'opdb-changelog', path: '/opdb/changelog' },

   // Found by inserting /api into a website path — see content/conventions.md.
   { name: 'events', path: '/events/1' },
   { name: 'events-list', path: '/events' },
   { name: 'clubs', path: '/clubs/57' },
   // The three diagnostic failures that identify a real-but-unreadable route.
   { name: 'error-405-players', path: '/players/135991' },
   { name: 'error-401-locations', path: '/locations/10993' },
   { name: 'error-401-clubs-list', path: '/clubs' },

   // The API's only POST. Computes an estimate; stores nothing.
   { name: 'wppr-estimator', path: '/ifpa/wppr-estimator', body: { tournamentId: KNOCKOUT_TOURNAMENT } },

   // --- Statistics family ---------------------------------------------------
   // Distinct from /summary/* despite the overlapping names: different shapes,
   // and these return no envelope at all.
   { name: 'stats-matchplay', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/stats/matchplay` },
   { name: 'stats-rounds', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/stats/rounds` },
   { name: 'stats-arenas', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/stats/arenas` },
   { name: 'stats-players', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/stats/players` },
   { name: 'stats-bestgame', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/stats/bestgame` },
   // Errors unless the tournament has a definite duration — captured for the shape.
   { name: 'stats-matches-error', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/stats/matches` },

   // --- Format-specific -----------------------------------------------------
   { name: 'frenzy', path: `/tournaments/${FRENZY_TOURNAMENT}/frenzy` },
   { name: 'max-matchplay', path: `/tournaments/${MAX_MATCHPLAY_TOURNAMENT}/max-matchplay` },
   // 400/403 on a tournament of the wrong type — the type gate itself.
   { name: 'frenzy-wrong-type', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/frenzy` },
   { name: 'queues-wrong-type', path: `/tournaments/${KNOCKOUT_TOURNAMENT}/queues` },
   { name: 'queues', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/queues` },
   { name: 'bgsummary', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/arenas/bgsummary` },
   { name: 'single-player-top-scores', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/single-player-games/top-scores` },

   // --- Item-level GETs -----------------------------------------------------
   { name: 'game-single', path: `/tournaments/${GROUP_KNOCKOUT_TOURNAMENT}/games/${SAMPLE_GAME}` },
   { name: 'card-single', path: `/tournaments/${CARD_BEST_GAME_TOURNAMENT}/cards/${SAMPLE_CARD}` },
   { name: 'single-player-game-single', path: `/tournaments/${GOLF_TOURNAMENT}/single-player-games/${SAMPLE_SINGLE_PLAYER_GAME}` },

   // --- Organizer resources -------------------------------------------------
   { name: 'arenas-list', path: '/arenas?page=1' },
   { name: 'locations-list', path: '/locations?page=1' },

   // --- Series statistics ---------------------------------------------------
   { name: 'series-stats', path: `/series/${SAMPLE_SERIES}/stats` },
   { name: 'series-stats-attendance', path: `/series/${SAMPLE_SERIES}/stats/attendance?count=${SERIES_ATTENDANCE_COUNT}` },
   { name: 'series-include-details', path: `/series/${SAMPLE_SERIES}?includeDetails=true` },

   // --- Ratings extensions --------------------------------------------------
   { name: 'ifpa-rating-history', path: `/ifpa/${SAMPLE_IFPA_ID}/rating-history?limit=5` },
   { name: 'ratings-compare', path: '/ratings/compare', body: { userIds: [SAMPLE_USER] } },
   // Route exists but the token is not privileged enough — 401, not 404.
   { name: 'rating-periods', path: '/rating-periods?page=1' },

   // --- Newly found query parameters ----------------------------------------
   { name: 'tournament-parent-playoffs', path: `/tournaments/${KNOCKOUT_TOURNAMENT}?includeParent=true&includePlayoffs=true` },
   { name: 'user-include-ifpa', path: `/users/${SAMPLE_USER}?includeIfpa=true&includeCounts=true` },
   { name: 'tournaments-by-type', path: '/tournaments?type=frenzy&status=completed&limit=3' },
   // An unknown `type` yields an empty set rather than being ignored, unlike `status`.
   { name: 'tournaments-bogus-type', path: '/tournaments?type=bogusnonsense&limit=3' },

   // Removed from the API: 404s as of 2026-08-15.
   { name: 'error-404-dashboard', path: '/dashboard' },

   // --- Error shapes --------------------------------------------------------
   // Note: tournament id 1 exists, so a high id is needed for a real 404.
   { name: 'error-404-tournament', path: '/tournaments/1' },
   { name: 'error-404-tournament-high', path: '/tournaments/99999999' },
   { name: 'error-404-standings', path: '/tournaments/99999999/standings' },
   { name: 'error-404-user', path: '/users/999999999' },
   { name: 'error-unauth', path: `/tournaments/${KNOCKOUT_TOURNAMENT}`, noAuth: true },
   { name: 'error-page-past-end', path: '/tournaments?played=5750&limit=5&page=9999' }
]

let lastCallAt = 0

// Wait until at least CALL_INTERVAL_MS has passed since the previous request.
async function pace() {
   const wait = lastCallAt + CALL_INTERVAL_MS - Date.now()
   if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
   lastCallAt = Date.now()
}

// Perform one probe, writing the raw body to samples/raw/<name>.json and
// returning a short console-friendly summary.
async function runProbe(probe) {
   await pace()

   const method = probe.body ? 'POST' : 'GET'
   const headers = { Accept: 'application/json' }

   // A few probes deliberately omit auth to record what the API does without it.
   if (!probe.noAuth) headers.Authorization = `Bearer ${process.env.MATCHPLAY_API_TOKEN}`

   const options = { method, headers }
   if (probe.body) {
      headers['Content-Type'] = 'application/json'
      options.body = JSON.stringify(probe.body)
   }

   const response = await fetch(`${API_BASE}${probe.path}`, options)
   const text = await response.text()

   fs.writeFileSync(path.join(RAW_DIR, `${probe.name}.json`), text)
   fs.writeFileSync(
      path.join(RAW_DIR, `${probe.name}.meta.json`),
      JSON.stringify({
         name: probe.name,
         method,
         path: probe.path,
         status: response.status,
         contentType: response.headers.get('content-type'),
         bytes: text.length
      }, null, 2)
   )

   return { status: response.status, bytes: text.length, preview: text.slice(0, BODY_PREVIEW_LIMIT) }
}

async function main() {
   fs.mkdirSync(RAW_DIR, { recursive: true })

   const filter = process.argv[2]
   const probes = filter ? PROBES.filter(p => p.name.includes(filter)) : PROBES
   if (!probes.length) {
      console.error(`No probe matches "${filter}"`)
      process.exit(1)
   }

   console.log(`Running ${probes.length} probes at ${CALL_INTERVAL_MS}ms spacing (~${Math.ceil(probes.length * CALL_INTERVAL_MS / 1000)}s)\n`)

   for (const probe of probes) {
      try {
         const result = await runProbe(probe)
         const flag = result.status >= 400 ? '!' : ' '
         console.log(`${flag} ${String(result.status).padEnd(4)} ${probe.name.padEnd(28)} ${String(result.bytes).padStart(8)}b`)
         if (result.status >= 400) console.log(`       ${result.preview.replace(/\s+/g, ' ')}`)
      } catch (err) {
         console.log(`! ERR  ${probe.name.padEnd(28)} ${err.message}`)
      }
   }

   console.log(`\nRaw captures in ${RAW_DIR}`)
}

main()
