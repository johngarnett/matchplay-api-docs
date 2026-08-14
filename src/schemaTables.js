// Turns OpenAPI component schemas into Markdown field tables.
//
// Prose in content/*.md marks where a table belongs with a placeholder:
//
//    {{schema:Tournament}}
//
// and this module substitutes a generated table. The spec is therefore the
// single source of truth: a schema fix updates the prose, the JSON Schemas and
// the text digests together, and the two can never disagree.

const PLACEHOLDER_RE = /^\{\{schema:([A-Za-z0-9_]+)\}\}$/gm
const INDEX_PLACEHOLDER_RE = /^\{\{schema-index\}\}$/gm

// Evidence classes, rendered as coloured badges. `verified` means the field was
// seen in a real captured payload; `derived` means it is only known from code
// that reads it; `unverified` flags a claim we could not confirm either way.
const EVIDENCE_CLASSES = new Set(['verified', 'derived', 'unverified'])
const DEFAULT_EVIDENCE = 'derived'

// Escape a value for use inside a Markdown table cell.
function escapeCell(text) {
   return String(text)
      .replace(/\|/g, '\\|')
      .replace(/\n+/g, ' ')
      .trim()
}

// Resolve a local $ref like "#/components/schemas/Player" against the document.
function resolveRef(doc, ref) {
   if (!ref.startsWith('#/')) throw new Error(`Only local refs are supported, got ${ref}`)
   let node = doc
   for (const segment of ref.slice(2).split('/')) {
      node = node && node[segment]
      if (node === undefined) throw new Error(`Unresolvable ref ${ref}`)
   }
   return node
}

// The short name a $ref points at, for linking to that schema's own table.
function refName(ref) {
   return ref.slice(ref.lastIndexOf('/') + 1)
}

// Where the generated schema index lives. Type links point at anchors on that
// page so every referenced object is reachable from any field table.
const SCHEMA_INDEX_PATH = '/schemas.html'

// The anchor id for one schema on the index page.
function schemaAnchor(name) {
   return `schema-${name.toLowerCase()}`
}

// Render a human-readable type for one property schema.
function describeType(doc, schema) {
   if (!schema) return '—'

   if (schema.$ref) {
      const name = refName(schema.$ref)
      return `[${name}](${SCHEMA_INDEX_PATH}#${schemaAnchor(name)})`
   }

   if (schema.oneOf || schema.anyOf) {
      const branches = schema.oneOf || schema.anyOf
      return branches.map(branch => describeType(doc, branch)).join(' \\| ')
   }

   if (schema.type === 'array') {
      return `${describeType(doc, schema.items)}[]`
   }

   const types = Array.isArray(schema.type) ? schema.type : [schema.type]
   const nullable = types.includes('null') || schema.nullable === true
   const base = types.filter(t => t && t !== 'null')

   let rendered = base.length ? base.join(' \\| ') : 'any'
   if (schema.format) rendered += ` (${schema.format})`
   if (nullable) rendered += ' \\| null'
   return rendered
}

// Build the Notes cell: description, enum values, examples and constraints.
function describeNotes(schema) {
   const parts = []
   if (schema.description) parts.push(schema.description)

   if (Array.isArray(schema.enum)) {
      parts.push(`One of: ${schema.enum.map(v => `\`${v}\``).join(', ')}`)
   } else if (schema.items && Array.isArray(schema.items.enum)) {
      parts.push(`Items one of: ${schema.items.enum.map(v => `\`${v}\``).join(', ')}`)
   }

   if (schema.example !== undefined) {
      const rendered = typeof schema.example === 'object'
         ? JSON.stringify(schema.example)
         : String(schema.example)
      parts.push(`Example: \`${rendered}\``)
   }

   return parts.join(' ')
}

// Flatten a schema's own properties together with anything it composes via
// allOf. Inherited properties are tagged with the name of the schema they came
// from so the table can say where a field is defined.
function collectProperties(doc, schema, inheritedFrom = null, seen = new Set()) {
   if (!schema) return { properties: {}, required: new Set() }

   if (schema.$ref) {
      const name = refName(schema.$ref)
      if (seen.has(name)) return { properties: {}, required: new Set() }
      seen.add(name)
      return collectProperties(doc, resolveRef(doc, schema.$ref), name, seen)
   }

   const properties = {}
   const required = new Set(schema.required || [])

   for (const branch of schema.allOf || []) {
      const merged = collectProperties(doc, branch, inheritedFrom, seen)
      Object.assign(properties, merged.properties)
      for (const key of merged.required) required.add(key)
   }

   for (const [key, value] of Object.entries(schema.properties || {})) {
      properties[key] = { schema: value, inheritedFrom }
   }

   return { properties, required }
}

// Render one schema as a Markdown table, headings left to the surrounding prose.
function renderSchemaTable(doc, name) {
   const schemas = (doc.components && doc.components.schemas) || {}
   const schema = schemas[name]
   if (!schema) throw new Error(`Unknown schema "${name}" — not in components.schemas`)

   const { properties, required } = collectProperties(doc, schema)
   const propertyNames = Object.keys(properties)

   if (!propertyNames.length) {
      throw new Error(`Schema "${name}" has no properties to tabulate`)
   }

   const anyInherited = propertyNames.some(key => properties[key].inheritedFrom)

   const rows = propertyNames.map(propertyName => {
      const { schema: property, inheritedFrom } = properties[propertyName]
      const evidence = EVIDENCE_CLASSES.has(property['x-evidence'])
         ? property['x-evidence']
         : DEFAULT_EVIDENCE

      const badge = `<span class="evidence evidence-${evidence}">${evidence}</span>`
      const requiredMark = required.has(propertyName) ? ' *(required)*' : ''
      const notes = escapeCell(describeNotes(property)) + requiredMark

      const cells = [
         `\`${propertyName}\``,
         describeType(doc, property),
         badge,
         notes
      ]
      if (anyInherited) cells.splice(3, 0, inheritedFrom ? `from \`${inheritedFrom}\`` : '—')

      return `| ${cells.join(' | ')} |`
   })

   const header = anyInherited
      ? ['| Field | Type | Evidence | Inherited | Notes |', '| --- | --- | --- | --- | --- |']
      : ['| Field | Type | Evidence | Notes |', '| --- | --- | --- | --- |']

   return [...header, ...rows].join('\n')
}

// Render every component schema as its own section, for the generated index
// page. Each heading carries the anchor that describeType() links to.
function renderSchemaIndex(doc) {
   const schemas = (doc.components && doc.components.schemas) || {}
   const sections = []

   for (const name of Object.keys(schemas).sort()) {
      const schema = schemas[name]
      sections.push(`## ${name} {#${schemaAnchor(name)}}`)

      if (schema.description) sections.push(schema.description.trim())

      if (Array.isArray(schema.enum)) {
         sections.push(`Enumeration: ${schema.enum.map(v => `\`${v}\``).join(', ')}`)
      } else {
         try {
            sections.push(renderSchemaTable(doc, name))
         } catch {
            // Schemas with no properties (bare enums, free-form objects) get
            // their description alone.
            sections.push('_No documented properties._')
         }
      }
   }

   return sections.join('\n\n')
}

// Replace {{schema:Name}} and {{schema-index}} placeholders in a Markdown source.
function expandSchemaPlaceholders(markdown, doc) {
   return markdown
      .replace(INDEX_PLACEHOLDER_RE, () => renderSchemaIndex(doc))
      .replace(PLACEHOLDER_RE, (_match, name) => renderSchemaTable(doc, name))
}

module.exports = {
   expandSchemaPlaceholders,
   renderSchemaTable,
   renderSchemaIndex,
   collectProperties,
   describeType,
   describeNotes,
   resolveRef,
   schemaAnchor,
   EVIDENCE_CLASSES
}
