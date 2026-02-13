import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const ext = path.join(__dirname, '..', 'extension')

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true })
fs.copyFileSync(path.join(ext, 'manifest.json'), path.join(dist, 'manifest.json'))
const iconsSrc = path.join(ext, 'icons')
const iconsDist = path.join(dist, 'icons')
if (!fs.existsSync(iconsDist)) fs.mkdirSync(iconsDist, { recursive: true })
for (const file of fs.readdirSync(iconsSrc)) {
  fs.copyFileSync(path.join(iconsSrc, file), path.join(iconsDist, file))
}
