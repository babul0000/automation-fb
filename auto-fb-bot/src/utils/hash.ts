import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const HASH_FILE_PATH = path.resolve(process.cwd(), 'data', 'posted_hashes.json');

// In-memory set of posted topic hashes
const postedHashesSet: Set<string> = new Set<string>();

/**
 * Ensures data directory and hash persistence file exist
 */
function initHashStore(): void {
  try {
    const dir = path.dirname(HASH_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (fs.existsSync(HASH_FILE_PATH)) {
      const data = fs.readFileSync(HASH_FILE_PATH, 'utf-8');
      const loaded: string[] = JSON.parse(data);
      loaded.forEach((h) => postedHashesSet.add(h));
      console.log(`[Hash Engine] Loaded ${postedHashesSet.size} historical topic hashes.`);
    }
  } catch (err: any) {
    console.warn(`[Hash Engine Warning] Could not load persisted hashes: ${err.message}`);
  }
}

// Initialize on module load
initHashStore();

/**
 * Persists known hashes to local storage
 */
function persistHashes(): void {
  try {
    const arr = Array.from(postedHashesSet);
    fs.writeFileSync(HASH_FILE_PATH, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err: any) {
    console.error(`[Hash Engine Error] Failed to persist hashes: ${err.message}`);
  }
}

/**
 * Normalizes a topic title by removing punctuation, extra spaces, and lowercase
 */
export function normalizeTitle(title: string): string {
  if (!title) return '';
  return title
    .toLowerCase()
    .replace(/[।.,\/#!$%\^&\*;:{}=\-_`~()?"'–—]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a SHA-256 hash for a topic title
 */
export function generateTopicHash(title: string): string {
  const normalized = normalizeTitle(title);
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

/**
 * Checks if a topic title was already posted
 */
export function isTopicDuplicate(title: string): boolean {
  const hash = generateTopicHash(title);
  return postedHashesSet.has(hash);
}

/**
 * Marks a topic title as published to prevent future duplicates
 */
export function markTopicAsPosted(title: string): string {
  const hash = generateTopicHash(title);
  postedHashesSet.add(hash);
  persistHashes();
  return hash;
}

/**
 * Returns all currently recorded topic hashes
 */
export function getRecordedHashes(): string[] {
  return Array.from(postedHashesSet);
}
