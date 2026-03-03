/**
 * Lightweight Markdown → HTML renderer (no external deps).
 * Covers: headings, bold, italic, code, code blocks, tables, lists, paragraphs, links, hr.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineMarkdown(text: string): string {
  let s = escapeHtml(text);
  // code (inline)
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
  // bold + italic
  s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  // bold
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // italic
  s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // links
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="md-link">$1</a>');
  return s;
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const lines = md.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.trimStart().startsWith('```')) {
      const lang = line.trimStart().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith('```')) {
        codeLines.push(escapeHtml(lines[i]));
        i++;
      }
      i++; // skip closing ```
      out.push(`<pre class="md-pre"><code${lang ? ` class="language-${lang}"` : ''}>${codeLines.join('\n')}</code></pre>`);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      out.push(`<h${level} class="md-h${level}">${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push('<hr class="md-hr" />');
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\|?\s*[-:]+/.test(lines[i + 1])) {
      const parseRow = (row: string) =>
        row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - (row.endsWith('|') ? 1 : 0)).map(c => c.trim());

      const headers = parseRow(line);
      i += 2; // skip header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|')) {
        rows.push(parseRow(lines[i]));
        i++;
      }

      let table = '<table class="md-table"><thead><tr>';
      for (const h of headers) table += `<th>${inlineMarkdown(h)}</th>`;
      table += '</tr></thead><tbody>';
      for (const row of rows) {
        table += '<tr>';
        for (const cell of row) table += `<td>${inlineMarkdown(cell)}</td>`;
        table += '</tr>';
      }
      table += '</tbody></table>';
      out.push(table);
      continue;
    }

    // Unordered list
    if (/^[\s]*[-*+]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[\s]*[-*+]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^[\s]*[-*+]\s/, ''));
        i++;
      }
      out.push('<ul class="md-ul">' + items.map(it => `<li>${inlineMarkdown(it)}</li>`).join('') + '</ul>');
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s/, ''));
        i++;
      }
      out.push('<ol class="md-ol">' + items.map(it => `<li>${inlineMarkdown(it)}</li>`).join('') + '</ol>');
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Paragraph
    out.push(`<p class="md-p">${inlineMarkdown(line)}</p>`);
    i++;
  }

  return out.join('\n');
}

/** CSS string for dark-themed markdown content */
export const markdownStyles = `
.md-h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; color: #f4f4f5; }
.md-h2 { font-size: 1.25rem; font-weight: 600; margin: 1rem 0 0.5rem; color: #e4e4e7; }
.md-h3 { font-size: 1.1rem; font-weight: 600; margin: 0.75rem 0 0.25rem; color: #d4d4d8; }
.md-h4, .md-h5, .md-h6 { font-size: 1rem; font-weight: 600; margin: 0.5rem 0 0.25rem; color: #d4d4d8; }
.md-p { margin: 0.4rem 0; line-height: 1.6; color: #a1a1aa; }
.md-code { background: #27272a; padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.85em; color: #67e8f9; }
.md-pre { background: #18181b; border: 1px solid #3f3f46; border-radius: 0.5rem; padding: 0.75rem 1rem; overflow-x: auto; margin: 0.5rem 0; }
.md-pre code { background: none; padding: 0; color: #d4d4d8; font-size: 0.85em; }
.md-table { width: 100%; border-collapse: collapse; margin: 0.5rem 0; font-size: 0.85rem; }
.md-table th { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 2px solid #3f3f46; color: #e4e4e7; font-weight: 600; }
.md-table td { padding: 0.35rem 0.6rem; border-bottom: 1px solid #27272a; color: #a1a1aa; }
.md-table tr:hover td { background: #27272a; }
.md-ul, .md-ol { margin: 0.4rem 0; padding-left: 1.5rem; color: #a1a1aa; }
.md-ul li, .md-ol li { margin: 0.2rem 0; line-height: 1.5; }
.md-hr { border: none; border-top: 1px solid #3f3f46; margin: 0.75rem 0; }
.md-link { color: #60a5fa; text-decoration: underline; }
.md-link:hover { color: #93c5fd; }
strong { color: #e4e4e7; }
em { color: #d4d4d8; }
`;
