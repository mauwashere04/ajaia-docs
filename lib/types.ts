export type AccessRole = 'owner' | 'editor' | 'viewer';
export type ShareRole = 'editor' | 'viewer';

export type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  content?: JSONNode[];
};

export type DocContent = {
  type: 'doc';
  content: JSONNode[];
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
};

export type Summary = {
  id: string;
  title: string;
  updatedAt: string;
  role: AccessRole;
  ownerName: string;
};

export type Collaborator = {
  name: string;
  email: string;
  role: ShareRole;
};

export type PublicDocument = {
  id: string;
  title: string;
  content: DocContent;
  updatedAt: string;
  role: AccessRole;
  owner: { name: string; email: string };
  collaborators: Collaborator[];
};

export type CommentRecord = {
  id: string;
  quote: string;
  body: string;
  createdAt: string;
  resolvedAt: string | null;
  authorName: string;
  authorEmail: string;
};

export type VersionSummary = {
  id: string;
  title: string;
  createdAt: string;
  authorName: string;
};

export type VersionDetail = VersionSummary & {
  content: DocContent;
};

export type PresencePerson = {
  name: string;
  email: string;
  from: number | null;
  to: number | null;
};

export type StoreError = {
  ok: false;
  status: 400 | 403 | 404;
  code: 'invalid' | 'not-found' | 'forbidden' | 'owner-only' | 'read-only';
  error: string;
};
