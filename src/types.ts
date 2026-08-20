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
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
  metrics?: TypingMetrics;
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
}


