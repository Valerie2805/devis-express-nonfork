import { newId, nowIso } from './utils.js'

export async function addAnalyticsEvent(
  db: any,
  input: { business_id: string; session_id: string; trade_id: string; name: string; page_type: string; page_path: string; properties?: any },
) {
  await db.run(
    `INSERT INTO analytics_event (
      event_id, business_id, session_id, trade_id, name, page_type, page_path,
      properties_json, utm_json, referrer, created_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?
    )`,
    [
      newId(),
      input.business_id,
      input.session_id,
      input.trade_id,
      input.name,
      input.page_type,
      input.page_path,
      JSON.stringify(input.properties || {}),
      JSON.stringify({}),
      null,
      nowIso(),
    ],
  )
}

export async function emitLeadStatusChanged(db: any, input: { business_id: string; trade_id: string; user_id: string | null; lead_id: string; status_from: string; status_to: string }) {
  await addAnalyticsEvent(db, {
    business_id: input.business_id,
    session_id: `bo:${input.user_id || 'unknown'}`,
    trade_id: input.trade_id,
    name: 'lead_status_changed',
    page_type: 'other',
    page_path: `/backoffice/${input.business_id}/leads/${input.lead_id}`,
    properties: { lead_id: input.lead_id, status_from: input.status_from, status_to: input.status_to },
  })
}

export async function emitLeadResponseSent(
  db: any,
  input: { business_id: string; trade_id: string; user_id: string | null; lead_id: string; channel: string; template_id: string },
) {
  await addAnalyticsEvent(db, {
    business_id: input.business_id,
    session_id: `bo:${input.user_id || 'unknown'}`,
    trade_id: input.trade_id,
    name: 'lead_response_sent',
    page_type: 'other',
    page_path: `/backoffice/${input.business_id}/leads/${input.lead_id}`,
    properties: { lead_id: input.lead_id, channel: input.channel, template_id: input.template_id },
  })
}

