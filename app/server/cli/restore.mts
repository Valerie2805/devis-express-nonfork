import fs from 'fs'
import { getDb } from '../db.js'

process.stdout.on('error', (err: any) => {
  if (err && err.code === 'EPIPE') process.exit(0)
  throw err
})

if (process.env.RESTORE_ALLOW !== 'true') {
  throw new Error('RESTORE_ALLOW must be true')
}

const filePath = process.argv[2]
if (!filePath) {
  throw new Error('Missing backup file path argument')
}

const raw = fs.readFileSync(filePath, 'utf8')
const parsed = JSON.parse(raw) as any
const tables = (parsed && parsed.tables) as Record<string, any[]>
if (!tables || typeof tables !== 'object') throw new Error('Invalid backup format')

const db = await getDb()

function placeholders(n: number) {
  return Array.from({ length: n }, () => '?').join(', ')
}

for (const [table, rows] of Object.entries(tables)) {
  if (!Array.isArray(rows) || rows.length === 0) continue
  const cols = Object.keys(rows[0])
  if (cols.length === 0) continue

  const base = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)})`
  const sql = db.driver === 'postgres' ? `${base} ON CONFLICT DO NOTHING` : `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders(cols.length)})`

  for (const r of rows) {
    const params = cols.map((c) => (r as any)[c])
    await db.run(sql, params)
  }
}

process.stdout.write('ok\n')

