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
  forPosition?: Position;
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
  probeAttempts?: number;
  settled?: boolean;
}

export interface LiveInterviewSuggestion {
  text: string;
  isFlag: boolean;
  relatedBlockId?: string;
  exactQuestion?: string;
  attempt?: number;
}

export interface ActiveSuggestion {
  exactQuestion: string;
  text?: string;
  blockId: string;
  attempt: number;
}

export interface LiveInterviewBlockEvaluation {
  blockId: string;
  title: string;
  rating: number | null;
  passed: boolean;
  notes: string;
}

export interface BestFitPosition {
  position: 'Barista' | 'Shift Leader' | 'Store Manager';
  reasoning: string;
}

export interface LiveInterviewConfirmedAvailability {
  openingShifts: 'YES' | 'NO' | 'CONDITIONAL';
  closingShifts: 'YES' | 'NO' | 'CONDITIONAL';
  weekends: string;
  holidays: 'YES' | 'NO' | 'CONDITIONAL';
  hoursPerWeek: string;
  earliestArrival?: string;
  noticePeriodAndStartDate?: string;
  notes: string;
}

export interface LiveInterviewFinalEvaluation {
  overallRating: number; // 1 to 5
  recommendation: 'Hire' | 'Second Interview' | 'Do Not Hire';
  strengths: string[];
  concerns: string[];
  blockSummary: LiveInterviewBlockEvaluation[];
  narrative: string;
  generatedAt: string;
  language?: string;
  bestFitPosition?: BestFitPosition;
  targetPosition?: 'Barista' | 'Shift Leader' | 'Store Manager';
  claimedExperienceVerification?: {
    status: 'VERIFIED' | 'PARTIALLY_VERIFIED' | 'NOT_VERIFIED';
    evidence: string;
  };
  inconsistenciesWithOnlineInterview?: string[];
  confirmedAvailability?: LiveInterviewConfirmedAvailability;
}

export interface LiveInterviewState {
  consentConfirmedAt?: string;
  startedAt?: string;
  endedAt?: string;
  transcript: string;
  blockStatus: Record<string, LiveInterviewBlockStatus>;
  suggestions: LiveInterviewSuggestion[];
  activeSuggestion?: ActiveSuggestion | null;
  finalEvaluation?: LiveInterviewFinalEvaluation | null;
  crossPositionEvaluations?: Record<string, LiveInterviewFinalEvaluation>;
  positionSuggestion?: {
    suggest: boolean;
    position: 'Barista' | 'Shift Leader' | 'Store Manager';
    reason: string;
  };
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
  appointment?: InterviewAppointment;
}

export type AppointmentStatus = 'pending' | 'confirmed' | 'reschedule_requested' | 'cancelled';
export type AppointmentType = 'interview' | 'blocked';

export interface InterviewAppointment {
  id: string;
  sessionId: string;
  candidateName: string;
  candidatePhone: string;
  candidateEmail: string;
  startUtc: string; // ISO string
  endUtc: string;   // ISO string
  status: AppointmentStatus;
  type?: AppointmentType; // default 'interview'
  token: string;    // Secure token for candidate actions
  createdAt: string;
  updatedAt: string;
  createdByLang?: 'en' | 'es';
  notes?: string;
  smsSent?: boolean;
}

export interface AppointmentSlot {
  startUtc: string;
  endUtc: string;
  label: string;
  taken: boolean;
}

export type SlotDurationMinutes = 15 | 30 | 45 | 60 | 90 | 120;

export interface DaySchedule {
  dayOfWeek: number; // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  enabled: boolean;
  startHour: number; // 0..23 (Florida / ET)
  endHour: number;   // 0..23 (Florida / ET)
}

export interface AppSettings {
  interviewLocationName: string;
  interviewLocationAddress: string;
  scheduleByDay: DaySchedule[];
  slotDurationMinutes: SlotDurationMinutes;
  // Legacy backward-compatibility fields:
  scheduleDays?: number[];
  scheduleStartHour?: number;
  scheduleEndHour?: number;
}
