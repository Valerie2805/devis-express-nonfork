import { extractOpeningHours } from '../siteAudit/openingHours.js'

const html = `
<html><head>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "openingHoursSpecification": [
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "09:00", "closes": "12:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "14:00", "closes": "18:00" },
    { "@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "10:00", "closes": "14:00" }
  ],
  "openingHours": ["Su off"]
}
</script>
</head><body>Bonjour</body></html>
`

const out = extractOpeningHours({ html, text: '' })
if (!out.includes('Lun–Ven') || !out.includes('09:00-12:00') || !out.includes('14:00-18:00') || !out.includes('Sam') || !out.includes('Dim') || !out.includes('Fermé')) {
  throw new Error(`opening_hours parsing failed: ${out}`)
}

console.log('ok')
