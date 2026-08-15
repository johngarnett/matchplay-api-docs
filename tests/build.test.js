// Unit tests for the build pipeline: front matter parsing, schema table
// generation, and the machine-readable emitters.

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const { parseFrontMatter, loadPages, applyBasePath } = require('../src/build')
const { renderSchemaTable, collectProperties, describeType, expandSchemaPlaceholders } = require('../src/schemaTables')
const { rewriteRefs } = require('../src/emit')

const ROOT = path.join(__dirname, '..')
const spec = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'openapi.yaml'), 'utf8'))

test('parseFrontMatter splits attributes from body', () => {
   const { attributes, body } = parseFrontMatter('---\ntitle: Hi\norder: 3\n---\n# Heading\n')
   assert.equal(attributes.title, 'Hi')
   assert.equal(attributes.order, 3)
   assert.equal(body, '# Heading\n')
})

test('parseFrontMatter tolerates a file with no front matter', () => {
   const { attributes, body } = parseFrontMatter('# Just a heading\n')
   assert.deepEqual(attributes, {})
   assert.equal(body, '# Just a heading\n')
})

test('every content page has a title and an order', () => {
   for (const page of loadPages()) {
      assert.ok(page.title, `${page.slug} is missing a title`)
      assert.notEqual(page.order, 999, `${page.slug} is missing an order`)
   }
})

test('page order is unique so the sidebar is deterministic', () => {
   const orders = loadPages().map(page => page.order)
   assert.equal(new Set(orders).size, orders.length, 'duplicate order values')
})

test('describeType renders nullable unions and arrays', () => {
   assert.equal(describeType(spec, { type: ['integer', 'null'] }), 'integer \\| null')
   assert.equal(describeType(spec, { type: 'array', items: { type: 'string' } }), 'string[]')
})

test('renderSchemaTable emits one row per property', () => {
   const table = renderSchemaTable(spec, 'Round')
   const rows = table.split('\n').slice(2)
   const properties = Object.keys(spec.components.schemas.Round.properties)
   assert.equal(rows.length, properties.length)
   assert.ok(table.includes('`roundId`'))
})

test('renderSchemaTable flattens allOf composition', () => {
   // Game composes GameSummary, so it must show fields from both.
   const table = renderSchemaTable(spec, 'Game')
   assert.ok(table.includes('`gameId`'), 'missing inherited field')
   assert.ok(table.includes('`resultPositions`'), 'missing own field')
   assert.ok(table.includes('from `GameSummary`'), 'inheritance not attributed')
})

test('collectProperties does not infinitely recurse on shared refs', () => {
   const { properties } = collectProperties(spec, spec.components.schemas.PlayerArenaSummaryRow)
   assert.ok(properties.wins)
   assert.ok(properties.arenaId)
})

test('renderSchemaTable rejects an unknown schema name', () => {
   assert.throws(() => renderSchemaTable(spec, 'NoSuchSchema'), /Unknown schema/)
})

test('every property carries a recognised x-evidence value', () => {
   const allowed = new Set(['verified', 'derived', 'unverified'])
   for (const [name, schema] of Object.entries(spec.components.schemas)) {
      for (const [key, property] of Object.entries(schema.properties || {})) {
         if (property['x-evidence'] === undefined) continue
         assert.ok(allowed.has(property['x-evidence']), `${name}.${key} has a bogus x-evidence`)
      }
   }
})

test('expandSchemaPlaceholders substitutes a table', () => {
   const output = expandSchemaPlaceholders('before\n\n{{schema:Round}}\n\nafter', spec)
   assert.ok(output.includes('| Field | Type |'))
   assert.ok(output.includes('before'))
   assert.ok(!output.includes('{{schema:'))
})

test('every {{schema:...}} placeholder in content resolves', () => {
   for (const page of loadPages()) {
      assert.doesNotThrow(
         () => expandSchemaPlaceholders(page.body, spec),
         `unresolvable schema placeholder in ${page.slug}.md`
      )
   }
})

test('applyBasePath prefixes root-relative href and src', () => {
   const html = '<a href="/games.html">g</a><link href="/assets/site.css"><img src="/x.png">'
   const out = applyBasePath(html, '/base')
   assert.ok(out.includes('href="/base/games.html"'))
   assert.ok(out.includes('href="/base/assets/site.css"'))
   assert.ok(out.includes('src="/base/x.png"'))
})

test('applyBasePath prefixes the bare root link', () => {
   assert.equal(applyBasePath('<a href="/">home</a>', '/base'), '<a href="/base/">home</a>')
})

test('applyBasePath leaves absolute and protocol-relative URLs alone', () => {
   const html = '<a href="https://example.com/x">a</a><a href="//cdn.example.com/y">b</a>'
   assert.equal(applyBasePath(html, '/base'), html)
})

test('applyBasePath leaves fragments and relative links alone', () => {
   const html = '<a href="#anchor">a</a><a href="games.html">b</a>'
   assert.equal(applyBasePath(html, '/base'), html)
})

test('applyBasePath is a no-op without a base path', () => {
   const html = '<a href="/games.html">g</a>'
   assert.equal(applyBasePath(html, ''), html)
})

test('the schema manifest lists every component schema', () => {
   // Static hosts serve no directory listing, so /schemas/ 404s and the manifest
   // is the only way to enumerate what is published there.
   const manifestPath = path.join(ROOT, 'dist', 'schemas', 'index.json')
   if (!fs.existsSync(manifestPath)) return   // dist/ only exists after a build

   const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
   const names = Object.keys(spec.components.schemas)
   assert.equal(manifest.count, names.length)
   assert.deepEqual(manifest.schemas.map(s => s.name).sort(), names.slice().sort())

   for (const entry of manifest.schemas) {
      assert.ok(
         fs.existsSync(path.join(ROOT, 'dist', 'schemas', entry.file)),
         `${entry.file} is listed in the manifest but was not written`
      )
   }
})

test('rewriteRefs makes component refs relative for standalone schemas', () => {
   const rewritten = rewriteRefs({ $ref: '#/components/schemas/Player' })
   assert.equal(rewritten.$ref, './Player.json')
})

test('rewriteRefs descends into arrays and nested objects', () => {
   const rewritten = rewriteRefs({
      type: 'array',
      items: { $ref: '#/components/schemas/Game' }
   })
   assert.equal(rewritten.items.$ref, './Game.json')
})
