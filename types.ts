
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

export interface BaseJob {
  id: string;
  file: File;
  base64: string;
  mimeType: string;
  status: AppStatus;
  timestamp: string;
  job_type: 'audio' | 'press_release';
}

export interface TranscriptionJob extends BaseJob {
  job_type: 'audio';
  result?: AnalysisResult;
}

export interface PressReleaseJob extends BaseJob {
  job_type: 'press_release';
  result?: PressReleaseResult;
  userAngle?: string;
}
