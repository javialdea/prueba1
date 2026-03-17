// utils/tokenStore.ts
// In-memory store for real Gemini token usage accumulated during a browser session.
// No external dependencies — plain JS pub/sub pattern.

export interface TokenEntry {
    id: number;
    operation: string;       // e.g. 'processAudio', 'processPressRelease'
    label: string;           // Human-readable label in Spanish
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costEUR: number;         // Real cost calculated from usageMetadata + pricing tables
    timestamp: Date;
}

// ─── Labels per operation ────────────────────────────────────────────────────
const OPERATION_LABELS: Record<string, string> = {
    processAudio: 'Audio / Transcripción',
    processPressRelease: 'Nota de Prensa',
    verifyManualSelection: 'Verificación Fact-Check',
    generateTeletipoFromText: 'Teletipo (generación)',
    suggestHeadlinesForTopic: 'Titulares sugeridos',
    genericChat: 'Chat / Asistente',
    chatWithDocuments: 'Chat con documentos',
    chatWithSource: 'Chat con fuente',
};

export const getOperationLabel = (operation: string): string =>
    OPERATION_LABELS[operation] ?? operation;

// ─── Store ───────────────────────────────────────────────────────────────────
let nextId = 1;
let entries: TokenEntry[] = [];
const subscribers: Set<() => void> = new Set();

const notify = () => subscribers.forEach(cb => cb());

export const addTokenEntry = (entry: Omit<TokenEntry, 'id' | 'label' | 'timestamp'>): void => {
    entries = [
        ...entries,
        {
            ...entry,
            id: nextId++,
            label: getOperationLabel(entry.operation),
            timestamp: new Date(),
        },
    ];
    notify();
};

export const getTokenEntries = (): TokenEntry[] => entries;

export const clearTokenEntries = (): void => {
    entries = [];
    nextId = 1;
    notify();
};

export const subscribeToTokenEntries = (cb: () => void): (() => void) => {
    subscribers.add(cb);
    return () => subscribers.delete(cb); // returns unsubscribe function
};

// ─── Session totals helper ───────────────────────────────────────────────────
export interface SessionTotals {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    totalCostEUR: number;
    callCount: number;
}

export const getSessionTotals = (): SessionTotals =>
    entries.reduce(
        (acc, e) => ({
            totalInputTokens: acc.totalInputTokens + e.inputTokens,
            totalOutputTokens: acc.totalOutputTokens + e.outputTokens,
            totalTokens: acc.totalTokens + e.totalTokens,
            totalCostEUR: acc.totalCostEUR + e.costEUR,
            callCount: acc.callCount + 1,
        }),
        { totalInputTokens: 0, totalOutputTokens: 0, totalTokens: 0, totalCostEUR: 0, callCount: 0 }
    );
