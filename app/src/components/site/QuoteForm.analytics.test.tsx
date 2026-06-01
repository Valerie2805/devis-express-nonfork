import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import QuoteForm from './QuoteForm'

describe('QuoteForm tracking', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    cleanup()
  })

  it('inclut lead_id dans submit_quote_form', async () => {
    const calls: any[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        calls.push({ url, init })
        if (url.includes('/api/v1/site/b1/leads')) {
          return new Response(JSON.stringify({ lead_id: 'l1', status: 'new', decision: 'needs_followup', tags: [] }), { status: 201 })
        }
        if (url.includes('/api/v1/analytics/b1/events')) {
          return new Response('', { status: 204 })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <QuoteForm
        businessId="b1"
        tradeId="t1"
        cityDefault="Paris"
        zoneList={['75001']}
        formSpec={{ request_types: { foo: { label: 'Foo' } }, extra_fields: [], required_photos_for: [] }}
      />,
    )

    fireEvent.change(await screen.findByLabelText('Code postal'), { target: { value: '75001' } })
    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '+33123456789' } })
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: /envoyer/i }))

    expect(await screen.findByText('Demande envoyée')).toBeInTheDocument()

    const analyticsBodies = calls
      .filter((c) => String(c.url).includes('/api/v1/analytics/b1/events'))
      .map((c) => {
        try {
          return JSON.parse(String(c.init?.body || '{}'))
        } catch {
          return {}
        }
      })
    const open = analyticsBodies.find((b) => b?.name === 'open_quote_form')
    expect(open?.properties?.trigger).toBeTruthy()
    const submit = analyticsBodies.find((b) => b?.name === 'submit_quote_form')
    expect(submit?.properties?.lead_id).toBe('l1')
  })
})
