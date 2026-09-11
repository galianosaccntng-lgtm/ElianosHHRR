const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `    // Merge block updates intelligently (don't degrade 'covered')
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

const replace = `    // Merge block updates intelligently (don't degrade 'covered')
    const newBlockStatus = { ...prevLive.blockStatus };
    for (const [blockId, update] of Object.entries(aiResult.blockUpdates || {})) {
      const existing = newBlockStatus[blockId];
      if (existing && existing.status === 'covered') {
        if ((update as any).status === 'covered') {
          newBlockStatus[blockId] = update as any; 
        } else {
          // keep 'covered' status, but update liveRating if AI provided one
          if ((update as any).liveRating !== undefined) {
            existing.liveRating = (update as any).liveRating;
          }
        }
      } else {
        newBlockStatus[blockId] = update as any;
      }
    }`;

code = code.replace(target, replace);
fs.writeFileSync('server.ts', code);
