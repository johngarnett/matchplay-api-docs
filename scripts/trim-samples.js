// Turn raw API captures into small, committable fixtures.
//
//    node scripts/trim-samples.js
//
// samples/raw/ is gitignored because raw payloads carry real names, pronouns,
// avatar URLs and privacy flags for many people. This produces samples/ —
// a couple of records per endpoint, which is enough for the spec tests to run
// on a fresh clone without shipping a directory of personal data.
//
// Records are kept verbatim rather than scrubbed: the point of the fixtures is
// to prove the schemas match reality, and rewriting values would defeat that.
// Trimming is the privacy control, so keep RECORD_LIMIT small.

const fs = require('node:fs')
const path = require('node:path')

const RAW_DIR = path.join(__dirname, '..', 'samples', 'raw')
const OUT_DIR = path.join(__dirname, '..', 'samples')
const RECORD_LIMIT = 2

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
   { file: 'summary-arenas.json', envelope: 'data' },
   { file: 'summary-player-arenas.json', envelope: 'data' },
   { file: 'summary-matches.json', envelope: 'data' },
   { file: 'ratings-by-user.json', envelope: 'whole', truncate: { ratingHistory: 3 } },
   { file: 'user.json', envelope: 'whole' },
   { file: 'wppr-estimator.json', envelope: 'whole', truncate: { players: 2 } }
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

function trim(body, fixture) {
   if (fixture.envelope === 'array') return body.slice(0, RECORD_LIMIT)

   if (fixture.envelope === 'whole') {
      const trimmed = truncateFields(body, fixture.truncate)
      // The single-tournament endpoint nests everything under `data`.
      if (trimmed.data && !Array.isArray(trimmed.data)) {
         trimmed.data = truncateFields(trimmed.data, { players: 2, arenas: 2, scorekeepers: 2 })
      }
      return trimmed
   }

   return { ...body, data: (body.data || []).slice(0, RECORD_LIMIT) }
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

      const trimmed = trim(JSON.parse(fs.readFileSync(source, 'utf8')), fixture)
      fs.writeFileSync(path.join(OUT_DIR, fixture.file), JSON.stringify(trimmed, null, 2))
      written += 1
   }

   console.log(`Wrote ${written} fixtures to samples/`)
}

main()
