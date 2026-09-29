import { HTMLElement, Node, NodeType, parse } from 'node-html-parser';
import type { DocContent, JSONNode } from './types';

type Mark = { type: string; attrs?: Record<string, unknown> };

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function alignAttrs(element: HTMLElement): Record<string, unknown> | undefined {
  const style = element.getAttribute('style') ?? '';
  const match = /text-align:\s*(center|right)/i.exec(style);
  if (!match) return undefined;
  return { textAlign: match[1].toLowerCase() };
}

function withAttrs(node: JSONNode, attrs?: Record<string, unknown>): JSONNode {
  if (!attrs || Object.keys(attrs).length === 0) return node;
  return { ...node, attrs: { ...node.attrs, ...attrs } };
}

function inlineNodes(node: Node, marks: Mark[]): JSONNode[] {
  if (node.nodeType === NodeType.TEXT_NODE) {
    const text = node.text;
    if (!text) return [];
    return [{ type: 'text', text, ...(marks.length ? { marks } : {}) }];
  }
  if (!isElement(node)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'br') return [{ type: 'hardBreak' }];
  if (tag === 'img') return [];
  let next = marks;
  if (tag === 'strong' || tag === 'b') next = [...marks, { type: 'bold' }];
  if (tag === 'em' || tag === 'i') next = [...marks, { type: 'italic' }];
  if (tag === 'u') next = [...marks, { type: 'underline' }];
  return node.childNodes.flatMap((child) => inlineNodes(child, next));
}

function paragraph(element: HTMLElement, type: 'paragraph' | 'heading' = 'paragraph', level?: number): JSONNode {
  const content = element.childNodes.flatMap((child) => inlineNodes(child, []));
  const attrs = { ...alignAttrs(element), ...(type === 'heading' ? { level: level ?? 1 } : {}) };
  const node: JSONNode = { type, ...(content.length ? { content } : {}) };
  return withAttrs(node, attrs);
}

function imageNode(element: HTMLElement): JSONNode[] {
  const src = element.getAttribute('src') ?? '';
  if (!src) return [];
  return [{ type: 'image', attrs: { src, alt: element.getAttribute('alt') ?? '' } }];
}

function listItem(element: HTMLElement): JSONNode {
  const blocks = element.childNodes.filter(isElement).flatMap((child) => blocksFrom(child));
  const content = blocks.length ? blocks : [paragraph(element)];
  return { type: 'listItem', content };
}

function tableNode(element: HTMLElement): JSONNode {
  const rows = element
    .querySelectorAll('tr')
    .map((row) => {
      const cells = row.childNodes
        .filter(isElement)
        .filter((cell) => cell.tagName.toLowerCase() === 'td' || cell.tagName.toLowerCase() === 'th');
      return {
        type: 'tableRow',
        content: cells.map((cell) => {
          const inner = cell.childNodes.filter(isElement).flatMap((child) => blocksFrom(child));
          return {
            type: cell.tagName.toLowerCase() === 'th' ? 'tableHeader' : 'tableCell',
            content: inner.length ? inner : [paragraph(cell)],
          };
        }),
      };
    })
    .filter((row) => (row.content ?? []).length > 0);
  return { type: 'table', content: rows };
}

function blocksFrom(element: HTMLElement): JSONNode[] {
  const tag = element.tagName.toLowerCase();
  if (tag === 'img') return imageNode(element);
  if (/^h[1-6]$/.test(tag)) {
    const level = Math.min(3, Number(tag[1]) || 1);
    return [paragraph(element, 'heading', level)];
  }
  if (tag === 'p') {
    const images = element.querySelectorAll('img');
    if (images.length && !element.text.trim()) return images.flatMap((image) => imageNode(image));
    return [paragraph(element)];
  }
  if (tag === 'ul' || tag === 'ol') {
    const items = element.childNodes.filter(isElement).filter((child) => child.tagName.toLowerCase() === 'li').map(listItem);
    if (!items.length) return [];
    return [
      {
        type: tag === 'ol' ? 'orderedList' : 'bulletList',
        ...(tag === 'ol' ? { attrs: { start: 1 } } : {}),
        content: items,
      },
    ];
  }
  if (tag === 'table') return [tableNode(element)];
  return element.childNodes.filter(isElement).flatMap((child) => blocksFrom(child));
}

export function htmlToDoc(html: string): DocContent {
  const root = parse(`<article>${html}</article>`);
  const article = root.querySelector('article');
  const content = article ? article.childNodes.filter(isElement).flatMap((child) => blocksFrom(child)) : [];
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] };
}
