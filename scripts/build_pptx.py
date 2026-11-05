from pathlib import Path
from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
SHOTS = ROOT / ".screens" / "crops"
OUT = ROOT / "deliverables"
OUT.mkdir(exist_ok=True)

# ---------- palette ----------
PAPER = RGBColor(0xF3, 0xEF, 0xE7)
CARD = RGBColor(0xFF, 0xFD, 0xF8)
INK = RGBColor(0x1B, 0x1B, 0x19)
MUTED = RGBColor(0x6F, 0x68, 0x5B)
MUTED2 = RGBColor(0x9A, 0x91, 0x83)
LINE = RGBColor(0xDE, 0xD5, 0xC6)
ACCENT = RGBColor(0xD4, 0x55, 0x2D)
ACCENT_SOFT = RGBColor(0xF6, 0xDE, 0xD4)
TEAL = RGBColor(0x2F, 0x6F, 0x6A)
GREEN = RGBColor(0x3E, 0x6B, 0x48)
AMBER = RGBColor(0x8A, 0x6A, 0x3B)
PURPLE = RGBColor(0x5B, 0x5F, 0x9E)
RED = RGBColor(0xB2, 0x3A, 0x48)
DARK = RGBColor(0x17, 0x1A, 0x18)
DARK2 = RGBColor(0x22, 0x27, 0x23)
DARK3 = RGBColor(0x2D, 0x34, 0x2E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
SAND = RGBColor(0xEC, 0xE5, 0xD9)

FONT_SANS = "Noto Sans SC"
FONT_SERIF = "Noto Serif SC"
FONT_MONO = "Consolas"

W, H = 13.333, 7.5


def add_bg(slide, color=PAPER):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(W), Inches(H))
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
    shape.shadow.inherit = False


def tx(slide, x, y, w, h, text, size=14, color=INK, font=FONT_SANS,
       bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
       spacing=1.15, italic=False, margins=(0, 0, 0, 0)):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = Inches(margins[0])
    tf.margin_right = Inches(margins[1])
    tf.margin_top = Inches(margins[2])
    tf.margin_bottom = Inches(margins[3])
    tf.vertical_anchor = anchor
    lines = str(text).split("\n")
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        p.space_after = Pt(0)
        p.space_before = Pt(0)
        r = p.add_run()
        r.text = line
        r.font.name = font
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.color.rgb = color
    return box


def rect(slide, x, y, w, h, fill=CARD, line=None, radius=0.08, line_width=0.8):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    shape.adjustments[0] = radius
    if fill is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(line_width)
    shape.shadow.inherit = False
    return shape


def line(slide, x1, y1, x2, y2, color=LINE, width=1.0, arrow=False, dash=None):
    conn = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    conn.line.color.rgb = color
    conn.line.width = Pt(width)
    if dash:
        conn.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    if arrow:
        ln = conn.line._get_or_add_ln()
        tail = etree.SubElement(ln, qn('a:tailEnd'))
        tail.set('type', 'triangle')
        tail.set('w', 'sm')
        tail.set('len', 'sm')
    return conn


def pill(slide, x, y, w, h, text, fill=ACCENT_SOFT, color=ACCENT, size=9, bold=True):
    rect(slide, x, y, w, h, fill=fill, line=None, radius=0.5)
    tx(slide, x, y + 0.02, w, h - 0.04, text, size=size, color=color, bold=bold,
       align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)


def add_pic_fill(slide, path, x, y, w, h, border=True):
    path = Path(path)
    iw, ih = Image.open(path).size
    target = w / h
    image = iw / ih
    pic = slide.shapes.add_picture(str(path), Inches(x), Inches(y), Inches(w), Inches(h))
    if image > target:
        crop = (1 - target / image) / 2
        pic.crop_left = crop
        pic.crop_right = crop
    elif image < target:
        crop = (1 - image / target) / 2
        pic.crop_top = crop
        pic.crop_bottom = crop
    if border:
        b = rect(slide, x, y, w, h, fill=None, line=LINE, radius=0.03, line_width=0.8)
        b.fill.background()
    return pic


def footer(slide, idx, dark=False):
    color = RGBColor(0x8F, 0x8A, 0x80) if not dark else RGBColor(0x8F, 0x8A, 0x80)
    tx(slide, 0.7, 7.12, 5.0, 0.22, "织序 AgentLoom  ·  赛题一  ·  Agent 编排创新应用", 8, color)
    tx(slide, 11.86, 7.12, 0.75, 0.22, f"{idx:02d}", 8, color, align=PP_ALIGN.RIGHT)


def section(slide, label, title, subtitle=None, dark=False):
    tx(slide, 0.72, 0.48, 7.5, 0.25, label.upper(), 9.5, ACCENT, bold=True)
    tx(slide, 0.7, 0.74, 11.9, 0.62, title, 27, WHITE if dark else INK, font=FONT_SERIF, spacing=1.05)
    if subtitle:
        tx(slide, 0.72, 1.38, 11.7, 0.35, subtitle, 10.5, RGBColor(0xB8, 0xB3, 0xA9) if dark else MUTED)


def small_node(slide, x, y, w, h, label, color, active=False, sub=None):
    rect(slide, x, y, w, h, fill=CARD, line=color if active else LINE, radius=0.12, line_width=1.1 if active else 0.7)
    rect(slide, x, y, 0.045, h, fill=color, line=None, radius=0.5)
    tx(slide, x + 0.12, y + 0.08, w - 0.18, 0.24, label, 8.5, INK, bold=True)
    if sub:
        tx(slide, x + 0.12, y + 0.30, w - 0.18, 0.2, sub, 6.5, MUTED)


prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)
blank = prs.slide_layouts[6]


# =========================================================
# 01 Cover
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
# right dark panel
panel = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(8.05), 0, Inches(5.283), Inches(H))
panel.fill.solid(); panel.fill.fore_color.rgb = DARK; panel.line.fill.background(); panel.shadow.inherit = False
# faint vertical grid
for gx in [8.55, 9.55, 10.55, 11.55, 12.55]:
    line(s, gx, 0.4, gx, 7.1, RGBColor(0x2A, 0x30, 0x2B), 0.5)
for gy in [0.9, 1.9, 2.9, 3.9, 4.9, 5.9, 6.9]:
    line(s, 8.3, gy, 13.1, gy, RGBColor(0x2A, 0x30, 0x2B), 0.5)

# brand mark
for i, (dx, dy, c) in enumerate([(0, 0, ACCENT), (0.32, 0, DARK3), (0, 0.32, DARK3), (0.32, 0.32, ACCENT)]):
    r = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(0.78 + dx), Inches(0.72 + dy), Inches(0.27), Inches(0.27))
    r.fill.solid(); r.fill.fore_color.rgb = c; r.line.fill.background(); r.shadow.inherit = False
tx(s, 1.45, 0.7, 2.4, 0.32, "织序", 17, INK, font=FONT_SERIF, bold=True)
tx(s, 1.45, 1.02, 2.4, 0.22, "AGENTLOOM", 7.5, MUTED, bold=True)

tx(s, 0.78, 1.95, 6.9, 0.28, "2026 第五届“未来杯”  ·  赛题一  ·  Agent 编排创新应用", 9.5, ACCENT, bold=True)
tx(s, 0.74, 2.35, 6.9, 0.9, "织序", 54, INK, font=FONT_SERIF, spacing=0.98)
tx(s, 0.74, 3.18, 6.9, 0.72, "AgentLoom", 38, INK, font=FONT_SERIF, spacing=0.98)
tx(s, 0.78, 4.12, 6.5, 0.75, "可验证的多 Agent 团队\n编排与调度平台", 18, MUTED, spacing=1.35)

line(s, 0.78, 5.2, 2.6, 5.2, ACCENT, 2.0)
tx(s, 0.78, 5.42, 6.4, 0.45, "Agent 是主机，插件是卡，画布是工作台。", 12.5, INK, bold=True)
tx(s, 0.78, 6.55, 6.2, 0.3, "项目白皮书 / 演示版  ·  2026.11", 9.5, MUTED2)

# mini pipeline on dark panel
left = [
    ("研究规划", ACCENT, 2.2),
    ("市场研究", TEAL, 2.85),
    ("产业链", AMBER, 3.5),
    ("竞争情报", PURPLE, 4.15),
]
for label, color, y in left:
    rect(s, 9.25, y, 1.45, 0.38, fill=DARK2, line=RGBColor(0x3A, 0x42, 0x3B), radius=0.18)
    rect(s, 9.38, y + 0.14, 0.1, 0.1, fill=color, line=None, radius=0.5)
    tx(s, 9.55, y + 0.08, 1.05, 0.22, label, 7.5, RGBColor(0xE8, 0xE2, 0xD8), bold=True)
    line(s, 10.7, y + 0.19, 11.15, 3.34, RGBColor(0x4A, 0x52, 0x4A), 0.7)
right = [("首席分析", ACCENT, 3.15), ("事实核查", GREEN, 3.8)]
for label, color, y in right:
    rect(s, 11.15, y, 1.45, 0.38, fill=DARK2, line=RGBColor(0x3A, 0x42, 0x3B), radius=0.18)
    rect(s, 11.28, y + 0.14, 0.1, 0.1, fill=color, line=None, radius=0.5)
    tx(s, 11.45, y + 0.08, 1.05, 0.22, label, 7.5, RGBColor(0xE8, 0xE2, 0xD8), bold=True)
line(s, 11.87, 3.53, 11.87, 3.8, RGBColor(0x4A, 0x52, 0x4A), 0.8, arrow=True)
tx(s, 10.9, 2.9, 0.6, 0.22, "3 → 1", 6.5, ACCENT, font=FONT_MONO, bold=True)

# stamp
c = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(11.55), Inches(5.72), Inches(1.15), Inches(1.15))
c.fill.solid(); c.fill.fore_color.rgb = ACCENT; c.line.color.rgb = PAPER; c.line.width = Pt(3); c.shadow.inherit = False
tx(s, 11.62, 5.86, 1.0, 0.35, "8", 26, WHITE, font=FONT_SERIF, bold=True, align=PP_ALIGN.CENTER)
tx(s, 11.62, 6.22, 1.0, 0.22, "ROLES", 7, WHITE, bold=True, align=PP_ALIGN.CENTER)
tx(s, 11.62, 6.40, 1.0, 0.18, "ONE FLOW", 6, WHITE, align=PP_ALIGN.CENTER)


# =========================================================
# 02 Three gaps
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "THE PROBLEM", "多 Agent 的三道坎", "演示能跑，不等于能交付。真正的门槛在控制、解释与验收。")
cards = [
    ("01", "团队写死", "角色、工具、流程硬编码。\n加一个风险审查员要改代码，\n换一个行业要重做一套系统。", ACCENT),
    ("02", "思考黑盒", "“多想几步”只是一句提示词。\n不知道它想了哪些角度，\n也不知道为什么选了这个结论。", AMBER),
    ("03", "结果不可验", "Agent 说“报告完成了”，\n但数字是否有依据、\n引用是否真的支持结论？", PURPLE),
]
for i, (num, head, body, color) in enumerate(cards):
    x = 0.72 + i * 4.05
    rect(s, x, 1.95, 3.72, 3.55, fill=CARD, line=LINE, radius=0.06)
    tx(s, x + 0.28, 2.14, 1.0, 0.4, num, 24, color, font=FONT_SERIF, bold=True)
    tx(s, x + 0.28, 2.72, 3.1, 0.4, head, 19, INK, font=FONT_SERIF, bold=True)
    tx(s, x + 0.28, 3.28, 3.15, 1.75, body, 11.5, MUTED, spacing=1.65)
    line(s, x + 0.28, 5.03, x + 1.05, 5.03, color, 2.0)
rect(s, 0.72, 5.92, 11.9, 0.62, fill=DARK, line=None, radius=0.12)
tx(s, 1.0, 6.04, 11.3, 0.35, "门槛不在“能不能跑”，而在“能不能被控制、解释、验收”。", 13, WHITE, font=FONT_SERIF, bold=True)
footer(s, 2)


# =========================================================
# 03 Positioning
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "THE ANSWER", "我们的答案：把认知做成插件", "不是再做一个 Agent，而是给 Agent 加一层可编排的“外脑”。")
tx(s, 0.74, 2.05, 5.6, 1.8, "Agent 是主机，\n插件是卡。", 36, INK, font=FONT_SERIF, spacing=1.25)
line(s, 0.76, 4.05, 2.85, 4.05, ACCENT, 2.2)
tx(s, 0.76, 4.28, 5.3, 0.9, "画布是工作台：\n团队、思考、验证，都在同一张图上发生。", 12, MUTED, spacing=1.55)

layers = [
    ("团队层", "8 个角色组成 DAG，支持并行、依赖、回环。", TEAL),
    ("认知层", "节点挂载能力插件，改变“这个节点怎么想”。", ACCENT),
    ("验证层", "核查器对齐结论与证据，失败驱动回写。", GREEN),
]
for i, (head, body, color) in enumerate(layers):
    y = 1.95 + i * 1.52
    rect(s, 6.55, y, 5.95, 1.24, fill=CARD, line=LINE, radius=0.06)
    rect(s, 6.55, y, 0.07, 1.24, fill=color, line=None, radius=0.5)
    tx(s, 6.82, y + 0.18, 1.2, 0.28, head, 12, color, bold=True)
    tx(s, 8.0, y + 0.17, 4.25, 0.75, body, 10.5, MUTED, spacing=1.4)

rect(s, 6.55, 6.42, 5.95, 0.45, fill=ACCENT_SOFT, line=None, radius=0.15)
tx(s, 6.75, 6.51, 5.55, 0.25, "插件管思考方式，Agent 管领域知识。", 10.5, ACCENT, bold=True)
footer(s, 3)


# =========================================================
# 04 Product architecture
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "PRODUCT", "产品全景：一条可运行的流水线", "从知识入库到报告交付，所有环节在一个工作台里闭环。")
bands = [
    ("01  控制台", "总览  /  知识库  /  团队  /  画布  /  运行  /  证据账本  /  评测", CARD, LINE, INK),
    ("02  API", "Fastify  ·  REST  ·  SSE 实时事件  ·  Markdown 报告导出", SAND, LINE, INK),
    ("03  编排运行时", "调度器  ·  DAG 引擎  ·  Self-Loop  ·  核查器  ·  事件总线", DARK, None, WHITE),
    ("04  数据与模型", "SQLite  ·  中文 BM25  ·  Mock  /  DeepSeek 双模式", CARD, LINE, INK),
]
for i, (head, body, fill, border, color) in enumerate(bands):
    y = 1.82 + i * 1.12
    rect(s, 0.72, y, 8.35, 0.9, fill=fill, line=border, radius=0.05)
    tx(s, 0.98, y + 0.12, 8.0, 0.26, head, 10.5, color if color == WHITE else ACCENT, bold=True)
    tx(s, 0.98, y + 0.4, 7.9, 0.3, body, 9.5, RGBColor(0xC9, 0xC4, 0xBA) if color == WHITE else MUTED)

# arrows between bands
for y in [2.75, 3.87, 4.99]:
    line(s, 4.9, y - 0.02, 4.9, y + 0.1, MUTED2, 0.9, arrow=True)

# side screenshot
add_pic_fill(s, SHOTS / "workflow.png", 9.35, 1.8, 3.35, 2.0)
tx(s, 9.35, 4.0, 3.35, 0.28, "运行控制台", 10, INK, bold=True)
tx(s, 9.35, 4.32, 3.35, 0.6, "实时图谱、节点轨迹、调度事件同屏。", 9, MUTED, spacing=1.4)
pill(s, 9.35, 5.2, 1.55, 0.32, "Mock 演示", ACCENT_SOFT, ACCENT, 8)
pill(s, 11.0, 5.2, 1.55, 0.32, "Live 可切换", RGBColor(0xE6, 0xEC, 0xE4), GREEN, 8)
tx(s, 9.35, 5.85, 3.35, 0.55, "本地单机可跑，数据留在自己的工作区。", 8, MUTED2, spacing=1.4)
footer(s, 4)


# =========================================================
# 05 Plugin
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "CAPABILITY PLUGIN", "插件挂在节点上，而不是团队上", "同一个能力，可以插到任何 Agent 节点；业务知识仍由 Agent 提供。")
# pipeline
labels = [("任务", "输入"), ("规划", "拆解"), ("市场", "研究"), ("产业链", "研究"), ("竞争", "研究"), ("分析", "发散"), ("写作", "引用"), ("核查", "验收")]
for i, (head, sub) in enumerate(labels):
    x = 0.72 + i * 0.98
    color = ACCENT if i == 5 else TEAL if i in (2, 3, 4) else AMBER if i in (6, 7) else PURPLE
    small_node(s, x, 2.0, 0.82, 0.62, head, color, active=(i == 5), sub=sub)
    if i < len(labels) - 1:
        line(s, x + 0.82, 2.31, x + 0.96, 2.31, MUTED2, 0.8, arrow=True)
# branch chips
for j, (name, val) in enumerate([("稳健", "88"), ("进取", "79"), ("反方", "83")]):
    x = 4.9 + j * 1.12
    rect(s, x, 3.02, 0.98, 0.44, fill=CARD, line=ACCENT_SOFT, radius=0.12)
    tx(s, x + 0.1, 3.08, 0.8, 0.18, name, 7, MUTED, bold=True)
    tx(s, x + 0.6, 3.05, 0.3, 0.25, val, 10, ACCENT, font=FONT_MONO, bold=True)
line(s, 5.6, 2.62, 5.6, 3.02, ACCENT, 1.2, arrow=True)
line(s, 5.35, 3.24, 5.05, 2.62, ACCENT, 0.8, dash=True)
tx(s, 4.9, 3.58, 3.55, 0.25, "一个节点展开 3 条思维分支，裁判收敛", 8.5, ACCENT, bold=True)

# plugin card
rect(s, 0.72, 4.1, 7.2, 2.25, fill=CARD, line=LINE, radius=0.05)
rect(s, 0.72, 4.1, 0.07, 2.25, fill=ACCENT, line=None, radius=0.5)
tx(s, 1.0, 4.28, 3.6, 0.25, " cognition.diverge", 10, ACCENT, font=FONT_MONO, bold=True)
tx(s, 1.0, 4.58, 6.5, 0.28, "发散思考  ·  节点级挂载  ·  认知", 9, MUTED)
tx(s, 1.0, 4.94, 6.6, 0.55, "把一个 Agent 节点展开成稳健 / 进取 / 反方三条分支，\n由裁判按证据覆盖、假设可检验性、行动性收敛。", 9.5, INK, spacing=1.45)
for i, (k, v) in enumerate([("branches", "3"), ("merge", "judge"), ("budget", "0.02")]):
    tx(s, 1.0 + i * 1.75, 5.83, 1.2, 0.2, k, 7.5, MUTED2, font=FONT_MONO)
    tx(s, 1.0 + i * 1.75, 6.02, 1.2, 0.22, v, 8.5, INK, font=FONT_MONO, bold=True)

# right quote
tx(s, 8.45, 4.25, 4.1, 1.8, "“插件管思考方式，\nAgent 管领域知识。”", 21, INK, font=FONT_SERIF, spacing=1.4)
line(s, 8.48, 6.0, 9.6, 6.0, ACCENT, 2.0)
tx(s, 8.48, 6.17, 4.0, 0.3, "所以同一个插件可以跨行业复用。", 10, MUTED)
footer(s, 5)


# =========================================================
# 06 Scenario
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "SCENARIO", "首发场景：AI 眼镜产业链投研", "资料密集、结论开放、错误代价高——正好需要知识库、发散与核查。")
stats = [("6", "篇资料"), ("35", "个片段"), ("8", "个角色"), ("3", "路并行")]
for i, (num, label) in enumerate(stats):
    x = 0.72 + i * 1.48
    rect(s, x, 1.95, 1.36, 1.05, fill=CARD, line=LINE, radius=0.08)
    tx(s, x + 0.14, 2.05, 1.1, 0.45, num, 25, ACCENT, font=FONT_SERIF, bold=True)
    tx(s, x + 0.14, 2.56, 1.1, 0.2, label, 8, MUTED)
tx(s, 0.75, 3.35, 5.6, 0.75, "研究任务", 10, ACCENT, bold=True)
tx(s, 0.75, 3.62, 5.55, 0.95, "生成一份面向投资决策的 AI 眼镜产业链研究报告，重点回答市场空间、价值链分配、竞争格局与主要风险。", 10, INK, spacing=1.55)
tx(s, 0.75, 4.95, 5.6, 0.75, "四个必须回答的问题", 10, ACCENT, bold=True)
for i, t in enumerate(["市场空间与增速", "价值链与 BOM", "竞争格局与护城河", "隐私、供应链与估值风险"]):
    y = 5.3 + i * 0.38
    rect(s, 0.78, y + 0.06, 0.09, 0.09, fill=ACCENT if i == 0 else TEAL if i == 1 else PURPLE if i == 2 else AMBER, line=None, radius=0.5)
    tx(s, 0.99, y, 4.9, 0.25, t, 9.5, MUTED)
add_pic_fill(s, SHOTS / "knowledge_top.png", 6.75, 1.9, 5.85, 3.05)
tx(s, 6.65, 5.1, 5.95, 0.28, "知识库：6 篇资料，35 个可检索片段", 9, INK, bold=True)
tx(s, 6.65, 5.45, 5.95, 0.75, "从资料到片段，再到报告中的引用；检索测试让证据链在入库阶段就可检查。", 9, MUTED, spacing=1.5)
rect(s, 6.65, 6.35, 5.95, 0.5, fill=ACCENT_SOFT, line=None, radius=0.12)
tx(s, 6.85, 6.46, 5.55, 0.28, "每个结论都能回到原文", 9, ACCENT, bold=True)
footer(s, 6)


# =========================================================
# 07 Orchestration
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "ORCHESTRATION", "编排：一张图，三种并行", "DAG 表达依赖，调度器决定谁先跑、跑几个、失败了怎么办。")
# DAG
positions = {
    "input": (0.7, 2.65), "planner": (1.9, 2.65),
    "market": (3.25, 1.95), "chain": (3.25, 2.65), "competition": (3.25, 3.35),
    "analyst": (4.85, 2.65), "writer": (4.85, 4.55),
    "verifier": (6.25, 4.55), "editor": (7.65, 4.55), "output": (9.05, 4.55),
}
node_defs = {
    "input": ("任务", "输入", TEAL), "planner": ("规划", "拆解", ACCENT),
    "market": ("市场", "研究", TEAL), "chain": ("产业链", "BOM", AMBER), "competition": ("竞争", "份额", PURPLE),
    "analyst": ("分析", "发散", ACCENT), "writer": ("写作", "引用", GREEN),
    "verifier": ("核查", "验收", AMBER), "editor": ("主编", "终稿", PURPLE), "output": ("报告", "交付", ACCENT),
}
node_w = 1.0
node_h = 0.62
for key, (x, y) in positions.items():
    head, sub, color = node_defs[key]
    small_node(s, x, y, node_w, node_h, head, color, active=key in ("analyst", "verifier"), sub=sub)
edges = [
    ("input", "planner"), ("planner", "market"), ("planner", "chain"), ("planner", "competition"),
    ("market", "analyst"), ("chain", "analyst"), ("competition", "analyst"),
    ("analyst", "writer"), ("writer", "verifier"), ("verifier", "editor"), ("editor", "output"),
]
for a, b in edges:
    x1, y1 = positions[a]; x2, y2 = positions[b]
    if abs(x1 - x2) < 0.01:
        line(s, x1 + node_w / 2, y1 + node_h, x2 + node_w / 2, y2, RGBColor(0xB9, 0xAE, 0x9D), 0.9, arrow=True)
    else:
        line(s, x1 + node_w, y1 + node_h / 2, x2, y2 + node_h / 2, RGBColor(0xB9, 0xAE, 0x9D), 0.9, arrow=True)
# loop edge below the writer row
line(s, 6.75, 5.17, 6.75, 5.34, ACCENT, 1.2, dash=True)
line(s, 6.75, 5.34, 5.35, 5.34, ACCENT, 1.2, dash=True)
line(s, 5.35, 5.34, 5.35, 5.17, ACCENT, 1.2, arrow=True, dash=True)
tx(s, 5.55, 5.4, 1.2, 0.2, "Self-Loop", 7, ACCENT, bold=True)

right = [
    ("关键路径优先", "depth 越大越优先获得并发槽位。"),
    ("最大并发 3", "三路研究并行，写作/核查串行。"),
    ("失败重试", "节点最多 2 次尝试，失败不拖垮全局。"),
    ("预算保护", "模型调用前检查预算，超限即停。"),
]
for i, (head, body) in enumerate(right):
    y = 1.92 + i * 1.08
    tx(s, 10.55, y, 2.1, 0.25, head, 9.5, ACCENT, bold=True)
    tx(s, 10.55, y + 0.28, 2.1, 0.55, body, 8.2, MUTED, spacing=1.35)
rect(s, 10.4, 6.15, 2.25, 0.55, fill=SAND, line=None, radius=0.1)
tx(s, 10.55, 6.25, 2.0, 0.3, "调度事件化", 8.5, INK, bold=True)
footer(s, 7)


# =========================================================
# 08 Diverge
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "COGNITION", "发散：一个节点，三种视角", "不是把一条思维链复制三份，而是三种不同的认知策略。")
cands = [
    ("稳健情景", "88", "渗透率线性提升，优先配置确定性更高的上游。", GREEN),
    ("进取情景", "79", "AI 助手成为手机替代入口，整机与渠道弹性最大。", ACCENT),
    ("反方情景", "83", "重量、续航与隐私制约，增速可能低于预期。", PURPLE),
]
for i, (name, score, body, color) in enumerate(cands):
    x = 0.72 + i * 2.55
    rect(s, x, 1.85, 2.35, 2.45, fill=CARD, line=LINE, radius=0.06)
    tx(s, x + 0.18, 2.0, 1.3, 0.3, name, 11, INK, bold=True)
    pill(s, x + 1.72, 1.98, 0.45, 0.3, score, RGBColor(0xF1, 0xEC, 0xE3), color, 8)
    tx(s, x + 0.18, 2.52, 1.95, 1.2, body, 9, MUTED, spacing=1.55)
    line(s, x + 0.18, 4.02, x + 1.0, 4.02, color, 2.0)
# judge
tx(s, 8.6, 1.95, 3.9, 0.3, "裁判收敛", 10, ACCENT, bold=True)
tx(s, 8.6, 2.3, 3.95, 1.7, "3  →  1", 40, INK, font=FONT_SERIF, bold=True)
tx(s, 8.6, 3.35, 3.95, 0.95, "按证据覆盖、假设可检验性、行动性打分；\n稳健 0.88，反方 0.83，进取 0.79。", 9, MUTED, spacing=1.5)
rect(s, 8.6, 4.35, 3.95, 0.55, fill=ACCENT_SOFT, line=None, radius=0.1)
tx(s, 8.78, 4.45, 3.6, 0.3, "选择稳健情景作为主判断", 9, ACCENT, bold=True)
rect(s, 0.72, 4.95, 11.9, 0.82, fill=DARK, line=None, radius=0.08)
tx(s, 0.98, 5.08, 5.4, 0.3, "NodeOutput.candidates", 9.5, ACCENT, font=FONT_MONO, bold=True)
tx(s, 0.98, 5.38, 10.9, 0.28, "三张候选卡、裁判理由、每条分支的评分，全部进入运行轨迹，可展开、可回放。", 9, WHITE)
footer(s, 8)


# =========================================================
# 09 Verification / loop
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "VERIFICATION", "验证：报告不是写完就算", "核查结果不是展示分数，而是按问题类型路由回上游。")
# before/after
tx(s, 0.8, 1.95, 1.6, 0.3, "第一轮", 9, MUTED, bold=True)
tx(s, 0.72, 2.2, 2.4, 0.9, "85%", 48, ACCENT, font=FONT_SERIF, bold=True)
tx(s, 3.0, 2.38, 0.9, 0.5, "→", 26, MUTED2, font=FONT_SERIF)
tx(s, 3.75, 1.95, 1.6, 0.3, "第二轮", 9, MUTED, bold=True)
tx(s, 3.67, 2.2, 2.4, 0.9, "100%", 48, GREEN, font=FONT_SERIF, bold=True)
tx(s, 0.8, 3.15, 4.6, 0.3, "13 条结论  ·  2 条问题  ·  1 次回环", 8.5, MUTED)

# issues
issues = [
    ("数字不一致", "报告写“2028 年 5000 万台”，证据为 3200 万台。"),
    ("引用缺失", "“2027 年第一轮洗牌”没有对应证据。"),
]
for i, (head, body) in enumerate(issues):
    y = 3.75 + i * 1.05
    rect(s, 0.72, y, 5.55, 0.88, fill=CARD, line=RGBColor(0xE8, 0xC8, 0xBF), radius=0.08)
    rect(s, 0.72, y, 0.06, 0.88, fill=ACCENT, line=None, radius=0.5)
    tx(s, 0.95, y + 0.1, 2.2, 0.25, head, 9.5, ACCENT, bold=True)
    tx(s, 0.95, y + 0.38, 5.1, 0.3, body, 8.7, MUTED)

# loop flow
rect(s, 7.0, 1.95, 5.55, 4.15, fill=DARK, line=None, radius=0.06)
tx(s, 7.28, 2.15, 4.9, 0.3, "SELF-LOOP", 8.5, ACCENT, bold=True)
flow = [("Writer v1", 2.65, ACCENT), ("Verifier", 3.75, AMBER), ("Writer v2", 4.85, GREEN)]
for i, (label, y, color) in enumerate(flow):
    rect(s, 7.45, y, 1.85, 0.52, fill=DARK2, line=RGBColor(0x3A, 0x42, 0x3B), radius=0.1)
    tx(s, 7.62, y + 0.12, 1.55, 0.25, label, 8.5, WHITE, bold=True)
    rect(s, 7.45, y, 0.05, 0.52, fill=color, line=None, radius=0.5)
# arrows down
line(s, 8.37, 3.17, 8.37, 3.7, RGBColor(0x6A, 0x72, 0x6A), 1.0, arrow=True)
line(s, 8.37, 4.27, 8.37, 4.8, RGBColor(0x6A, 0x72, 0x6A), 1.0, arrow=True)
# feedback loop arrow on right
line(s, 9.55, 4.05, 10.3, 4.05, ACCENT, 1.2, arrow=True, dash=True)
line(s, 10.3, 4.05, 10.3, 2.95, ACCENT, 1.2, dash=True)
line(s, 10.3, 2.95, 9.55, 2.95, ACCENT, 1.2, arrow=True, dash=True)
tx(s, 9.65, 4.15, 1.3, 0.22, "按类型路由", 7.5, ACCENT, bold=True)
tx(s, 7.28, 5.65, 4.95, 0.35, "通过后 → 主编终稿", 10, WHITE, bold=True)

rect(s, 0.72, 5.85, 5.55, 0.62, fill=DARK, line=None, radius=0.1)
tx(s, 0.95, 5.98, 5.15, 0.35, "缺引用 → 竞争情报员    ·    数字不一致 → 首席分析师", 8.5, WHITE, bold=True)
footer(s, 9)


# =========================================================
# 10 Knowledge
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "EVIDENCE LEDGER", "证据账本：每个结论都能回到原文", "报告只是账本的渲染视图；每条主张都有引用、状态与路由目标。")
add_pic_fill(s, SHOTS / "ledger_body.png", 0.72, 1.8, 4.45, 5.2)
points = [
    ("13 条主张，逐条核对", "最终轮 13 条被支持；第一轮 85% 时定位到 2 条问题。"),
    ("每条主张可展开证据", "引用原文、文档标题与核查理由同屏，不需要翻日志。"),
    ("问题按类型路由", "缺引用回研究员，数字不一致回分析师，而不是一律重写。"),
]
for i, (head, body) in enumerate(points):
    y = 2.05 + i * 1.3
    rect(s, 6.0, y, 0.08, 0.08, fill=ACCENT if i == 0 else TEAL if i == 1 else PURPLE, line=None, radius=0.5)
    tx(s, 6.23, y - 0.06, 5.8, 0.3, head, 11, INK, bold=True)
    tx(s, 6.23, y + 0.26, 5.8, 0.55, body, 9.5, MUTED, spacing=1.45)
rect(s, 6.0, 5.95, 5.95, 0.65, fill=ACCENT_SOFT, line=None, radius=0.12)
tx(s, 6.2, 6.08, 5.55, 0.35, "“报告只是证据账本的渲染视图。”", 12, ACCENT, font=FONT_SERIF, bold=True)
footer(s, 10)


# =========================================================
# 11 Console
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "OBSERVABILITY", "运行控制台：可观察，才可干预", "同一个任务，既能看结果，也能看过程、看证据、看调度。")
add_pic_fill(s, SHOTS / "run_graph.png", 0.72, 1.8, 8.1, 3.35)
add_pic_fill(s, SHOTS / "run_timeline.png", 0.72, 5.25, 8.1, 1.6)
# callouts
callouts = [
    ("01", "实时图谱", "节点状态、分支、回环。"),
    ("02", "节点轨迹", "每个角色的输出与 Token。"),
    ("03", "调度事件", "排队、开始、核查、回环。"),
]
for i, (num, head, body) in enumerate(callouts):
    y = 1.9 + i * 1.5
    tx(s, 9.1, y, 0.4, 0.25, num, 9, ACCENT, font=FONT_MONO, bold=True)
    tx(s, 9.55, y - 0.03, 2.9, 0.3, head, 11, INK, bold=True)
    tx(s, 9.55, y + 0.28, 2.9, 0.4, body, 8.8, MUTED, spacing=1.35)
    line(s, 8.9, y + 0.12, 9.0, y + 0.12, ACCENT, 1.0)
tx(s, 9.1, 6.55, 3.3, 0.3, "从“等结果”变成“看过程”。", 9, ACCENT, bold=True)
footer(s, 11)


# =========================================================
# 12 Results
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "TRACTION", "应用成效：一条可复核的证据链", "一次真实运行，从“差不多”走到“可交付”。")
metrics = [
    ("13", "条结论", "逐条核查"),
    ("85→100", "核查分", "第一轮到第二轮"),
    ("2", "条问题", "被定位并修正"),
    ("1", "次回环", "Self-Loop"),
]
for i, (num, label, note) in enumerate(metrics):
    x = 0.72 + i * 3.05
    rect(s, x, 1.95, 2.8, 2.1, fill=CARD, line=LINE, radius=0.06)
    tx(s, x + 0.22, 2.08, 2.4, 0.65, num, 34, ACCENT if i == 1 else INK, font=FONT_SERIF, bold=True)
    tx(s, x + 0.22, 2.82, 2.4, 0.28, label, 10, INK, bold=True)
    tx(s, x + 0.22, 3.14, 2.4, 0.3, note, 8, MUTED)
tx(s, 0.75, 4.45, 7.6, 0.55, "Mock 模式真实运行；Live 成本与延迟待接入后复测。", 9, MUTED)
tx(s, 0.75, 5.25, 11.3, 0.9, "“交付的不是一份报告，\n而是一条证据链。”", 27, INK, font=FONT_SERIF, spacing=1.35)
line(s, 0.78, 6.55, 2.2, 6.55, ACCENT, 2.0)
footer(s, 12)


# =========================================================
# 13 Comparison
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "POSITIONING", "对比：我们补的是哪一层", "不替代 LobeHub 或 DSH，补上“团队级编排 + 节点级认知 + 结果级验收”。")
rows = [
    ("核心抽象", "助手 / 插件市场", "插件化 Harness", "节点能力插件 + 可验证团队"),
    ("编排", "对话 / 助手为中心", "代码 Agent 运行时", "可视化 DAG + 回环"),
    ("调度", "通用任务调度", "工具调用", "关键路径 + 并发 + 预算"),
    ("验证", "人工反馈为主", "工具结果为主", "引用 / 数字 / 语义 + Self-Loop"),
    ("差异点", "生态与助手", "工程化运行时", "认知插件 + 验收闭环"),
]
tbl_shape = s.shapes.add_table(len(rows) + 1, 4, Inches(0.72), Inches(1.85), Inches(11.9), Inches(4.4))
table = tbl_shape.table
widths = [1.55, 3.0, 3.0, 4.35]
for i, wd in enumerate(widths):
    table.columns[i].width = Inches(wd)
# header
headers = ["维度", "LobeHub", "DeepSeek Harness", "织序 AgentLoom"]
for j, h in enumerate(headers):
    cell = table.cell(0, j)
    cell.text = ""
    cell.fill.solid(); cell.fill.fore_color.rgb = DARK
    p = cell.text_frame.paragraphs[0]
    r = p.add_run(); r.text = h
    r.font.name = FONT_SANS; r.font.size = Pt(9.5); r.font.bold = True
    r.font.color.rgb = WHITE
    cell.margin_left = Inches(0.08); cell.margin_top = Inches(0.05); cell.margin_bottom = Inches(0.03)
for i, row in enumerate(rows, start=1):
    for j, val in enumerate(row):
        cell = table.cell(i, j)
        cell.text = ""
        cell.fill.solid(); cell.fill.fore_color.rgb = CARD if i % 2 else RGBColor(0xFA, 0xF6, 0xEE)
        p = cell.text_frame.paragraphs[0]
        r = p.add_run(); r.text = val
        r.font.name = FONT_SANS; r.font.size = Pt(8.7)
        r.font.bold = j == 3 or j == 0
        r.font.color.rgb = ACCENT if j == 3 else INK if j == 0 else MUTED
        cell.margin_left = Inches(0.08); cell.margin_top = Inches(0.04); cell.margin_bottom = Inches(0.03)
footer(s, 13)


# =========================================================
# 14 Business
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "BUSINESS", "商业模式：先卖团队，再卖生态", "早期用项目制交付验证价值，中期用模板与插件放大。")
customers = [
    ("高校 / 智库", "研究流程可复现，学生团队可训练。", TEAL),
    ("券商 / 咨询", "投研、尽调、投委会材料，引用敏感。", ACCENT),
    ("企业战略部", "竞品、政策、年度规划，重复度高。", PURPLE),
]
for i, (head, body, color) in enumerate(customers):
    y = 1.95 + i * 1.12
    rect(s, 0.72, y, 4.15, 0.92, fill=CARD, line=LINE, radius=0.07)
    rect(s, 0.72, y, 0.06, 0.92, fill=color, line=None, radius=0.5)
    tx(s, 0.98, y + 0.14, 3.7, 0.28, head, 10.5, INK, bold=True)
    tx(s, 0.98, y + 0.45, 3.65, 0.3, body, 8.4, MUTED)

rev = [
    ("私有化部署", "8–20 万 / 年"),
    ("团队模板订阅", "1–3 万 / 年"),
    ("实施与陪跑", "5–10 万 / 项目"),
    ("插件分成", "20%–30%"),
]
for i, (label, price) in enumerate(rev):
    y = 1.95 + i * 0.82
    tx(s, 5.35, y + 0.1, 2.3, 0.25, label, 9.5, INK, bold=True)
    tx(s, 7.75, y + 0.08, 1.75, 0.28, price, 9.5, ACCENT, font=FONT_MONO, bold=True)
    line(s, 5.35, y + 0.58, 9.5, y + 0.58, LINE, 0.7)

rect(s, 9.9, 1.9, 2.7, 3.35, fill=DARK, line=None, radius=0.08)
tx(s, 10.12, 2.08, 2.3, 0.25, "早期测算（假设）", 7.5, ACCENT, bold=True)
tx(s, 10.12, 2.42, 2.3, 0.5, "1000 家", 18, WHITE, font=FONT_SERIF, bold=True)
tx(s, 10.12, 2.85, 2.3, 0.3, "目标客户 × 10 万", 8, RGBColor(0xC9, 0xC4, 0xBA))
tx(s, 10.12, 3.35, 2.3, 0.5, "1 亿 / 年", 18, WHITE, font=FONT_SERIF, bold=True)
tx(s, 10.12, 3.78, 2.3, 0.3, "SAM 假设", 8, RGBColor(0xC9, 0xC4, 0xBA))
tx(s, 10.12, 4.32, 2.3, 0.3, "3 年 30 家付费 → 300 万 / 年", 7.5, WHITE)
footer(s, 14)


# =========================================================
# 15 Roadmap
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "ROADMAP", "路线图：从校赛到试点", "16 天先把闭环跑通，再用真实场景换数据。")
phases = [
    ("2026.11", "MVP / 校赛", "知识库、8 角色、发散、核查、回环；白皮书 / PPT / 视频。", ACCENT),
    ("2026.12–2027.02", "试点", "2 个校内/企业场景，积累真实运行与成本数据。", TEAL),
    ("2027.03–06", "产品化", "插件契约、团队模板、PDF 入库、权限沙盒。", AMBER),
    ("2027 H2", "商业化", "私有化部署 + 模板订阅 + 渠道合作。", PURPLE),
]
line(s, 1.0, 3.25, 12.35, 3.25, LINE, 1.2)
for i, (date, head, body, color) in enumerate(phases):
    x = 0.75 + i * 3.05
    c = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x + 0.05), Inches(3.08), Inches(0.34), Inches(0.34))
    c.fill.solid(); c.fill.fore_color.rgb = color; c.line.color.rgb = PAPER; c.line.width = Pt(3); c.shadow.inherit = False
    tx(s, x, 2.55, 2.6, 0.25, date, 8.5, color, font=FONT_MONO, bold=True)
    tx(s, x, 3.6, 2.65, 0.35, head, 12, INK, bold=True)
    tx(s, x, 3.98, 2.65, 1.0, body, 8.6, MUTED, spacing=1.5)
rect(s, 0.72, 5.75, 11.9, 0.62, fill=ACCENT_SOFT, line=None, radius=0.12)
tx(s, 0.98, 5.88, 11.3, 0.3, "16 天，不追求“什么都有”，只追求“闭环真的跑通”。", 12, ACCENT, font=FONT_SERIF, bold=True)
footer(s, 15)


# =========================================================
# 16 Team / closing
# =========================================================
s = prs.slides.add_slide(blank)
add_bg(s)
section(s, "TEAM", "团队 & 下一步", "一支懂模型、懂工程、也懂场景的交叉团队。")
roles = [
    ("队长", "产品定位 / 架构 / 答辩"),
    ("算法", "调度器 / 核查器 / 评测"),
    ("前端", "编排画布 / 运行控制台"),
    ("后端", "API / 知识库 / 模型网关"),
    ("运营", "场景 / 商业模式 / 材料"),
]
for i, (role, work) in enumerate(roles):
    y = 1.95 + i * 0.72
    tx(s, 0.75, y, 1.0, 0.25, role, 9, ACCENT, bold=True)
    tx(s, 1.6, y - 0.02, 2.1, 0.25, "【待填】", 9, INK, bold=True)
    tx(s, 3.55, y - 0.02, 3.2, 0.25, work, 8.7, MUTED)
    line(s, 0.75, y + 0.5, 6.7, y + 0.5, LINE, 0.6)

rect(s, 7.35, 1.9, 5.2, 4.25, fill=DARK, line=None, radius=0.08)
tx(s, 7.65, 2.15, 4.5, 0.25, "OUR BELIEF", 8, ACCENT, bold=True)
tx(s, 7.65, 2.55, 4.55, 2.3, "让 Agent 的能力\n像插件一样可插拔，\n让每个结论都有证据。", 21, WHITE, font=FONT_SERIF, spacing=1.45)
line(s, 7.68, 5.2, 9.1, 5.2, ACCENT, 2.0)
tx(s, 7.68, 5.4, 4.5, 0.45, "织序 AgentLoom  ·  赛题一", 9, RGBColor(0xC9, 0xC4, 0xBA))
tx(s, 0.75, 6.3, 6.0, 0.4, "欢迎提问 / 现场演示", 13, INK, font=FONT_SERIF, bold=True)
footer(s, 16)


out = OUT / "织序AgentLoom-项目介绍.pptx"
prs.save(out)
print(f"saved: {out} ({len(prs.slides)} slides)")
