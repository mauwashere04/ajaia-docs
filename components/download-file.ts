import type { DocContent, JSONNode } from '@/lib/types';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  UnderlineType,
  WidthType,
} from 'docx';
import { docToMarkdown, docToPlainText } from '@/lib/markdown';

function filename(title: string, extension: string) {
  const base = title.trim().replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'document';
  return `${base}.${extension}`;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function imageDataUrl(src: string) {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function runs(nodes: JSONNode[] | undefined, fallbackSize: number): Array<{ text: string; size: number; style: string }> {
  const items: Array<{ text: string; size: number; style: string }> = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      items.push({ text: '\n', size: fallbackSize, style: 'normal' });
      continue;
    }
    if (node.type === 'text') {
      const marks = new Set(node.marks?.map((mark) => mark.type));
      const sizeMark = node.marks?.find((mark) => mark.type === 'textStyle')?.attrs?.fontSize;
      const size = typeof sizeMark === 'string' ? Number.parseInt(sizeMark, 10) || fallbackSize : fallbackSize;
      const style = marks.has('bold') && marks.has('italic') ? 'bolditalic' : marks.has('bold') ? 'bold' : marks.has('italic') ? 'italic' : 'normal';
      items.push({ text: node.text ?? '', size, style });
      continue;
    }
    items.push(...runs(node.content, fallbackSize));
  }
  return items;
}

export function downloadMarkdownFile(title: string, doc: DocContent) {
  saveBlob(new Blob([docToMarkdown(doc)], { type: 'text/markdown;charset=utf-8' }), filename(title, 'md'));
}

export function downloadTextFile(title: string, doc: DocContent) {
  saveBlob(new Blob([docToPlainText(doc)], { type: 'text/plain;charset=utf-8' }), filename(title, 'txt'));
}

export async function downloadPdfFile(title: string, doc: DocContent) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 64;
  const maxWidth = pageWidth - margin * 2;
  let y = 72;

  const drawLine = (line: Array<{ text: string; size: number; style: string }>, align: string) => {
    const width = line.reduce((sum, run) => {
      pdf.setFont('times', run.style);
      pdf.setFontSize(run.size);
      return sum + pdf.getTextWidth(run.text);
    }, 0);
    let x = margin;
    if (align === 'center') x = (pageWidth - width) / 2;
    if (align === 'right') x = pageWidth - margin - width;
    const lineSize = Math.max(...line.map((run) => run.size), 12);
    const lineHeight = Math.ceil(lineSize * 1.75);
    if (y + lineHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    for (const run of line) {
      pdf.setFont('times', run.style);
      pdf.setFontSize(run.size);
      pdf.text(run.text, x, y + lineSize);
      x += pdf.getTextWidth(run.text);
    }
    y += lineHeight;
  };

  pdf.setFont('times', 'bold');
  pdf.setFontSize(22);
  pdf.text(title || 'Untitled', margin, y);
  y += 34;

  for (const block of doc.content) {
    if (block.type === 'image') {
      const alt = String(block.attrs?.alt ?? 'Image');
      const data = typeof block.attrs?.src === 'string' ? await imageDataUrl(block.attrs.src) : null;
      if (y + 180 > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      if (data) {
        const kind = data.includes('image/png') ? 'PNG' : 'JPEG';
        try {
          pdf.addImage(data, kind, margin, y, Math.min(maxWidth, 360), 160);
          y += 176;
          continue;
        } catch {
          // Fall through to the text label when the file cannot be embedded.
        }
      }
      pdf.setFont('times', 'italic');
      pdf.setFontSize(12);
      pdf.text(alt, margin, y);
      y += 20;
      continue;
    }
    if (block.type === 'table') {
      for (const row of block.content ?? []) {
        const cells = (row.content ?? []).map((cell) => runs(cell.content, 12).map((run) => run.text).join('').trim());
        const text = cells.join('  |  ');
        if (!text) continue;
        pdf.setFont('times', row.content?.[0]?.type === 'tableHeader' ? 'bold' : 'normal');
        pdf.setFontSize(12);
        const wrapped = pdf.splitTextToSize(text, maxWidth) as string[];
        for (const line of wrapped) {
          if (y + 16 > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }
          pdf.text(line, margin, y);
          y += 16;
        }
        y += 4;
      }
      y += 8;
      continue;
    }
    const align = block.attrs?.textAlign === 'center' || block.attrs?.textAlign === 'right' ? block.attrs.textAlign : 'left';
    const headingSize = block.type === 'heading' ? (block.attrs?.level === 1 ? 22 : block.attrs?.level === 2 ? 18 : 15) : 12;
    if (block.type === 'heading') y += 8;
    const prefix =
      block.type === 'bulletList' || block.type === 'orderedList'
        ? ''
        : '';
    const blocks = block.type === 'bulletList' || block.type === 'orderedList' ? block.content ?? [] : [block];
    blocks.forEach((item, index) => {
      const source = block.type === 'bulletList' || block.type === 'orderedList' ? item.content : [item];
      const textRuns = runs(source, headingSize);
      const marker = block.type === 'bulletList' ? '• ' : block.type === 'orderedList' ? `${index + 1}. ` : prefix;
      const withMarker = marker ? [{ text: marker, size: 12, style: 'normal' }, ...textRuns] : textRuns;
      if (withMarker.length === 0 || withMarker.every((run) => run.text === '')) {
        y += 12;
        return;
      }
      let line: Array<{ text: string; size: number; style: string }> = [];
      let width = 0;
      for (const run of withMarker) {
        const parts = run.text.split(/(\s+)/);
        for (const part of parts) {
          if (!part) continue;
          if (part === '\n') {
            if (line.length) drawLine(line, align);
            line = [];
            width = 0;
            continue;
          }
          pdf.setFont('times', run.style);
          pdf.setFontSize(run.size);
          const partWidth = pdf.getTextWidth(part);
          if (width + partWidth > maxWidth && width > 0) {
            drawLine(line, align);
            line = [];
            width = 0;
          }
          line.push({ text: part, size: run.size, style: run.style });
          width += partWidth;
        }
      }
      if (line.length) drawLine(line, align);
      y += block.type === 'heading' ? 8 : 6;
    });
  }

  pdf.save(filename(title, 'pdf'));
}

function wordAlignment(align: unknown) {
  if (align === 'center') return AlignmentType.CENTER;
  if (align === 'right') return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

function wordRuns(nodes: JSONNode[] | undefined): TextRun[] {
  const items: TextRun[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      items.push(new TextRun({ break: 1 }));
      continue;
    }
    if (node.type === 'text') {
      const marks = new Set(node.marks?.map((mark) => mark.type));
      const sizeMark = node.marks?.find((mark) => mark.type === 'textStyle')?.attrs?.fontSize;
      const px = typeof sizeMark === 'string' ? Number.parseInt(sizeMark, 10) : Number.NaN;
      items.push(
        new TextRun({
          text: node.text ?? '',
          bold: marks.has('bold'),
          italics: marks.has('italic'),
          underline: marks.has('underline') ? { type: UnderlineType.SINGLE } : undefined,
          size: Number.isFinite(px) ? px * 2 : undefined,
        }),
      );
      continue;
    }
    items.push(...wordRuns(node.content));
  }
  return items.length ? items : [new TextRun('')];
}

async function imageBox(blob: Blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('image'));
      img.src = url;
    });
    const width = img.naturalWidth || 480;
    const height = img.naturalHeight || 270;
    const scale = width > 480 ? 480 / width : 1;
    return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
  } catch {
    return { width: 480, height: 270 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function wordBlocks(blocks: JSONNode[]): Promise<Array<Paragraph | Table>> {
  const children: Array<Paragraph | Table> = [];
  for (const block of blocks) {
    if (block.type === 'image' && typeof block.attrs?.src === 'string') {
      try {
        const response = await fetch(block.attrs.src);
        if (!response.ok) throw new Error('missing');
        const blob = await response.blob();
        const kind = blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : 'jpg';
        const data = new Uint8Array(await blob.arrayBuffer());
        children.push(
          new Paragraph({
            children: [new ImageRun({ type: kind, data, transformation: await imageBox(blob) })],
          }),
        );
      } catch {
        children.push(new Paragraph({ children: [new TextRun(String(block.attrs.alt ?? 'Image'))] }));
      }
      continue;
    }
    if (block.type === 'table') {
      const rows = (block.content ?? [])
        .map(
          (row) =>
            new TableRow({
              children: (row.content ?? []).map(
                (cell) =>
                  new TableCell({
                    children: [new Paragraph({ children: wordRuns(cell.content) })],
                  }),
              ),
            }),
        )
        .filter((row) => row);
      if (rows.length) {
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      }
      continue;
    }
    if (block.type === 'bulletList' || block.type === 'orderedList') {
      for (const item of block.content ?? []) {
        children.push(
          new Paragraph({
            bullet: block.type === 'bulletList' ? { level: 0 } : undefined,
            numbering: block.type === 'orderedList' ? { reference: 'ordered-list', level: 0 } : undefined,
            children: wordRuns(item.content),
          }),
        );
      }
      continue;
    }
    const heading =
      block.type === 'heading'
        ? block.attrs?.level === 1
          ? HeadingLevel.HEADING_1
          : block.attrs?.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3
        : undefined;
    children.push(
      new Paragraph({
        heading,
        alignment: wordAlignment(block.attrs?.textAlign),
        children: wordRuns(block.content),
      }),
    );
  }
  return children.length ? children : [new Paragraph('')];
}

export async function downloadDocxFile(title: string, doc: DocContent) {
  const file = new Document({
    title: title || 'Untitled',
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }],
        },
      ],
    },
    sections: [{ children: await wordBlocks(doc.content) }],
  });
  saveBlob(await Packer.toBlob(file), filename(title, 'docx'));
}
