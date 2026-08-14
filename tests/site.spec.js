// Playwright checks on the built site: responsive layout at three widths, both
// colour schemes, working navigation, and no broken internal links.

const { test, expect } = require('@playwright/test')
const fs = require('node:fs')
const path = require('node:path')

const DIST_DIR = path.join(__dirname, '..', 'dist')

const VIEWPORTS = {
   phone: { width: 390, height: 844 },
   tablet: { width: 820, height: 1180 },
   desktop: { width: 1440, height: 900 }
}

test.describe('layout', () => {
   for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      test(`page body does not scroll horizontally on ${name}`, async ({ page }) => {
         await page.setViewportSize(viewport)
         await page.goto('/tournaments.html')

         // The tournament page has the widest field table in the site.
         const overflow = await page.evaluate(() =>
            document.documentElement.scrollWidth - document.documentElement.clientWidth
         )
         expect(overflow, `horizontal overflow of ${overflow}px`).toBeLessThanOrEqual(1)
      })

      test(`wide tables scroll inside their container on ${name}`, async ({ page }) => {
         await page.setViewportSize(viewport)
         await page.goto('/tournaments.html')

         const wrapped = await page.evaluate(() =>
            [...document.querySelectorAll('table')].every(
               table => table.closest('.table-scroll') !== null
            )
         )
         expect(wrapped, 'a table is not inside .table-scroll').toBe(true)
      })
   }
})

test.describe('navigation', () => {
   test('sidebar is visible on desktop and hidden behind a toggle on phone', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.desktop)
      await page.goto('/')
      await expect(page.locator('.menu-toggle')).toBeHidden()

      await page.setViewportSize(VIEWPORTS.phone)
      await expect(page.locator('.menu-toggle')).toBeVisible()
   })

   test('the drawer opens and closes on phone', async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.phone)
      await page.goto('/')

      const sidebar = page.locator('.sidebar')
      await expect(sidebar).not.toHaveClass(/open/)

      await page.locator('.menu-toggle').click()
      await expect(sidebar).toHaveClass(/open/)

      await page.locator('.scrim').click()
      await expect(sidebar).not.toHaveClass(/open/)
   })

   test('the current page is marked in the sidebar', async ({ page }) => {
      await page.goto('/scoring.html')
      await expect(page.locator('.sidebar nav a[aria-current="page"]')).toHaveText('Scoring')
   })
})

test.describe('theming', () => {
   for (const scheme of ['light', 'dark']) {
      test(`body has an explicit background in ${scheme} mode`, async ({ page }) => {
         await page.emulateMedia({ colorScheme: scheme })
         await page.goto('/')

         const background = await page.evaluate(() =>
            getComputedStyle(document.body).backgroundColor
         )
         expect(background).not.toBe('rgba(0, 0, 0, 0)')
         expect(background).not.toBe('transparent')
      })
   }

   test('light and dark render different backgrounds', async ({ page }) => {
      await page.emulateMedia({ colorScheme: 'light' })
      await page.goto('/')
      const light = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

      await page.emulateMedia({ colorScheme: 'dark' })
      await page.reload()
      const dark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)

      expect(light).not.toBe(dark)
   })
})

test.describe('content integrity', () => {
   test('schema placeholders were all expanded', async ({ page }) => {
      for (const file of fs.readdirSync(DIST_DIR).filter(name => name.endsWith('.html'))) {
         const html = fs.readFileSync(path.join(DIST_DIR, file), 'utf8')
         expect(html, `${file} has an unexpanded placeholder`).not.toContain('{{schema:')
      }
   })

   test('evidence badges render', async ({ page }) => {
      await page.goto('/games.html')
      await expect(page.locator('.evidence-verified').first()).toBeVisible()
   })

   test('every internal link resolves to a real page and anchor', async ({ page }) => {
      const pages = fs.readdirSync(DIST_DIR).filter(name => name.endsWith('.html'))

      // Collect the anchor ids each page defines, so cross-page fragment links
      // can be checked as well as same-page ones.
      const anchorsByPage = new Map()
      for (const file of pages) {
         await page.goto(`/${file}`)
         const ids = await page.evaluate(() =>
            [...document.querySelectorAll('[id]')].map(element => element.id)
         )
         anchorsByPage.set(file, new Set(ids))
      }

      const broken = []

      for (const file of pages) {
         await page.goto(`/${file}`)
         const links = await page.evaluate(() =>
            [...document.querySelectorAll('a[href^="/"], a[href^="#"]')].map(a => a.getAttribute('href'))
         )

         for (const href of new Set(links)) {
            const [rawTarget, hash] = href.split('#')

            // Resolve the target page: "" means this page, "/" means index.
            let targetPage = file
            if (rawTarget && rawTarget !== '') {
               const name = rawTarget === '/' ? 'index.html' : rawTarget.replace(/^\//, '')
               if (pages.includes(name)) {
                  targetPage = name
               } else if (fs.existsSync(path.join(DIST_DIR, name.replace(/\/$/, '')))) {
                  targetPage = null   // a real non-HTML asset, e.g. /openapi.yaml or /schemas/
               } else {
                  broken.push(`${file} -> ${href} (no such file)`)
                  continue
               }
            }

            if (hash && targetPage && !anchorsByPage.get(targetPage).has(hash)) {
               broken.push(`${file} -> ${href} (no anchor #${hash} on ${targetPage})`)
            }
         }
      }

      expect(broken, `broken links:\n${broken.join('\n')}`).toEqual([])
   })
})

test.describe('machine-readable outputs', () => {
   test('the spec, schemas and text digests are served', async ({ page }) => {
      for (const asset of ['/openapi.yaml', '/openapi.json', '/asyncapi.yaml', '/llms.txt', '/llms-full.txt']) {
         const response = await page.request.get(asset)
         expect(response.status(), `${asset} did not return 200`).toBe(200)
      }
   })

   test('openapi.json is valid JSON with the expected shape', async ({ page }) => {
      const response = await page.request.get('/openapi.json')
      const spec = await response.json()
      expect(spec.openapi).toMatch(/^3\.1\./)
      expect(Object.keys(spec.paths).length).toBeGreaterThan(20)
   })
})
