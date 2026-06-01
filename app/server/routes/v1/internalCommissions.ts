import type { Request, Response } from 'express'
import { getDb } from '../../db.js'
import { newId, nowIso } from '../../utils.js'
import { createRouter } from '../router.js'
import { requireInternalAuth } from '../../internal/middleware.js'
import { parseCompanyKey } from '../../company/companyProfile.js'

const router = createRouter()

function roundEur(v: number) {
  return Math.round(v)
}

export async function listCommissionsHandler(req: Request, res: Response) {
  const from = String((req.query as any).from || '').trim()
  const to = String((req.query as any).to || '').trim()
  const db = await getDb()
  const params: any[] = []
  let where = '1=1'
  if (from && /^\d{4}-\d{2}$/.test(from)) {
    where += ' AND month >= ?'
    params.push(from)
  }
  if (to && /^\d{4}-\d{2}$/.test(to)) {
    where += ' AND month <= ?'
    params.push(to)
  }
  const rawItems = await db.all<any>(`SELECT * FROM commission_entry WHERE ${where} ORDER BY month DESC, updated_at DESC`, params)
  const items = rawItems.map((it: any) => ({
    ...it,
    company_key: it.business_id ? `business:${it.business_id}` : it.prospect_id ? `prospect:${it.prospect_id}` : null,
  }))
  const totalsByMonth: Record<
    string,
    { ca_eur: number; commission_gross_eur: number; charges_amount_eur: number; commission_net_eur: number; count: number }
  > = {}
  for (const it of items) {
    const m = String(it.month || '')
    if (!m) continue
    if (!totalsByMonth[m]) totalsByMonth[m] = { ca_eur: 0, commission_gross_eur: 0, charges_amount_eur: 0, commission_net_eur: 0, count: 0 }
    totalsByMonth[m].ca_eur += Number(it.ca_eur || 0)
    totalsByMonth[m].commission_gross_eur += Number(it.commission_gross_eur || 0)
    totalsByMonth[m].charges_amount_eur += Number(it.charges_amount_eur || 0)
    totalsByMonth[m].commission_net_eur += Number(it.commission_net_eur || 0)
    totalsByMonth[m].count += 1
  }
  res.status(200).json({ items, totals_by_month: totalsByMonth })
}

export async function upsertCommissionHandler(req: Request, res: Response) {
  const body = (req.body || {}) as any
  const month = String(body.month || '').trim()
  const companyKeyRaw = body.company_key !== undefined ? String(body.company_key || '').trim() : ''
  const caEur = Number(body.ca_eur)
  const ratePct = Number(body.rate_pct)
  const chargesPct = Number(body.charges_pct)

  if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(caEur) || !Number.isFinite(ratePct) || !Number.isFinite(chargesPct)) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const key = companyKeyRaw ? parseCompanyKey(companyKeyRaw) : null
  if (companyKeyRaw && !key) {
    res.status(400).json({ success: false, error: 'Invalid payload' })
    return
  }

  const businessId = key?.business_id ? String(key.business_id) : null
  const prospectId = key?.prospect_id ? String(key.prospect_id) : null

  const commissionGross = roundEur(caEur * (ratePct / 100))
  const chargesAmount = roundEur(commissionGross * (chargesPct / 100))
  const commissionNet = commissionGross - chargesAmount
  const now = nowIso()

  const db = await getDb()
  let existing: any = null
  if (businessId) existing = await db.get('SELECT entry_id FROM commission_entry WHERE month = ? AND business_id = ? AND prospect_id IS NULL', [month, businessId])
  else if (prospectId) existing = await db.get('SELECT entry_id FROM commission_entry WHERE month = ? AND prospect_id = ? AND business_id IS NULL', [month, prospectId])
  else existing = await db.get('SELECT entry_id FROM commission_entry WHERE month = ? AND business_id IS NULL AND prospect_id IS NULL', [month])

  if (existing?.entry_id) {
    await db.run(
      `UPDATE commission_entry
       SET ca_eur = ?, rate_pct = ?, charges_pct = ?,
           commission_gross_eur = ?, charges_amount_eur = ?, commission_net_eur = ?,
           updated_at = ?
       WHERE entry_id = ?`,
      [roundEur(caEur), ratePct, chargesPct, commissionGross, chargesAmount, commissionNet, now, String(existing.entry_id)],
    )
    res.status(200).json({
      entry: {
        entry_id: String(existing.entry_id),
        month,
        business_id: businessId,
        prospect_id: prospectId,
        ca_eur: roundEur(caEur),
        rate_pct: ratePct,
        charges_pct: chargesPct,
        commission_gross_eur: commissionGross,
        charges_amount_eur: chargesAmount,
        commission_net_eur: commissionNet,
        updated_at: now,
      },
    })
    return
  }

  const entryId = newId()
  await db.run(
    `INSERT INTO commission_entry (
      entry_id, month, business_id, prospect_id,
      ca_eur, rate_pct, charges_pct,
      commission_gross_eur, charges_amount_eur, commission_net_eur,
      created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?
    )`,
    [
      entryId,
      month,
      businessId,
      prospectId,
      roundEur(caEur),
      ratePct,
      chargesPct,
      commissionGross,
      chargesAmount,
      commissionNet,
      now,
      now,
    ],
  )

  res.status(200).json({
    entry: {
      entry_id: entryId,
      month,
      business_id: businessId,
      prospect_id: prospectId,
      ca_eur: roundEur(caEur),
      rate_pct: ratePct,
      charges_pct: chargesPct,
      commission_gross_eur: commissionGross,
      charges_amount_eur: chargesAmount,
      commission_net_eur: commissionNet,
      created_at: now,
      updated_at: now,
    },
  })
}

router.get('/internal/commissions', requireInternalAuth, listCommissionsHandler)
router.post('/internal/commissions', requireInternalAuth, upsertCommissionHandler)

export default router
