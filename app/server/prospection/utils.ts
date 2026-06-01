export function parseInboundAlias(to: string, inboundDomain: string) {
  const s = String(to || '').trim().toLowerCase()
  const m = s.match(/^p_([a-z0-9-]+)@(.+)$/)
  if (!m) return null
  if (String(m[2]).toLowerCase() !== String(inboundDomain || '').trim().toLowerCase()) return null
  return m[1]
}

