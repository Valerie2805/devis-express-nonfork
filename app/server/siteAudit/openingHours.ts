function decodeXmlEntities(s: string) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function cleanInlineHtml(s: string) {
  return decodeXmlEntities(String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
}

function frDay(d: string) {
  const v = String(d || '').toLowerCase()
  if (v.startsWith('lun') || v.includes('lundi')) return 'Lun'
  if (v.startsWith('mar') || v.includes('mardi')) return 'Mar'
  if (v.startsWith('mer') || v.includes('mercredi')) return 'Mer'
  if (v.startsWith('jeu') || v.includes('jeudi')) return 'Jeu'
  if (v.startsWith('ven') || v.includes('vendredi')) return 'Ven'
  if (v.startsWith('sam') || v.includes('samedi')) return 'Sam'
  if (v.startsWith('dim') || v.includes('dimanche')) return 'Dim'
  if (v.includes('monday') || v === 'mo') return 'Lun'
  if (v.includes('tuesday') || v === 'tu') return 'Mar'
  if (v.includes('wednesday') || v === 'we') return 'Mer'
  if (v.includes('thursday') || v === 'th') return 'Jeu'
  if (v.includes('friday') || v === 'fr') return 'Ven'
  if (v.includes('saturday') || v === 'sa') return 'Sam'
  if (v.includes('sunday') || v === 'su') return 'Dim'
  return ''
}

const dayOrder = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

function normalizeTime(t: string) {
  const v = String(t || '').trim()
  if (!v) return ''
  const m = v.match(/^(\d{1,2}):?(\d{2})?$/)
  if (!m) return v
  const hh = String(m[1]).padStart(2, '0')
  const mm = String(m[2] || '00').padStart(2, '0')
  return `${hh}:${mm}`
}

function parseJsonLd(html: string) {
  const out: any[] = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const raw = String(m[1] || '').trim()
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      out.push(parsed)
    } catch {}
  }
  return out
}

function flattenJsonLd(node: any): any[] {
  if (!node) return []
  if (Array.isArray(node)) return node.flatMap(flattenJsonLd)
  if (typeof node !== 'object') return []
  const g = (node as any)['@graph']
  if (g) return flattenJsonLd(g)
  return [node]
}

function parseOpeningHoursStrings(v: any) {
  const arr = Array.isArray(v) ? v : [v]
  const out: string[] = []
  for (const raw of arr) {
    const s = String(raw || '').trim()
    if (!s) continue
    out.push(s)
  }
  return out
}

function extractFromMicrodata(html: string) {
  const out: string[] = []
  const re = /itemprop=["']openingHours["'][^>]*content=["']([^"']+)["']/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const s = String(m[1] || '').trim()
    if (s) out.push(s)
  }
  return out
}

type Schedule = Record<string, { intervals: Array<[string, string]>; closed?: boolean }>

function emptySchedule(): Schedule {
  return Object.fromEntries(dayOrder.map((d) => [d, { intervals: [] }])) as Schedule
}

function dayIndex(d: string) {
  return dayOrder.indexOf(d as any)
}

function expandRange(a: string, b: string) {
  const ia = dayIndex(a)
  const ib = dayIndex(b)
  if (ia < 0 || ib < 0) return []
  if (ia <= ib) return dayOrder.slice(ia, ib + 1)
  return [...dayOrder.slice(ia), ...dayOrder.slice(0, ib + 1)]
}

function parseDayPart(s: string) {
  const raw = String(s || '').trim()
  if (!raw) return []
  const cleaned = raw.replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim()
  const parts = cleaned.split(/[,\s]+/).filter(Boolean)
  const out: string[] = []
  for (const p of parts) {
    const m = p.match(/^([A-Za-zÀ-ÿ]{2,10})[-–]([A-Za-zÀ-ÿ]{2,10})$/)
    if (m) {
      const a = frDay(m[1])
      const b = frDay(m[2])
      out.push(...expandRange(a, b))
      continue
    }
    const d = frDay(p)
    if (d) out.push(d)
  }
  return Array.from(new Set(out))
}

function normalizeTimeLoose(s: string) {
  const v = String(s || '').trim().toLowerCase().replace(/\s+/g, '')
  const m = v.match(/^(\d{1,2})(?::|h)?(\d{2})?$/)
  if (!m) return ''
  return normalizeTime(`${m[1]}:${m[2] || '00'}`)
}

function parseIntervals(s: string) {
  const raw = String(s || '')
    .replace(/\u2013/g, '-')
    .replace(/\u2014/g, '-')
    .replace(/\bà\b/gi, '-')
  const parts = raw
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean)
  const out: Array<[string, string]> = []
  for (const p of parts) {
    const m = p.match(/(\d{1,2}(:\d{2})?|\d{1,2}\s*h\s*\d{0,2})\s*-\s*(\d{1,2}(:\d{2})?|\d{1,2}\s*h\s*\d{0,2})/i)
    if (!m) continue
    const a = normalizeTimeLoose(m[1])
    const b = normalizeTimeLoose(m[3])
    if (!a || !b) continue
    out.push([a, b])
  }
  return out
}

function applyClosed(schedule: Schedule, days: string[]) {
  for (const d of days) {
    const cur = schedule[d]
    if (!cur) continue
    if (cur.intervals.length) continue
    cur.closed = true
  }
}

function applyIntervals(schedule: Schedule, days: string[], intervals: Array<[string, string]>) {
  for (const d of days) {
    const cur = schedule[d]
    if (!cur) continue
    cur.closed = false
    for (const it of intervals) cur.intervals.push(it)
  }
}

function mergeIntervals(schedule: Schedule) {
  for (const d of dayOrder) {
    const cur = schedule[d]
    if (!cur) continue
    const uniq = new Map<string, [string, string]>()
    for (const [a, b] of cur.intervals) uniq.set(`${a}-${b}`, [a, b])
    cur.intervals = Array.from(uniq.values())
  }
}

function parseOpeningHoursTextEntry(entry: string, schedule: Schedule) {
  const s = String(entry || '').trim()
  if (!s) return
  const lower = s.toLowerCase()
  const off = /(off|closed|fermé|fermee|ferme)\b/.test(lower)

  const m = s.match(/^([A-Za-zÀ-ÿ,\s\u2013-]+)\s+(.+)$/)
  if (!m) return
  const days = parseDayPart(m[1])
  if (!days.length) return

  if (off) {
    applyClosed(schedule, days)
    return
  }

  const intervals = parseIntervals(m[2])
  if (!intervals.length) return
  applyIntervals(schedule, days, intervals)
}

function parseFromJsonLd(nodes: any[]) {
  const schedule = emptySchedule()
  let got = false
  for (const n of nodes) {
    const oh = (n as any).openingHoursSpecification
    if (oh) {
      const list = Array.isArray(oh) ? oh : [oh]
      for (const spec of list) {
        const days = parseDayPart(Array.isArray(spec?.dayOfWeek) ? spec.dayOfWeek.map((x: any) => frDay(String(x))).join(' ') : String(spec?.dayOfWeek || ''))
        const opens = normalizeTime(String(spec?.opens || ''))
        const closes = normalizeTime(String(spec?.closes || ''))
        if (days.length && opens && closes) {
          applyIntervals(schedule, days, [[opens, closes]])
          got = true
        }
      }
    }
    const ohStr = (n as any).openingHours
    if (ohStr) {
      for (const entry of parseOpeningHoursStrings(ohStr)) {
        parseOpeningHoursTextEntry(entry, schedule)
        got = true
      }
    }
  }
  mergeIntervals(schedule)
  return got ? schedule : null
}

function parseFromStrings(strings: string[]) {
  const schedule = emptySchedule()
  let got = false
  for (const entry of strings) {
    parseOpeningHoursTextEntry(entry, schedule)
    got = true
  }
  mergeIntervals(schedule)
  return got ? schedule : null
}

function parseFromText(text: string) {
  const schedule = emptySchedule()
  const t = String(text || '')
  const re = /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b[^.\n]{0,140}?(\d{1,2})\s*h\s*(\d{2})?\s*[-–]\s*(\d{1,2})\s*h\s*(\d{2})?\b/gi
  let m: RegExpExecArray | null
  let got = false
  while ((m = re.exec(t))) {
    const day = frDay(String(m[1] || ''))
    const opens = normalizeTime(`${m[2]}:${m[3] || '00'}`)
    const closes = normalizeTime(`${m[4]}:${m[5] || '00'}`)
    if (day && opens && closes) {
      applyIntervals(schedule, [day], [[opens, closes]])
      got = true
    }
  }
  mergeIntervals(schedule)
  return got ? schedule : null
}

function keyForDay(d: string, schedule: Schedule) {
  const cur = schedule[d]
  if (!cur) return ''
  if (cur.closed && !cur.intervals.length) return 'Fermé'
  if (!cur.intervals.length) return ''
  return cur.intervals.map(([a, b]) => `${a}-${b}`).join(', ')
}

function formatSchedule(schedule: Schedule) {
  const groups: Array<{ from: string; to: string; key: string }> = []
  let current: { from: string; to: string; key: string } | null = null
  for (const d of dayOrder) {
    const k = keyForDay(d, schedule)
    if (!k) continue
    if (!current) {
      current = { from: d, to: d, key: k }
      continue
    }
    const prevIdx = dayIndex(current.to)
    const curIdx = dayIndex(d)
    if (current.key === k && curIdx === prevIdx + 1) {
      current.to = d
      continue
    }
    groups.push(current)
    current = { from: d, to: d, key: k }
  }
  if (current) groups.push(current)

  const label = (g: { from: string; to: string }) => (g.from === g.to ? g.from : `${g.from}–${g.to}`)
  return groups.map((g) => `${label(g)}: ${g.key}`).join('\n')
}

export function extractOpeningHours(input: { html?: string; text?: string }) {
  const html = String(input.html || '')
  const text = String(input.text || '')

  const json = parseJsonLd(html)
  const flat = json.flatMap(flattenJsonLd)
  const scheduleFromJson = parseFromJsonLd(flat)
  if (scheduleFromJson) return cleanInlineHtml(formatSchedule(scheduleFromJson))

  const micro = extractFromMicrodata(html)
  if (micro.length) {
    const scheduleFromMicro = parseFromStrings(micro)
    if (scheduleFromMicro) return cleanInlineHtml(formatSchedule(scheduleFromMicro))
  }

  const fromText = parseFromText(text)
  if (fromText) return cleanInlineHtml(formatSchedule(fromText))

  return ''
}
