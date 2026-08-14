// Local preview server for the generated site.
//
// The build output in dist/ is fully static -- this exists so you can browse it
// over http:// during authoring rather than file://. Deploying dist/ anywhere
// (GitHub Pages, S3, Netlify, nginx) needs no Node runtime at all.

const path = require('node:path')
const fs = require('node:fs')
const express = require('express')

const DIST_DIR = path.join(__dirname, 'dist')
const DEFAULT_PORT = 3100

if (!fs.existsSync(DIST_DIR)) {
   console.error('dist/ not found — run `npm run build` first.')
   process.exit(1)
}

const app = express()

// Serve .md/.txt/.yaml as UTF-8 text so browsers display rather than download.
app.use(express.static(DIST_DIR, {
   extensions: ['html'],
   setHeaders(res, filePath) {
      if (/\.(txt|yaml|yml)$/.test(filePath)) {
         res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      }
   }
}))

app.use((req, res) => {
   res.status(404).type('html').send('<h1>404</h1><p><a href="/">Back to the documentation</a></p>')
})

const port = process.env.PORT || DEFAULT_PORT
app.listen(port, () => {
   console.log(`Preview: http://localhost:${port}`)
})
