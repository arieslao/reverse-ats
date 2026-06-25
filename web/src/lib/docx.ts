// Client-side .docx generation. The Worker returns the tailored résumé as
// structured JSON (and the cover letter as text); the browser turns it into a
// Word document and triggers a download. Keeps document generation off the
// Worker bundle entirely. The `docx` library is dynamically imported so it only
// loads when the user actually downloads.

import type { TailoredResume } from './api'

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const safe = (s: string) => s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document'

export async function downloadResumeDocx(
  resume: TailoredResume,
  meta: { name?: string; contact?: string; jobTitle?: string; company?: string },
) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx')

  const children: InstanceType<typeof Paragraph>[] = []

  if (meta.name) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.name, bold: true, size: 32 })] }))
  }
  if (meta.contact) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: meta.contact, size: 18 })] }))
  }
  if (resume.headline) {
    children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: resume.headline, italics: true, size: 22 })] }))
  }

  const section = (title: string) =>
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22 })],
    })

  if (resume.summary) {
    children.push(section('Summary'))
    children.push(new Paragraph({ children: [new TextRun({ text: resume.summary, size: 20 })] }))
  }

  if (resume.skills?.length) {
    children.push(section('Skills'))
    children.push(new Paragraph({ children: [new TextRun({ text: resume.skills.join('  •  '), size: 20 })] }))
  }

  if (resume.experience?.length) {
    children.push(section('Experience'))
    for (const e of resume.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 120 },
          children: [
            new TextRun({ text: e.title, bold: true, size: 21 }),
            new TextRun({ text: e.company ? `  —  ${e.company}` : '', size: 21 }),
            ...(e.dates ? [new TextRun({ text: `   (${e.dates})`, italics: true, size: 18 })] : []),
          ],
        }),
      )
      for (const b of e.bullets || []) {
        children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b, size: 20 })] }))
      }
    }
  }

  if (resume.education?.length) {
    children.push(section('Education'))
    for (const ed of resume.education) {
      children.push(new Paragraph({ children: [new TextRun({ text: ed, size: 20 })] }))
    }
  }

  if (resume.certifications?.length) {
    children.push(section('Certifications'))
    children.push(new Paragraph({ children: [new TextRun({ text: resume.certifications.join('  •  '), size: 20 })] }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `resume_${safe(meta.company || '')}_${safe(meta.jobTitle || '')}.docx`)
}

export async function downloadCoverLetterDocx(
  text: string,
  meta: { name?: string; contact?: string; jobTitle?: string; company?: string; date?: string },
) {
  const { Document, Packer, Paragraph, TextRun } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = []

  if (meta.name) children.push(new Paragraph({ children: [new TextRun({ text: meta.name, bold: true, size: 24 })] }))
  if (meta.contact) children.push(new Paragraph({ children: [new TextRun({ text: meta.contact, size: 18 })] }))
  if (meta.date) children.push(new Paragraph({ spacing: { before: 120, after: 120 }, children: [new TextRun({ text: meta.date, size: 20 })] }))
  if (meta.company) children.push(new Paragraph({ children: [new TextRun({ text: meta.company, size: 20 })] }))

  // Blank line before the body.
  children.push(new Paragraph({ children: [new TextRun({ text: '', size: 20 })] }))

  for (const para of text.split(/\n{2,}/)) {
    children.push(new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: para.trim(), size: 22 })] }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, `cover_letter_${safe(meta.company || '')}_${safe(meta.jobTitle || '')}.docx`)
}
