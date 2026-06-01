import { describe, expect, it, vi, afterEach } from 'vitest'
import { fireEvent, render, screen, cleanup } from '@testing-library/react'
import Inbox from '@/pages/internal/Inbox'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import { MemoryRouter } from 'react-router-dom'

describe('Internal Inbox', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    useInternalAuthStore.getState().setToken(null)
    cleanup()
  })

  it('affiche les threads et charge les messages', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/inbox/p1')) {
          return new Response(JSON.stringify({ items: [{ message_id: 'm1', direction: 'inbound', subject: 'Re', text: 'Hello', created_at: 'x' }] }), {
            status: 200,
          })
        }
        if (url.includes('/api/v1/internal/prospection/inbox')) {
          return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'ACME', last_at: 'x', last_direction: 'inbound', last_subject: 'Re' }] }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/inbox']}>
        <Inbox />
      </MemoryRouter>,
    )
    expect(await screen.findByText('ACME')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ACME/ }))
    expect(await screen.findByText('Hello')).toBeInTheDocument()
  })

  it('permet de répondre via Resend', async () => {
    useInternalAuthStore.getState().setToken('t')
    let messagesCalls = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any, init?: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/prospects/p1/send')) {
          return new Response(JSON.stringify({ provider_message_id: 'email_123' }), { status: 200 })
        }
        if (url.includes('/api/v1/internal/prospection/inbox/p1')) {
          messagesCalls++
          if (messagesCalls === 1) {
            return new Response(
              JSON.stringify({ items: [{ message_id: 'm1', direction: 'inbound', from_email: 'alice@example.com', subject: 'Hello', text: 'Ping', created_at: 'x' }] }),
              { status: 200 },
            )
          }
          return new Response(
            JSON.stringify({
              items: [
                { message_id: 'm1', direction: 'inbound', from_email: 'alice@example.com', subject: 'Hello', text: 'Ping', created_at: 'x' },
                { message_id: 'm2', direction: 'outbound', to_email: 'alice@example.com', subject: 'Re: Hello', text: 'Pong', created_at: 'y' },
              ],
            }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/internal/prospection/inbox')) {
          return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'ACME', last_at: 'x', last_direction: 'inbound', last_subject: 'Hello' }] }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/inbox']}>
        <Inbox />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /ACME/ }))

    fireEvent.change(await screen.findByLabelText('To'), { target: { value: 'alice@example.com' } })
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Re: Hello' } })
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'Pong' } })
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }))

    expect(await screen.findByText('Envoyé')).toBeInTheDocument()
    expect((await screen.findAllByText('Pong')).length).toBeGreaterThan(0)
  })

  it('pré-remplit To/Subject/Text à partir du dernier inbound', async () => {
    useInternalAuthStore.getState().setToken('t')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: any) => {
        const url = String(input)
        if (url.includes('/api/v1/internal/prospection/inbox/p1')) {
          return new Response(
            JSON.stringify({ items: [{ message_id: 'm1', direction: 'inbound', from_email: 'alice@example.com', subject: 'Hello', text: 'Ping\nLine2', created_at: 'x' }] }),
            { status: 200 },
          )
        }
        if (url.includes('/api/v1/internal/prospection/inbox')) {
          return new Response(JSON.stringify({ items: [{ prospect_id: 'p1', name: 'ACME', last_at: 'x', last_direction: 'inbound', last_subject: 'Hello' }] }), {
            status: 200,
          })
        }
        return new Response(JSON.stringify({ error: 'not found' }), { status: 404 })
      }),
    )

    render(
      <MemoryRouter initialEntries={['/internal/inbox']}>
        <Inbox />
      </MemoryRouter>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /ACME/ }))

    expect(await screen.findByDisplayValue('alice@example.com')).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Re: Hello')).toBeInTheDocument()
    const ta = await screen.findByDisplayValue(/Ping/)
    expect(ta).toBeInTheDocument()
  })
})
