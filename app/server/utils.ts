import crypto from 'crypto'

export function nowIso() {
  return new Date().toISOString()
}

export function newId() {
  return crypto.randomUUID()
}

export function normalizePhone(raw: string) {
  const cleaned = (raw || '').replace(/[^\d+]/g, '')
  if (cleaned.startsWith('+')) return cleaned
  if (cleaned.startsWith('0')) return `+33${cleaned.slice(1)}`
  return cleaned
}

export function isPhoneValid(e164: string) {
  return /^\+\d{8,15}$/.test(e164)
}

export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback
  if (typeof value === 'object') return value as T
  if (typeof value !== 'string') return fallback
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}
