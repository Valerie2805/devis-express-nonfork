import { getDb } from '../db.js'

process.stdout.on('error', (err: any) => {
  if (err && err.code === 'EPIPE') process.exit(0)
  throw err
})

const db = await getDb()

const tables = [
  'business',
  'business_user',
  'lead',
  'appointment',
  'lead_task',
  'message_log',
  'asset',
  'business_review',
  'business_gallery_photo',
  'analytics_event',
  'audit_log',
]

const out: Record<string, any[]> = {}
for (const t of tables) {
  out[t] = await db.all<any>(`SELECT * FROM ${t}`)
}

process.stdout.write(JSON.stringify({ exported_at: new Date().toISOString(), tables: out }, null, 2))
process.stdout.write('\n')
