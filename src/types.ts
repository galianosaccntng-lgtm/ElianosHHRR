export type Position = 'Barista' | 'Shift Leader' | 'Store Manager' | null;
export type InterviewStatus = 'Completed' | 'In Progress' | 'Incomplete';

export interface CandidateInfo {
  name: string;
  phone: string;
  email: string;
}

export interface TypingMetrics {
  typingDurationMs: number;
  keystrokes: number;
  maxInsertChunk: number;
  responseDelayMs: number;
  tabSwitches: number;
  wpm: number;
  pasteAttempts?: number;
  humanConfidence?: number;
  lowConfidenceWarned?: boolean;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  metrics?: TypingMetrics;
}

export interface SecondInterviewQuestion {
  id: string;
  block: string;
  text: string;
  language: 'es' | 'en';
  purpose: string;
  listenFor: string[];
  redFlags: string[];
}

export interface SecondInterviewBlock {
  id: string;
  title: string;
  goal: string;
  minutes: number;
  mustPass: boolean;
  questionIds: string[];
}

export interface SecondInterviewGuide {
  generatedAt: string;
  focusPoints: string[];
  interviewerTips: string[];
  blocks: SecondInterviewBlock[];
  questions: SecondInterviewQuestion[];
  decision: {
    hire: string;
    thirdConversation: string;
    decline: string;
  };
}

export interface SecondInterviewScores {
  scores: Record<string, number>;
  notes: Record<string, string>;
  updatedAt: string;
}

export interface OnboardingDoc {
  docType: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  contentType: string;
  uploadedAt: string;
}

export interface OnboardingState {
  status: 'not_started' | 'invited' | 'in_progress' | 'submitted' | 'completed';
  token: string;
  tokenExpiresAt: string;
  invitedAt?: string;
  documents: OnboardingDoc[];
  requiredDocTypes: string[];
}

export interface LiveInterviewBlockStatus {
  status: 'covered' | 'partial' | 'not_addressed';
  confidence: number;
  evidence: string;
  liveRating?: number | null;
  reasoning?: string;
  gaps?: string | string[];
}

export interface LiveInterviewSuggestion {
  text: string;
  isFlag: boolean;
  relatedBlockId?: string;
}

export interface LiveInterviewState {
  consentConfirmedAt?: string;
  startedAt?: string;
  endedAt?: string;
  transcript: string;
  blockStatus: Record<string, LiveInterviewBlockStatus>;
  suggestions: LiveInterviewSuggestion[];
  languageNote?: string;
  updatedAt: string;
}

export interface InterviewSession {
  id: string;
  position: Position;
  candidateInfo: CandidateInfo;
  messages: Message[];
  status: InterviewStatus;
  date: string;
  deletedAt?: string | null;
  evaluation?: string;
  emailSent?: boolean;
  followUpSentAt?: string;
  secondInterviewGuide?: SecondInterviewGuide;
  secondInterviewScores?: SecondInterviewScores;
  onboarding?: OnboardingState;
  liveInterview?: LiveInterviewState;
}


