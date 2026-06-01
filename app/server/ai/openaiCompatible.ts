type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export async function chatJson(messages: ChatMessage[]) {
  const baseUrl = String(process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const apiKey = String(process.env.AI_API_KEY || '')
  const model = String(process.env.AI_MODEL || '')
  if (!apiKey) throw new Error('AI_API_KEY missing')
  if (!model) throw new Error('AI_MODEL missing')

  const timeoutMs = Math.min(60_000, Math.max(2_000, Number(process.env.AI_TIMEOUT_MS || 20_000)))
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages,
      }),
    })
  } finally {
    clearTimeout(t)
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`AI request failed (${res.status}): ${txt || res.statusText}`)
  }

  const data = (await res.json()) as any
  const content = data?.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') throw new Error('AI invalid response')
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  const jsonText = start >= 0 && end > start ? content.slice(start, end + 1) : content
  return JSON.parse(jsonText)
}
