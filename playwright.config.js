// Playwright drives the built site through the local preview server.
// `testMatch` keeps Playwright to *.spec.js so the node:test unit files in the
// same directory are not picked up.

const { defineConfig, devices } = require('@playwright/test')

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

module.exports = defineConfig({
   testDir: './tests',
   testMatch: '**/*.spec.js',
   fullyParallel: true,
   reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

   // A deploy is gated on these tests, so a flake would block publication. Two
   // retries in CI, none locally where a flake should be seen and fixed.
   retries: process.env.CI ? 2 : 0,

   // Fail rather than silently skipping the suite if a .only is committed.
   forbidOnly: !!process.env.CI,
   use: {
      baseURL: BASE_URL,
      trace: 'on-first-retry'
   },
   projects: [
      { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
   ],
   webServer: {
      command: 'npm run build && node server.js',
      url: BASE_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60000
   }
})
