// js/games/pedalPoint/audioEngine.js
import { initAudio, audioCtx } from '../../audio.js';
import { getNoteFrequency } from '../../musicTheory.js';
import { BEAT_DURATION } from './constants.js';

export class CoastalAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.isRunning = false;
    this.nextStepTime = 0;
    this.currentStep = 0;
    this.comboLayer = 0;
    this.lastBeatTime = 0;
    this.beatIndex = 0;
    this.onBeatCallback = null;
  }

  init() {
    try {
      initAudio();
      this.ctx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (!this.masterGain && this.ctx) {
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.42;
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {}
  }

  start() {
    this.init();
    if (!this.ctx) return;
    this.isRunning = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.lastBeatTime = this.nextStepTime;
  }

  stop() {
    this.isRunning = false;
  }

  setComboLayer(comboCount) {
    if (comboCount >= 8) this.comboLayer = 3;
    else if (comboCount >= 4) this.comboLayer = 2;
    else if (comboCount >= 2) this.comboLayer = 1;
    else this.comboLayer = 0;
  }

  getBeatPhase() {
    if (!this.ctx || !this.isRunning) return 0;
    const elapsed = this.ctx.currentTime - this.lastBeatTime;
    return ((elapsed / BEAT_DURATION) % 1 + 1) % 1;
  }

  getBeatAccuracy() {
    const p = this.getBeatPhase();
    return Math.min(p, 1 - p);
  }

  update() {
    if (!this.ctx || !this.isRunning) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const stepDur = BEAT_DURATION / 4;
    while (this.nextStepTime < this.ctx.currentTime + 0.12) {
      this.scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += stepDur;
      this.currentStep = (this.currentStep + 1) % 16;
    }
  }

  scheduleStep(step, t) {
    if (step % 4 === 0) {
      this.lastBeatTime = t;
      this.beatIndex = (step / 4) % 4;
      if (this.onBeatCallback) {
        const delayMs = Math.max(0, (t - this.ctx.currentTime) * 1000);
        const bIdx = this.beatIndex;
        setTimeout(() => this.onBeatCallback(bIdx), delayMs);
      }
    }

    if (step % 4 === 0) this.playKick(t);
    if (step % 2 === 1) this.playShaker(t, step % 4 === 2 ? 0.11 : 0.06);
    if (step === 4 || step === 12) this.playRimClap(t);

    if (this.comboLayer >= 1) {
      const bassPattern = [98.0, 0, 98.0, 110.0, 0, 123.47, 0, 146.83, 130.81, 0, 130.81, 146.83, 0, 164.81, 146.83, 110.0];
      const f = bassPattern[step];
      if (f > 0) this.playBass(t, f, BEAT_DURATION * 0.45);
    }

    if (this.comboLayer >= 2) {
      const arpNotes = [392.0, 493.88, 587.33, 659.25, 783.99, 659.25, 587.33, 493.88];
      if (step % 2 === 0) {
        this.playMarimba(t, arpNotes[(step / 2) % arpNotes.length], 0.14);
      }
    }

    if (this.comboLayer >= 3 && (step === 0 || step === 8)) {
      const chord = step === 0 ? [196.0, 246.94, 293.66, 369.99] : [261.63, 329.63, 392.0, 493.88];
      this.playPadChord(t, chord, BEAT_DURATION * 1.9);
    }
  }

  playKick(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.13);
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  playShaker(t, vol) {
    const bufLen = Math.floor(this.ctx.sampleRate * 0.045);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 6200;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
  }

  playRimClap(t) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.04);
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.055);
  }

  playBass(t, freq, dur) {
    const osc = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(480, t);
    filt.frequency.exponentialRampToValueAtTime(160, t + dur);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  playMarimba(t, freq, vol) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playPadChord(t, freqs, dur) {
    freqs.forEach((f) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.055, t + 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  }

  playNoteTrigger(freq, boost = false) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc1.type = 'triangle';
    osc2.type = 'sine';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 2, t);
    gain.gain.setValueAtTime(boost ? 0.34 : 0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + (boost ? 0.45 : 0.32));
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.48);
    osc2.stop(t + 0.48);
  }

  playWheelieChordShimmer(rootSemitone = 0) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const baseFreq = 261.63 * Math.pow(2, rootSemitone / 12);
    [1, 1.25, 1.5, 2].forEach((ratio, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(baseFreq * ratio, t + idx * 0.03);
      gain.gain.setValueAtTime(0.14, t + idx * 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55 + idx * 0.03);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(t + idx * 0.03);
      osc.stop(t + 0.6 + idx * 0.03);
    });
  }

  playPortKemblaFoghorn(rootSemitone = 0) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const freq = 65.41 * Math.pow(2, rootSemitone / 12);
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const filt = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq * 1.006, t);
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(240, t);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.25);
    gain.gain.setValueAtTime(0.20, t + 1.35);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 2.1);
    osc1.connect(filt);
    osc2.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 2.15);
    osc2.stop(t + 2.15);
  }

  playFeedbackNote(noteOrMidi = 60) {
    this.init();
    if (!this.ctx) return;
    const freq = typeof noteOrMidi === 'number'
      ? 440 * Math.pow(2, (noteOrMidi - 69) / 12)
      : (getNoteFrequency(noteOrMidi) || 392.0);
    this.playNoteTrigger(freq, false);
  }

  playMissBuzz() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(95, t + 0.18);
    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  playJumpPop(perfect) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(perfect ? 260 : 180, t);
    osc.frequency.exponentialRampToValueAtTime(perfect ? 780 : 420, t + 0.16);
    gain.gain.setValueAtTime(0.26, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  playWhipWhoosh() {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.24);
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  playLandingThud(intensity) {
    this.init();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.12);
    gain.gain.setValueAtTime(0.15 + intensity * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  playSkidScrub(intensity) {
    if (!this.ctx || !this.isRunning) return;
    const t = this.ctx.currentTime;
    const dur = 0.07;
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filt = this.ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = 950 + intensity * 650;
    filt.Q.value = 1.4;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.16, 0.04 + intensity * 0.12), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    src.connect(filt);
    filt.connect(gain);
    gain.connect(this.masterGain);
    src.start(t);
  }
}

export function installSteeringMutePatch(shouldMuteCallback) {
  if (audioCtx && !audioCtx._ppSteeringMutePatched) {
    audioCtx._ppSteeringMutePatched = true;
    const rawCreateOsc = audioCtx.createOscillator.bind(audioCtx);
    const rawCreateGain = audioCtx.createGain.bind(audioCtx);
    audioCtx.createOscillator = function () {
      const osc = rawCreateOsc();
      if (shouldMuteCallback()) {
        const origConnect = osc.connect.bind(osc);
        osc.connect = function (dest) {
          if (dest && dest.gain && typeof dest.gain.setValueAtTime === 'function') {
            dest.gain.setValueAtTime(0, audioCtx.currentTime);
            dest.gain.value = 0;
          }
          const silentGain = rawCreateGain();
          silentGain.gain.value = 0;
          return origConnect(silentGain);
        };
      }
      return osc;
    };
  }
}
