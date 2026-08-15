// The HTML shell every generated page is wrapped in: head, sidebar navigation,
// content column, footer, and the small inline script that drives the mobile
// drawer. No framework and no external requests -- the only asset is
// /assets/site.css, copied from public/ at build time.

const SITE_TITLE = 'Match Play Events API'
const SITE_TAGLINE = 'Unofficial reference documentation'
const REPO_NOTE = 'Reconstructed from observed traffic. Not affiliated with Match Play Events.'

// Absolute, so it survives the BASE_PATH rewrite untouched and works wherever
// the site is hosted.
const REPO_URL = 'https://github.com/johngarnett/matchplay-api-docs'

// Escape a string for safe interpolation into HTML text or an attribute.
function escapeHtml(text) {
   return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
}

// Build the sidebar. `pages` is the ordered page list; `currentSlug` marks the
// active entry. Pages carry an optional `group` so the nav can show headings.
function renderNav(pages, currentSlug) {
   const parts = []
   let lastGroup = null

   for (const page of pages) {
      if (page.group && page.group !== lastGroup) {
         parts.push(`      <div class="group-label">${escapeHtml(page.group)}</div>`)
         lastGroup = page.group
      }
      const current = page.slug === currentSlug ? ' aria-current="page"' : ''
      parts.push(`      <a href="${escapeHtml(page.href)}"${current}>${escapeHtml(page.navTitle || page.title)}</a>`)
   }

   return parts.join('\n')
}

// Wrap rendered page body HTML in the full document.
function renderPage({ title, description, bodyHtml, pages, currentSlug, generatedAt }) {
   const safeTitle = escapeHtml(title)
   const safeDescription = escapeHtml(description || SITE_TAGLINE)

   return `<!doctype html>
<html lang="en">
<head>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width, initial-scale=1">
   <title>${safeTitle} · ${SITE_TITLE}</title>
   <meta name="description" content="${safeDescription}">
   <link rel="stylesheet" href="/assets/site.css">
</head>
<body>
   <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false">☰</button>
   <div class="scrim" hidden></div>
   <div class="layout">
      <aside class="sidebar">
         <a class="sidebar-title" href="/">${SITE_TITLE}</a>
         <div class="sidebar-sub">${SITE_TAGLINE}</div>
         <nav>
${renderNav(pages, currentSlug)}
         </nav>
      </aside>
      <div class="main">
         <main class="content">
${bodyHtml}
         </main>
         <footer class="page-footer">
            <span>${REPO_NOTE}</span>
            <span>
               <a href="${REPO_URL}">Source on GitHub</a>
               · Generated ${escapeHtml(generatedAt)}
            </span>
         </footer>
      </div>
   </div>
   <script>
      (function () {
         const button = document.querySelector('.menu-toggle')
         const sidebar = document.querySelector('.sidebar')
         const scrim = document.querySelector('.scrim')

         function setOpen(open) {
            sidebar.classList.toggle('open', open)
            scrim.classList.toggle('open', open)
            scrim.hidden = !open
            button.setAttribute('aria-expanded', open ? 'true' : 'false')
         }

         button.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')))
         scrim.addEventListener('click', () => setOpen(false))
         document.addEventListener('keydown', event => {
            if (event.key === 'Escape') setOpen(false)
         })
      })()
   </script>
</body>
</html>
`
}

module.exports = { renderPage, escapeHtml, SITE_TITLE, SITE_TAGLINE }
