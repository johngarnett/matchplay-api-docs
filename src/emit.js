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

// Write one self-contained JSON Schema per component schema.
function writeJsonSchemas(spec, distDir) {
   const schemas = (spec.components && spec.components.schemas) || {}
   const schemaDir = path.join(distDir, 'schemas')
   fs.mkdirSync(schemaDir, { recursive: true })

   const written = []
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
   }
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
      '> enumerations, scoring semantics and behavioural quirks. Not affiliated with',
      '> Match Play Events.',
      '',
      '## Machine-readable',
      '',
      `- [OpenAPI 3.1 spec](${baseUrl}/openapi.json): every documented endpoint, parameter and response schema`,
      `- [JSON Schemas](${baseUrl}/schemas/): one standalone schema per object`,
      `- [Full text](${baseUrl}/llms-full.txt): the entire reference in a single file`,
      ''
   ]

   let lastGroup = null
   for (const page of pages) {
      if (page.group && page.group !== lastGroup) {
         lines.push(`## ${page.group}`, '')
         lastGroup = page.group
      }
      const blurb = page.description ? `: ${page.description}` : ''
      lines.push(`- [${page.title}](${baseUrl}${page.href})${blurb}`)
   }
   lines.push('')

   const target = path.join(distDir, 'llms.txt')
   fs.writeFileSync(target, lines.join('\n'))
   return target
}

// The whole reference as one plain-text file: every page's Markdown source,
// concatenated with separators, so an agent can retrieve it in a single fetch.
function writeLlmsFullTxt(pages, distDir, basePath = '') {
   const chunks = [
      '# Match Play Events API — unofficial reference (full text)',
      '',
      'Reconstructed from observed traffic. Not affiliated with Match Play Events.',
      'Machine-readable spec: /openapi.json — JSON Schemas: /schemas/',
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
