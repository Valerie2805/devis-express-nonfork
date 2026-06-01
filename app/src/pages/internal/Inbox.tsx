import { useEffect, useMemo, useState } from 'react'
import { apiFetch, authHeaders } from '@/lib/api'
import { useInternalAuthStore } from '@/store/internalAuthStore'
import InternalShell from '@/components/internal/InternalShell'

type ThreadRow = {
  prospect_id: string
  name: string
  last_at: string
  last_direction: string
  last_subject: string | null
}

type MessageRow = {
  message_id: string
  direction: string
  from_email: string | null
  to_email: string | null
  subject: string | null
  text: string | null
  created_at: string
}

export default function Inbox() {
  const { token } = useInternalAuthStore()
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [loadingThreads, setLoadingThreads] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendStatus, setSendStatus] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)

  const selectedThread = useMemo(() => threads.find((t) => t.prospect_id === selected) || null, [threads, selected])

  async function loadThreads(signal?: AbortSignal) {
    const d = await apiFetch<{ items: ThreadRow[] }>('/api/v1/internal/prospection/inbox', {
      headers: { ...authHeaders(token) },
      signal,
    })
    setThreads(Array.isArray(d.items) ? d.items : [])
  }

  async function loadMessages(prospectId: string, signal?: AbortSignal) {
    const d = await apiFetch<{ items: MessageRow[] }>(`/api/v1/internal/prospection/inbox/${encodeURIComponent(prospectId)}`, {
      headers: { ...authHeaders(token) },
      signal,
    })
    setMessages(Array.isArray(d.items) ? d.items : [])
  }

  useEffect(() => {
    const controller = new AbortController()
    setLoadingThreads(true)
    loadThreads(controller.signal).then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoadingThreads(false))
    return () => controller.abort()
  }, [token])

  useEffect(() => {
    if (!selected) return
    const controller = new AbortController()
    setLoadingMessages(true)
    loadMessages(selected, controller.signal).then(() => setError(null))
      .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoadingMessages(false))
    return () => controller.abort()
  }, [selected, token])

  useEffect(() => {
    if (!selected) return
    const lastInbound = [...messages].reverse().find((m) => m.direction === 'inbound') || null
    if (lastInbound?.from_email && !toEmail) setToEmail(lastInbound.from_email)
    const baseSubject = String(lastInbound?.subject || selectedThread?.last_subject || '').trim()
    if (baseSubject && !subject) setSubject(/^re:/i.test(baseSubject) ? baseSubject : `Re: ${baseSubject}`)
    const inboundText = String(lastInbound?.text || '').trim()
    if (inboundText && !text.trim()) {
      const quoted = inboundText
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')
      setText(`Bonjour,\n\n${quoted}\n`)
    }
  }, [messages, selected, selectedThread, subject, toEmail, text])

  async function onSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSending(true)
    setSendStatus(null)
    setSendError(null)
    try {
      await apiFetch(`/api/v1/internal/prospection/prospects/${encodeURIComponent(selected)}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
        body: JSON.stringify({ to_email: toEmail.trim(), subject: subject.trim(), text }),
      })
      setSendStatus('Envoyé')
      await Promise.all([loadMessages(selected), loadThreads()])
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSending(false)
    }
  }

  return (
    <InternalShell>
      <div className="grid gap-4 md:grid-cols-[320px_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm font-semibold">Inbox</div>
          {loadingThreads ? <div className="mt-4 text-sm text-zinc-300">Chargement…</div> : null}
          {error ? <div className="mt-4 text-sm text-rose-200">{error}</div> : null}
          {!loadingThreads && !error ? (
            <div className="mt-4 grid gap-2">
              {threads.map((t) => (
                <button
                  key={t.prospect_id}
                  type="button"
                  onClick={() => {
                    setSelected(t.prospect_id)
                    setToEmail('')
                    setSubject('')
                    setText('')
                    setSendStatus(null)
                    setSendError(null)
                  }}
                  className={[
                    'rounded-xl border px-4 py-3 text-left',
                    selected === t.prospect_id ? 'border-white/25 bg-white/10' : 'border-white/10 bg-zinc-950/20 hover:bg-zinc-950/30',
                  ].join(' ')}
                >
                  <div className="text-sm font-semibold">{t.name}</div>
                  <div className="mt-1 text-xs text-zinc-300">{t.last_subject || '—'}</div>
                </button>
              ))}
              {threads.length === 0 ? <div className="text-sm text-zinc-300">Aucun message</div> : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
          {selectedThread ? (
            <>
              <div className="text-sm font-semibold">{selectedThread.name}</div>
              <div className="mt-1 text-xs text-zinc-300">{selectedThread.prospect_id}</div>
            </>
          ) : (
            <div className="text-sm text-zinc-300">Sélectionne un thread</div>
          )}

          {selected ? (
            <>
              {loadingMessages ? <div className="mt-4 text-sm text-zinc-300">Chargement…</div> : null}
              {!loadingMessages ? (
                <div className="mt-4 grid gap-2">
                  {messages.map((m) => (
                    <div key={m.message_id} className="rounded-xl border border-white/10 bg-zinc-950/20 px-4 py-3">
                      <div className="text-xs text-zinc-300">
                        {m.direction} · {m.created_at}
                      </div>
                      <div className="mt-1 text-sm font-semibold">{m.subject || '—'}</div>
                      <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{m.text || ''}</div>
                    </div>
                  ))}
                  {messages.length === 0 ? <div className="text-sm text-zinc-300">Aucun message</div> : null}
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-950/20 p-4">
                <div className="text-sm font-semibold">Répondre</div>
                <form onSubmit={onSend} className="mt-3 grid gap-3">
                  <label className="grid gap-1 text-xs text-zinc-300">
                    To
                    <input
                      value={toEmail}
                      onChange={(e) => setToEmail(e.target.value)}
                      className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Subject
                    <input
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="h-10 rounded-lg border border-white/10 bg-zinc-950/40 px-3 text-sm text-white outline-none focus:border-white/25"
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-zinc-300">
                    Text
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      className="min-h-28 rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2 text-sm text-white outline-none focus:border-white/25"
                    />
                  </label>
                  {sendError ? <div className="text-xs text-rose-200">{sendError}</div> : null}
                  {sendStatus ? <div className="text-xs text-emerald-200">{sendStatus}</div> : null}
                  <button
                    type="submit"
                    disabled={sending || !toEmail.trim() || !subject.trim() || !text.trim()}
                    className="h-10 rounded-lg bg-white px-4 text-sm font-semibold text-zinc-950 disabled:opacity-60"
                  >
                    {sending ? 'Envoi…' : 'Envoyer'}
                  </button>
                </form>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </InternalShell>
  )
}
