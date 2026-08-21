import { TypingMetrics } from './types';

/**
 * Pure function to calculate estimated human authorship confidence (0-100%)
 * based on typing telemetry and message character length.
 * 
 * Used identically on client and server to ensure deterministic scores.
 */
export function humanConfidence(metrics?: Partial<TypingMetrics> | null, textLength: number = 0): number | null {
  if (!metrics || typeof metrics !== 'object') {
    return null;
  }

  let score = 100;

  const pasteAttempts = Number(metrics.pasteAttempts) || 0;
  score -= 20 * Math.min(pasteAttempts, 2);

  const maxInsertChunk = Number(metrics.maxInsertChunk) || 0;
  if (maxInsertChunk > 40) {
    score -= Math.min(40, maxInsertChunk - 40);
  }

  const wpm = Number(metrics.wpm) || 0;
  if (wpm > 80) {
    score -= Math.min(25, Math.round((wpm - 80) / 2));
  }

  const tabSwitches = Number(metrics.tabSwitches) || 0;
  score -= 8 * Math.min(tabSwitches, 3);

  const typingDurationMs = Number(metrics.typingDurationMs) || 0;
  if (textLength >= 200 && typingDurationMs < 20000) {
    score -= 20;
  }

  const keystrokes = Number(metrics.keystrokes) || 0;
  if (textLength >= 120 && (textLength > 0 ? (keystrokes / textLength) < 0.15 : false) && maxInsertChunk > 40) {
    score -= 15;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
