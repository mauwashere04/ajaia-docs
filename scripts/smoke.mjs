const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

function client() {
  const cookies = new Map();
  return {
    async send(path, options = {}) {
      const headers = new Headers(options.headers);
      if (cookies.size) headers.set('cookie', [...cookies].map(([key, value]) => `${key}=${value}`).join('; '));
      const response = await fetch(base + path, { ...options, headers, redirect: 'manual' });
      for (const line of response.headers.getSetCookie()) {
        const [pair] = line.split(';');
        const eq = pair.indexOf('=');
        cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      }
      const text = await response.text();
      let body = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: response.status, body, location: response.headers.get('location') };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const alex = client();
const home = await alex.send('/');
assert(home.status === 307 && home.location?.endsWith('/login'), `home redirect failed: ${home.status} ${home.location}`);

const loginPage = await alex.send('/login');
assert(loginPage.status === 200 && String(loginPage.body).includes('Ajaia Docs'), 'login page missing');

const bad = await alex.send('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'alex@ajaia.test', password: 'wrong' }),
});
assert(bad.status === 401, `bad password status ${bad.status}`);

const signedIn = await alex.send('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'alex@ajaia.test', password: 'demo1234' }),
});
assert(signedIn.status === 200 && signedIn.body.user.name === 'Alex Rivera', 'alex login failed');

const library = await alex.send('/api/documents');
assert(library.status === 200, 'library failed');
assert(library.body.owned.some((doc) => doc.title === 'Welcome to Ajaia Docs'), 'welcome doc missing for alex');
assert(library.body.shared.length === 0, 'alex should not have shared docs yet');

const created = await alex.send('/api/documents', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Smoke plan' }),
});
assert(created.status === 201, `create failed ${created.status} ${JSON.stringify(created.body)}`);
const id = created.body.document.id;

const sam = client();
await sam.send('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sam@ajaia.test', password: 'demo1234' }),
});
const hidden = await sam.send(`/api/documents/${id}`);
assert(hidden.status === 404, `sam should not see unshared doc, got ${hidden.status}`);

const shared = await alex.send(`/api/documents/${id}/share`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'sam@ajaia.test' }),
});
assert(shared.status === 200, `share failed ${shared.status} ${JSON.stringify(shared.body)}`);

const opened = await sam.send(`/api/documents/${id}`);
assert(opened.status === 200 && opened.body.document.role === 'editor', 'sam editor open failed');

const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Kept' }] },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'bold line', marks: [{ type: 'bold' }] }],
    },
  ],
};
const saved = await sam.send(`/api/documents/${id}`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Smoke plan edited', content }),
});
assert(saved.status === 200, `save failed ${saved.status}`);

const reread = await alex.send(`/api/documents/${id}`);
assert(reread.body.document.title === 'Smoke plan edited', 'title did not persist');
assert(JSON.stringify(reread.body.document.content) === JSON.stringify(content), 'formatting did not persist');

const samLibrary = await sam.send('/api/documents');
assert(samLibrary.body.shared.some((doc) => doc.id === id), 'shared list missing document');
assert(!samLibrary.body.owned.some((doc) => doc.id === id), 'shared document leaked into owned');

const blocked = await sam.send(`/api/documents/${id}/share`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'alex@ajaia.test' }),
});
assert(blocked.status === 403, `editor share should be 403, got ${blocked.status}`);

const form = new FormData();
form.set('file', new File(['# Imported\n\n- item\n'], 'weekly-plan.md', { type: 'text/markdown' }));
const imported = await alex.send('/api/import', { method: 'POST', body: form });
assert(imported.status === 201 && imported.body.document.title === 'Weekly plan', `import failed ${imported.status} ${JSON.stringify(imported.body)}`);
assert(imported.body.document.content.content[0].type === 'heading', 'import did not keep the heading');

const docx = new FormData();
docx.set('file', new File(['nope'], 'brief.docx', { type: 'application/octet-stream' }));
const rejected = await alex.send('/api/import', { method: 'POST', body: docx });
assert(rejected.status === 400, `docx should be rejected, got ${rejected.status}`);

const page = await alex.send(`/docs/${id}`);
assert(page.status === 200 && String(page.body).includes('Loading document'), 'editor page did not render');

console.log('smoke ok', id);
