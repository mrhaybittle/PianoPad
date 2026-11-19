export let audioCtx = null;

export function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export function playErrorClackSound() {
    initAudio();
    const now = audioCtx.currentTime;
    
    const bufferSize = audioCtx.sampleRate * 0.04;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(320, now);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    noise.start(now);
    noise.stop(now + 0.04);
}

export function playTone(freq, duration = 0.4, volScale = 1.0) {
    if (!freq) return;
    initAudio();

    const instEl = document.getElementById('instrument-select');
    const inst = instEl ? instEl.value : 'piano';
    const now = audioCtx.currentTime;

    if (inst === 'piano') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.4 * volScale, now + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.3);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.3);
    } else if (inst === 'synth') {
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 3, now);
        filter.frequency.exponentialRampToValueAtTime(freq, now + duration);

        gain.gain.setValueAtTime(0.2 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.1);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.1);
    } else if (inst === 'organ') {
        [1, 2, 3].forEach(multiplier => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq * multiplier, now);

            const vol = (0.2 / multiplier) * volScale;
            gain.gain.setValueAtTime(vol, now);
            gain.gain.linearRampToValueAtTime(vol, now + duration);
            gain.gain.linearRampToValueAtTime(0.0001, now + duration + 0.05);

            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + duration + 0.05);
        });
    } else if (inst === 'marimba') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.6 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + Math.min(duration, 0.25));

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
    } else if (inst === 'chiptune') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.15 * volScale, now);
        gain.gain.linearRampToValueAtTime(0.15 * volScale, now + duration);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.02);

        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(now);
        osc.stop(now + duration + 0.02);
    } else if (inst === 'epiano') {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(freq, now);
        osc2.frequency.setValueAtTime(freq * 2, now);

        gain.gain.setValueAtTime(0.35 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.4);

        osc1.connect(gain); osc2.connect(gain);
        gain.connect(audioCtx.destination);
        osc1.start(now); osc2.start(now);
        osc1.stop(now + duration + 0.4); osc2.stop(now + duration + 0.4);
    } else if (inst === 'harpsichord') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.25 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.15);

        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + duration + 0.15);
    } else if (inst === 'synth80s') {
        const osc = audioCtx.createOscillator();
        const filter = audioCtx.createBiquadFilter();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, now);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 4, now);

        gain.gain.setValueAtTime(0.2 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.2);

        osc.connect(filter); filter.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + duration + 0.2);
    } else if (inst === 'xylophone') {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq * 2, now);

        gain.gain.setValueAtTime(0.5 * volScale, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.start(now); osc.stop(now + 0.18);
    } else if (inst === 'accordion') {
        [0.99, 1.01].forEach(detune => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq * detune, now);

            gain.gain.setValueAtTime(0.12 * volScale, now);
            gain.gain.linearRampToValueAtTime(0.12 * volScale, now + duration);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.1);

            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.start(now); osc.stop(now + duration + 0.1);
        });
    }
}

export function bufferToWavBlob(buffer) {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const outBuffer = new ArrayBuffer(length);
    const view = new DataView(outBuffer);
    const channels = [];
    let sample = 0;
    let offset = 0;
    let pos = 0;

    function writeString(str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(pos++, str.charCodeAt(i));
        }
    }

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }

    writeString('RIFF');
    setUint32(length - 8);
    writeString('WAVE');
    writeString('fmt ');
    setUint32(16);
    setUint16(1);
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);
    setUint16(numOfChan * 2);
    setUint16(16);
    writeString('data');
    setUint32(length - pos - 4);

    for (let i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    while (offset < buffer.length) {
        for (let i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset]));
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([outBuffer], { type: 'audio/wav' });
}
