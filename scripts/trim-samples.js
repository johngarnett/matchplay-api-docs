// Turn raw API captures into small, committable fixtures.
//
//    node scripts/trim-samples.js
//
// samples/raw/ is gitignored because raw payloads carry real names, pronouns,
// avatar URLs and privacy flags for many people. This produces samples/ —
// a couple of records per endpoint, which is enough for the spec tests to run
// on a fresh clone without shipping a directory of personal data.
//
// Two privacy controls apply. Trimming keeps the record count small, so keep
// RECORD_LIMIT low. Anonymizing replaces third parties' display names and avatar
// URLs — see anonymize() below.
//
// Everything the schema tests actually prove is kept verbatim: ids, enums, nulls,
// numbers and structure. A display name is a string either way, so anonymizing
// costs nothing as evidence.

const fs = require('node:fs')
const path = require('node:path')

const RAW_DIR = path.join(__dirname, '..', 'samples', 'raw')
const OUT_DIR = path.join(__dirname, '..', 'samples')
const RECORD_LIMIT = 2

// The IFPA id whose row the documentation quotes from the WPPR estimator.
const DOCUMENTED_IFPA_ID = 32819

// This repository is public, so third parties' display names and avatar URLs are
// replaced with placeholders. Ids, flags, enums, nulls and structure are kept
// verbatim — those are what the schema tests actually prove, and a name is a
// string either way, so nothing is lost as evidence.
//
// The repo owner consented to appearing, so his records pass through unchanged.
const CONSENTING_USER_IDS = new Set([5750])
const CONSENTING_IFPA_IDS = new Set([32819])
const PLACEHOLDER_NAME = 'Player Name'
const PLACEHOLDER_FIRST_NAME = 'Player'
const PLACEHOLDER_LAST_NAME = 'Name'
const PLACEHOLDER_INITIALS = 'PN'

// Keys whose values name or depict a person.
const PERSON_NAME_KEYS = new Set(['name', 'firstName', 'lastName', 'initials'])
const AVATAR_KEYS = new Set(['avatar', 'banner', 'tournamentAvatar'])

// Does this object describe a person? Tournaments, arenas and locations also have
// a `name`, and theirs must survive — only person-shaped records are rewritten.
function isPersonRecord(node) {
   if (!node || typeof node !== 'object') return false
   return 'userId' in node || 'playerId' in node || 'claimedBy' in node || 'ifpaId' in node
}

function isConsenting(node) {
   return CONSENTING_USER_IDS.has(node.userId)
      || CONSENTING_USER_IDS.has(node.claimedBy)
      || CONSENTING_IFPA_IDS.has(node.ifpaId)
}

// Blank the timestamp in an avatar URL so it points at nothing retrievable while
// keeping the documented `avatar-U<userId>-<epoch>.jpg` shape intact.
function neutralizeAvatar(url) {
   if (typeof url !== 'string') return url
   return url.replace(/-(\d{6,})\./, '-0000000000.')
}

// Walk a payload, replacing third parties' names and avatars in place.
function anonymize(node) {
   if (Array.isArray(node)) return node.map(anonymize)
   if (!node || typeof node !== 'object') return node

   const person = isPersonRecord(node) && !isConsenting(node)
   const out = {}

   for (const [key, value] of Object.entries(node)) {
      if (person && PERSON_NAME_KEYS.has(key) && typeof value === 'string' && value !== '') {
         if (key === 'firstName') out[key] = PLACEHOLDER_FIRST_NAME
         else if (key === 'lastName') out[key] = PLACEHOLDER_LAST_NAME
         else if (key === 'initials') out[key] = PLACEHOLDER_INITIALS
         else out[key] = PLACEHOLDER_NAME
      } else if (person && AVATAR_KEYS.has(key)) {
         out[key] = neutralizeAvatar(value)
      } else {
         out[key] = anonymize(value)
      }
   }
   return out
}

// Files worth committing, and how to find the records inside each envelope.
// `envelope: 'data'` keeps {data, links, meta} intact but truncates data;
// 'array' is a bare array; 'whole' is a single-object response kept as-is.
const FIXTURES = [
   { file: 'rounds.json', envelope: 'data' },
   { file: 'games-tournament-scoped.json', envelope: 'data' },
   { file: 'games-global.json', envelope: 'data' },
   { file: 'standings.json', envelope: 'array' },
   { file: 'tournaments-played.json', envelope: 'data' },
   { file: 'tournament-series-expansions.json', envelope: 'whole' },
   { file: 'resolve-players-scoped.json', envelope: 'data' },
   { file: 'resolve-arenas-scoped.json', envelope: 'data' },
   { file: 'resolve-players-global.json', envelope: 'data' },
   { file: 'resolve-users-global.json', envelope: 'data' },
   { file: 'search-users.json', envelope: 'data' },
   { file: 'single-player-games.json', envelope: 'data' },
   { file: 'cards.json', envelope: 'data', limit: 1 },
   { file: 'summary-arenas.json', envelope: 'data' },
   { file: 'summary-player-arenas.json', envelope: 'data' },
   { file: 'summary-matches.json', envelope: 'data' },
   { file: 'ratings-by-user.json', envelope: 'whole', truncate: { ratingHistory: 3 } },
   { file: 'user.json', envelope: 'whole' },
   // The estimator returns every entrant. Keep only the row the docs quote, and
   // drop unresolvedNames, which is a list of real names of people who have no
   // IFPA record and therefore never appeared in any API object we published.
   { file: 'wppr-estimator.json', envelope: 'whole', pick: { players: p => p.ifpaId === DOCUMENTED_IFPA_ID }, clear: ['unresolvedNames'], truncate: { standingsOrder: 2 } }
]

// Cap named array properties on a single-object response so a long history or
// player list does not dominate the fixture.
function truncateFields(record, limits) {
   if (!limits) return record
   const out = { ...record }
   for (const [key, limit] of Object.entries(limits)) {
      if (Array.isArray(out[key])) out[key] = out[key].slice(0, limit)
   }
   return out
}

// Keep only the elements of a named array that a predicate selects, so a fixture
// carries the record the docs quote rather than whichever happened to be first.
function pickFields(record, pickers) {
   if (!pickers) return record
   const out = { ...record }
   for (const [key, predicate] of Object.entries(pickers)) {
      if (Array.isArray(out[key])) out[key] = out[key].filter(predicate)
   }
   return out
}

// Blank named properties outright — for data we hold but must not publish.
function clearFields(record, keys) {
   if (!keys) return record
   const out = { ...record }
   for (const key of keys) {
      if (Array.isArray(out[key])) out[key] = []
      else if (out[key] !== undefined) out[key] = null
   }
   return out
}

function trim(body, fixture) {
   if (fixture.envelope === 'array') return body.slice(0, RECORD_LIMIT)

   if (fixture.envelope === 'whole') {
      let trimmed = truncateFields(body, fixture.truncate)
      trimmed = pickFields(trimmed, fixture.pick)
      trimmed = clearFields(trimmed, fixture.clear)
      // The single-tournament endpoint nests everything under `data`.
      if (trimmed.data && !Array.isArray(trimmed.data)) {
         trimmed.data = truncateFields(trimmed.data, { players: 2, arenas: 2, scorekeepers: 2 })
      }
      return trimmed
   }

   return { ...body, data: (body.data || []).slice(0, fixture.limit || RECORD_LIMIT) }
}

function main() {
   if (!fs.existsSync(RAW_DIR)) {
      console.error(`No ${RAW_DIR} — run \`npm run probe\` first.`)
      process.exit(1)
   }

   let written = 0
   for (const fixture of FIXTURES) {
      const source = path.join(RAW_DIR, fixture.file)
      if (!fs.existsSync(source)) {
         console.log(`  skip ${fixture.file} (not captured)`)
         continue
      }

      const trimmed = anonymize(trim(JSON.parse(fs.readFileSync(source, 'utf8')), fixture))
      fs.writeFileSync(path.join(OUT_DIR, fixture.file), JSON.stringify(trimmed, null, 2))
      written += 1
   }

   console.log(`Wrote ${written} fixtures to samples/`)
}

main()
