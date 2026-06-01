import crypto from 'crypto'
import { getMessagingProvider } from './providers/messagingProvider.js'
import { renderTemplate } from './messaging.js'
import { newId, nowIso, safeJsonParse } from './utils.js'

function isTruthy(v: any) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

function getStaffPermissions(cfg: any) {
  const perms = cfg?.settings?.staff_permissions
  return perms && typeof perms === 'object' ? perms : {}
}

function getPipelineStages(cfg: any): Array<{ id: string; label?: string }> {
  const stages = cfg?.settings?.pipeline_stages
  if (!Array.isArray(stages)) return []
  return stages
    .map((s: any) => ({ id: String(s?.id || ''), label: s?.label ? String(s.label) : undefined }))
    .filter((s) => s.id)
}

function defaultStage(cfg: any) {
  const def = cfg?.settings?.pipeline_default_stage
  if (def) return String(def)
  const stages = getPipelineStages(cfg)
  return stages[0]?.id || null
}

async function pickRoundRobinAssignee(db: any, businessId: string, cfg: any): Promise<string | null> {
  const staff = (await db.all("SELECT user_id FROM business_user WHERE business_id = ? AND role = 'staff' ORDER BY created_at ASC", [
    businessId,
  ])) as Array<{ user_id: string }>
  if (!staff.length) return null
  const idx = Number(cfg?.settings?.assign_round_robin_index || 0)
  const pick = staff[((idx % staff.length) + staff.length) % staff.length]?.user_id || null
  const next = {
    ...(cfg || {}),
    settings: {
      ...(cfg?.settings || {}),
      assign_round_robin_index: idx + 1,
    },
  }
  await db.run('UPDATE business SET config_json = ?, updated_at = ? WHERE business_id = ?', [JSON.stringify(next), nowIso(), businessId])
  return pick
}

function hasInboundAfter(lead: any, iso: string) {
  const t = lead?.last_inbound_at ? new Date(String(lead.last_inbound_at)).getTime() : 0
  const since = iso ? new Date(iso).getTime() : 0
  return t && since && t >= since
}

function matchRule(rule: any, lead: any) {
  const when = rule?.when || {}
  if (when.status && String(lead.status || '') !== String(when.status)) return false
  if (when.decision && String(lead.decision || '') !== String(when.decision)) return false
  if (when.stage && String(lead.stage || '') !== String(when.stage)) return false
  if (when.in_zone !== undefined && Boolean(lead.in_zone) !== Boolean(when.in_zone)) return false
  if (when.channel_preference && String(lead.channel_preference || '') !== String(when.channel_preference)) return false
  if (when.tag) {
    const tags = safeJsonParse(lead.tags_json, []) as string[]
    if (!tags.includes(String(when.tag))) return false
  }
  return true
}

async function scheduleSequenceTasks(db: any, businessId: string, lead: any, seq: any, triggerAtIso: string) {
  const steps = Array.isArray(seq?.steps) ? seq.steps : []
  const baseAt = new Date(triggerAtIso).getTime()
  for (const step of steps) {
    const delayMin = Number(step?.delay_minutes || 0)
    const runAt = new Date(baseAt + Math.max(0, delayMin) * 60_000).toISOString()
    const payload = {
      channel: step?.channel,
      template_id: step?.template_id,
      variables: step?.variables || {},
      stop_if_inbound: step?.stop_if_inbound !== false,
      sequence_id: seq?.id || null,
      step_id: step?.id || null,
      trigger_at: triggerAtIso,
    }
    await db.run(
      `INSERT INTO lead_task (task_id, business_id, lead_id, kind, run_at, payload_json, status, last_error, attempts, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newId(), businessId, lead.lead_id, 'send_message', runAt, JSON.stringify(payload), 'pending', null, 0, nowIso(), nowIso()],
    )
  }
}

export async function applyAutomationsOnLeadCreate(db: any, businessId: string, leadId: string, businessCfg: any) {
  const lead = (await db.get('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])) as any
  if (!lead) return

  const settings = businessCfg?.settings || {}
  if (settings.automations_enabled === false) return
  const urgency = String(lead.urgency || '')
  if (urgency === 'now' && settings.automations_urgent_enabled === false) return
  if (urgency !== 'now' && settings.automations_nonurgent_enabled === false) return

  const rules = Array.isArray(businessCfg?.settings?.automation_rules) ? businessCfg.settings.automation_rules : []
  const sequences = Array.isArray(businessCfg?.settings?.sequences) ? businessCfg.settings.sequences : []

  let stage = lead.stage ? String(lead.stage) : defaultStage(businessCfg)
  let assignee = lead.assignee_user_id ? String(lead.assignee_user_id) : null
  const tags = new Set<string>(safeJsonParse(lead.tags_json, []) as string[])

  for (const r of rules) {
    if (!matchRule(r, { ...lead, stage })) continue
    const then = r?.then || {}
    if (then.set_stage) stage = String(then.set_stage)
    if (then.add_tag) tags.add(String(then.add_tag))
    if (then.assign === 'round_robin_staff' && !assignee) assignee = await pickRoundRobinAssignee(db, businessId, businessCfg)
    if (then.assign_user_id) assignee = String(then.assign_user_id)
  }

  const updates: string[] = []
  const params: any[] = []
  if (stage !== (lead.stage || null)) {
    updates.push('stage = ?')
    params.push(stage)
  }
  if (assignee !== (lead.assignee_user_id || null)) {
    updates.push('assignee_user_id = ?')
    params.push(assignee)
  }
  const nextTags = Array.from(tags)
  if (JSON.stringify(nextTags) !== JSON.stringify(safeJsonParse(lead.tags_json, []) as string[])) {
    updates.push('tags_json = ?')
    params.push(JSON.stringify(nextTags))
  }
  if (updates.length) {
    updates.push('updated_at = ?')
    params.push(nowIso())
    params.push(businessId, leadId)
    await db.run(`UPDATE lead SET ${updates.join(', ')} WHERE business_id = ? AND lead_id = ?`, params)
  }

  const triggerAt = lead.created_at || nowIso()
  for (const seq of sequences) {
    if (seq && seq.enabled === false) continue
    const trigger = seq?.trigger || {}
    if (String(trigger.event || '') !== 'lead_created') continue
    if (trigger.decision && String(lead.decision || '') !== String(trigger.decision)) continue
    if (trigger.stage && stage !== String(trigger.stage)) continue
    await scheduleSequenceTasks(db, businessId, { ...lead, stage }, seq, triggerAt)
  }
}

export async function applyAutomationsOnStageEntered(db: any, businessId: string, leadId: string, businessCfg: any, stage: string) {
  const lead = (await db.get('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, leadId])) as any
  if (!lead) return

  const settings = businessCfg?.settings || {}
  if (settings.automations_enabled === false) return
  const urgency = String(lead.urgency || '')
  if (urgency === 'now' && settings.automations_urgent_enabled === false) return
  if (urgency !== 'now' && settings.automations_nonurgent_enabled === false) return

  const sequences = Array.isArray(businessCfg?.settings?.sequences) ? businessCfg.settings.sequences : []
  const triggerAt = nowIso()
  for (const seq of sequences) {
    if (seq && seq.enabled === false) continue
    const trigger = seq?.trigger || {}
    if (String(trigger.event || '') !== 'stage_entered') continue
    if (trigger.stage && String(trigger.stage) !== String(stage)) continue
    if (trigger.decision && String(lead.decision || '') !== String(trigger.decision)) continue
    await scheduleSequenceTasks(db, businessId, { ...lead, stage }, seq, triggerAt)
  }
}

export async function runDueTasks(db: any, businessId: string, businessCfg: any, limit: number) {
  const tasks = (await db.all(
    "SELECT * FROM lead_task WHERE business_id = ? AND status = 'pending' AND run_at <= ? ORDER BY run_at ASC LIMIT ?",
    [businessId, nowIso(), limit],
  )) as any[]
  if (!tasks.length) return { processed: 0, sent: 0, skipped: 0, failed: 0 }

  const provider = getMessagingProvider()
  let sent = 0
  let skipped = 0
  let failed = 0

  for (const t of tasks) {
    const payload = safeJsonParse(t.payload_json, {}) as any
    const lead = (await db.get('SELECT * FROM lead WHERE business_id = ? AND lead_id = ?', [businessId, t.lead_id])) as any
    if (!lead || String(lead.status || '') === 'deleted') {
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['skipped', nowIso(), t.task_id])
      skipped += 1
      continue
    }

    const channel = String(payload.channel || '')
    const templateId = String(payload.template_id || '')
    if (!channel || !templateId) {
      await db.run("UPDATE lead_task SET status = ?, last_error = ?, updated_at = ? WHERE task_id = ?", ['failed', 'Invalid payload', nowIso(), t.task_id])
      failed += 1
      continue
    }

    if (payload.stop_if_inbound !== false && hasInboundAfter(lead, String(payload.trigger_at || lead.created_at || ''))) {
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['skipped', nowIso(), t.task_id])
      skipped += 1
      continue
    }

    const smsOptOut = lead.sms_opt_out_at ? true : false
    const smsOptIn = isTruthy(lead.sms_opt_in)
    const waOptIn = isTruthy(lead.whatsapp_opt_in)

    if (smsOptOut) {
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['skipped', nowIso(), t.task_id])
      skipped += 1
      continue
    }
    if (channel === 'sms' && !smsOptIn) {
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['skipped', nowIso(), t.task_id])
      skipped += 1
      continue
    }
    if (channel === 'whatsapp' && !waOptIn) {
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['skipped', nowIso(), t.task_id])
      skipped += 1
      continue
    }

    const business = businessCfg
    const rendered = renderTemplate(templateId, channel as any, { business, lead, variables: payload.variables || {} })
    if (!rendered) {
      await db.run("UPDATE lead_task SET status = ?, last_error = ?, updated_at = ? WHERE task_id = ?", ['failed', 'Unknown template', nowIso(), t.task_id])
      failed += 1
      continue
    }

    try {
      const sendResult = await provider.send({ channel: channel as any, to: String(lead.phone_e164 || ''), text: rendered })
      await db.run(
        `INSERT INTO message_log (
          message_id, business_id, lead_id, channel, template_id, rendered_text, provider_message_id, status, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
        [crypto.randomUUID(), businessId, lead.lead_id, channel, templateId, rendered, sendResult.provider_message_id || null, sendResult.status, nowIso()],
      )
      await db.run("UPDATE lead_task SET status = ?, updated_at = ? WHERE task_id = ?", ['done', nowIso(), t.task_id])
      sent += 1
    } catch (e: any) {
      const attempts = Number(t.attempts || 0) + 1
      const nextStatus = attempts >= 3 ? 'failed' : 'pending'
      await db.run('UPDATE lead_task SET attempts = ?, status = ?, last_error = ?, updated_at = ? WHERE task_id = ?', [
        attempts,
        nextStatus,
        String(e?.message || e || 'send failed').slice(0, 500),
        nowIso(),
        t.task_id,
      ])
      failed += 1
    }
  }

  return { processed: tasks.length, sent, skipped, failed }
}

export function buildDefaultAutomationConfig() {
  return {
    pipeline_stages: [
      { id: 'new', label: 'Nouveau' },
      { id: 'contacted', label: 'Contacté' },
      { id: 'appointment', label: 'RDV' },
      { id: 'won', label: 'Gagné' },
      { id: 'lost', label: 'Perdu' },
    ],
    pipeline_default_stage: 'new',
    automation_rules: [
      {
        id: 'rr_assign_on_create',
        when: { decision: 'qualified' },
        then: { assign: 'round_robin_staff' },
      },
    ],
    sequences: [
      {
        id: 'followup_qualified',
        enabled: true,
        trigger: { event: 'lead_created', decision: 'qualified' },
        steps: [
          { id: 's1', delay_minutes: 5, channel: 'sms', template_id: 'ack', stop_if_inbound: true },
          { id: 's2', delay_minutes: 120, channel: 'sms', template_id: 'missed_call_followup', stop_if_inbound: true },
        ],
      },
    ],
    automations_enabled: true,
    automations_urgent_enabled: true,
    automations_nonurgent_enabled: true,
    staff_permissions: getStaffPermissions({}),
  }
}
