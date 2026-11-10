# -*- coding: utf-8 -*-
"""Stage 2: doc-typeset (business-report template) — Markdown → 美化 HTML。
按 doc-typeset SKILL.md 约定：语义 section + @page、CSS 变量引用 token、
结构化内容一律用 table、无 grid/dl/装饰短横线、封面块显式居中。"""
import json
import re
import html as html_lib
from pathlib import Path

ROOT = Path(r"C:\Users\LENOVO\WorkBuddy\2026-10-29-15-52-00\output\game-report-20261108")
MD = ROOT / "stage1" / "final_draft.md"
TOKENS = ROOT / "stage2" / "design_tokens.json"
OUT = ROOT / "stage2" / "formatted-game-experiment-report.html"

compiled = json.loads(TOKENS.read_text(encoding="utf-8"))
css_vars = compiled["css_variables"]
var_lines = "\n".join(f"    {k}: {v};" for k, v in css_vars.items())

lines = MD.read_text(encoding="utf-8").splitlines()

def inline(s):
    s = html_lib.escape(s, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", s)
    return s

def cell_split(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]

# ---- 正文 Markdown → HTML 片段 ----
body_parts = []
toc = []
i = 0
n = len(lines)
in_code = False
code_buf = []
list_type = None
list_buf = []

def flush_list():
    global list_type, list_buf
    if list_type and list_buf:
        body_parts.append(f"<{list_type}>" + "".join(f"<li>{inline(x)}</li>" for x in list_buf) + f"</{list_type}>")
    list_type, list_buf = None, []

while i < n:
    line = lines[i]
    stripped = line.strip()

    if stripped.startswith("```"):
        if in_code:
            body_parts.append("<pre>" + html_lib.escape("\n".join(code_buf)) + "</pre>")
            code_buf, in_code = [], False
        else:
            flush_list()
            in_code = True
        i += 1
        continue
    if in_code:
        code_buf.append(line)
        i += 1
        continue

    if stripped.startswith("|"):
        flush_list()
        tbl = []
        while i < n and lines[i].strip().startswith("|"):
            tbl.append(lines[i].strip())
            i += 1
        head = cell_split(tbl[0])
        rows = [cell_split(r) for r in tbl[2:]] if len(tbl) > 1 and set(tbl[1].replace("|", "").replace("-", "").replace(":", "").strip()) == set() else [cell_split(r) for r in tbl[1:]]
        t = ['<table class="data-table"><thead><tr>']
        t += [f"<th>{inline(c)}</th>" for c in head]
        t.append("</tr></thead><tbody>")
        for r in rows:
            t.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>")
        t.append("</tbody></table>")
        body_parts.append("".join(t))
        continue

    if re.match(r"^\d+\.\s", stripped):
        if list_type not in (None, "ol"):
            flush_list()
        list_type = "ol"
        list_buf.append(re.sub(r"^\d+\.\s+", "", stripped))
        i += 1
        continue
    if stripped.startswith("- "):
        if list_type not in (None, "ul"):
            flush_list()
        list_type = "ul"
        list_buf.append(stripped[2:])
        i += 1
        continue
    flush_list()

    if stripped.startswith("## "):
        title = stripped[3:].strip()
        toc.append(title)
        body_parts.append(f"<h2>{inline(title)}</h2>")
    elif stripped.startswith("### "):
        body_parts.append(f"<h3>&nbsp;&nbsp;{inline(stripped[4:].strip())}</h3>")
    elif stripped.startswith("# "):
        pass  # 文档主标题已在封面
    elif stripped.startswith("**关键词**"):
        body_parts.append(f"<p class=\"keywords\">{inline(stripped)}</p>")
    elif stripped:
        body_parts.append(f"<p>{inline(stripped)}</p>")
    i += 1
flush_list()

# 定向修正 TQ-03：h2 后紧接 h3 时补一句章节导语（不引入新事实）
INTROS = {
    "四": "本节说明项目的目录组织、代码规模与关键架构选择。",
    "五": "本节按游戏逐一说明外部规格表的落地方式，并保留需求中途变更的记录。",
    "七": "本节汇总最终交付物、各层次验证手段与部署结果。",
    "九": "附录汇总游戏清单、运行方式、关键参数与实验时间线，便于复现与核查。",
}
fixed_parts = []
for k, part in enumerate(body_parts):
    fixed_parts.append(part)
    if part.startswith("<h2>") and k + 1 < len(body_parts) and body_parts[k + 1].startswith("<h3>"):
        label = part[4:6]
        intro = next((v for key, v in INTROS.items() if key in label), "本节对相关内容作分点说明。")
        fixed_parts.append(f'<p class="section-intro">{intro}</p>')
body_parts = fixed_parts

# 摘要段落收进单列底纹卡片：把首个 h2(摘要) 与紧随其后的段落重组
body_html = "\n".join(body_parts)
abstract_match = re.search(r"<h2>摘要</h2>\n(<p>.*?</p>)\n(<p class=\"keywords\">.*?</p>)", body_html, re.S)
if abstract_match:
    card = ('<div class="executive-summary">'
            '<table class="abstract-card executive-summary"><thead><tr><th>摘要</th></tr></thead><tbody><tr><td>'
            + abstract_match.group(1) + abstract_match.group(2)
            + '</td></tr></tbody></table></div>')
    body_html = body_html.replace(abstract_match.group(0), card, 1)

toc_html = "".join(f"<li>{html_lib.escape(t)}</li>" for t in toc[:9])

CSS = f"""
  @page {{ @bottom-center {{ content: counter(page); }} }}
  @page cover {{ @bottom-center {{ content: none; }} }}
  :root {{
{var_lines}
    --fs-cover: var(--typography-fontSize-coverTitle, 22pt);
    --fs-h1: var(--typography-fontSize-h1, 20pt);
    --fs-h2: var(--typography-fontSize-sectionHeader, 13pt);
    --fs-h3: var(--typography-fontSize-h2, 11pt);
    --fs-body: var(--typography-fontSize-body, 9pt);
    --fs-small: var(--typography-fontSize-small, 8pt);
    --ff-heading: var(--typography-fontFamily-heading, sans-serif);
    --ff-body: var(--typography-fontFamily-body, sans-serif);
    --ff-code: var(--typography-fontFamily-code, monospace);
    --lh-body: var(--typography-lineHeight-body, 1.6);
    --fw-heading: var(--typography-fontWeight-heading, 600);
    --color-border: var(--color-divider, #E0E0E0);
    --color-bg: var(--color-background, #FFFFFF);
    --color-panel: var(--color-surface, #F5F7FA);
    --spacing-p: var(--spacing-paragraph, 0.75em);
    --spacing-section: var(--spacing-sectionGap, 2.5em);
    --spacing-card: var(--spacing-cardPadding, 1.5em);
    --margin-page: var(--layout-marginLeft, 2.5cm);
    --page-content-width: var(--layout-maxContentWidth, 160mm);
    --border-thin: 0.5pt;
    --border-thick: var(--decoration-headingBorderWidth, 4px);
    --cell-pad: 0.4em;
    --radius: 4px;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: var(--ff-body); font-size: var(--fs-body); line-height: var(--lh-body);
          color: var(--color-text); background: var(--color-bg);
          max-width: var(--page-content-width); margin-left: auto; margin-right: auto; }}
  section[role="cover"] {{ page: cover; padding-top: var(--spacing-section); padding-bottom: var(--spacing-section); }}
  section[role="cover"] h1, section[role="cover"] p, section[role="cover"] table {{ text-align: center; }}
  section[role="cover"] h1 {{ font-family: var(--ff-heading); font-size: var(--fs-cover);
          color: var(--color-primary); font-weight: var(--fw-heading);
          margin-bottom: var(--spacing-p); text-align: center; }}
  .cover-subtitle {{ font-size: var(--fs-h3); color: var(--color-textSecondary);
          margin-bottom: var(--spacing-section); text-align: center; }}
  .cover-eyebrow {{ font-size: var(--fs-small); color: var(--color-accent);
          margin-bottom: var(--spacing-section); text-align: center; }}
  .cover-meta-table {{ width: 100%; border-collapse: collapse; margin-top: var(--spacing-section); }}
  .cover-meta-table td {{ border: none; text-align: center; font-size: var(--fs-small);
          color: var(--color-textSecondary); padding: var(--cell-pad); }}
  .toc-title {{ font-size: var(--fs-h3); font-weight: var(--fw-heading);
          color: var(--color-heading); margin-bottom: var(--spacing-p); }}
  .doc-toc {{ margin-bottom: var(--spacing-section); }}
  .doc-toc ol {{ margin-left: var(--spacing-card); margin-bottom: var(--spacing-p); }}
  .doc-toc li {{ font-size: var(--fs-body); margin-bottom: var(--cell-pad); color: var(--color-textSecondary); }}
  h2 {{ font-family: var(--ff-heading); font-size: var(--fs-h2); font-weight: var(--fw-heading);
          color: var(--color-bg); background: var(--color-primary);
          padding: var(--cell-pad); margin-top: var(--spacing-section); margin-bottom: var(--spacing-p); }}
  h3 {{ font-family: var(--ff-heading); font-size: var(--fs-h3); font-weight: var(--fw-heading);
          color: var(--color-heading); border-left: var(--border-thick) solid var(--color-primary);
          margin-top: var(--spacing-p); margin-bottom: var(--spacing-p); padding-left: var(--cell-pad); }}
  p {{ margin-bottom: var(--spacing-p); text-align: justify; }}
  .keywords {{ color: var(--color-textSecondary); font-size: var(--fs-small); }}
  ol, ul {{ margin-left: var(--spacing-card); margin-bottom: var(--spacing-p); }}
  li {{ margin-bottom: var(--cell-pad); }}
  strong {{ font-weight: var(--fw-heading); }}
  code {{ font-family: var(--ff-code); font-size: var(--fs-small); background: var(--color-panel); }}
  pre {{ font-family: var(--ff-code); font-size: var(--fs-small); background: var(--color-panel);
          padding: var(--spacing-p); margin-bottom: var(--spacing-p); white-space: pre-wrap; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: var(--spacing-p); }}
  th, td {{ border: var(--border-thin) solid var(--color-border); padding: var(--cell-pad);
          font-size: var(--fs-small); text-align: left; vertical-align: top; }}
  th {{ background: var(--color-panel); color: var(--color-heading); font-weight: var(--fw-heading); }}
  .abstract-card {{ margin-bottom: var(--spacing-section); }}
  .abstract-card td {{ background: var(--color-panel);
          border-left: var(--border-thick) solid var(--color-primary);
          padding: var(--spacing-card); }}
"""

HTML = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="docx-page-size" content="A4">
  <title>使用大模型制作游戏实验报告</title>
  <style>{CSS}</style>
</head>
<body>
  <section role="cover">
    <p class="cover-eyebrow">软件工程 · 人机协同开发实验</p>
    <h1>使用大模型制作游戏</h1>
    <p class="cover-subtitle">基于自然语言迭代开发 10 款网页小游戏的实验报告</p>
    <table class="cover-meta-table"><thead><tr><th>报告信息</th></tr></thead><tbody>
      <tr><td>实验环境：WorkBuddy AI 编程助手 / 原生前端技术栈</td></tr>
      <tr><td>实验周期：2026 年 10 月 29 日 — 10 月 30 日</td></tr>
      <tr><td>报告日期：2026 年 11 月 8 日</td></tr>
    </tbody></table>
  </section>

  <section role="body" data-page-restart="1">
    <nav class="doc-toc" aria-label="文档目录">
      <p class="toc-title">目录</p>
      <ol>{toc_html}</ol>
    </nav>
{body_html}
  </section>
</body>
</html>
"""

OUT.write_text(HTML, encoding="utf-8")
print("HTML 已生成:", OUT)
print("大小:", len(HTML), "字符；正文块:", len(body_parts), "；目录项:", len(toc))
