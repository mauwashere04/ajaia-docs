import { describe, expect, it } from 'vitest';
import { importFile } from '../lib/import-file';
import { docToMarkdown, markdownToDoc, textToDoc } from '../lib/markdown';

describe('markdown export', () => {
  it('writes headings, emphasis, and lists back out', () => {
    const markdown = docToMarkdown(markdownToDoc('# Title\n\n**Bold** and *italic*\n\n- a\n- b\n\n1. c\n'));
    expect(markdown).toContain('# Title');
    expect(markdown).toContain('**Bold**');
    expect(markdown).toContain('*italic*');
    expect(markdown).toContain('- a');
    expect(markdown).toContain('1. c');
  });

  it('writes tables and images', () => {
    const markdown = docToMarkdown({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }] },
              ],
            },
          ],
        },
        { type: 'image', attrs: { src: '/api/media/example.png', alt: 'Diagram' } },
      ],
    });
    expect(markdown).toContain('| Name | Note |');
    expect(markdown).toContain('| Ada | First |');
    expect(markdown).toContain('![Diagram](/api/media/example.png)');
  });
});

describe('file import', () => {
  it('turns a small markdown subset into editor JSON', () => {
    expect(markdownToDoc('# Title\n\n**Bold** and *italic*\n\n- a\n- b\n\n1. c\n')).toEqual({
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'c' }] }] },
          ],
        },
      ],
    });
  });

  it('keeps plain text literal, including markdown characters', () => {
    const imported = importFile('notes.txt', '# Not a heading\n\nsecond', 28);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.title).toBe('Notes');
    expect(imported.content).toEqual(textToDoc('# Not a heading\n\nsecond'));
    expect(JSON.stringify(imported.content)).not.toContain('"heading"');
  });

  it('rejects unsupported file types and oversized files', () => {
    expect(importFile('brief.docx', 'hello', 5).ok).toBe(false);
    const oversized = importFile('big.md', 'a', 512 * 1024 + 1);
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) expect(oversized.error).toMatch(/512 KB/);
  });
});
