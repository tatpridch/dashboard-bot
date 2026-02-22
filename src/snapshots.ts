import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Cloud platforms (Alpic/Lambda) have read-only fs — use /tmp there
const SNAPSHOTS_DIR = process.env.SNAPSHOTS_DIR || join(__dirname, "..", "snapshots");
const INDEX_FILE = join(SNAPSHOTS_DIR, "snapshots.json");
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SnapshotEntry {
  slug: string;
  title: string;
  createdAt: string;
  expiresAt: string;
}

function ensureDir() {
  if (!existsSync(SNAPSHOTS_DIR)) {
    mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }
}

function readIndex(): SnapshotEntry[] {
  ensureDir();
  if (!existsSync(INDEX_FILE)) return [];
  try {
    return JSON.parse(readFileSync(INDEX_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function writeIndex(entries: SnapshotEntry[]) {
  ensureDir();
  writeFileSync(INDEX_FILE, JSON.stringify(entries, null, 2));
}

export function initSnapshots() {
  ensureDir();
  cleanupExpired();
  setInterval(cleanupExpired, 60 * 60 * 1000);
}

export function createSnapshot(title: string, html: string): { slug: string } {
  const slug = crypto.randomUUID().slice(0, 8);
  const now = new Date();
  const entry: SnapshotEntry = {
    slug,
    title,
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + DEFAULT_TTL_MS).toISOString(),
  };

  ensureDir();
  writeFileSync(join(SNAPSHOTS_DIR, `${slug}.html`), html);

  const index = readIndex();
  index.push(entry);
  writeIndex(index);

  return { slug };
}

export function getSnapshot(slug: string): string | null {
  const file = join(SNAPSHOTS_DIR, `${slug}.html`);
  if (!existsSync(file)) return null;

  const index = readIndex();
  const entry = index.find((e) => e.slug === slug);
  if (entry && new Date(entry.expiresAt) < new Date()) {
    deleteSnapshot(slug);
    return null;
  }

  return readFileSync(file, "utf-8");
}

export function listSnapshots(): SnapshotEntry[] {
  cleanupExpired();
  return readIndex();
}

export function deleteSnapshot(slug: string): boolean {
  const file = join(SNAPSHOTS_DIR, `${slug}.html`);
  if (existsSync(file)) {
    unlinkSync(file);
  }
  const index = readIndex();
  const filtered = index.filter((e) => e.slug !== slug);
  if (filtered.length === index.length) return false;
  writeIndex(filtered);
  return true;
}

export function cleanupExpired() {
  const index = readIndex();
  const now = new Date();
  const active: SnapshotEntry[] = [];

  for (const entry of index) {
    if (new Date(entry.expiresAt) < now) {
      const file = join(SNAPSHOTS_DIR, `${entry.slug}.html`);
      if (existsSync(file)) unlinkSync(file);
    } else {
      active.push(entry);
    }
  }

  if (active.length !== index.length) {
    writeIndex(active);
  }
}
