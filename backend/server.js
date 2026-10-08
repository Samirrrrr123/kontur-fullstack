import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createDatabase } from './database.js'
import { createApp } from './app.js'
import { seed } from './seed.js'

mkdirSync('data', { recursive: true })
const secretFile = 'data/session-secret'
if (!process.env.JWT_SECRET && !existsSync(secretFile)) writeFileSync(secretFile, randomBytes(48).toString('hex'))
const secret = process.env.JWT_SECRET || readFileSync(secretFile, 'utf8')
const db = createDatabase()
await db.initialize()
await seed(db)
const app = createApp(db, secret)
const port = Number(process.env.PORT || 3000)
const server = app.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Контур: http://localhost:${port}`))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(async () => { await db.destroy(); process.exit(0) }))
