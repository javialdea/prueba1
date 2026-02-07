
export interface TranscriptionSegment {
  timestamp: string;
  text: string;
}

export interface FactCheck {
  claim: string;
  verdict: 'Verdadero' | 'Falso' | 'Engañoso' | 'Inconsistente' | 'Dudoso';
  explanation: string;
}

export interface TopicDetail {
  name: string;
  description: string;
}

export interface AnalysisResult {
  transcription: TranscriptionSegment[];
  topics: TopicDetail[];
  suggestedHeadlines: string[];
  socialThreads: string[];
  factChecks: FactCheck[];
}

export interface PressReleaseResult {
  headline: string;
  lead: string;
  body: string;
  originalText: string;
  userAngle?: string;
  finalHeadline?: string;
  finalLead?: string;
  finalBody?: string;
}

export interface NewsItem {
  headline: string;
  summary: string;
  url?: string;
}

export interface NewspaperSummary {
  source: string;
  news: NewsItem[];
}

export interface PressSummaryResult {
  date: string;
  summaries: NewspaperSummary[];
}

export enum AppMode {
  AUDIO = 'AUDIO',
  PRESS_RELEASE = 'PRESS_RELEASE',
  WRITING_ASSISTANT = 'WRITING_ASSISTANT',
  PRESS_SUMMARY = 'PRESS_SUMMARY',
}

export enum AppStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR',
}

export interface FileState {
  file: File | null;
  base64: string | null;
  mimeType: string | null;
}

export interface HistoryItem {
  id: string;
  date: string;
  fileName: string;
  mode: AppMode;
  data: AnalysisResult | PressReleaseResult | PressSummaryResult | any;
}
