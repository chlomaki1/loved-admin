import { promises as fs } from 'fs';
import { join } from 'path';

const DB_PATH = join(__dirname, '..', 'data', 'main_threads.json');

async function ensureDb(): Promise<Record<string, any>> {
    try {
        const raw = await fs.readFile(DB_PATH, 'utf-8');
        return JSON.parse(raw);
    } catch (err: any) {
        // create directory and file
        await fs.mkdir(join(__dirname, '..', 'data'), { recursive: true });
        await fs.writeFile(DB_PATH, JSON.stringify({}), 'utf-8');
        return {};
    }
}

export async function getMainThreadMeta(roundId: number, mode: number) {
    const db = await ensureDb();
    return db[`${roundId}:${mode}`] ?? null;
}

export async function getMainThreadsForRound(roundId: number): Promise<Record<number, { topic_id: number; post_id: number; created_at?: string }>> {
  const db = await ensureDb();
  const out: Record<number, { topic_id: number; post_id: number; created_at?: string }> = {};
  for (const [key, val] of Object.entries(db)) {
    const [r, m] = key.split(':');
    if (Number(r) === roundId) out[Number(m)] = val;
  }
  return out;
}

export async function setMainThreadMeta(roundId: number, mode: number, meta: { topic_id: number; post_id: number; created_at?: string }) {
    const db = await ensureDb();
    db[`${roundId}:${mode}`] = { ...meta, created_at: meta.created_at ?? new Date().toISOString() };
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}

export async function deleteMainThreadMeta(roundId: number, mode: number) {
    const db = await ensureDb();
    delete db[`${roundId}:${mode}`];
    await fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}