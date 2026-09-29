import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';

export const commentHighlightKey = new PluginKey<DecorationSet>('commentHighlight');

export const CommentHighlight = Extension.create({
  name: 'commentHighlight',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: commentHighlightKey,
        state: {
          init: () => DecorationSet.empty,
          apply(transaction, previous) {
            const next = transaction.getMeta(commentHighlightKey) as DecorationSet | undefined;
            if (next) return next;
            return previous.map(transaction.mapping, transaction.doc);
          },
        },
        props: {
          decorations(state) {
            return commentHighlightKey.getState(state);
          },
        },
      }),
    ];
  },
});
