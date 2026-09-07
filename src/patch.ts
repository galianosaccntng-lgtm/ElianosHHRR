import { LiveInterviewState, SecondInterviewBlock } from './types';

export function mapLiveStateToScores(liveState: LiveInterviewState, blocks: SecondInterviewBlock[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const block of blocks) {
    const status = liveState.blockStatus?.[block.id];
    let score = 0;
    if (status?.status === 'covered') {
      score = status.confidence > 80 ? 5 : 4;
    } else if (status?.status === 'partial') {
      score = status.confidence > 50 ? 3 : 2;
    } else {
      score = 1;
    }
    // Set this score for all questions in this block
    if (block.questionIds) {
      block.questionIds.forEach(qid => scores[qid] = score);
    }
  }
  return scores;
}
