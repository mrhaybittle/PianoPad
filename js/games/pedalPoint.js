// js/games/pedalPoint.js
import { initAudio } from '../audio.js';
import { createPedalPointSession } from './pedalPoint/simulation.js';

let activeController = null;

function ensureThreeLoaded() {
  if (window.THREE) return Promise.resolve(window.THREE);
  const cdnUrls = [
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
    'https://unpkg.com/three@0.128.0/build/three.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
  ];
  return new Promise((resolve, reject) => {
    let idx = 0;
    const tryNext = () => {
      if (window.THREE) return resolve(window.THREE);
      if (idx >= cdnUrls.length) return reject(new Error('Three.js failed to load'));
      const script = document.createElement('script');
      script.src = cdnUrls[idx++];
      script.async = true;
      script.onload = () => (window.THREE ? resolve(window.THREE) : tryNext());
      script.onerror = () => {
        script.remove();
        tryNext();
      };
      document.head.appendChild(script);
    };
    tryNext();
  });
}

function stopPedalPoint() {
  if (activeController && activeController.cleanup) {
    activeController.cleanup();
  }
  activeController = null;
}

function handlePedalPointInput(noteStr, bridge) {
  if (activeController && activeController.onPianoNoteDown) {
    activeController.onPianoNoteDown(noteStr, bridge);
  }
}

function handlePedalPointRelease(noteStr) {
  if (activeController && activeController.onPianoNoteUp) {
    activeController.onPianoNoteUp(noteStr);
  }
}

async function startPedalPoint(bridge, autoStart = false) {
  initAudio();
  stopPedalPoint();

  bridge.exitActiveMiniGame();
  document.getElementById('game-results-modal')?.classList.remove('open');
  document.getElementById('arcade-hub')?.classList.remove('open');

  bridge.setActiveMiniGame('pedalPoint');
  bridge.resetGameStats();

  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = '🚵‍♂️ Loading Pedal Point 3D Escarpment...';

  let THREE;
  try {
    THREE = await ensureThreeLoaded();
  } catch (e) {
    alert('Three.js failed to load. Please check your internet connection and reload.');
    bridge.exitActiveMiniGame();
    return;
  }

  activeController = createPedalPointSession(THREE, bridge, autoStart, {
    onFinish: (score, summaryHtml) => {
      stopPedalPoint();
      bridge.finishCustomMiniGame(
        'Pedal Point',
        score,
        summaryHtml,
        () => startPedalPoint(bridge, true)
      );
    }
  });
}

export {
  startPedalPoint,
  handlePedalPointInput,
  handlePedalPointRelease,
  stopPedalPoint
};
