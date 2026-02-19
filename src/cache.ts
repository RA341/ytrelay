import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { logger } from './logger';
import { createHash } from 'node:crypto';

interface CacheEntry {
  filePath: string;
  timestamp: number; // When it was cached (milliseconds since epoch)
  originalFileName: string;
}

const cache = new Map<string, CacheEntry>(); // Key: hashed videoUrl, Value: CacheEntry
const CACHE_DIR = path.join(process.cwd(), 'cache');

let cacheDurationMs: number;
let cleanupInterval: NodeJS.Timeout | null = null;

function getCacheKey(videoUrl: string): string {
  return createHash('sha256').update(videoUrl).digest('hex');
}

async function ensureCacheDirExists() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

export async function initCache() {
  const durationMinutes = parseInt(process.env.CACHE_DURATION_MINUTES || '30', 10);
  cacheDurationMs = durationMinutes * 60 * 1000;
  logger.info(`Cache initialized with duration: ${durationMinutes} minutes (${cacheDurationMs}ms)`, { cacheDurationMinutes: durationMinutes });

  await ensureCacheDirExists();

  // Start periodic cleanup
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }
  cleanupInterval = setInterval(cleanupCache, cacheDurationMs / 2); // Run cleanup half the duration
  logger.info('Cache cleanup interval started.');
}

export function getCachedFile(videoUrl: string): CacheEntry | null {
  const key = getCacheKey(videoUrl);
  const entry = cache.get(key);

  if (entry) {
    if (Date.now() - entry.timestamp < cacheDurationMs) {
      logger.info('Cache hit: file is valid', { videoUrl, key, filePath: entry.filePath });
      return entry;
    } else {
      logger.info('Cache hit: file expired, marking for deletion', { videoUrl, key, filePath: entry.filePath });
      // Don't await deletion here, let periodic cleanup handle it or delete on next set
      removeCacheEntry(key, entry.filePath);
    }
  }
  logger.info('Cache miss', { videoUrl, key });
  return null;
}

export async function addFileToCache(videoUrl: string, tempFilePath: string, originalFileName: string): Promise<CacheEntry> {
  await ensureCacheDirExists(); // Just in case
  const key = getCacheKey(videoUrl);
  const newCachedFilePath = path.join(CACHE_DIR, `${key}-${originalFileName}`); // Use key prefix to make unique but identifiable

  // If an old expired entry exists, ensure its file is deleted before moving new one
  const oldEntry = cache.get(key);
  if (oldEntry) {
    await removeFileFromDisk(oldEntry.filePath);
  }

  await fs.rename(tempFilePath, newCachedFilePath); // Move file to cache dir
  const entry: CacheEntry = {
    filePath: newCachedFilePath,
    timestamp: Date.now(),
    originalFileName,
  };
  cache.set(key, entry);
  logger.info('File added to cache', { videoUrl, key, filePath: newCachedFilePath });
  return entry;
}

async function removeFileFromDisk(filePath: string) {
  try {
    await fs.unlink(filePath);
    logger.info('File removed from disk', { filePath });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      logger.info('Attempted to remove non-existent file from disk (already gone)', { filePath });
    } else {
      logger.error('Error removing file from disk', err, { filePath });
    }
  }
}

function removeCacheEntry(key: string, filePath: string) {
  cache.delete(key);
  removeFileFromDisk(filePath); // Asynchronously remove from disk
}

async function cleanupCache() {
  logger.info('Running cache cleanup...');
  const now = Date.now();
  const keysToRemove: string[] = [];

  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp >= cacheDurationMs) {
      logger.info('Expired cache entry found during cleanup', { key, filePath: entry.filePath });
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) {
    const entry = cache.get(key); // Get it again, might have been removed by other means
    if (entry) {
      removeCacheEntry(key, entry.filePath);
    }
  }
  logger.info(`Cache cleanup complete. Removed ${keysToRemove.length} expired entries.`);
}

// Ensure cleanup is called if the process is exiting
process.on('exit', () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    logger.info('Cache cleanup interval stopped on process exit.');
  }
});
process.on('SIGINT', () => { // Ctrl+C
  logger.info('SIGINT received, exiting...');
  process.exit(0);
});
process.on('SIGTERM', () => { // graceful shutdown
  logger.info('SIGTERM received, exiting...');
  process.exit(0);
});
