// Client-side document parsing for the inventory importers.
//
// Résumé files (PDF/DOCX/TXT) and the LinkedIn data-export ZIP are parsed in
// the BROWSER, then only the extracted text / structured rows are sent to the
// Worker. This avoids shipping PDF/zip parsers into the Worker bundle and keeps
// the raw files on the user's machine.

// The heavy parsers (pdfjs / mammoth / jszip) are dynamically imported inside
// each function so they're fetched only when the user actually uploads a file —
// just viewing the inventory page stays light.

/** Extract plain text from a résumé file (PDF, DOCX, or TXT/MD). */
export async function parseResumeFile(file: File): Promise<string> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) return parsePdf(await file.arrayBuffer())
  if (name.endsWith('.docx')) return parseDocx(await file.arrayBuffer())
  if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) {
    return file.text()
  }
  throw new Error('Unsupported file. Upload a PDF, DOCX, or TXT résumé.')
}

async function parsePdf(buf: ArrayBuffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist')
  const { default: pdfWorkerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const text = content.items
      .map((it) => ('str' in it ? (it as { str: string }).str : ''))
      .join(' ')
    pages.push(text)
  }
  return pages.join('\n\n').replace(/[ \t]+/g, ' ').trim()
}

async function parseDocx(buf: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import('mammoth/mammoth.browser')
  const result = await mammoth.extractRawText({ arrayBuffer: buf })
  return (result.value || '').trim()
}

// ─── LinkedIn data-export ZIP ───────────────────────────────────────────────

export interface LinkedinExport {
  profile: { summary?: string; headline?: string } | null
  positions: Record<string, string>[]
  skills: string[]
  education: Record<string, string>[]
  certifications: Record<string, string>[]
}

/**
 * Parse the official LinkedIn "Get a copy of your data" archive. We match the
 * relevant CSVs by name (LinkedIn occasionally tweaks casing/paths) and map
 * each to row objects keyed by the CSV header — exactly what the Worker's
 * /api/inventory/linkedin-import endpoint expects.
 */
export async function parseLinkedinZip(file: File): Promise<LinkedinExport> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const find = (needle: string) =>
    Object.values(zip.files).find(
      (f) => !f.dir && f.name.toLowerCase().split('/').pop()?.startsWith(needle.toLowerCase()),
    )

  const rowsOf = async (needle: string): Promise<Record<string, string>[]> => {
    const f = find(needle)
    if (!f) return []
    return parseCsv(await f.async('string'))
  }

  const profileRows = await rowsOf('profile.csv')
  const p = profileRows[0] || {}
  const profile = profileRows.length
    ? { summary: p['Summary'] || '', headline: p['Headline'] || '' }
    : null

  const skillRows = await rowsOf('skills.csv')
  const skills = skillRows.map((r) => r['Name'] || Object.values(r)[0]).filter(Boolean)

  return {
    profile,
    positions: await rowsOf('positions.csv'),
    skills,
    education: await rowsOf('education.csv'),
    certifications: await rowsOf('certifications.csv'),
  }
}

// ─── minimal RFC-4180 CSV parser (handles quotes, embedded commas/newlines) ──

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  // Strip a UTF-8 BOM if present.
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else {
      field += c
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }

  if (rows.length < 2) return []
  const header = rows[0].map((h) => h.trim())
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    header.forEach((h, idx) => {
      obj[h] = (r[idx] ?? '').trim()
    })
    return obj
  })
}
