"""Build the white paper DOCX from docs/white-paper.md.

Usage: python scripts/build_white_paper.py
"""

from __future__ import annotations

import re
from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs' / 'white-paper.md'
TARGET = ROOT / 'deliverables' / '织序AgentLoom-项目白皮书.docx'

BODY_FONT = '宋体'
HEAD_FONT = '黑体'
CODE_FONT = 'Consolas'
GRAY = RGBColor(0x59, 0x59, 0x59)


def set_run_font(run, name: str, size: float, bold: bool = False, color: RGBColor | None = None, italic: bool = False):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    if color is not None:
        run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    east = rpr.find(qn('w:rFonts'))
    if east is None:
        east = OxmlElement('w:rFonts')
        rpr.append(east)
    east.set(qn('w:eastAsia'), name)
    east.set(qn('w:ascii'), name)
    east.set(qn('w:hAnsi'), name)


def add_inline(paragraph, text: str, size: float = 10.5, color: RGBColor | None = None):
    parts = re.split(r'(\*\*[^*]+\*\*|`[^`]+`)', text)
    for part in parts:
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            run = paragraph.add_run(part[2:-2])
            set_run_font(run, BODY_FONT, size, bold=True, color=color)
        elif part.startswith('`') and part.endswith('`'):
            run = paragraph.add_run(part[1:-1])
            set_run_font(run, CODE_FONT, size - 0.5, color=RGBColor(0xB0, 0x3A, 0x2E))
        else:
            run = paragraph.add_run(part)
            set_run_font(run, BODY_FONT, size, color=color)


def body_paragraph(doc, text: str, indent: bool = True, size: float = 10.5):
    p = doc.add_paragraph()
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(6)
    if indent:
        p.paragraph_format.first_line_indent = Pt(size * 2)
    add_inline(p, text.strip(), size=size)
    return p


def heading(doc, text: str, level: int):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(18 if level == 1 else 12)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.keep_with_next = True
    run = p.add_run(text)
    set_run_font(run, HEAD_FONT, 16 if level == 1 else 13, bold=True, color=RGBColor(0x1A, 0x1A, 0x1A))
    if level == 1:
        pPr = p._p.get_or_add_pPr()
        border = OxmlElement('w:pBdr')
        bottom = OxmlElement('w:bottom')
        bottom.set(qn('w:val'), 'single')
        bottom.set(qn('w:sz'), '6')
        bottom.set(qn('w:space'), '4')
        bottom.set(qn('w:color'), 'BFBFBF')
        border.append(bottom)
        pPr.append(border)


def add_table(doc, rows: list[list[str]]):
    cols = max(len(row) for row in rows)
    table = doc.add_table(rows=0, cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    for index, row in enumerate(rows):
        cells = table.add_row().cells
        for col in range(cols):
            value = row[col] if col < len(row) else ''
            cell = cells[col]
            cell.text = ''
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(2)
            add_inline(p, value, size=9)
            for run in p.runs:
                run.font.bold = index == 0
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_code(doc, block: list[str]):
    for line in block:
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.left_indent = Cm(0.6)
        run = p.add_run(line if line else ' ')
        set_run_font(run, CODE_FONT, 9, color=RGBColor(0x33, 0x33, 0x33))
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_quote(doc, block: list[str]):
    for line in block:
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Cm(0.8)
        p.paragraph_format.space_after = Pt(2)
        add_inline(p, line, size=10, color=GRAY)


def add_page_number(section):
    footer = section.footer
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    instr = OxmlElement('w:instrText')
    instr.set(qn('xml:space'), 'preserve')
    instr.text = 'PAGE'
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run._r.append(fld_begin)
    run._r.append(instr)
    run._r.append(fld_end)
    set_run_font(run, BODY_FONT, 9, color=GRAY)


def main():
    text = SOURCE.read_text(encoding='utf-8')
    lines = text.splitlines()

    doc = Document()
    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(2.54)
    section.bottom_margin = Cm(2.54)
    section.left_margin = Cm(2.8)
    section.right_margin = Cm(2.8)
    add_page_number(section)

    normal = doc.styles['Normal']
    normal.font.name = BODY_FONT
    normal.font.size = Pt(10.5)
    normal.element.rPr.rFonts.set(qn('w:eastAsia'), BODY_FONT)

    i = 0
    title_done = False
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        if stripped == '---':
            i += 1
            continue

        if stripped.startswith('```'):
            block = []
            i += 1
            while i < len(lines) and not lines[i].strip().startswith('```'):
                block.append(lines[i])
                i += 1
            i += 1
            add_code(doc, block)
            continue

        if stripped.startswith('# '):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(120)
            run = p.add_run(stripped[2:])
            set_run_font(run, HEAD_FONT, 26, bold=True)
            title_done = True
            i += 1
            continue

        if stripped.startswith('## ') and title_done and not any(x in stripped for x in ['一、', '二、', '三、', '四、', '五、', '附录', '摘要']):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(6)
            run = p.add_run(stripped[3:])
            set_run_font(run, HEAD_FONT, 14, color=GRAY)
            i += 1
            continue

        if stripped.startswith('## '):
            if stripped[3:].startswith('摘要'):
                doc.add_page_break()
            heading(doc, stripped[3:], 1)
            i += 1
            continue

        if stripped.startswith('### '):
            heading(doc, stripped[4:], 2)
            i += 1
            continue

        if stripped.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                cells = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                if not all(re.fullmatch(r':?-{2,}:?', c or '---') for c in cells):
                    rows.append(cells)
                i += 1
            add_table(doc, rows)
            continue

        if stripped.startswith('> '):
            block = []
            while i < len(lines) and lines[i].strip().startswith('> '):
                block.append(lines[i].strip()[2:])
                i += 1
            add_quote(doc, block)
            continue

        if stripped.startswith('- '):
            while i < len(lines) and lines[i].strip().startswith('- '):
                p = doc.add_paragraph(style='List Bullet')
                p.paragraph_format.line_spacing = 1.5
                p.paragraph_format.space_after = Pt(2)
                add_inline(p, lines[i].strip()[2:])
                i += 1
            continue

        if re.match(r'^\d+\.\s', stripped):
            while i < len(lines) and re.match(r'^\d+\.\s', lines[i].strip()):
                value = re.sub(r'^\d+\.\s', '', lines[i].strip())
                p = doc.add_paragraph(style='List Number')
                p.paragraph_format.line_spacing = 1.5
                p.paragraph_format.space_after = Pt(2)
                add_inline(p, value)
                i += 1
            continue

        paragraph = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt or nxt.startswith(('#', '|', '>', '- ', '```')) or nxt == '---' or re.match(r'^\d+\.\s', nxt):
                break
            paragraph.append(nxt)
            i += 1
        body_paragraph(doc, ''.join(paragraph))

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    doc.save(TARGET)
    print(f'wrote {TARGET} ({TARGET.stat().st_size} bytes)')


if __name__ == '__main__':
    main()
