import { getDb } from '../db.js'
import { runMigrations } from '../migrate.js'

const db = await getDb()
await runMigrations(db)
process.stdout.write('ok\n')

