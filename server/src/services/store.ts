import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SourceConfig } from '../types.js';

/** Minimal card info saved with favourites/progress so lists render without re-resolving every item. */
export interface Snapshot {
  title: string;
  poster?: string;
  backdrop?: string;
  kind: 'channel' | 'movie' | 'series' | 'episode';
  subtitle?: string;
}

export interface Favorite {
  id: string;
  addedAt: number;
  snapshot: Snapshot;
}

export interface Progress {
  /** The playable thing: movie id or episode id */
  id: string;
  /** For episodes, the series id so "continue watching" can deep-link the show */
  parentId?: string;
  position: number;
  duration: number;
  updatedAt: number;
  snapshot: Snapshot;
}

export interface DbShape {
  version: 1;
  sources: SourceConfig[];
  favorites: Favorite[];
  progress: Record<string, Progress>;
}

const EMPTY: DbShape = { version: 1, sources: [], favorites: [], progress: {} };

/** JSON file store with debounced atomic writes. Plenty for a household; swap for SQL when adding multi-user accounts. */
export class Store {
  private data: DbShape;
  private file: string;
  private timer: NodeJS.Timeout | null = null;

  constructor(dataDir: string | null) {
    this.file = dataDir ? join(dataDir, 'db.json') : '';
    this.data = structuredClone(EMPTY);
    if (!this.file) return;
    try {
      this.data = { ...structuredClone(EMPTY), ...JSON.parse(readFileSync(this.file, 'utf8')) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  get isNew() {
    return this.data.sources.length === 0;
  }

  read(): Readonly<DbShape> {
    return this.data;
  }

  update(fn: (d: DbShape) => void) {
    fn(this.data);
    this.scheduleSave();
  }

  private scheduleSave() {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => this.flush(), 250);
  }

  flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (!this.file) return;
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }
}
