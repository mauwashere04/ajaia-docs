# Submission

## Included

- Source code for Ajaia Docs (Next.js, TipTap, SQLite)
- `README.md` — local setup, accounts, import limits
- `ARCHITECTURE.md` — scope, storage, access rules, next steps
- `AI_WORKFLOW.md` — how AI was used and what was changed
- `examples/weekly-plan.md` — a file to import
- `Dockerfile` and `render.yaml` — a container deploy
- `netlify.toml` — Netlify build settings
- Automated tests (`npm test`)

## Reviewer access

| Name | Email | Password |
| --- | --- | --- |
| Alex Rivera | alex@ajaia.test | demo1234 |
| Sam Okonkwo | sam@ajaia.test | demo1234 |

Local app, after unzip: `npm install`, then `npm run dev`, then http://localhost:3000. Node.js 22 or newer. Full steps are in `README.md`. Dependencies are not in the zip.

Paste these after the steps below.

```
DRIVE_FOLDER_URL=
LIVE_URL=
```

The walkthrough URL goes in `WALKTHROUGH.txt`.

## Still to do before sending

1. Zip the project from the folder that contains `package.json`. Leave out `node_modules`, `.next`, `data`, and `.env`. Those are installed or created locally. From the parent of this folder:

```bash
tar -a -c -f ajaia-docs.zip --exclude=node_modules --exclude=.next --exclude=data --exclude=.env -C ajaia-docs .
```

Upload that zip to Google Drive, set the link to anyone with the link can view, and paste it above. A reviewer unzips it, runs `npm install`, then `npm run dev`.
2. Deploy on Netlify and paste the site URL above.
3. Record the 3–5 minute Loom and paste the URL in `WALKTHROUGH.txt`.

## Walkthrough

Record a 3–5 minute unlisted Loom. Suggested path:

1. Sign in as Alex and open the welcome document.
2. Show the style dropdown, font-size stepper, bold, and center alignment. Rename the document and refresh so the text is still there.
3. Insert a table. Save as Word, then mention import accepts `.txt`, `.md`, and `.docx`.
4. Share the document with `sam@ajaia.test` as Can view, then switch it to Can edit.
5. Sign out, sign in as Sam, and show it under Shared with you. As a viewer, show that the toolbar is gone and a comment still saves. Click that comment so the quote highlights in the document.
6. Open the document in two browsers, both as editors. Show the other person’s caret, type in one window, and show the text appear in the other. Open History, then Close it.
7. Say what was left out: merged keystrokes when both people type the same paragraph, and suggestion mode.
8. Mention Cursor/Grok, and that tests cover sharing, roles, history, comments, presence, and Word import.

## Intentionally incomplete

Working:

- Create, rename, rich text, autosave, reopen
- Import `.txt` and `.md` up to 512 KB, and `.docx` up to 5 MB
- Owner, editor, and viewer access, including change and remove
- Owned and shared lists
- Presence, the other person’s caret, and in-place text updates
- Comments with an optional quote, click-to-highlight, resolve, and reopen
- Version history with preview and restore
- Save as Markdown, plain text, PDF, or Word
- Left, center, and right alignment, plus a font-size stepper and a heading dropdown
- Tables and image upload
- Tests for access, roles, history, comments, presence, live writes, and Word import

Not built:

- Character-level merge when both people type the same paragraph
- Suggestion mode that rewrites the document
- Signup or more than two users
- Page breaks. A fixed page size kept clipping lines, so the document stays one continuous page.

With another 2–4 hours I would put SQLite on a persistent disk, then merge overlapping keystrokes. Suggestion mode is the feature after that.
