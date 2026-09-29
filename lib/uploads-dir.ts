import { dirname, join } from 'node:path';

export function uploadsDirectory() {
  const databasePath = process.env.DATABASE_PATH;
  if (databasePath && databasePath !== ':memory:') return join(dirname(databasePath), 'uploads');
  return join(process.cwd(), 'data', 'uploads');
}
