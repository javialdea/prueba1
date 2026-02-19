// Gemini API Pricing Calculator
// Based on official pricing as of February 2026

export interface PricingTier {
    inputPrice: number;  // per 1M tokens
    outputPrice: number; // per 1M tokens
    audioInputPrice?: number; // per 1M tokens (for audio-specific pricing)
    searchPrice?: number; // per 1,000 queries
}

export interface ModelPricing {
    free?: PricingTier;
    paid: PricingTier;
}

// Gemini 3 Pro Preview Pricing
export const GEMINI_3_PRO_PRICING: ModelPricing = {
    paid: {
        inputPrice: 2.00,      // $2.00 per 1M tokens (≤200k prompts)
        outputPrice: 12.00,    // $12.00 per 1M tokens (≤200k prompts)
        searchPrice: 14.00,    // $14 per 1,000 search queries (after 5,000 free/month)
    }
};

// Gemini 3 Flash Preview Pricing
export const GEMINI_3_FLASH_PRICING: ModelPricing = {
    free: {
        inputPrice: 0,
        outputPrice: 0,
    },
    paid: {
        inputPrice: 0.50,      // $0.50 per 1M tokens (text/image/video)
        audioInputPrice: 1.00, // $1.00 per 1M tokens (audio)
        outputPrice: 3.00,     // $3.00 per 1M tokens
    }
};

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

// Token estimation functions
export const estimateAudioTokens = (durationMinutes: number): TokenEstimate => {
    // Rough estimate: 1 minute ≈ 1,500-2,000 tokens
    const audioTokens = durationMinutes * 1750;
    const promptTokens = 500; // System prompt
    const outputTokens = durationMinutes * 600; // Transcription + analysis

    return {
        inputTokens: audioTokens + promptTokens,
        outputTokens,
    };
};

export const estimatePressReleaseTokens = (documentSizeKB: number): TokenEstimate => {
    // Rough estimate: 1KB ≈ 250 tokens
    const documentTokens = documentSizeKB * 250;
    const promptTokens = 300;
    const outputTokens = 800; // Headline + lead + body

    return {
        inputTokens: documentTokens + promptTokens,
        outputTokens,
    };
};

export const estimateChatTokens = (messageLength: number, historyMessages: number): TokenEstimate => {
    // Rough estimate: 1 character ≈ 0.25 tokens
    const messageTokens = messageLength * 0.25;
    const historyTokens = historyMessages * 150; // Average per message
    const outputTokens = 200; // Average response

    return {
        inputTokens: messageTokens + historyTokens,
        outputTokens,
    };
};

export const estimateMadridSummaryTokens = (): TokenEstimate => {
    return {
        inputTokens: 200,  // Prompt
        outputTokens: 2500, // Summary JSON
        searchQueries: 5,   // Approximate queries per summary
    };
};

// Cost calculation functions
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

// Specific operation cost calculators
export const calculateAudioCost = (durationMinutes: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimateAudioTokens(durationMinutes);
    const pricing = tier === 'free' && GEMINI_3_PRO_PRICING.free
        ? GEMINI_3_PRO_PRICING.free
        : GEMINI_3_PRO_PRICING.paid;
    return calculateCost(tokens, pricing, true);
};

export const calculatePressReleaseCost = (documentSizeKB: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimatePressReleaseTokens(documentSizeKB);
    const pricing = tier === 'free' && GEMINI_3_PRO_PRICING.free
        ? GEMINI_3_PRO_PRICING.free
        : GEMINI_3_PRO_PRICING.paid;
    return calculateCost(tokens, pricing);
};

export const calculateChatCost = (messageLength: number, historyMessages: number, tier: 'free' | 'paid' = 'paid'): CostEstimate => {
    const tokens = estimateChatTokens(messageLength, historyMessages);
    const pricing = tier === 'free' && GEMINI_3_FLASH_PRICING.free
        ? GEMINI_3_FLASH_PRICING.free
        : GEMINI_3_FLASH_PRICING.paid;
    return calculateCost(tokens, pricing);
};

export const calculateMadridSummaryCost = (tier: 'free' | 'paid' = 'paid', includingSearch: boolean = true): CostEstimate => {
    const tokens = estimateMadridSummaryTokens();
    if (!includingSearch) {
        delete tokens.searchQueries;
    }
    const pricing = tier === 'free' && GEMINI_3_PRO_PRICING.free
        ? GEMINI_3_PRO_PRICING.free
        : GEMINI_3_PRO_PRICING.paid;
    return calculateCost(tokens, pricing);
};

// Monthly projection calculator
export interface MonthlyUsage {
    audioTranscriptions: number;
    pressReleases: number;
    chatMessages: number;
    madridSummaries: number;
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

    const totalInputCost =
        (audioCost.inputCost * usage.audioTranscriptions) +
        (pressCost.inputCost * usage.pressReleases) +
        (chatCost.inputCost * usage.chatMessages) +
        (summaryCost.inputCost * usage.madridSummaries);

    const totalOutputCost =
        (audioCost.outputCost * usage.audioTranscriptions) +
        (pressCost.outputCost * usage.pressReleases) +
        (chatCost.outputCost * usage.chatMessages) +
        (summaryCost.outputCost * usage.madridSummaries);

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

// Format currency (converted from USD to EUR)
const USD_TO_EUR = 0.92; // Approximate conversion rate

export const formatCurrency = (amountUSD: number): string => {
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
    }).format(amountUSD * USD_TO_EUR);
};
