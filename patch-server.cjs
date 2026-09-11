const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const promptTarget = `"evidence": "Brief evidence from this or previous segments backing this status (IN SPANISH)"
    }`;

const promptReplace = `"evidence": "Brief evidence from this or previous segments backing this status (IN SPANISH)",
      "liveRating": "An integer from 1 to 5 reflecting the QUALITY of candidate responses in this block so far (1 = weak/concerning, 3 = acceptable, 5 = excellent). Use null if the block is not_addressed. Do NOT penalize for non-native language."
    }`;

code = code.replace(promptTarget, promptReplace);

const mergeTarget = `    // Merge block updates intelligently (don't degrade 'covered')
    const newBlockStatus = { ...prevLive.blockStatus };
    for (const [blockId, update] of Object.entries(aiResult.blockUpdates || {})) {
      const existing = newBlockStatus[blockId];
      if (existing && existing.status === 'covered') {
        if ((update as any).status === 'covered') {
          newBlockStatus[blockId] = update as any; // update confidence/evidence
        }
      } else {
        newBlockStatus[blockId] = update as any;
      }
    }`;

const mergeReplace = `    // Merge block updates intelligently (don't degrade 'covered')
    const newBlockStatus = { ...prevLive.blockStatus };
    for (const [blockId, update] of Object.entries(aiResult.blockUpdates || {})) {
      const existing = newBlockStatus[blockId];
      if (existing && existing.status === 'covered') {
        if ((update as any).status === 'covered') {
          newBlockStatus[blockId] = update as any; // update confidence/evidence/rating
        } else if (existing.liveRating !== undefined) {
          // If Gemini returned a non-covered status but we already have covered, keep 'covered' status but update liveRating if provided in the update, or keep existing rating.
          // Wait, the rule says "don't degrade covered". So if we ignore the degrade, we should still allow liveRating to update if the AI sent it.
          // Actually, if it sends partial, it might send a liveRating. Let's merge liveRating into existing.
          if ((update as any).liveRating !== undefined) {
            existing.liveRating = (update as any).liveRating;
          }
        }
      } else {
        newBlockStatus[blockId] = update as any;
      }
    }`;

code = code.replace(mergeTarget, mergeReplace);
fs.writeFileSync('server.ts', code);
