import type { Node as ProseNode } from '@tiptap/pm/model';

export function locateQuote(doc: ProseNode, quote: string): { from: number; to: number } | null {
  const needle = quote.trim();
  if (!needle) return null;

  let text = '';
  const positions: number[] = [];
  let separated = true;
  doc.nodesBetween(0, doc.content.size, (node, pos) => {
    if (node.isText && node.text) {
      for (let index = 0; index < node.text.length; index += 1) {
        text += node.text[index];
        positions.push(pos + index);
      }
      separated = false;
      return;
    }
    if (node.isLeaf) {
      separated = false;
      return;
    }
    if (!separated && node.isBlock) {
      text += '\n';
      positions.push(-1);
      separated = true;
    }
  });

  const at = text.indexOf(needle);
  if (at < 0) return null;
  let from = -1;
  let to = -1;
  for (let index = at; index < at + needle.length; index += 1) {
    const position = positions[index];
    if (position === undefined || position < 0) continue;
    if (from < 0) from = position;
    to = position + 1;
  }
  if (from < 0 || to < from) return null;
  return { from, to };
}
