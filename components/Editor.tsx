'use client';

import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Table from '@tiptap/extension-table';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TableRow from '@tiptap/extension-table-row';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Underline from '@tiptap/extension-underline';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { CommentHighlight, commentHighlightKey } from '@/components/comment-highlight';
import { FontSize } from '@/components/font-size';
import { caretDecorations, RemoteCaret, RemoteCarets, remoteCaretKey } from '@/components/remote-carets';
import { locateQuote } from '@/lib/find-quote';
import type { DocContent } from '@/lib/types';
import type { Editor as TiptapEditor } from '@tiptap/react';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import { forwardRef, ReactNode, useEffect, useImperativeHandle, useRef, useState } from 'react';

function Tool({
  label,
  name,
  className = '',
  active = false,
  disabled = false,
  onClick,
}: {
  label: ReactNode;
  name: string;
  className?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? `tool is-active ${className}` : `tool ${className}`}
      aria-label={name}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function styleValue(editor: TiptapEditor) {
  if (editor.isActive('heading', { level: 1 })) return '1';
  if (editor.isActive('heading', { level: 2 })) return '2';
  if (editor.isActive('heading', { level: 3 })) return '3';
  return 'p';
}

function displayedSize(editor: TiptapEditor) {
  const marked = editor.getAttributes('textStyle').fontSize;
  if (typeof marked === 'string') {
    const parsed = Number.parseInt(marked, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (editor.isActive('heading', { level: 1 })) return 34;
  if (editor.isActive('heading', { level: 2 })) return 25;
  if (editor.isActive('heading', { level: 3 })) return 20;
  return 18;
}

function FontSizeControl({ editor }: { editor: TiptapEditor }) {
  const size = displayedSize(editor);
  const [draft, setDraft] = useState(String(size));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(String(size));
  }, [size]);

  function apply(next: number) {
    const clamped = Math.min(96, Math.max(8, Math.round(next)));
    setDraft(String(clamped));
    editor.chain().focus().setFontSize(`${clamped}px`).run();
  }

  function currentDraft() {
    const parsed = Number.parseInt(draft, 10);
    return Number.isFinite(parsed) ? parsed : size;
  }

  return (
    <span className="size-stepper">
      <button
        type="button"
        aria-label="Decrease font size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => apply(currentDraft() - 1)}
      >
        −
      </button>
      <input
        aria-label="Font size"
        inputMode="numeric"
        value={draft}
        onFocus={() => {
          focused.current = true;
        }}
        onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
        onBlur={() => {
          focused.current = false;
          apply(currentDraft());
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            apply(currentDraft());
          }
        }}
      />
      <button
        type="button"
        aria-label="Increase font size"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => apply(currentDraft() + 1)}
      >
        +
      </button>
    </span>
  );
}

export type EditorHandle = {
  applyRemote: (content: DocContent) => void;
  setCarets: (carets: RemoteCaret[]) => void;
  revealQuote: (quote: string) => boolean;
};

export const Editor = forwardRef<
  EditorHandle,
  {
    initial: DocContent;
    documentId: string;
    editable?: boolean;
    onChange: (content: DocContent) => void;
    onQuoteChange?: (quote: string) => void;
    onSelection?: (from: number, to: number) => void;
  }
>(function Editor({ initial, documentId, editable = true, onChange, onQuoteChange, onSelection }, ref) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const uploadRef = useRef<(file: File) => void>(() => {});
  const highlightTimer = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      FontSize,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image.configure({ inline: false, allowBase64: false }),
      CommentHighlight,
      RemoteCarets,
      Placeholder.configure({ placeholder: editable ? 'Start writing…' : 'View only' }),
    ],
    content: initial,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'editor-body',
        'aria-label': 'Document body',
      },
      handlePaste(_view, event) {
        const file = [...event.clipboardData?.files ?? []].find((item) => item.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        uploadRef.current(file);
        return true;
      },
      handleDrop(_view, event) {
        const file = [...event.dataTransfer?.files ?? []].find((item) => item.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault();
        uploadRef.current(file);
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      onChange(current.getJSON() as DocContent);
    },
    onSelectionUpdate: ({ editor: current }) => {
      const { from, to } = current.state.selection;
      onSelection?.(from, to);
      if (from === to) {
        onQuoteChange?.('');
        return;
      }
      onQuoteChange?.(current.state.doc.textBetween(from, to, '\n').slice(0, 280));
    },
  });

  useImperativeHandle(ref, () => ({
    applyRemote(content) {
      editor?.commands.setContent(content, false);
    },
    setCarets(carets) {
      if (!editor) return;
      const decorations = caretDecorations(editor.state.doc, carets);
      editor.view.dispatch(editor.state.tr.setMeta(remoteCaretKey, decorations));
    },
    revealQuote(quote: string) {
      if (!editor) return false;
      const range = locateQuote(editor.state.doc, quote);
      if (!range) return false;
      editor.chain().focus().setTextSelection(range).scrollIntoView().run();
      editor.view.dispatch(
        editor.state.tr
          .setMeta(commentHighlightKey, DecorationSet.create(editor.state.doc, [Decoration.inline(range.from, range.to, { class: 'comment-target' })]))
          .setMeta('addToHistory', false),
      );
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => {
        if (editor.isDestroyed) return;
        editor.view.dispatch(editor.state.tr.setMeta(commentHighlightKey, DecorationSet.empty).setMeta('addToHistory', false));
      }, 2200);
      return true;
    },
  }));

  useEffect(() => {
    editor?.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    return () => {
      if (highlightTimer.current) window.clearTimeout(highlightTimer.current);
    };
  }, []);

  uploadRef.current = (file) => {
    if (!editor) return;
    void (async () => {
      setImageError(null);
      const body = new FormData();
      body.set('file', file);
      const response = await fetch(`/api/documents/${documentId}/images`, { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { url?: string; alt?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        setImageError(payload?.error ?? 'Could not add that image.');
        return;
      }
      editor.chain().focus().setImage({ src: payload.url, alt: payload.alt || file.name }).run();
    })();
  };

  if (!editor) return <p className="lede">Opening editor…</p>;

  return (
    <div className="editor-stack">
      <div className="toolbar-dock no-print">
        {editable ? (
          <div className="toolbar" role="toolbar" aria-label="Formatting">
          <select
            className="style-select"
            aria-label="Paragraph style"
            value={styleValue(editor)}
            onChange={(event) => {
              const value = event.target.value;
              if (value === 'p') editor.chain().focus().setParagraph().run();
              else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run();
            }}
          >
            <option value="p">Normal</option>
            <option value="1">Heading 1</option>
            <option value="2">Heading 2</option>
            <option value="3">Heading 3</option>
          </select>
          <FontSizeControl editor={editor} />
          <span className="tool-rule" />
          <Tool className="tool-bold" label="B" name="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} />
          <Tool className="tool-italic" label="I" name="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <Tool className="tool-underline" label="U" name="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <span className="tool-rule" />
          <Tool label="Left" name="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} />
          <Tool label="Center" name="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} />
          <Tool label="Right" name="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} />
          <span className="tool-rule" />
          <Tool label="List" name="Bulleted list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <Tool label="1." name="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <span className="tool-rule" />
          <Tool
            label="Table"
            name="Insert table"
            active={editor.isActive('table')}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          />
          <Tool label="Image" name="Insert image" onClick={() => fileRef.current?.click()} />
          {editor.isActive('table') ? (
            <>
              <Tool label="+ Row" name="Add row" onClick={() => editor.chain().focus().addRowAfter().run()} />
              <Tool label="+ Col" name="Add column" onClick={() => editor.chain().focus().addColumnAfter().run()} />
              <Tool label="Delete" name="Delete table" onClick={() => editor.chain().focus().deleteTable().run()} />
            </>
          ) : null}
          <span className="tool-spacer" />
          <Tool
            className="tool-icon"
            name="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
            label={
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 14 4 9l5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
          <Tool
            className="tool-icon"
            name="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
            label={
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 14 5-5-5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </div>
        ) : (
          <p className="hint view-only">View only. You can still select text and comment.</p>
        )}
        {imageError ? (
          <p className="error" role="alert">
            {imageError}
          </p>
        ) : null}
      </div>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) uploadRef.current(file);
        }}
      />
      <article className="sheet">
        <EditorContent editor={editor} />
      </article>
    </div>
  );
});
