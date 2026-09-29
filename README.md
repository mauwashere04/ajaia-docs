# Ajaia Docs

A small shared document editor. Two seeded people can sign in, write with basic formatting, import a `.txt` or `.md` file, and share a document with each other.

## Accounts

| Name | Email | Password | Starts with |
| --- | --- | --- | --- |
| Alex Rivera | alex@ajaia.test | demo1234 | Owns “Welcome to Ajaia Docs” |
| Sam Okonkwo | sam@ajaia.test | demo1234 | Sees that document under Shared with you |

The login screen can sign in as either person directly. The password form uses the same accounts.

## Run locally

The zip does not include `node_modules`, `.next`, or `data`. Those are created on your machine.

1. Install Node.js 22 or newer. `.nvmrc` is `22`.
2. Unzip the project and open a terminal in that folder.
3. Install dependencies and start the app:

```bash
npm install
npm run dev
```

4. Open http://localhost:3000.
5. Sign in as Alex or Sam from the table above. On the login screen, either name signs you in directly. The password for both accounts is `demo1234`.

`npm install` is required. Without it, `npm run dev` cannot start.

Optional checks, from the same folder:

```bash
npm test
```

With the dev server already running, `node scripts/smoke.mjs` signs in as both people, shares a document, saves formatting, and imports `examples/weekly-plan.md`.

The first launch creates `data/ajaia.db` and seeds the welcome document. Delete the `data` folder and start the app again to get that seed back. `data` is local only. Do not put it in the zip.

Optional environment variables are in `.env.example`.

- `SESSION_SECRET` signs the login cookie. Set a long random value before any shared deployment. Local development uses a built-in fallback.
- `DATABASE_PATH` overrides the SQLite file location.
- `SESSION_SECURE=true` marks the login cookie Secure. Turn that on for an HTTPS deployment. Leave it unset for local HTTP, including `npm start` on localhost.

## Also in the editor

- **Presence.** A green line appears when the other account has the document open. Their caret and selection show in the text, and their edits land in place about once a second. If you are both typing at once, your text stays and a banner offers their version.
- **Comments.** Select text, open Comments, and leave a note. Anyone with access can comment and resolve. Viewers can comment.
- **History.** Saves from the same person within about a minute fold into one version. Open History to preview and restore. A viewer cannot restore.
- **Save as.** Markdown (`.md`), plain text (`.txt`), PDF (`.pdf`), or Word (`.docx`). The PDF is a downloaded file. Underline exports as HTML `<u>` in Markdown because Markdown has no underline.
- **Alignment.** Left, center, and right apply to the current paragraph or heading. Font size is a stepper. Paragraph style is a dropdown.
- **Tables and images.** Table inserts a 3 by 3 grid. Inside a table, the toolbar can add a row, add a column, or delete the table. Image uploads a PNG, JPEG, GIF, or WebP up to 2 MB. You can also paste or drop an image.
- **Roles.** The owner can grant Can edit or Can view, change that later, or remove access. Viewers cannot edit or restore.

## Import limits

The library accepts `.txt` and `.md` files up to 512 KB, and `.docx` files up to 5 MB.

- `.md` imports headings (`#` through `###`), `**bold**`, `*italic*`, bulleted lists, and numbered lists. Other Markdown is kept as plain text.
- `.txt` imports as paragraphs. Characters such as `#` stay literal.
- `.docx` imports headings, bold, italic, underline, lists, tables, and images. Save as can write the same document back out as Word.

Other formats are rejected in the UI and the API.

## Production

```bash
npm test
npm run build
npm start
```

The app listens on `0.0.0.0` and on `PORT` when that variable is set.

### Deploy on Netlify

`netlify.toml` sets Node 22, enables SQLite, and stores the database under `/tmp` so the function can write it. In the Netlify site settings, add `SESSION_SECRET` to a long random string. `SESSION_SECURE` is already true in that file.

Netlify runs the app as short-lived functions. The database and uploaded images live in `/tmp` for that function only. A reviewer can sign in and edit during one visit. A later visit, or a second browser that hits a different function, can see a fresh welcome document again. Treat the Netlify URL as a live click-through, and record the two-person demo locally if the live site resets.

### Deploy with the Dockerfile

A `Dockerfile` is included. On a host that runs one container, documents survive refresh while that process stays up, and they can disappear when the instance sleeps or is redeployed. To keep the file across restarts, mount a persistent disk and set:

```bash
DATABASE_PATH=/data/ajaia.db
SESSION_SECRET=a-long-random-string
SESSION_SECURE=true
```

`render.yaml` describes a Render Docker web service. Persistent disks there are a paid option, so the free service should be treated as a live demo rather than durable storage.

## Tests

```bash
npm test
```

The document test checks the access rule that matters: another user cannot open a document until the owner shares it, and after that it shows up only under Shared with you. Import and session tests cover the other boundaries.

With the dev server running, `node scripts/smoke.mjs` signs in as both people, shares a document, saves formatting, and imports a markdown file. That script creates extra documents in the local database.

Node may print `ExperimentalWarning: SQLite is an experimental feature` because the app uses the built-in `node:sqlite` module. The warning is expected.
