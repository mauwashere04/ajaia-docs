# Architecture

## What this is

Ajaia Docs is one Next.js app. The browser edits rich text. Route handlers read and write a SQLite file. A signed cookie is the whole session.

The product slice is create, rename, format, save, reopen, import `.txt` or `.md`, and share with one other seeded user. Owned and shared documents are separate lists.

## What this slice adds

Presence, comments, version history, export, and viewer/editor roles sit on the same editor. They are deliberately smaller than the full Google Docs versions of those ideas.

- Presence is a heartbeat about every 800ms. It carries the caret and, when the writer is not behind, the document JSON. The other editor applies that JSON in place. It is not a CRDT: two people typing the same paragraph do not merge keystrokes. The person who is behind keeps their draft and can take the newer copy.
- A write is stored only when the sender’s last-seen timestamp still matches the document. A viewer heartbeat never writes.
- Comments are a quote plus a note. There is no suggestion mode that rewrites the document.
- History keeps up to 30 versions. Autosaves from the same person collapse for about 60 seconds so the list stays readable.
- Save as downloads Markdown, plain text, PDF, or Word. Tables and images are included.
- Sharing is owner, editor, or viewer. Only the owner changes access. Viewers can read, comment, and export.

The read API still returns 404 for a document the caller cannot see. A viewer who tries to save gets a 403 that says they have view access.

## Next, with a few more hours

1. Put the SQLite file on a persistent disk or Turso so a live instance survives sleep.
2. Merge simultaneous keystrokes in the same paragraph. The current path keeps one draft and offers the other.
3. Suggestion mode that proposes a replacement instead of a side comment.

## Storage

SQLite through Node’s `node:sqlite` keeps the demo free of hosted databases and native build tools. The tradeoff is an experimental Node API, and a file that only lasts as long as the disk under it. Locally, `data/ajaia.db` survives restarts. On a free host without a volume, it survives refresh but not a new process.

Documents store TipTap JSON, not HTML. Reloading the editor uses that JSON, so bold, lists, and headings come back without a second format to keep in sync.

Tables:

- `users` — the two seeded accounts
- `documents` — title, JSON body, owner, timestamps
- `document_shares` — one row per person, with role `editor` or `viewer`
- `document_versions` — title and JSON snapshots, capped at 30
- `comments` — quote, body, author, optional resolved time
- `presence` — last heartbeat and caret position per person per document

Passwords are scrypt hashes. Both demo passwords are printed on the login screen, so this is compartmentalization, not a secret-management design.

## Access

The store distinguishes missing documents, documents the caller cannot read, owner-only actions, and view-only writes.

The HTTP API collapses “cannot read” into the same 404 as “missing”, so a guessed id does not reveal that a private document exists. An editor who tries to share gets a 403. A viewer who tries to save or restore gets a 403 that names the view-only limit.

The automated tests cover the owned-versus-shared split, viewer denial, restore, comments, and presence.

## Request path

1. Login checks the seeded user and sets an httpOnly HMAC cookie.
2. The library and editor call JSON routes. Pages only check that a valid cookie exists, then the client loads data.
3. Saves are debounced from the editor. The title and the TipTap document go in one PATCH, and a version is recorded when the content changed.
4. Import parses the file on the server and creates a normal document. After that, the file is gone; the document is the source of truth.
5. While a document is open, the browser posts a presence heartbeat and learns if someone else saved a newer copy.
