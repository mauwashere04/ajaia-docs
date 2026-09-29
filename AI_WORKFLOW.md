# AI workflow

I used Cursor with Grok as the coding assistant. I did not paste the finished app in from a single prompt. I locked the scope first, then had the assistant implement that slice.

## Where it sped the work up

- Turning the open prompt into a cut list: TipTap JSON, SQLite, two seeded users, `.txt` and `.md` only, no live collaboration.
- Scaffolding the Next.js routes, the editor toolbar, and the SQLite access layer in one pass.
- Drafting the markdown-to-JSON importer and the tests around sharing.

## What I changed or rejected

- Started without live cursors. After trying the editor with two accounts, I added a fast heartbeat that draws the other person’s caret and applies their text in place. I still skipped a CRDT. If both people are mid-edit, the app keeps the local draft and offers the other version instead of merging keystrokes.
- Rejected suggestion mode. Comments quote a selection and sit beside the document, which is enough to review without a second editing model.
- The first PDF button used the browser print dialog, which looked for a printer. Save as now downloads a real `.pdf`, plus `.md`, `.txt`, and `.docx`.
- The first version rejected `.docx`. Import and Save as now read and write Word files for headings, lists, tables, and images. A file that is not a real Word document is still rejected.
- Tried page separators that split a long document into letter-size sheets. They clipped lines and the page height never stayed stable, so I removed them. The document is one continuous page.
- Rejected mapping every forbidden read to a silent empty editor. Private documents return the same 404 as a missing id; an editor who tries to share still gets a plain 403.
- Kept the welcome document seeded and already shared, so a reviewer can see both library sections without creating data by hand.
- The assistant’s first design used a longer spec cycle. I skipped that and approved one stack so implementation could start.

## How I checked it

- `npm test` covers sharing, saved formatting, import limits, and the session cookie signature.
- `npm run build` typechecks the app.
- With the dev server running, `node scripts/smoke.mjs` signs in as both seeded users, proves Sam gets a 404 until Alex shares, then saves a heading and bold text and reads them back. It also imports `weekly-plan.md` and rejects a file that only pretends to be a `.docx`.

I have not clicked through the toolbar in a browser yet. The editor page renders, and the saved document JSON is the same shape TipTap writes. The walkthrough video is recorded separately.
