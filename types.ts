export interface Question {
  id: number;
  optionA: string;
  optionB: string;
  scale: 'EI' | 'SN' | 'FT' | 'JP';
}

export interface PersonalityType {
  code: string;
  name: string;
  description: string;
}

export type Answers = Record<number, number>;

export interface RegistrationData {
  firstName: string;
  lastName: string;
  phone: string;
  age: string;
  password?: string;
  interests?: string[];
}

export interface ScoringResult {
  EI: number;
  SN: number;
  FT: number;
  JP: number;
  type: string;
}

export interface ChatMessageData {
  id?: number;
  role: 'user' | 'model';
  text: string;
  timestamp?: string;
  createdAt?: string;
  rating?: 'like' | 'dislike';
}