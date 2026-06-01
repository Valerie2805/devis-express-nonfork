export type ApiError = { success: false; error: string }

export type ApiFetchInit = RequestInit & { timeoutMs?: number }

async function parseJson(res: Response) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

export async function apiFetch<T>(input: RequestInfo, init?: ApiFetchInit): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? 15000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  if (init?.signal) {
    if (init.signal.aborted) controller.abort()
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const { timeoutMs: _timeoutMs, signal: _signal, ...rest } = init || {}

  try {
    const res = await fetch(input, { ...rest, signal: controller.signal })
    const data = await parseJson(res)
    if (!res.ok) {
      const message = (data && (data.error || data.message)) || `HTTP ${res.status}`
      throw new Error(message)
    }
    return data as T
  } catch (e) {
    const name = e && typeof e === 'object' && 'name' in e ? String((e as any).name) : ''
    if (name === 'AbortError') throw new Error('Délai dépassé')
    throw e
  } finally {
    clearTimeout(timeoutId)
  }
}

export function authHeaders(token: string | null) {
  return token ? { Authorization: `Bearer ${token}` } : {}
}
