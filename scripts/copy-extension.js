import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(__dirname, '..', 'dist')
const ext = path.join(__dirname, '..', 'extension')

if (!fs.existsSync(dist)) fs.mkdirSync(dist, { recursive: true })
fs.copyFileSync(path.join(ext, 'manifest.json'), path.join(dist, 'manifest.json'))
fs.copyFileSync(path.join(ext, 'icon-16.png'), path.join(dist, 'icon-16.png'))
fs.copyFileSync(path.join(ext, 'icon-32.png'), path.join(dist, 'icon-32.png'))
fs.copyFileSync(path.join(ext, 'icon-48.png'), path.join(dist, 'icon-48.png'))
