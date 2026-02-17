
export interface TranscriptionSegment {
  timestamp: string;
  text: string;
}

export interface FactCheck {
  claim: string;
  verdict: 'Verdadero' | 'Falso' | 'Engañoso' | 'Inconsistente' | 'Dudoso';
  explanation: string;
  sources?: { title: string, url: string }[];
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
  manualFactChecks?: FactCheck[];
  isVerifyingManual?: boolean;
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



export enum AppMode {
  AUDIO = 'AUDIO',
  PRESS_RELEASE = 'PRESS_RELEASE',
  WRITING_ASSISTANT = 'WRITING_ASSISTANT',
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
  data: AnalysisResult | PressReleaseResult;
}

export interface TranscriptionJob {
  id: string;
  file: File;
  base64: string;
  mimeType: string;
  status: AppStatus;
  result?: AnalysisResult;
  timestamp: string;
}

export interface PressReleaseJob {
  id: string;
  file: File;
  base64: string;
  mimeType: string;
  status: AppStatus;
  result?: PressReleaseResult;
  userAngle?: string;
  timestamp: string;
}
