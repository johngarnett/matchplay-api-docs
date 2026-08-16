// List every claim tag and where it appears.
//
//    npm run claims              every claim, with its locations
//    npm run claims auto-close   just that one
//
// Prose repeats itself: a measurement explained in depth on one page is
// referenced by teasers, tables and checklists on others. Correcting the
// detailed page and forgetting the rest is how this documentation has gone
// stale before, every time.
//
// A tag marks a location rather than describing it:
//
//    <!-- claim:auto-close canonical -->   the page that states it in full
//    <!-- claim:auto-close -->             a page that references or depends on it
//
// Nothing has to be kept in sync — the tags are the index, and this script reads
// them. Run it before changing a claim to see everything that has to agree.

const fs = require('node:fs')
const path = require('node:path')

const CONTENT_DIR = path.join(__dirname, '..', 'content')
const TAG_RE = /<!--\s*claim:([a-z0-9-]+)(\s+canonical)?\s*-->/g

function collect() {
   const claims = new Map()

   for (const file of fs.readdirSync(CONTENT_DIR).filter(name => name.endsWith('.md'))) {
      const lines = fs.readFileSync(path.join(CONTENT_DIR, file), 'utf8').split('\n')
      lines.forEach((line, index) => {
         for (const match of line.matchAll(TAG_RE)) {
            const [, key, canonical] = match
            if (!claims.has(key)) claims.set(key, [])
            claims.get(key).push({ file, line: index + 1, canonical: Boolean(canonical) })
         }
      })
   }
   return claims
}

function main() {
   const filter = process.argv[2]
   const claims = collect()
   const keys = [...claims.keys()].sort().filter(key => !filter || key.includes(filter))

   if (!keys.length) {
      console.log(filter ? `No claim matches "${filter}".` : 'No claim tags found.')
      return
   }

   for (const key of keys) {
      const sites = claims.get(key)
      const canonical = sites.find(site => site.canonical)
      console.log(`\n${key}  (${sites.length} location${sites.length === 1 ? '' : 's'})`)
      console.log(`  canonical: ${canonical ? `${canonical.file}:${canonical.line}` : '** none **'}`)
      for (const site of sites.filter(s => !s.canonical)) {
         console.log(`  refers to: ${site.file}:${site.line}`)
      }
   }
   console.log()
}

if (require.main === module) main()

module.exports = { collect }
