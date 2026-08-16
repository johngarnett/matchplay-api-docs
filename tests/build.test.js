// Unit tests for the build pipeline: front matter parsing, schema table
// generation, and the machine-readable emitters.

const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')

const { parseFrontMatter, loadPages, applyBasePath, addCalloutIds } = require('../src/build')
const { renderSchemaTable, collectProperties, describeType, expandSchemaPlaceholders } = require('../src/schemaTables')
const { renderPage } = require('../src/layout')
const { rewriteRefs } = require('../src/emit')
const { collectHeadings, renderToc, insertToc } = require('../src/toc')
const { collect: collectClaims } = require('../scripts/claims')

const ROOT = path.join(__dirname, '..')
const spec = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'openapi.yaml'), 'utf8'))
const asyncApiSpec = YAML.parse(fs.readFileSync(path.join(ROOT, 'spec', 'asyncapi.yaml'), 'utf8'))
const { renderOpenApiReference, renderAsyncApiReference } = require('../src/specRender')

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
         () => expandSchemaPlaceholders(page.body, spec, asyncApiSpec),
         `unresolvable schema placeholder in ${page.slug}.md`
      )
   }
})

test('the OpenAPI reference renders every operation', () => {
   const md = renderOpenApiReference(spec)
   for (const [route, methods] of Object.entries(spec.paths)) {
      for (const method of Object.keys(methods)) {
         assert.ok(
            md.includes(`\`${method.toUpperCase()} ${route}\``),
            `${method.toUpperCase()} ${route} is missing from the reference`
         )
      }
   }
})

test('the OpenAPI reference links response schemas to the schema index', () => {
   const md = renderOpenApiReference(spec)
   assert.match(md, /\[Tournament\]\(\/schemas\.html#schema-tournament\)/)
})

test('the AsyncAPI reference renders every message', () => {
   const md = renderAsyncApiReference(asyncApiSpec)
   for (const name of Object.keys(asyncApiSpec.components.messages)) {
      assert.ok(md.includes(`\`${name}\``), `${name} is missing from the websocket reference`)
   }
})

test('every claim tag has exactly one canonical location', () => {
   // A claim explained in full on two pages is the duplication these tags exist
   // to prevent; a claim referenced with no canonical has nowhere to point.
   const problems = []

   for (const [key, sites] of collectClaims()) {
      const canonical = sites.filter(site => site.canonical)
      if (canonical.length === 0) problems.push(`${key}: referenced but no canonical`)
      if (canonical.length > 1) {
         problems.push(`${key}: ${canonical.length} canonicals (${canonical.map(c => c.file).join(', ')})`)
      }
   }

   assert.deepEqual(problems, [], 'run `npm run claims` to see the locations')
})

test('claim tags never reach the built output', () => {
   const distDir = path.join(ROOT, 'dist')
   if (!fs.existsSync(distDir)) return

   const leaked = fs.readdirSync(distDir)
      .filter(name => name.endsWith('.html') || name.endsWith('.txt'))
      .filter(name => fs.readFileSync(path.join(distDir, name), 'utf8').includes('claim:'))

   assert.deepEqual(leaked, [], 'claim tags are source-only bookkeeping')
})

test('addCalloutIds derives an id from the callout title', () => {
   const html = '<div class="callout callout-warn">\n<span class="callout-title">Trust, but verify</span>'
   assert.match(addCalloutIds(html), /id="trust-but-verify"/)
})

test('addCalloutIds respects an explicit id and strips inline markup', () => {
   const explicit = '<div class="callout" id="mine">\n<span class="callout-title">Whatever</span>'
   assert.equal(addCalloutIds(explicit), explicit)

   const code = '<div class="callout">\n<span class="callout-title"><code>limit</code> is dropped</span>'
   assert.match(addCalloutIds(code), /id="limit-is-dropped"/)
})

test('addCalloutIds keeps ids unique within a page', () => {
   const twice = '<div class="callout">\n<span class="callout-title">Same</span>'
       + '<div class="callout">\n<span class="callout-title">Same</span>'
   const out = addCalloutIds(twice)
   assert.match(out, /id="same"/)
   assert.match(out, /id="same-2"/)
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

test('the footer links to the repository, and the link survives BASE_PATH', () => {
   const html = renderPage({
      title: 'T', description: '', bodyHtml: '', pages: [], currentSlug: 'x', generatedAt: '2026-01-01'
   })
   const footer = html.slice(html.indexOf('page-footer'))
   assert.match(footer, /href="https:\/\/github\.com\/[^"]+"/)

   // Absolute URLs must not be rewritten when the site is served from a subpath.
   assert.equal(applyBasePath(footer, '/base'), footer)
})

test('llms.txt lists every page and both rendered spec views', () => {
   const llmsPath = path.join(ROOT, 'dist', 'llms.txt')
   if (!fs.existsSync(llmsPath)) return   // dist/ only exists after a build
   const llms = fs.readFileSync(llmsPath, 'utf8')

   for (const page of loadPages()) {
      assert.ok(llms.includes(`](${page.href})`), `${page.slug} is missing from llms.txt`)
   }
   for (const artifact of ['/openapi.json', '/openapi.yaml', '/asyncapi.yaml',
                           '/schemas/index.json', '/llms-full.txt',
                           '/reference-rest.html', '/reference-websocket.html']) {
      assert.ok(llms.includes(`](${artifact})`), `${artifact} is missing from llms.txt`)
   }
})

test('llms.txt headings are well-formed Markdown', () => {
   const llmsPath = path.join(ROOT, 'dist', 'llms.txt')
   if (!fs.existsSync(llmsPath)) return

   // A heading directly after a list item is read as list text by many parsers.
   const lines = fs.readFileSync(llmsPath, 'utf8').split('\n')
   const malformed = lines
      .map((line, index) => ({ line, index }))
      .filter(({ line, index }) => line.startsWith('## ') && index > 0 && lines[index - 1].trim())
      .map(({ line }) => line)

   assert.deepEqual(malformed, [], 'headings need a blank line before them')
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

// ---- Table of contents ----------------------------------------------------

const H2 = (id, text) => `<h2 id="${id}" tabindex="-1">${text} <a class="header-anchor" href="#${id}">#</a></h2>`
const H3 = (id, text) => `<h3 id="${id}" tabindex="-1">${text} <a class="header-anchor" href="#${id}">#</a></h3>`

// Enough headings to clear TOC_MIN_HEADINGS.
function longPage() {
   let html = '<p>Intro.</p>'
   for (let i = 0; i < 7; i += 1) html += H2(`s${i}`, `Section ${i}`) + H3(`u${i}`, `Sub ${i}`)
   return html
}

test('collectHeadings strips the permalink and any inline markup', () => {
   const html = H2('points-map', 'The <code>pointsMap</code> field')
   assert.deepEqual(collectHeadings(html), [{ level: 2, id: 'points-map', text: 'The pointsMap field' }])
})

test('collectHeadings ignores h4, which is used for sub-points', () => {
   const html = H2('a', 'A') + '<h4 id="b" tabindex="-1">B</h4>'
   assert.deepEqual(collectHeadings(html).map(h => h.id), ['a'])
})

test('renderToc nests an h3 inside the preceding h2 list item', () => {
   const toc = renderToc([
      { level: 2, id: 'a', text: 'A' },
      { level: 3, id: 'b', text: 'B' }
   ])
   // The sublist must open inside the <li>, not after it closes.
   assert.match(toc, /<li><a href="#a">A<\/a>\s*<ul>\s*<li><a href="#b">B<\/a><\/li>\s*<\/ul>\s*<\/li>/)
})

test('renderToc closes every tag it opens', () => {
   const toc = renderToc([
      { level: 2, id: 'a', text: 'A' },
      { level: 3, id: 'b', text: 'B' },
      { level: 2, id: 'c', text: 'C' }
   ])
   assert.equal((toc.match(/<ul>/g) || []).length, (toc.match(/<\/ul>/g) || []).length)
   assert.equal((toc.match(/<li>/g) || []).length, (toc.match(/<\/li>/g) || []).length)
})

test('renderToc promotes an h3 that precedes any h2', () => {
   const toc = renderToc([{ level: 3, id: 'orphan', text: 'Orphan' }])
   assert.match(toc, /<ul>\s*<li><a href="#orphan">Orphan<\/a><\/li>\s*<\/ul>/)
})

test('insertToc leaves a short page alone', () => {
   const html = H2('a', 'A') + H2('b', 'B')
   assert.equal(insertToc(html), html)
})

test('insertToc places the contents before the first h2, not before the intro', () => {
   const html = insertToc(longPage())
   assert.ok(html.indexOf('<p>Intro.</p>') < html.indexOf('class="toc"'), 'intro comes first')
   assert.ok(html.indexOf('class="toc"') < html.indexOf('id="s0"'), 'toc precedes the first section')
})

test('the contents never links to itself', () => {
   const toc = insertToc(longPage()).match(/<nav class="toc"[\s\S]*?<\/nav>/)[0]
   assert.ok(!toc.includes('href="#toc-heading"'))
})

// Whether every contents link resolves to a real id is checked against the
// built site by tests/site.spec.js -- its link-integrity test already walks
// `a[href^="#"]` on every page, which is exactly what the contents emits. A
// copy here would have to read dist/, which does not exist when `npm test`
// runs on a clean checkout.
test('insertToc only emits links to headings it found', () => {
   const html = insertToc(longPage())
   const toc = html.match(/<nav class="toc"[\s\S]*?<\/nav>/)[0]
   const ids = new Set(collectHeadings(html).map(h => h.id))

   for (const [, id] of toc.matchAll(/href="#([^"]+)"/g)) {
      assert.ok(ids.has(id), `contents links to #${id}, which is not a heading on the page`)
   }
})
