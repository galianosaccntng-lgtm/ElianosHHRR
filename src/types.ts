export type Position = 'Barista' | 'Shift Leader' | 'Store Manager' | null;
export type InterviewStatus = 'Completed' | 'In Progress' | 'Incomplete';

export interface CandidateInfo {
  name: string;
  phone: string;
  email: string;
}

export interface Message {
  role: 'user' | 'model';
  parts: { text: string }[];
}

export interface InterviewSession {
  id: string;
  position: Position;
  candidateInfo: CandidateInfo;
  messages: Message[];
  status: InterviewStatus;
  date: string;
  evaluation?: string;
  emailSent?: boolean;
  followUpSentAt?: string;
}


