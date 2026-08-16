// Tests that keep the spec honest.
//
// The most valuable check here is the last one: every captured sample payload is
// validated against the schema the spec claims describes it. If the API changes
// shape, or a schema is wrong, this fails rather than silently publishing a
// wrong spec.

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')
const Ajv = require('ajv')

const ROOT = path.join(__dirname, '..')

// Committed fixtures live in samples/; the richer raw captures in samples/raw/
// are gitignored and only present on a machine that has run `npm run probe`.
// Prefer raw when available, fall back to the committed trims, so this suite
// still validates on a fresh clone.
const COMMITTED_SAMPLES = path.join(ROOT, 'samples')
const RAW_SAMPLES = path.join(ROOT, 'samples', 'raw')

// Resolve one fixture, preferring the fuller raw capture.
function sampleFile(name) {
   for (const dir of [RAW_SAMPLES, COMMITTED_SAMPLES]) {
      const candidate = path.join(dir, name)
      if (fs.existsSync(candidate)) return candidate
   }
   return null
}

const spec = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'openapi.yaml'), 'utf8'))

test('openapi.yaml declares 3.1 and the required top-level members', () => {
   assert.match(spec.openapi, /^3\.1\./)
   assert.ok(spec.info.title)
   assert.ok(spec.info.version)
   assert.ok(spec.paths)
   assert.ok(spec.servers?.length)
})

test('asyncapi.yaml parses and declares its channel', () => {
   const asyncSpec = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'asyncapi.yaml'), 'utf8'))
   assert.match(asyncSpec.asyncapi, /^3\./)
   assert.ok(asyncSpec.channels.tournament)
   assert.equal(asyncSpec.channels.tournament.address, 'tournaments.{tournamentId}')
})

test('every operation has an operationId, summary and 200 response', () => {
   for (const [route, methods] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(methods)) {
         const label = `${method.toUpperCase()} ${route}`
         assert.ok(operation.operationId, `${label} has no operationId`)
         assert.ok(operation.summary, `${label} has no summary`)
         assert.ok(operation.responses?.['200'], `${label} has no 200 response`)
      }
   }
})

test('operationIds are unique', () => {
   const ids = []
   for (const methods of Object.values(spec.paths)) {
      for (const operation of Object.values(methods)) ids.push(operation.operationId)
   }
   assert.equal(new Set(ids).size, ids.length, 'duplicate operationId')
})

test('every $ref in the spec resolves', () => {
   const missing = []

   function walk(node) {
      if (Array.isArray(node)) return node.forEach(walk)
      if (!node || typeof node !== 'object') return

      for (const [key, value] of Object.entries(node)) {
         if (key === '$ref' && typeof value === 'string') {
            let target = spec
            for (const segment of value.slice(2).split('/')) {
               target = target?.[segment]
            }
            if (target === undefined) missing.push(value)
         } else {
            walk(value)
         }
      }
   }

   walk(spec)
   assert.deepEqual(missing, [], `unresolvable refs: ${missing.join(', ')}`)
})

test('every declared tag is used by at least one operation', () => {
   const used = new Set()
   for (const methods of Object.values(spec.paths)) {
      for (const operation of Object.values(methods)) {
         for (const tag of operation.tags || []) used.add(tag)
      }
   }
   for (const tag of spec.tags) {
      assert.ok(used.has(tag.name), `tag "${tag.name}" is declared but unused`)
   }
})

// Map each captured sample to the schema that should describe its records, and
// how to reach those records inside the response envelope.
const SAMPLE_EXPECTATIONS = [
   { file: 'rounds.json', schema: 'Round', pick: body => body.data },
   { file: 'games-tournament-scoped.json', schema: 'Game', pick: body => body.data },
   { file: 'games-global.json', schema: 'GameSummary', pick: body => body.data },
   { file: 'standings.json', schema: 'StandingsRow', pick: body => body },
   // Edge cases found by validating against a 13,539-game corpus: a UUID
   // scorbitId, numeric points, and a null gamesPlayed.
   { file: 'games-edge-cases.json', schema: 'Game', pick: body => body.data },
   { file: 'standings-edge-cases.json', schema: 'StandingsRow', pick: body => body },
   { file: 'tournaments-played.json', schema: 'Tournament', pick: body => body.data },
   { file: 'tournament-series-expansions.json', schema: 'Tournament', pick: body => [body.data] },
   { file: 'resolve-players-scoped.json', schema: 'TournamentPlayerEntry', pick: body => body.data },
   { file: 'resolve-arenas-scoped.json', schema: 'TournamentArenaEntry', pick: body => body.data },
   { file: 'resolve-players-global.json', schema: 'Player', pick: body => body.data },
   { file: 'resolve-users-global.json', schema: 'User', pick: body => body.data },
   { file: 'search-users.json', schema: 'User', pick: body => body.data },
   { file: 'series.json', schema: 'Series', pick: body => [body.data] },
   { file: 'series-list.json', schema: 'SeriesListItem', pick: body => body.data },
   { file: 'events.json', schema: 'Event', pick: body => [body.data] },
   { file: 'events-list.json', schema: 'Event', pick: body => body.data },
   { file: 'clubs.json', schema: 'Club', pick: body => [body.data] },
   { file: 'single-player-games.json', schema: 'SinglePlayerGame', pick: body => body.data },
   { file: 'cards.json', schema: 'Card', pick: body => body.data },
   { file: 'summary-arenas.json', schema: 'ArenaSummaryRow', pick: body => body.data },
   { file: 'summary-player-arenas.json', schema: 'PlayerArenaSummaryRow', pick: body => body.data },
   { file: 'summary-matches.json', schema: 'MatchSummaryRow', pick: body => body.data },
   { file: 'ratings-by-user.json', schema: 'RatingBundle', pick: body => [body] },
   { file: 'user.json', schema: 'UserProfileBundle', pick: body => [body] },
   { file: 'wppr-estimator.json', schema: 'WpprEstimate', pick: body => [body] },

   // Endpoints found in third-party clients and then verified live. The bare
   // shapes below are why `pick` is not always `body.data` — these return the
   // resource at the top level with no envelope.
   { file: 'stats-matchplay.json', schema: 'MatchplayStats', pick: body => [body] },
   { file: 'stats-rounds.json', schema: 'RoundStatsRow', pick: body => body },
   { file: 'stats-arenas.json', schema: 'ArenaStatsRow', pick: body => body },
   { file: 'stats-players.json', schema: 'PlayerStats', pick: body => [body] },
   { file: 'stats-bestgame.json', schema: 'BestGameStats', pick: body => [body] },
   { file: 'frenzy.json', schema: 'FrenzyState', pick: body => [body] },
   { file: 'max-matchplay.json', schema: 'MaxMatchplayState', pick: body => [body] },
   { file: 'bgsummary.json', schema: 'BestGameSummaryRow', pick: body => body },
   { file: 'game-single.json', schema: 'Game', pick: body => [body.data] },
   { file: 'card-single.json', schema: 'Card', pick: body => [body.data] },
   { file: 'single-player-game-single.json', schema: 'SinglePlayerGame', pick: body => [body.data] },
   { file: 'single-player-top-scores.json', schema: 'SinglePlayerGame', pick: body => body.data },
   { file: 'arenas-list.json', schema: 'Arena', pick: body => body.data },
   { file: 'locations-list.json', schema: 'Location', pick: body => body.data },
   { file: 'series-stats.json', schema: 'SeriesStats', pick: body => [body] },
   { file: 'series-stats-attendance.json', schema: 'Player', pick: body => body.data },
   { file: 'ifpa-rating-history.json', schema: 'IfpaRatingHistoryPoint', pick: body => body.data },
   { file: 'ratings-compare.json', schema: 'RatingComparison', pick: body => [body] }
]

test('every expectation has a committed fixture to check against', () => {
   const missing = SAMPLE_EXPECTATIONS
      .filter(({ file }) => !fs.existsSync(path.join(COMMITTED_SAMPLES, file)))
      .map(({ file }) => file)

   assert.deepEqual(missing, [], 'run `node scripts/trim-samples.js` to regenerate fixtures')
})

test('captured samples validate against the schemas the spec claims describe them', () => {
   // Ajv wants a plain JSON Schema document; hand it the components as
   // definitions and point $refs at them.
   const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false })
   const definitions = JSON.parse(
      JSON.stringify(spec.components.schemas).replaceAll('#/components/schemas/', '#/definitions/')
   )

   let checked = 0

   for (const { file, schema, pick } of SAMPLE_EXPECTATIONS) {
      const samplePath = sampleFile(file)
      if (!samplePath) continue

      const validate = ajv.compile({ $ref: `#/definitions/${schema}`, definitions })
      const records = pick(JSON.parse(fs.readFileSync(samplePath, 'utf8'))) || []

      for (const [index, record] of records.entries()) {
         const valid = validate(record)
         assert.ok(
            valid,
            `${file}[${index}] does not match ${schema}: ${ajv.errorsText(validate.errors)}`
         )
         checked += 1
      }
   }

   assert.ok(checked > 0, 'no records were validated')
})

test('no committed fixture contains a contact address', () => {
   // Events carry a real organiser email and have no userId, so the person
   // heuristic in trim-samples.js does not cover them on its own.
   const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.]+/g
   const ALLOWED = new Set(['organizer@example.com'])
   const offenders = []

   for (const file of fs.readdirSync(COMMITTED_SAMPLES).filter(f => f.endsWith('.json'))) {
      const text = fs.readFileSync(path.join(COMMITTED_SAMPLES, file), 'utf8')
      for (const match of text.match(EMAIL_RE) || []) {
         if (!ALLOWED.has(match)) offenders.push(`${file}: ${match}`)
      }
   }

   assert.deepEqual(offenders, [], 'a committed fixture leaks a contact address')
})

test('no sample carries a property the schema does not document', () => {
   const { collectProperties } = require('../src/schemaTables')
   const undocumented = []

   for (const { file, schema, pick } of SAMPLE_EXPECTATIONS) {
      const samplePath = sampleFile(file)
      if (!samplePath) continue

      const { properties } = collectProperties(spec, spec.components.schemas[schema])
      const known = new Set(Object.keys(properties))
      const records = pick(JSON.parse(fs.readFileSync(samplePath, 'utf8'))) || []

      for (const record of records) {
         if (!record || typeof record !== 'object') continue
         for (const key of Object.keys(record)) {
            if (!known.has(key)) undocumented.push(`${schema}.${key} (seen in ${file})`)
         }
      }
   }

   assert.deepEqual(
      [...new Set(undocumented)],
      [],
      'the API returned fields the spec does not document'
   )
})
