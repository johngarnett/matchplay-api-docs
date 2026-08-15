// Machine-readable build outputs, all derived from the same sources as the HTML
// so they cannot drift from it:
//
//    dist/openapi.json        the spec as JSON (YAML stays the editable source)
//    dist/schemas/<Name>.json one standalone JSON Schema per component schema
//    dist/llms.txt            short index, the convention docs.matchplay.events uses
//    dist/llms-full.txt       the whole reference as flat text, one fetch

const fs = require('node:fs')
const path = require('node:path')

const JSON_INDENT = 2
const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema'

// Rewrite internal OpenAPI refs so an extracted schema resolves against its
// siblings in dist/schemas/ rather than against the bundled spec.
function rewriteRefs(node) {
   if (Array.isArray(node)) return node.map(rewriteRefs)
   if (!node || typeof node !== 'object') return node

   const out = {}
   for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string' && value.startsWith('#/components/schemas/')) {
         out.$ref = `./${value.slice('#/components/schemas/'.length)}.json`
      } else {
         out[key] = rewriteRefs(value)
      }
   }
   return out
}

// Write dist/openapi.json alongside the YAML source.
function writeOpenApiJson(spec, distDir) {
   const target = path.join(distDir, 'openapi.json')
   fs.writeFileSync(target, JSON.stringify(spec, null, JSON_INDENT))
   return target
}

// Write one self-contained JSON Schema per component schema, plus a manifest.
//
// The manifest matters: static hosts do not serve directory listings, so
// `/schemas/` is a 404 and something has to enumerate what is there.
function writeJsonSchemas(spec, distDir, basePath = '') {
   const schemas = (spec.components && spec.components.schemas) || {}
   const schemaDir = path.join(distDir, 'schemas')
   fs.mkdirSync(schemaDir, { recursive: true })

   const written = []
   const manifest = []

   for (const [name, schema] of Object.entries(schemas)) {
      const document = {
         $schema: JSON_SCHEMA_DIALECT,
         $id: `${name}.json`,
         title: name,
         ...rewriteRefs(schema)
      }
      const target = path.join(schemaDir, `${name}.json`)
      fs.writeFileSync(target, JSON.stringify(document, null, JSON_INDENT))
      written.push(target)
      manifest.push({
         name,
         file: `${name}.json`,
         url: `${basePath}/schemas/${name}.json`,
         description: (schema.description || '').trim().split('\n')[0]
      })
   }

   fs.writeFileSync(
      path.join(schemaDir, 'index.json'),
      JSON.stringify({
         $comment: 'Manifest of the JSON Schemas in this directory. Generated from spec/openapi.yaml.',
         count: manifest.length,
         schemas: manifest.sort((a, b) => a.name.localeCompare(b.name))
      }, null, JSON_INDENT)
   )

   return written
}

// The short index. Mirrors the llms.txt convention: a title, a blurb, then
// annotated links grouped under headings.
function writeLlmsTxt(pages, distDir, baseUrl) {
   const lines = [
      '# Match Play Events API — unofficial reference',
      '',
      '> Reference documentation for the matchplay.events REST and websocket API,',
      '> reconstructed from observed traffic and from six applications that consume it.',
      '> The vendor handbook documents request paths only; this covers response schemas,',
      '> enumerations, scoring semantics and behavioural quirks.',
      '>',
      '> NOT AFFILIATED WITH MATCH PLAY EVENTS, AND NOT GUARANTEED TO BE CORRECT. This is a',
      '> best-effort record of behaviour observed at a point in time. matchplay.events is a',
      '> live service that can change without notice. The API\'s actual responses are the',
      '> only definitive source — verify against them before relying on anything here, and',
      '> prefer them over this document wherever the two disagree.',
      '',
      '## Machine-readable',
      '',
      `- [OpenAPI 3.1 spec, JSON](${baseUrl}/openapi.json): every documented endpoint, parameter and response schema`,
      `- [OpenAPI 3.1 spec, YAML](${baseUrl}/openapi.yaml): the same document, as the editable source`,
      `- [AsyncAPI 3.0 spec](${baseUrl}/asyncapi.yaml): the Pusher websocket channel and its twelve events`,
      `- [JSON Schemas](${baseUrl}/schemas/index.json): manifest; one standalone schema per object`,
      `- [Full text](${baseUrl}/llms-full.txt): the entire reference in a single file`,
      '',
      '## Rendered views of the specs',
      '',
      '> Generated from the specs above at build time, so they cannot drift from them, and',
      "> cross-linked into the prose that explains each endpoint's behaviour.",
      '',
      `- [REST endpoint reference](${baseUrl}/reference-rest.html): every path and method from the OpenAPI spec, as HTML`,
      `- [Websocket reference](${baseUrl}/reference-websocket.html): the channel and every event from the AsyncAPI spec, as HTML`,
      `- [Schema index](${baseUrl}/schemas.html): every object shape, as HTML`,
      ''
   ]

   let lastGroup = null
   for (const page of pages) {
      if (page.group && page.group !== lastGroup) {
         // A heading needs a blank line before it, or a parser reads it as more
         // list text rather than a new section.
         lines.push('', `## ${page.group}`, '')
         lastGroup = page.group
      }
      const blurb = page.description ? `: ${page.description}` : ''
      lines.push(`- [${page.title}](${baseUrl}${page.href})${blurb}`)
   }
   lines.push('')

   const target = path.join(distDir, 'llms.txt')
   // Collapse runs of blank lines left by section boundaries meeting each other.
   fs.writeFileSync(target, lines.join('\n').replace(/\n{3,}/g, '\n\n'))
   return target
}

// The whole reference as one plain-text file: every page's Markdown source,
// concatenated with separators, so an agent can retrieve it in a single fetch.
function writeLlmsFullTxt(pages, distDir, basePath = '') {
   const chunks = [
      '# Match Play Events API — unofficial reference (full text)',
      '',
      'NOT AFFILIATED WITH MATCH PLAY EVENTS, AND NOT GUARANTEED TO BE CORRECT.',
      'A best-effort record of behaviour observed at a point in time. matchplay.events is a',
      'live service that can change without notice. The API\'s actual responses are the only',
      'definitive source — verify against them before relying on anything here, and prefer',
      'them over this document wherever the two disagree.',
      `Machine-readable spec: ${basePath}/openapi.json — JSON Schemas: ${basePath}/schemas/index.json`,
      ''
   ]

   for (const page of pages) {
      chunks.push(
         '',
         '='.repeat(76),
         `# ${page.title}`,
         `Source: ${basePath}${page.href}`,
         '='.repeat(76),
         '',
         page.expandedMarkdown
      )
   }

   const target = path.join(distDir, 'llms-full.txt')
   fs.writeFileSync(target, chunks.join('\n'))
   return target
}

module.exports = { writeOpenApiJson, writeJsonSchemas, writeLlmsTxt, writeLlmsFullTxt, rewriteRefs }
