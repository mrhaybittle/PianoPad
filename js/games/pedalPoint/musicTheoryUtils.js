// js/games/pedalPoint/musicTheoryUtils.js
import { SEMITONE_MAP, SEMITONE_NAMES } from './constants.js';

export function detectTriadFromPitchClasses(pitchSet) {
  const semis = new Set();
  pitchSet.forEach(p => {
    const clean = p.toLowerCase().replace(/[0-9]/g, '');
    if (SEMITONE_MAP[clean] !== undefined) {
      semis.add(SEMITONE_MAP[clean]);
    }
  });
  if (semis.size < 3) return null;

  const patterns = [
    { intervals: [4, 7], quality: 'MAJOR' },
    { intervals: [3, 7], quality: 'MINOR' },
    { intervals: [3, 6], quality: 'DIMINISHED' },
    { intervals: [4, 8], quality: 'AUGMENTED' }
  ];

  for (const root of semis) {
    for (const pat of patterns) {
      const third = (root + pat.intervals[0]) % 12;
      const fifth = (root + pat.intervals[1]) % 12;
      if (semis.has(third) && semis.has(fifth)) {
        return {
          root,
          name: `${SEMITONE_NAMES[root]} ${pat.quality}`,
          quality: pat.quality
        };
      }
    }
  }
  return null;
}
