import { openDB, type IDBPDatabase } from 'idb';
import type { SessionData, StoredSession, SessionSummary } from '../types';
import { pickBestLap } from './lapFilter';

const DB_NAME = 'motolap-sessions';
const DB_VERSION = 2;
const STORE_NAME = 'sessions';
const REPORTS_STORE = 'reports';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains(REPORTS_STORE)) {
                    db.createObjectStore(REPORTS_STORE, { keyPath: 'id' });
                }
            },
        });
    }
    return dbPromise;
}

// ─── Sessions ───

export async function saveSession(session: SessionData, userId?: string): Promise<string> {
    const id = session.id || crypto.randomUUID();
    const bestLapTime = session.laps?.length
        ? pickBestLap(session.laps)?.duration
        : undefined;
    const stored: StoredSession = {
        id,
        metadata: session.metadata,
        beaconMarkers: session.beaconMarkers ?? [],
        dataPoints: session.dataPoints,
        savedAt: Date.now(),
        bestLapTime,
        userId,
    };
    const db = await getDB();
    await db.put(STORE_NAME, stored);
    return id;
}

export async function loadSession(id: string): Promise<StoredSession | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, id);
}

export async function listSessions(userId?: string): Promise<SessionSummary[]> {
    // Not logged in → no saved sessions visible
    if (!userId) return [];

    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    let cursor = await store.openCursor();
    const summaries: SessionSummary[] = [];

    while (cursor) {
        const stored = cursor.value as StoredSession;

        // Show only sessions belonging to this user
        const match = stored.userId === userId;

        if (match) {
            const lapCount = stored.beaconMarkers.length > 0
                ? stored.beaconMarkers.length
                : 1;

            summaries.push({
                id: stored.id,
                metadata: stored.metadata,
                savedAt: stored.savedAt,
                lapCount,
                bestLapTime: stored.bestLapTime ?? null,
                userId: stored.userId,
            });
        }
        cursor = await cursor.continue();
    }

    summaries.sort((a, b) => b.savedAt - a.savedAt);
    return summaries;
}

export async function updateSessionMetadata(id: string, metadata: Partial<SessionData['metadata']>): Promise<void> {
    const db = await getDB();
    const stored = await db.get(STORE_NAME, id) as StoredSession | undefined;
    if (!stored) return;
    stored.metadata = { ...stored.metadata, ...metadata };
    await db.put(STORE_NAME, stored);
}

export async function deleteSession(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(STORE_NAME, id);
    // Reports are intentionally preserved — they remain accessible via "Past Reports" in the modal
}

export async function deleteAllSessions(): Promise<void> {
    const db = await getDB();
    await db.clear(STORE_NAME);
}

// ─── Reports ───

export interface StoredReport {
    id: string;               // `${sessionId}-${refLapIndex}-${anaLapIndex}-${lang}`
    sessionId: string;
    refLapIndex: number;
    anaLapIndex: number;
    lang: 'ko' | 'en';
    report: string;
    savedAt: number;
    venue?: string;
    date?: string;
}

function makeReportId(sessionId: string, refLapIndex: number, anaLapIndex: number, lang: 'ko' | 'en'): string {
    return `${sessionId}-${refLapIndex}-${anaLapIndex}-${lang}`;
}

export async function saveReport(
    sessionId: string,
    refLapIndex: number,
    anaLapIndex: number,
    lang: 'ko' | 'en',
    report: string,
    meta?: { venue?: string; date?: string },
): Promise<void> {
    const db = await getDB();
    const stored: StoredReport = {
        id: makeReportId(sessionId, refLapIndex, anaLapIndex, lang),
        sessionId,
        refLapIndex,
        anaLapIndex,
        lang,
        report,
        savedAt: Date.now(),
        venue: meta?.venue,
        date: meta?.date,
    };
    await db.put(REPORTS_STORE, stored);
}

export async function loadReport(
    sessionId: string,
    refLapIndex: number,
    anaLapIndex: number,
    lang: 'ko' | 'en',
): Promise<StoredReport | undefined> {
    const db = await getDB();
    const id = makeReportId(sessionId, refLapIndex, anaLapIndex, lang);
    return db.get(REPORTS_STORE, id);
}

export async function listReports(sessionId: string): Promise<StoredReport[]> {
    const db = await getDB();
    const all = await db.getAll(REPORTS_STORE) as StoredReport[];
    return all.filter(r => r.sessionId === sessionId);
}

export async function listAllReports(): Promise<StoredReport[]> {
    const db = await getDB();
    return db.getAll(REPORTS_STORE) as Promise<StoredReport[]>;
}

export async function deleteReport(id: string): Promise<void> {
    const db = await getDB();
    await db.delete(REPORTS_STORE, id);
}
