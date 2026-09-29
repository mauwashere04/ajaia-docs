import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type RemoteCaret = {
  name: string;
  from: number;
  to: number;
  color: string;
};

export const remoteCaretKey = new PluginKey<DecorationSet>('remoteCarets');

export function caretDecorations(doc: ProseMirrorNode, carets: RemoteCaret[]) {
  const size = doc.content.size;
  const decorations = carets.flatMap((caret) => {
    const from = Math.max(0, Math.min(caret.from, size));
    const to = Math.max(from, Math.min(caret.to, size));
    const items = [];
    if (to > from) {
      items.push(
        Decoration.inline(from, to, {
          class: 'remote-selection',
          style: `background-color: ${caret.color}33`,
        }),
      );
    }
    items.push(
      Decoration.widget(
        from,
        () => {
          const span = document.createElement('span');
          span.className = 'remote-caret';
          span.dataset.name = caret.name;
          span.style.setProperty('--caret', caret.color);
          return span;
        },
        { side: 1 },
      ),
    );
    return items;
  });
  return DecorationSet.create(doc, decorations);
}

export const RemoteCarets = Extension.create({
  name: 'remoteCarets',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: remoteCaretKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous) {
            const next = transaction.getMeta(remoteCaretKey) as DecorationSet | undefined;
            if (next) return next;
            return previous.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations(state) {
            return remoteCaretKey.getState(state);
          },
        },
      }),
    ];
  },
});
