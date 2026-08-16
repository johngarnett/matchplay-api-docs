// Builds an in-page table of contents from rendered HTML.
//
// It reads the output rather than the Markdown source so that it sees the ids
// markdown-it-anchor actually assigned -- including the pinned `{#custom-id}`
// ones -- instead of re-deriving slugs and risking a mismatch with the very
// links it emits.
//
// Only pages long enough to be hard to scan get one, so short pages are not
// padded with navigation they do not need.

// Below this many headings a reader can just scroll. Tuned so the genuinely
// long reference pages qualify and the short ones do not.
const TOC_MIN_HEADINGS = 12

// h4 is used for sub-points inside a single argument; including it would make
// the longest pages' contents longer than some whole pages.
const HEADING_RE = /<(h2|h3) id="([^"]+)"[^>]*>(.*?)<\/\1>/g

// The permalink markdown-it-anchor appends inside each heading, plus any other
// inline markup (code spans in headings are common here).
const HEADER_ANCHOR_RE = /<a class="header-anchor"[\s\S]*?<\/a>/g
const TAG_RE = /<[^>]+>/g

// Pull the headings out of a rendered page, in document order.
function collectHeadings(html) {
   const headings = []

   for (const match of html.matchAll(HEADING_RE)) {
      const [, tag, id, inner] = match
      const text = inner.replace(HEADER_ANCHOR_RE, '').replace(TAG_RE, '').trim()
      if (text) headings.push({ level: Number(tag.slice(1)), id, text })
   }

   return headings
}

// Render the list. h3s nest inside the preceding h2's <li> -- a sublist has to
// live inside the item it belongs to, not beside it, or the markup is invalid
// and screen readers lose the relationship.
function renderToc(headings) {
   const link = h => `<a href="#${h.id}">${h.text}</a>`
   const items = []
   let openItem = false
   let openSublist = false

   const closeItem = () => {
      if (openSublist) { items.push('</ul>'); openSublist = false }
      if (openItem) { items.push('</li>'); openItem = false }
   }

   for (const heading of headings) {
      if (heading.level === 2) {
         closeItem()
         items.push(`<li>${link(heading)}`)
         openItem = true
         continue
      }

      // An h3 before any h2 (rare, but possible) becomes a top-level entry.
      if (!openItem) {
         items.push(`<li>${link(heading)}</li>`)
         continue
      }
      if (!openSublist) { items.push('<ul>'); openSublist = true }
      items.push(`<li>${link(heading)}</li>`)
   }
   closeItem()

   return [
      '<nav class="toc" aria-labelledby="toc-heading">',
      '<h2 id="toc-heading" class="toc-title">On this page</h2>',
      '<ul>',
      ...items,
      '</ul>',
      '</nav>'
   ].join('\n')
}

// Insert a contents list before the first h2, so it sits after the page's
// opening paragraph rather than jumping between the title and its own summary.
// Returns the html unchanged when the page is too short to warrant one.
function insertToc(html, minHeadings = TOC_MIN_HEADINGS) {
   const headings = collectHeadings(html)
   if (headings.length < minHeadings) return html

   const firstH2 = html.indexOf('<h2 ')
   if (firstH2 === -1) return html

   return html.slice(0, firstH2) + renderToc(headings) + '\n' + html.slice(firstH2)
}

module.exports = { collectHeadings, renderToc, insertToc, TOC_MIN_HEADINGS }
