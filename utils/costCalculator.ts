// Gemini API Pricing Calculator
// Based on official GCP billing account prices (EUR) — March 2026
// Source: Cuenta de facturación GCP — "Precio de Mi cuenta de facturación 1.csv"

export interface PricingTier {
    inputPrice: number;         // € per 1M input tokens (text)
    outputPrice: number;        // € per 1M output tokens
    audioInputPrice?: number;   // € per 1M audio input tokens (Flash: different from text)
    searchPrice?: number;       // € per 1,000 search queries
}

export interface ModelPricing {
    free?: PricingTier;
    paid: PricingTier;
}

// ─── Gemini 2.5 Flash ───────────────────────────────────────────────────────
// App usage: chat, chatWithDocuments, chatWithSource, suggestHeadlinesForTopic
// SKUs: 981A-C057-0BF9 (text in), 5308-F418-CF26 (audio in), 911A-8880-A243 (text out)
export const GEMINI_2_5_FLASH_PRICING: ModelPricing = {
    free: { inputPrice: 0, outputPrice: 0 }, // AI Studio free tier (not in billing account)
    paid: {
        inputPrice: 0.25446,       // €0.25446 / 1M text tokens
        audioInputPrice: 0.8482,   // €0.8482 / 1M audio tokens
        outputPrice: 2.1205,       // €2.1205 / 1M output tokens
    }
};

// ─── Gemini 2.5 Pro ─────────────────────────────────────────────────────────
// App usage: processAudio, processPressRelease, generateTeletipoFromText, verifyManualSelection
// Note: text, audio, and image inputs are all priced identically for this model
// SKUs: 2D1C-F790-3C09 (text in), 9B07-44AD-2984 (audio in), 0F51-429B-C2DC (text out), A87C-47D2-C83A (search)
export const GEMINI_2_5_PRO_PRICING: ModelPricing = {
    paid: {
        inputPrice: 1.06025,       // €1.06025 / 1M tokens (text, audio, and image — same price)
        audioInputPrice: 1.06025,  // €1.06025 / 1M audio tokens (same as text for 2.5 Pro)
        outputPrice: 8.482,        // €8.482 / 1M output tokens
        searchPrice: 29.687,       // €29.687 / 1K search queries (after 10,000 free/month)
    }
};

// Google Search Grounding: first 10,000 queries/month are free (SKU A87C-47D2-C83A)
export const SEARCH_FREE_QUERIES_PER_MONTH = 10_000;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TokenEstimate {
    inputTokens: number;
    outputTokens: number;
    searchQueries?: number;
}

export interface CostEstimate {
    inputCost: number;
    outputCost: number;
    searchCost?: number;
    totalCost: number;
    tier: 'free' | 'paid';
}

// ─── Token Estimation Functions ─────────────────────────────────────────────

export const estimateAudioTokens = (durationMinutes: number): TokenEstimate => {
    // Gemini audio tokenization: ~32 tokens/second ≈ 1,920 tokens/minute
    const audioTokens = durationMinutes * 1920;
    const promptTokens = 500; // System prompt + instructions
    const outputTokens = durationMinutes * 600; // Structured analysis JSON (scales with content)

    return {
        inputTokens: audioTokens + promptTokens,
        outputTokens,
    };
};

export const estimatePressReleaseTokens = (documentSizeKB: number): TokenEstimate => {
    // ~250 tokens per KB of text content
    const documentTokens = documentSizeKB * 250;
    const promptTokens = 300; // System prompt
    const outputTokens = 800; // Headline + lead + body JSON

    return {
        inputTokens: documentTokens + promptTokens,
        outputTokens,
    };
};

export const estimateTeletipoTokens = (durationMinutes: number): TokenEstimate => {
    // Two-step process: Flash (headline suggestions) + Pro (full teletipo)
    // Step 1 — Flash: topic text + portion of transcription → 3 short headlines
    const flashInputTokens = 1_000 + durationMinutes * 100;
    const flashOutputTokens = 200;
    // Step 2 — Pro: full transcription text + selected headline + context → teletipo JSON
    const proInputTokens = 600 + durationMinutes * 300;
    const proOutputTokens = 900;

    return {
        inputTokens: flashInputTokens + proInputTokens,
        outputTokens: flashOutputTokens + proOutputTokens,
    };
};

export const estimateChatTokens = (messageLength: number, historyMessages: number): TokenEstimate => {
    const messageTokens = messageLength * 0.25; // ~4 chars per token
    const historyTokens = historyMessages * 150; // Average tokens per context message
    const outputTokens = 200; // Average response length

    return {
        inputTokens: messageTokens + historyTokens,
        outputTokens,
    };
};

export const estimateMadridSummaryTokens = (): TokenEstimate => {
    return {
        inputTokens: 200,
        outputTokens: 2500,  // Full summary JSON
        searchQueries: 5,    // Approximate Google Search queries per summary
    };
};

// ─── Core Cost Calculator ────────────────────────────────────────────────────

export const calculateCost = (
    tokens: TokenEstimate,
    pricing: PricingTier,
    isAudio: boolean = false
): CostEstimate => {
    const inputPrice = isAudio && pricing.audioInputPrice
        ? pricing.audioInputPrice
        : pricing.inputPrice;

    const inputCost = (tokens.inputTokens / 1_000_000) * inputPrice;
    const outputCost = (tokens.outputTokens / 1_000_000) * pricing.outputPrice;
    const searchCost = tokens.searchQueries
        ? (tokens.searchQueries / 1000) * (pricing.searchPrice || 0)
        : 0;

    return {
        inputCost,
        outputCost,
        searchCost: tokens.searchQueries ? searchCost : undefined,
        totalCost: inputCost + outputCost + searchCost,
        tier: inputPrice === 0 ? 'free' : 'paid',
    };
};

// ─── Operation-Specific Calculators ─────────────────────────────────────────

// Audio analysis → Gemini 2.5 Pro (audio input pricing)
export const calculateAudioCost = (durationMinutes: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimateAudioTokens(durationMinutes);
    const pricing = tier === 'free' && GEMINI_2_5_PRO_PRICING.free
        ? GEMINI_2_5_PRO_PRICING.free
        : GEMINI_2_5_PRO_PRICING.paid;
    return calculateCost(tokens, pricing, true);
};

// Press release → Gemini 2.5 Pro (text input pricing)
export const calculatePressReleaseCost = (documentSizeKB: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimatePressReleaseTokens(documentSizeKB);
    const pricing = tier === 'free' && GEMINI_2_5_PRO_PRICING.free
        ? GEMINI_2_5_PRO_PRICING.free
        : GEMINI_2_5_PRO_PRICING.paid;
    return calculateCost(tokens, pricing);
};

// Teletipo → Flash (headline step) + Pro (generation step)
export const calculateTeletipoCost = (durationMinutes: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    // Step 1: Flash — suggest 3 headline options
    const flashInputTokens = 1_000 + durationMinutes * 100;
    const flashOutputTokens = 200;
    const flashPricing = tier === 'free' && GEMINI_2_5_FLASH_PRICING.free
        ? GEMINI_2_5_FLASH_PRICING.free
        : GEMINI_2_5_FLASH_PRICING.paid;

    // Step 2: Pro — generate full teletipo from selected headline
    const proInputTokens = 600 + durationMinutes * 300;
    const proOutputTokens = 900;
    const proPricing = tier === 'free' && GEMINI_2_5_PRO_PRICING.free
        ? GEMINI_2_5_PRO_PRICING.free
        : GEMINI_2_5_PRO_PRICING.paid;

    const flashInputCost = (flashInputTokens / 1_000_000) * flashPricing.inputPrice;
    const flashOutputCost = (flashOutputTokens / 1_000_000) * flashPricing.outputPrice;
    const proInputCost = (proInputTokens / 1_000_000) * proPricing.inputPrice;
    const proOutputCost = (proOutputTokens / 1_000_000) * proPricing.outputPrice;

    return {
        inputCost: flashInputCost + proInputCost,
        outputCost: flashOutputCost + proOutputCost,
        totalCost: flashInputCost + flashOutputCost + proInputCost + proOutputCost,
        tier,
    };
};

// Email pipeline → Gemini 2.5 Pro (nota) + Gemini 2.5 Flash (fidelity report)
// Call 1: 2.5 Pro — nota de agencia JSON
// Call 2: 2.5 Flash — informe de fidelidad JSON
export const calculateEmailPipelineCost = (documentSizeKB: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const proPricing = GEMINI_2_5_PRO_PRICING.paid;
    const flashPricing = GEMINI_2_5_FLASH_PRICING.paid;

    // Pro: document tokens + large system prompt (~1200 tokens)
    const proInputTokens = documentSizeKB * 250 + 1200;
    const proOutputTokens = 800; // JSON nota

    // Flash: original text + generated nota + short prompt
    const flashInputTokens = documentSizeKB * 250 + proOutputTokens + 500;
    const flashOutputTokens = 500; // JSON fidelity report

    const proInputCost = (proInputTokens / 1_000_000) * proPricing.inputPrice;
    const proOutputCost = (proOutputTokens / 1_000_000) * proPricing.outputPrice;
    const flashInputCost = (flashInputTokens / 1_000_000) * flashPricing.inputPrice;
    const flashOutputCost = (flashOutputTokens / 1_000_000) * flashPricing.outputPrice;

    return {
        inputCost: proInputCost + flashInputCost,
        outputCost: proOutputCost + flashOutputCost,
        totalCost: proInputCost + proOutputCost + flashInputCost + flashOutputCost,
        tier,
    };
};

// Chat → Gemini 2.5 Flash (text input pricing)
export const calculateChatCost = (messageLength: number, historyMessages: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimateChatTokens(messageLength, historyMessages);
    const pricing = tier === 'free' && GEMINI_2_5_FLASH_PRICING.free
        ? GEMINI_2_5_FLASH_PRICING.free
        : GEMINI_2_5_FLASH_PRICING.paid;
    return calculateCost(tokens, pricing);
};

// Madrid summaries → Gemini 2.5 Pro + optional Search grounding
export const calculateMadridSummaryCost = (tier: 'free' | 'paid' = 'paid', includingSearch: boolean = true): CostEstimate => {
    const tokens = estimateMadridSummaryTokens();
    if (!includingSearch) {
        delete tokens.searchQueries;
    }
    const pricing = tier === 'free' && GEMINI_2_5_PRO_PRICING.free
        ? GEMINI_2_5_PRO_PRICING.free
        : GEMINI_2_5_PRO_PRICING.paid;
    return calculateCost(tokens, pricing);
};

// ─── Monthly Projection ──────────────────────────────────────────────────────

export interface MonthlyUsage {
    audioTranscriptions: number;
    pressReleases: number;
    chatMessages: number;
    madridSummaries: number;
    teletipos?: number;        // optional — generated from audio jobs
    emailsRecibidos?: number;  // optional — email pipeline (NdP via Gmail)
}

export const calculateMonthlyProjection = (
    usage: MonthlyUsage,
    tier: 'free' | 'paid' = 'paid',
    avgAudioMinutes: number = 5,
    avgDocumentSizeKB: number = 50
): CostEstimate => {
    const audioCost = calculateAudioCost(avgAudioMinutes, tier);
    const pressCost = calculatePressReleaseCost(avgDocumentSizeKB, tier);
    const chatCost = calculateChatCost(100, 5, tier);
    const summaryCost = calculateMadridSummaryCost(tier, tier === 'paid');
    const teletipoCost = calculateTeletipoCost(avgAudioMinutes, tier);
    const emailCost = calculateEmailPipelineCost(avgDocumentSizeKB, tier);

    const totalInputCost =
        (audioCost.inputCost * usage.audioTranscriptions) +
        (pressCost.inputCost * usage.pressReleases) +
        (chatCost.inputCost * usage.chatMessages) +
        (summaryCost.inputCost * usage.madridSummaries) +
        (teletipoCost.inputCost * (usage.teletipos || 0)) +
        (emailCost.inputCost * (usage.emailsRecibidos || 0));

    const totalOutputCost =
        (audioCost.outputCost * usage.audioTranscriptions) +
        (pressCost.outputCost * usage.pressReleases) +
        (chatCost.outputCost * usage.chatMessages) +
        (summaryCost.outputCost * usage.madridSummaries) +
        (teletipoCost.outputCost * (usage.teletipos || 0)) +
        (emailCost.outputCost * (usage.emailsRecibidos || 0));

    const totalSearchCost = tier === 'paid'
        ? (summaryCost.searchCost || 0) * usage.madridSummaries
        : 0;

    return {
        inputCost: totalInputCost,
        outputCost: totalOutputCost,
        searchCost: totalSearchCost > 0 ? totalSearchCost : undefined,
        totalCost: totalInputCost + totalOutputCost + totalSearchCost,
        tier,
    };
};

// ─── Currency Formatting ─────────────────────────────────────────────────────
// All prices are already in EUR — no conversion needed

export const formatCurrency = (amountEUR: number): string => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(amountEUR);
};
