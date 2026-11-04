from pathlib import Path
import re
from docx import Document
from docx.shared import Cm, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "docs" / "white-paper.md"
OUT = ROOT / "deliverables"
OUT.mkdir(exist_ok=True)
SHOTS = ROOT / ".screens" / "crops"

INK = RGBColor(0x1B, 0x1B, 0x19)
MUTED = RGBColor(0x6F, 0x68, 0x5B)
ACCENT = RGBColor(0xD4, 0x55, 0x2D)
LINE = "DED5C6"
DARK = "171A18"
CARD = "FFFDF8"

FONT_SANS = "Noto Sans SC"
FONT_SERIF = "Noto Serif SC"
FONT_MONO = "Consolas"


def set_run_font(run, font=FONT_SANS, size=10.5, color=INK, bold=False, italic=False):
    run.font.name = font
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.italic = italic
    run.font.color.rgb = color
    rPr = run._element.get_or_add_rPr()
    rFonts = rPr.find(qn('w:rFonts'))
    if rFonts is None:
        rFonts = OxmlElement('w:rFonts')
        rPr.append(rFonts)
    rFonts.set(qn('w:eastAsia'), font)
    rFonts.set(qn('w:ascii'), font)
    rFonts.set(qn('w:hAnsi'), font)


def shade(cell, color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:fill'), color)
    shd.set(qn('w:val'), 'clear')
    tcPr.append(shd)


def cell_margins(cell, top=80, bottom=80, left=120, right=120):
    tcPr = cell._tc.get_or_add_tcPr()
    mar = OxmlElement('w:tcMar')
    for side, value in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:w'), str(value))
        el.set(qn('w:type'), 'dxa')
        mar.append(el)
    tcPr.append(mar)


def paragraph_border(p, color=LINE, size=6, side='bottom'):
    pPr = p._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    el = OxmlElement(f'w:{side}')
    el.set(qn('w:val'), 'single')
    el.set(qn('w:sz'), str(size))
    el.set(qn('w:space'), '6')
    el.set(qn('w:color'), color)
    pBdr.append(el)
    pPr.append(pBdr)


def add_field(paragraph, instr):
    run = paragraph.add_run()
    fld_begin = OxmlElement('w:fldChar')
    fld_begin.set(qn('w:fldCharType'), 'begin')
    run._r.append(fld_begin)
    run2 = paragraph.add_run()
    instr_el = OxmlElement('w:instrText')
    instr_el.set(qn('xml:space'), 'preserve')
    instr_el.text = instr
    run2._r.append(instr_el)
    run3 = paragraph.add_run()
    fld_end = OxmlElement('w:fldChar')
    fld_end.set(qn('w:fldCharType'), 'end')
    run3._r.append(fld_end)
    for r in (run, run2, run3):
        set_run_font(r, FONT_SANS, 8.5, MUTED)


def add_header_footer(section):
    header = section.header
    p = header.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    r = p.add_run("织序 AgentLoom  ·  项目白皮书")
    set_run_font(r, FONT_SANS, 8, MUTED)
    paragraph_border(p, LINE, 4, 'bottom')

    footer = section.footer
    fp = footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r1 = fp.add_run("第 ")
    set_run_font(r1, FONT_SANS, 8.5, MUTED)
    add_field(fp, "PAGE")
    r2 = fp.add_run(" 页")
    set_run_font(r2, FONT_SANS, 8.5, MUTED)


def add_heading(doc, text, level=1):
    p = doc.add_paragraph()
    p.style = doc.styles['Heading 1'] if level == 1 else doc.styles['Heading 2']
    p.paragraph_format.space_before = Pt(18 if level == 1 else 12)
    p.paragraph_format.space_after = Pt(7 if level == 1 else 5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    set_run_font(r, FONT_SERIF, 18 if level == 1 else 13, INK, bold=(level == 2))
    if level == 1:
        paragraph_border(p, "D4552D", 10, 'bottom')
    return p


def add_body(doc, text, first=False):
    p = doc.add_paragraph()
    p.paragraph_format.first_line_indent = Cm(0.74) if not first else Cm(0)
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(4)
    add_inline(p, text)
    return p


def add_inline(p, text, size=10.5, color=INK):
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    parts = re.split(r'(\*\*|`)', text)
    bold = False
    code = False
    for part in parts:
        if part == '**':
            bold = not bold
            continue
        if part == '`':
            code = not code
            continue
        if not part:
            continue
        r = p.add_run(part)
        set_run_font(r, FONT_MONO if code else FONT_SANS, size - 0.5 if code else size, color, bold=bold)
        if code:
            r.font.color.rgb = RGBColor(0x2F, 0x6F, 0x6A)


def add_bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.line_spacing = 1.45
    p.paragraph_format.space_after = Pt(2)
    add_inline(p, text)


def add_numbered(doc, number, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.9)
    p.paragraph_format.first_line_indent = Cm(-0.45)
    p.paragraph_format.line_spacing = 1.5
    p.paragraph_format.space_after = Pt(3)
    r = p.add_run(f"{number}. ")
    set_run_font(r, FONT_SANS, 10.5, ACCENT, bold=True)
    add_inline(p, text)


def add_quote(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.left_indent = Cm(0.55)
    p.paragraph_format.right_indent = Cm(0.4)
    p.paragraph_format.space_before = Pt(6)
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing = 1.45
    paragraph_border(p, "D4552D", 12, 'left')
    add_inline(p, text, 9.5, MUTED)


def add_table(doc, rows):
    if len(rows) < 2:
        return
    cols = max(len(row) for row in rows)
    table = doc.add_table(rows=len(rows), cols=cols)
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = True
    for i, row in enumerate(rows):
        for j in range(cols):
            cell = table.cell(i, j)
            cell_margins(cell)
            text = row[j] if j < len(row) else ''
            cell.text = ''
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.2
            add_inline(p, text, 8.5, RGBColor(0xFF, 0xFF, 0xFF) if i == 0 else INK)
            if i == 0:
                shade(cell, DARK)
                for run in p.runs:
                    run.font.bold = True
                    run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            elif i % 2 == 0:
                shade(cell, "FAF6EE")
    # spacing after table
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


def add_picture(doc, path, width_cm=15.5, caption=None):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after = Pt(4)
    run = p.add_run()
    run.add_picture(str(path), width=Cm(width_cm))
    if caption:
        cp = doc.add_paragraph()
        cp.alignment = WD_ALIGN_PARAGRAPH.CENTER
        cp.paragraph_format.space_after = Pt(10)
        r = cp.add_run(caption)
        set_run_font(r, FONT_SANS, 8.5, MUTED, italic=False)


# ---------- build ----------
doc = Document()
section = doc.sections[0]
section.page_width = Cm(21.0)
section.page_height = Cm(29.7)
section.top_margin = Cm(2.1)
section.bottom_margin = Cm(2.0)
section.left_margin = Cm(2.2)
section.right_margin = Cm(2.2)

styles = doc.styles
normal = styles['Normal']
normal.font.name = FONT_SANS
normal.font.size = Pt(10.5)
normal.element.rPr.rFonts.set(qn('w:eastAsia'), FONT_SANS)
for style_name in ('List Bullet', 'List Number'):
    if style_name in styles:
        st = styles[style_name]
        st.font.name = FONT_SANS
        st.font.size = Pt(10.5)
        st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT_SANS)

add_header_footer(section)

# Cover
p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(26)
r = p.add_run("2026 第五届“未来杯”创新大赛（校赛）")
set_run_font(r, FONT_SANS, 9.5, ACCENT, bold=True)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(18)
r = p.add_run("织序 AgentLoom")
set_run_font(r, FONT_SERIF, 36, INK)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(4)
r = p.add_run("可验证的多 Agent 团队编排与调度平台")
set_run_font(r, FONT_SERIF, 17, MUTED)

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(12)
r = p.add_run("项目白皮书  ·  赛题一（Agent 编排创新应用）")
set_run_font(r, FONT_SANS, 11, ACCENT, bold=True)
paragraph_border(p, "D4552D", 14, 'bottom')

p = doc.add_paragraph()
p.paragraph_format.space_before = Pt(18)
p.paragraph_format.line_spacing = 1.6
r = p.add_run(
    "多 Agent 系统正在从演示走向生产。织序把“团队”拆成一张可编排的图，把“思考”做成可挂载的节点能力插件，把“结果”交给核查器与 Self-Loop。"
)
set_run_font(r, FONT_SANS, 11, MUTED)

# dark statement block
table = doc.add_table(rows=1, cols=1)
table.alignment = WD_TABLE_ALIGNMENT.CENTER
cell = table.cell(0, 0)
shade(cell, DARK)
cell_margins(cell, 260, 260, 260, 260)
cell.text = ''
p = cell.paragraphs[0]
r = p.add_run("Agent 是主机，插件是卡，画布是工作台。")
set_run_font(r, FONT_SERIF, 15, RGBColor(0xFF, 0xFF, 0xFF), bold=True)

# metadata
doc.add_paragraph().paragraph_format.space_after = Pt(20)
meta = doc.add_table(rows=4, cols=2)
meta.style = 'Table Grid'
meta.autofit = False
for row in meta.rows:
    row.cells[0].width = Cm(3.4)
    row.cells[1].width = Cm(11.8)
items = [
    ("参赛赛道", "赛题一：Agent 编排创新应用"),
    ("项目名称", "织序 AgentLoom：可验证的多 Agent 团队编排与调度平台"),
    ("团队名称", "【待填：队伍名称】"),
    ("提交日期", "2026 年 11 月"),
]
for i, (k, v) in enumerate(items):
    for j, val in enumerate((k, v)):
        cell = meta.cell(i, j)
        cell.text = ''
        cell_margins(cell, 90, 90, 130, 130)
        p = cell.paragraphs[0]
        r = p.add_run(val)
        set_run_font(r, FONT_SANS, 9.5, MUTED if j == 0 else INK, bold=(j == 0))
        if j == 0:
            shade(cell, "F8F0E5")

doc.add_page_break()

# TOC
p = doc.add_paragraph()
r = p.add_run("目录")
set_run_font(r, FONT_SERIF, 22, INK)
paragraph_border(p, "D4552D", 8, 'bottom')
toc = [
    "摘要",
    "一、项目概述",
    "二、解决方案",
    "三、应用成效",
    "四、商业模式",
    "五、团队介绍",
    "六、发展规划",
    "附录 A：演示入口",
    "附录 B：关键指标口径",
    "附录 C：风险与应对",
]
for item in toc:
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.4
    r = p.add_run(item)
    set_run_font(r, FONT_SANS, 10.5, INK if item.startswith(('一', '二', '三', '四', '五', '六')) else MUTED)

doc.add_page_break()

# Parse markdown from "## 摘要"
text = MD.read_text(encoding='utf-8')
lines = text.splitlines()
start = next(i for i, line in enumerate(lines) if line.strip() == '## 摘要')
i = start
while i < len(lines):
    line = lines[i].rstrip()
    if not line.strip():
        i += 1
        continue
    if line.startswith('```'):
        # skip code block; the surrounding prose carries the idea
        i += 1
        while i < len(lines) and not lines[i].startswith('```'):
            i += 1
        i += 1
        continue
    if line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            raw = lines[i].strip().strip('|')
            cells = [c.strip() for c in raw.split('|')]
            if not all(re.fullmatch(r':?-{2,}:?', c) for c in cells):
                rows.append(cells)
            i += 1
        add_table(doc, rows)
        continue
    if line.startswith('### '):
        title = line[4:].strip()
        add_heading(doc, title, 2)
        if title.startswith('2.7'):
            add_picture(doc, SHOTS / "run_graph.png", 15.4, "图 1  运行控制台：实时图谱、节点轨迹与调度事件同屏")
        if title.startswith('3.2'):
            add_picture(doc, SHOTS / "verify_body.png", 15.4, "图 2  核查与 Self-Loop：第一轮 85%，第二轮 100%")
        i += 1
        continue
    if line.startswith('## '):
        title = line[3:].strip()
        heading = add_heading(doc, title, 1)
        if title != '摘要' and i != start:
            heading.paragraph_format.page_break_before = True
        i += 1
        continue
    if line.startswith('- '):
        add_bullet(doc, line[2:].strip())
        i += 1
        continue
    numbered = re.match(r'^(\d+)\.\s+(.*)$', line.strip())
    if numbered:
        add_numbered(doc, numbered.group(1), numbered.group(2))
        i += 1
        continue
    if line.startswith('> '):
        add_quote(doc, line[2:].strip())
        i += 1
        continue
    if line.strip() == '---':
        doc.add_page_break()
        i += 1
        continue
    # paragraph: gather consecutive plain lines
    buf = [line.strip()]
    i += 1
    while i < len(lines):
        nxt = lines[i].rstrip()
        if not nxt.strip() or nxt.startswith(('#', '|', '- ', '> ', '```', '---')) or re.match(r'^\d+\.\s', nxt.strip()):
            break
        buf.append(nxt.strip())
        i += 1
    add_body(doc, ' '.join(buf), first=(len(buf) == 1 and len(buf[0]) < 40))

doc.save(OUT / "织序AgentLoom-项目白皮书.docx")
print(f"saved: {OUT / '织序AgentLoom-项目白皮书.docx'}")
