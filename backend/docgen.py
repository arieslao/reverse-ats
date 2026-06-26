"""DOCX builders for tailored résumé + cover letter (python-docx).

Shared by the local API (download buttons) — produces a .docx as bytes.
"""

from __future__ import annotations

import io
import re


def resume_to_docx(resume: dict, name: str, contact: str) -> bytes:
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt

    doc = Document()
    h = doc.add_paragraph()
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = h.add_run(name or "")
    r.bold = True
    r.font.size = Pt(16)
    if contact:
        c = doc.add_paragraph()
        c.alignment = WD_ALIGN_PARAGRAPH.CENTER
        c.add_run(contact).font.size = Pt(9)
    if resume.get("headline"):
        hl = doc.add_paragraph()
        hl.alignment = WD_ALIGN_PARAGRAPH.CENTER
        rr = hl.add_run(resume["headline"])
        rr.italic = True
        rr.font.size = Pt(11)

    def section(title: str) -> None:
        p = doc.add_paragraph()
        rs = p.add_run(title.upper())
        rs.bold = True
        rs.font.size = Pt(11)

    if resume.get("summary"):
        section("Summary")
        doc.add_paragraph(resume["summary"])
    if resume.get("skills"):
        section("Skills")
        doc.add_paragraph("  •  ".join(resume["skills"]))
    if resume.get("experience"):
        section("Experience")
        for e in resume["experience"]:
            p = doc.add_paragraph()
            rb = p.add_run(e.get("title", ""))
            rb.bold = True
            if e.get("company"):
                p.add_run(f"  —  {e['company']}")
            if e.get("dates"):
                p.add_run(f"   ({e['dates']})").italic = True
            for b in e.get("bullets") or []:
                doc.add_paragraph(b, style="List Bullet")
    if resume.get("education"):
        section("Education")
        for ed in resume["education"]:
            doc.add_paragraph(ed)
    if resume.get("certifications"):
        section("Certifications")
        doc.add_paragraph("  •  ".join(resume["certifications"]))

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def cover_to_docx(text: str, name: str, contact: str, company: str) -> bytes:
    from docx import Document
    from docx.shared import Pt

    doc = Document()
    doc.add_paragraph().add_run(name or "").bold = True
    if contact:
        doc.add_paragraph(contact).runs[0].font.size = Pt(9)
    if company:
        doc.add_paragraph(company)
    doc.add_paragraph("")
    for para in re.split(r"\n{2,}", (text or "").strip()):
        doc.add_paragraph(para.strip())
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def slug(s: str) -> str:
    return (re.sub(r"_+", "_", re.sub(r"[^a-z0-9]+", "_", (s or "").lower())).strip("_") or "doc")[:50]
