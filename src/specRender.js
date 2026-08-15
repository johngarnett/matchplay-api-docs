// Render the OpenAPI and AsyncAPI specs as Markdown, for pages that present the
// machine-readable files in a form a human can read.
//
// Prose marks where a rendering belongs with a placeholder:
//
//    {{openapi-reference}}    every path, method, parameter and response
//    {{asyncapi-reference}}   the websocket server, channel and messages
//
// Written rather than delegated to Redoc or the AsyncAPI generator for one
// reason above all: those tools render a spec in isolation. This renderer links
// a response schema to its entry in the schema index and an operation to the
// prose page that explains it, which is the whole point of the site. It also
// costs no dependencies, no build time and no CDN.

const { describeType, describeNotes, schemaAnchor, EVIDENCE_CLASSES } = require('./schemaTables')

const DEFAULT_EVIDENCE = 'derived'
const SCHEMA_INDEX_PATH = '/schemas.html'

// Operations whose behaviour is covered in depth by a prose page. Rendered as a
// "see also" so the reference is a jumping-off point rather than a dead end.
const OPERATION_GUIDES = {
   Tournaments: '/tournaments.html',
   'Rounds & games': '/games.html',
   'Single player': '/single-player.html',
   Standings: '/standings.html',
   Summaries: '/summaries.html',
   Identity: '/identity.html',
   Ratings: '/profile-search.html',
   Search: '/profile-search.html',
   Machines: '/exports.html',
   IFPA: '/summaries.html',
   Series: '/series.html'
}

// Escape a value for a Markdown table cell.
function cell(text) {
   return String(text ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim()
}

// Turn the first line of a description into a one-line summary.
function firstLine(text) {
   return (text || '').trim().split('\n')[0]
}

// A stable anchor for one operation.
function operationAnchor(method, route) {
   return `op-${method}-${route}`
      .toLowerCase()
      .replace(/[^\w\s-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
}

// Find the schema a response body resolves to, so it can be linked.
function responseSchemaName(response) {
   const schema = response?.content?.['application/json']?.schema
   if (!schema) return null

   // Unwrap the common envelopes: {data: X}, {data: [X]}, or a bare array.
   const candidates = [
      schema,
      schema.properties?.data,
      schema.properties?.data?.items,
      schema.items
   ]
   for (const candidate of candidates) {
      if (candidate?.$ref) return candidate.$ref.slice(candidate.$ref.lastIndexOf('/') + 1)
   }
   return null
}

function schemaLink(name) {
   return `[${name}](${SCHEMA_INDEX_PATH}#${schemaAnchor(name)})`
}

// Render one operation's parameters.
function renderParameters(doc, parameters) {
   const resolved = (parameters || []).map(parameter =>
      parameter.$ref
         ? { ...resolveLocal(doc, parameter.$ref), ...parameter }
         : parameter
   )
   if (!resolved.length) return ''

   const rows = resolved.map(parameter => {
      const required = parameter.required ? ' *(required)*' : ''
      return `| \`${parameter.name}\` | ${parameter.in} | ${describeType(doc, parameter.schema)} | ${cell(describeNotes(parameter.schema || {}) + ' ' + (parameter.description || ''))}${required} |`
   })

   return [
      '',
      '| Parameter | In | Type | Notes |',
      '| --- | --- | --- | --- |',
      ...rows,
      ''
   ].join('\n')
}

function resolveLocal(doc, ref) {
   let node = doc
   for (const segment of ref.slice(2).split('/')) node = node?.[segment]
   return node || {}
}

// Render every path and method in the OpenAPI document.
function renderOpenApiReference(doc) {
   const out = []
   const byTag = new Map()

   for (const [route, methods] of Object.entries(doc.paths || {})) {
      for (const [method, operation] of Object.entries(methods)) {
         const tag = (operation.tags || ['Other'])[0]
         if (!byTag.has(tag)) byTag.set(tag, [])
         byTag.get(tag).push({ route, method, operation })
      }
   }

   // Follow the order the spec declares its tags in.
   const tagOrder = (doc.tags || []).map(tag => tag.name).filter(name => byTag.has(name))
   for (const name of byTag.keys()) if (!tagOrder.includes(name)) tagOrder.push(name)

   // A contents list, since this page is long.
   out.push('<div class="table-scroll">', '', '| Group | Operations |', '| --- | --- |')
   for (const tag of tagOrder) {
      const links = byTag.get(tag)
         .map(({ method, route }) => `[\`${method.toUpperCase()} ${route}\`](#${operationAnchor(method, route)})`)
         .join('<br>')
      out.push(`| **${tag}** | ${links} |`)
   }
   out.push('', '</div>', '')

   for (const tag of tagOrder) {
      const description = (doc.tags || []).find(t => t.name === tag)?.description
      out.push(`## ${tag}`, '')
      if (description) out.push(description.trim(), '')

      const guide = OPERATION_GUIDES[tag]
      if (guide) out.push(`Explained in depth on the [${tag}](${guide}) page.`, '')

      for (const { route, method, operation } of byTag.get(tag)) {
         out.push(`### \`${method.toUpperCase()} ${route}\` {#${operationAnchor(method, route)}}`, '')
         out.push(
            `<div class="endpoint"><span class="method">${method.toUpperCase()}</span> ` +
            `<span>${route}</span></div>`, ''
         )

         if (operation.summary) out.push(`**${operation.summary}**`, '')
         if (operation.description) out.push(operation.description.trim(), '')

         const parameterBlock = renderParameters(doc, operation.parameters)
         if (parameterBlock) out.push('<div class="table-scroll">', parameterBlock, '</div>', '')

         if (operation.requestBody) {
            const body = operation.requestBody.content?.['application/json']?.schema
            const properties = Object.keys(body?.properties || {})
            if (properties.length) {
               out.push(`**Request body** — ${properties.map(p => `\`${p}\``).join(', ')}`, '')
            }
         }

         const responses = Object.entries(operation.responses || {})
         if (responses.length) {
            out.push('<div class="table-scroll">', '', '| Status | Returns | Notes |', '| --- | --- | --- |')
            for (const [status, raw] of responses) {
               const response = raw.$ref ? resolveLocal(doc, raw.$ref) : raw
               const name = responseSchemaName(response)
               out.push(`| \`${status}\` | ${name ? schemaLink(name) : '—'} | ${cell(firstLine(response.description))} |`)
            }
            out.push('', '</div>', '')
         }
      }
   }

   return out.join('\n')
}

// Render the AsyncAPI document: server, channel, and every message.
function renderAsyncApiReference(doc) {
   const out = []

   for (const [name, server] of Object.entries(doc.servers || {})) {
      out.push(`## Server: ${name}`, '')
      out.push(
         '<div class="endpoint"><span class="method">' +
         `${(server.protocol || '').toUpperCase()}</span> ` +
         `<span>${server.protocol}://${server.host}${server.pathname || ''}</span></div>`, ''
      )
      if (server.description) out.push(server.description.trim(), '')
   }

   for (const [key, channel] of Object.entries(doc.channels || {})) {
      out.push(`## Channel: \`${channel.address || key}\``, '')
      if (channel.description) out.push(channel.description.trim(), '')

      const parameters = Object.entries(channel.parameters || {})
      if (parameters.length) {
         out.push('<div class="table-scroll">', '', '| Parameter | Description |', '| --- | --- |')
         for (const [name, parameter] of parameters) {
            out.push(`| \`${name}\` | ${cell(parameter.description)} |`)
         }
         out.push('', '</div>', '')
      }
   }

   const messages = Object.entries(doc.components?.messages || {})
   if (messages.length) {
      out.push('## Messages', '')
      out.push('<div class="table-scroll">', '', '| Event | Evidence | Summary |', '| --- | --- | --- |')
      for (const [name, message] of messages) {
         const evidence = EVIDENCE_CLASSES.has(message.payload?.['x-evidence'])
            ? message.payload['x-evidence']
            : DEFAULT_EVIDENCE
         const badge = `<span class="evidence evidence-${evidence}">${evidence}</span>`
         const summary = firstLine(message.summary || message.description)
         out.push(`| [\`${name}\`](#msg-${name.toLowerCase()}) | ${badge} | ${cell(summary)} |`)
      }
      out.push('', '</div>', '')

      for (const [name, message] of messages) {
         out.push(`### \`${name}\` {#msg-${name.toLowerCase()}}`, '')
         if (message.description) out.push(message.description.trim(), '')

         const properties = message.payload?.properties
         if (properties && Object.keys(properties).length) {
            out.push('<div class="table-scroll">', '', '| Field | Type | Notes |', '| --- | --- | --- |')
            for (const [field, schema] of Object.entries(properties)) {
               out.push(`| \`${field}\` | ${describeType(doc, schema)} | ${cell(describeNotes(schema))} |`)
            }
            out.push('', '</div>', '')
         } else {
            out.push('_Payload shape not documented field-by-field — see the description above._', '')
         }
      }
   }

   return out.join('\n')
}

module.exports = { renderOpenApiReference, renderAsyncApiReference, operationAnchor }
