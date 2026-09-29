import type { DocContent, JSONNode } from './types';

const EMPTY_DOC: DocContent = { type: 'doc', content: [{ type: 'paragraph' }] };

function withMark(nodes: JSONNode[], type: string): JSONNode[] {
  return nodes.map((node) => {
    if (node.type !== 'text') return node;
    return { ...node, marks: [...(node.marks ?? []), { type }] };
  });
}

export function parseInline(input: string): JSONNode[] {
  const nodes: JSONNode[] = [];
  let buffer = '';
  let index = 0;

  const flush = () => {
    if (!buffer) return;
    nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };

  while (index < input.length) {
    const marker = input.startsWith('**', index) ? '**' : input.startsWith('__', index) ? '__' : null;
    if (marker) {
      const end = input.indexOf(marker, index + 2);
      if (end !== -1) {
        flush();
        nodes.push(...withMark(parseInline(input.slice(index + 2, end)), 'bold'));
        index = end + 2;
        continue;
      }
    }

    const italicMarker = input[index] === '*' || input[index] === '_' ? input[index] : null;
    if (italicMarker) {
      const end = input.indexOf(italicMarker, index + 1);
      if (end > index + 1) {
        flush();
        nodes.push(...withMark(parseInline(input.slice(index + 1, end)), 'italic'));
        index = end + 1;
        continue;
      }
    }

    buffer += input[index];
    index += 1;
  }

  flush();
  return nodes;
}

function paragraph(text: string): JSONNode {
  const content = parseInline(text.trim());
  return content.length ? { type: 'paragraph', content } : { type: 'paragraph' };
}

function listItem(text: string): JSONNode {
  return { type: 'listItem', content: [paragraph(text)] };
}

function isSpecialLine(line: string): boolean {
  return /^(#{1,3})\s+\S/.test(line) || /^[-*]\s+\S/.test(line) || /^\d+\.\s+\S/.test(line);
}

export function markdownToDoc(source: string): DocContent {
  const lines = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const blocks: JSONNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const content = parseInline(heading[2].trim());
      blocks.push({
        type: 'heading',
        attrs: { level: heading[1].length },
        ...(content.length ? { content } : {}),
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: JSONNode[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(listItem(lines[index].replace(/^[-*]\s+/, '')));
        index += 1;
      }
      blocks.push({ type: 'bulletList', content: items });
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: JSONNode[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(listItem(lines[index].replace(/^\d+\.\s+/, '')));
        index += 1;
      }
      blocks.push({ type: 'orderedList', attrs: { start: 1 }, content: items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isSpecialLine(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    blocks.push(paragraph(paragraphLines.join(' ')));
  }

  return blocks.length ? { type: 'doc', content: blocks } : EMPTY_DOC;
}

export function textToDoc(source: string): DocContent {
  const normalized = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalized) return EMPTY_DOC;

  const content = normalized.split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    const nodes: JSONNode[] = [];
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) nodes.push({ type: 'hardBreak' });
      if (line.length > 0) nodes.push({ type: 'text', text: line });
    });
    return nodes.length ? { type: 'paragraph', content: nodes } : { type: 'paragraph' };
  });

  return { type: 'doc', content };
}

function inlineText(nodes: JSONNode[] | undefined): string {
  if (!nodes) return '';
  return nodes
    .map((node) => {
      if (node.type === 'hardBreak') return '\n';
      if (node.type === 'text') {
        let text = node.text ?? '';
        const marks = new Set(node.marks?.map((mark) => mark.type));
        if (marks.has('bold')) text = `**${text}**`;
        if (marks.has('italic')) text = `*${text}*`;
        if (marks.has('underline')) text = `<u>${text}</u>`;
        return text;
      }
      return inlineText(node.content);
    })
    .join('');
}

export function docToMarkdown(doc: DocContent): string {
  const blocks = doc.content.map((block) => {
    if (block.type === 'heading') {
      const level = Math.min(3, Math.max(1, Number(block.attrs?.level ?? 1)));
      return `${'#'.repeat(level)} ${inlineText(block.content).trim()}`;
    }
    if (block.type === 'bulletList') {
      return (block.content ?? []).map((item) => `- ${inlineText(item.content).trim()}`).join('\n');
    }
    if (block.type === 'orderedList') {
      return (block.content ?? [])
        .map((item, index) => `${index + 1}. ${inlineText(item.content).trim()}`)
        .join('\n');
    }
    if (block.type === 'image') {
      const alt = String(block.attrs?.alt ?? 'image').replace(/[\[\]]/g, '');
      const src = String(block.attrs?.src ?? '');
      return src ? `![${alt}](${src})` : '';
    }
    if (block.type === 'table') {
      const rows = (block.content ?? []).map((row) =>
        (row.content ?? []).map((cell) => inlineText(cell.content).replace(/\|/g, '\\|').replace(/\n/g, ' ').trim()),
      );
      if (rows.length === 0) return '';
      const width = Math.max(...rows.map((row) => row.length));
      const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')]);
      const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
      return [line(normalized[0]), line(normalized[0].map(() => '---')), ...normalized.slice(1).map(line)].join('\n');
    }
    return inlineText(block.content).replace(/\s+$/g, '');
  });

  const markdown = blocks.filter((block) => block.trim().length > 0).join('\n\n').trim();
  return markdown ? `${markdown}\n` : '';
}

export function docToPlainText(doc: DocContent): string {
  return docToMarkdown(doc)
    .replace(/<u>(.*?)<\/u>/g, '$1')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1');
}

export function titleFromFilename(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? filename;
  const words = base
    .replace(/\.(txt|md|docx)$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!words) return 'Imported document';
  return (words.charAt(0).toUpperCase() + words.slice(1)).slice(0, 120);
}
