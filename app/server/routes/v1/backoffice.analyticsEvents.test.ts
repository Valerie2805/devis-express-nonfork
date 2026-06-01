import { describe, expect, it } from 'vitest'
import { emitLeadResponseSent, emitLeadStatusChanged } from '../../analyticsEvents'

describe('backoffice analytics events', () => {
  it('émet lead_status_changed sur changement de status', async () => {
    const runCalls: any[] = []
    const db = {
      run: async (sql: string, params: any[]) => {
        runCalls.push({ sql, params })
      },
    }

    await emitLeadStatusChanged(db, {
      business_id: 'b1',
      trade_id: 't1',
      user_id: 'u1',
      lead_id: 'l1',
      status_from: 'new',
      status_to: 'won',
    })

    const ev = runCalls.find((c) => String(c.sql).includes('INSERT INTO analytics_event'))
    expect(ev).toBeTruthy()
    expect(ev.params?.[4]).toBe('lead_status_changed')
    const props = JSON.parse(String(ev.params?.[7] || '{}'))
    expect(props.lead_id).toBe('l1')
    expect(props.status_from).toBe('new')
    expect(props.status_to).toBe('won')
  })

  it('émet lead_response_sent sur envoi template', async () => {
    const runCalls: any[] = []
    const db = {
      run: async (sql: string, params: any[]) => {
        runCalls.push({ sql, params })
      },
    }

    await emitLeadResponseSent(db, {
      business_id: 'b1',
      trade_id: 't1',
      user_id: 'u1',
      lead_id: 'l1',
      channel: 'sms',
      template_id: 'ack',
    })

    const ev = runCalls.find((c) => String(c.sql).includes('INSERT INTO analytics_event') && String(c.params?.[4]) === 'lead_response_sent')
    expect(ev).toBeTruthy()
    const props = JSON.parse(String(ev.params?.[7] || '{}'))
    expect(props.lead_id).toBe('l1')
    expect(props.channel).toBe('sms')
  })
})
