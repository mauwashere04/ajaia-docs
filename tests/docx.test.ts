import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../lib/docx-import';
import { locateQuote } from '../lib/find-quote';
import { htmlToDoc } from '../lib/html-to-doc';

describe('word files', () => {
  it('turns word html into headings, lists, and tables', () => {
    const doc = htmlToDoc('<h1>Title</h1><p>Hello <strong>Ada</strong></p><ul><li>One</li></ul><table><tr><th>A</th></tr><tr><td>B</td></tr></table>');
    expect(doc.content.map((block) => block.type)).toEqual(['heading', 'paragraph', 'bulletList', 'table']);
    expect(JSON.stringify(doc)).toContain('Ada');
  });

  it('reads a real docx into editor content', async () => {
    const buffer = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Weekly')] }),
              new Paragraph({ children: [new TextRun({ text: 'Bring', bold: true })] }),
            ],
          },
        ],
      }),
    );
    const imported = await importDocx('weekly-plan.docx', buffer);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.title).toBe('Weekly plan');
    expect(imported.content.content.some((block) => block.type === 'heading')).toBe(true);
    expect(JSON.stringify(imported.content)).toContain('Bring');
  });

  it('rejects a file that is not a word document', async () => {
    const rejected = await importDocx('brief.docx', Buffer.from('nope'));
    expect(rejected.ok).toBe(false);
  });
});

describe('comment quotes', () => {
  it('finds the quoted text inside a paragraph', () => {
    const schema = getSchema([StarterKit]);
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello quoted world' }] }],
    });
    expect(locateQuote(doc, 'quoted')).toEqual({ from: 7, to: 13 });
  });
});
