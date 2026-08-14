// Build the documentation site.
//
//    content/*.md  +  spec/openapi.yaml   ->   dist/
//
// Each Markdown file becomes one HTML page. Front matter (a leading --- block)
// supplies the title, nav grouping and ordering. {{schema:Name}} placeholders
// are replaced with field tables generated from the OpenAPI spec, so schema
// documentation lives in exactly one place.

const fs = require('node:fs')
const path = require('node:path')
const YAML = require('yaml')
const MarkdownIt = require('markdown-it')
const anchor = require('markdown-it-anchor')

const { renderPage } = require('./layout')
const { expandSchemaPlaceholders } = require('./schemaTables')
const { writeOpenApiJson, writeJsonSchemas, writeLlmsTxt, writeLlmsFullTxt } = require('./emit')

const ROOT = path.join(__dirname, '..')
const CONTENT_DIR = path.join(ROOT, 'content')
const PUBLIC_DIR = path.join(ROOT, 'public')
const SPEC_PATH = path.join(ROOT, 'spec', 'openapi.yaml')
const DIST_DIR = path.join(ROOT, 'dist')
const BASE_URL = 'https://matchplay-api-docs.local'

const FRONT_MATTER_RE = /^---\n([\s\S]*?)\n---\n/

// html:true is safe here: content/ is first-party prose, and the generated
// schema tables emit <span> badges that must survive to the output.
const md = new MarkdownIt({ html: true, linkify: true, typographer: false })

// `{#custom-id}` on a heading pins its anchor, so cross-page links stay stable
// even if the heading text is reworded. Must run before markdown-it-anchor.
md.use(require('markdown-it-attrs'), { allowedAttributes: ['id'] })

md.use(anchor, {
   level: [2, 3, 4],
   permalink: anchor.permalink.linkInsideHeader({ symbol: '#', placement: 'after' }),
   slugify: text => text
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
})

// Wrap every table in a horizontally scrollable container so a wide field
// reference scrolls itself rather than the page body.
function wrapTables(mdInstance) {
   const defaultOpen = mdInstance.renderer.rules.table_open
      || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))
   const defaultClose = mdInstance.renderer.rules.table_close
      || ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

   mdInstance.renderer.rules.table_open = (...args) => `<div class="table-scroll">${defaultOpen(...args)}`
   mdInstance.renderer.rules.table_close = (...args) => `${defaultClose(...args)}</div>`
}
wrapTables(md)

// Split a Markdown file into front matter and body.
function parseFrontMatter(source) {
   const match = source.match(FRONT_MATTER_RE)
   if (!match) return { attributes: {}, body: source }
   return {
      attributes: YAML.parse(match[1]) || {},
      body: source.slice(match[0].length)
   }
}

// Read every content/*.md, ordered by front-matter `order`.
function loadPages() {
   return fs.readdirSync(CONTENT_DIR)
      .filter(name => name.endsWith('.md'))
      .map(name => {
         const slug = name.replace(/\.md$/, '')
         const { attributes, body } = parseFrontMatter(
            fs.readFileSync(path.join(CONTENT_DIR, name), 'utf8')
         )
         return {
            slug,
            body,
            title: attributes.title || slug,
            navTitle: attributes.navTitle,
            description: attributes.description || '',
            group: attributes.group || '',
            order: attributes.order ?? 999,
            href: slug === 'index' ? '/' : `/${slug}.html`,
            outputName: slug === 'index' ? 'index.html' : `${slug}.html`
         }
      })
      .sort((a, b) => a.order - b.order || a.slug.localeCompare(b.slug))
}

// Recursively copy a directory into dist/assets.
function copyAssets() {
   const target = path.join(DIST_DIR, 'assets')
   fs.mkdirSync(target, { recursive: true })
   for (const name of fs.readdirSync(PUBLIC_DIR)) {
      fs.copyFileSync(path.join(PUBLIC_DIR, name), path.join(target, name))
   }
}

function build() {
   if (!fs.existsSync(SPEC_PATH)) {
      throw new Error(`Missing ${SPEC_PATH} — the spec is the source of truth for field tables`)
   }

   const spec = YAML.parse(fs.readFileSync(SPEC_PATH, 'utf8'))
   const pages = loadPages()
   if (!pages.length) throw new Error('No Markdown files found in content/')

   fs.rmSync(DIST_DIR, { recursive: true, force: true })
   fs.mkdirSync(DIST_DIR, { recursive: true })

   const generatedAt = new Date().toISOString().slice(0, 10)

   for (const page of pages) {
      page.expandedMarkdown = expandSchemaPlaceholders(page.body, spec)
      const bodyHtml = md.render(page.expandedMarkdown)
      const html = renderPage({
         title: page.title,
         description: page.description,
         bodyHtml,
         pages,
         currentSlug: page.slug,
         generatedAt
      })
      fs.writeFileSync(path.join(DIST_DIR, page.outputName), html)
   }

   copyAssets()
   fs.copyFileSync(SPEC_PATH, path.join(DIST_DIR, 'openapi.yaml'))

   const asyncApiPath = path.join(ROOT, 'spec', 'asyncapi.yaml')
   if (fs.existsSync(asyncApiPath)) {
      fs.copyFileSync(asyncApiPath, path.join(DIST_DIR, 'asyncapi.yaml'))
   }

   writeOpenApiJson(spec, DIST_DIR)
   const schemaFiles = writeJsonSchemas(spec, DIST_DIR)
   writeLlmsTxt(pages, DIST_DIR, BASE_URL)
   writeLlmsFullTxt(pages, DIST_DIR)

   console.log(`Built ${pages.length} pages, ${schemaFiles.length} JSON schemas -> dist/`)
   for (const page of pages) console.log(`  ${page.outputName.padEnd(28)} ${page.title}`)
}

if (require.main === module) build()

module.exports = { build, parseFrontMatter, loadPages, md }
