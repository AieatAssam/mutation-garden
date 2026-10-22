import type { SimEvent } from '../sim';

export interface Sfx {
  /** Creates or resumes the audio context; call from a user gesture (autoplay rules). */
  unlock(): void;
  onEvents(events: readonly SimEvent[]): void;
  setMuted(muted: boolean): void;
  /** A quiet generative loop; it starts once audio is unlocked. */
  setMusic(on: boolean): void;
  readonly muted: boolean;
  dispose(): void;
}

/** Major pentatonic steps above C5, for combo and coin ladders (design.md 10). */
const PENTATONIC = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

type Voice = (context: AudioContext, out: AudioNode, at: number, pitch: number) => void;

function envelope(context: AudioContext, out: AudioNode, at: number, peak: number, decay: number): GainNode {
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  gain.connect(out);
  return gain;
}

function tone(context: AudioContext, out: AudioNode, at: number, type: OscillatorType, from: number, to: number,
  peak: number, decay: number): void {
  const oscillator = context.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, at);
  oscillator.frequency.exponentialRampToValueAtTime(to, at + decay * 0.8);
  oscillator.connect(envelope(context, out, at, peak, decay));
  oscillator.start(at);
  oscillator.stop(at + decay + 0.02);
}

function noise(context: AudioContext, out: AudioNode, at: number, filter: BiquadFilterType, frequency: number,
  peak: number, decay: number): void {
  const length = Math.ceil(context.sampleRate * decay);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let seed = 7;
  for (let index = 0; index < length; index += 1) {
    seed = (seed * 16807) % 2147483647;
    data[index] = seed / 1073741823.5 - 1;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const shaped = context.createBiquadFilter();
  shaped.type = filter;
  shaped.frequency.value = frequency;
  source.connect(shaped).connect(envelope(context, out, at, peak, decay));
  source.start(at);
}

const VOICES = {
  plant: (context, out, at, pitch) => {
    noise(context, out, at, 'lowpass', 700 * pitch, 0.35, 0.12);
    tone(context, out, at, 'sine', 160 * pitch, 70, 0.4, 0.16);
  },
  pop: (context, out, at, pitch) => tone(context, out, at, 'sine', 520 * pitch, 980 * pitch, 0.18, 0.09),
  ripe: (context, out, at, pitch) => {
    tone(context, out, at, 'triangle', 880 * pitch, 880 * pitch, 0.16, 0.35);
    tone(context, out, at + 0.07, 'triangle', 1318.5 * pitch, 1318.5 * pitch, 0.13, 0.4);
  },
  harvest: (context, out, at, pitch) => {
    tone(context, out, at, 'triangle', 330 * pitch, 660 * pitch, 0.3, 0.14);
    noise(context, out, at, 'bandpass', 1800, 0.12, 0.06);
  },
  coin: (context, out, at, pitch) => {
    tone(context, out, at, 'square', pitch, pitch, 0.05, 0.12);
    tone(context, out, at + 0.05, 'sine', pitch * 1.5, pitch * 1.5, 0.12, 0.22);
  },
  water: (context, out, at, pitch) => {
    noise(context, out, at, 'bandpass', 1400 * pitch, 0.25, 0.35);
    tone(context, out, at + 0.05, 'sine', 900 * pitch, 1500 * pitch, 0.06, 0.12);
  },
} satisfies Record<string, Voice>;

/** Synthesised garden sounds: pleasant on repeat, varied by small random pitch shifts. */
export function createSfx(): Sfx {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let combo = 0;
  let lastHarvestAt = 0;
  let musicOn = false;
  let musicTimer = 0;
  let musicStep = 0;
  // A slow, soft pentatonic walk two octaves down; ducked well under the effects.
  const playMusicNote = () => {
    if (!context || !master || !musicOn || context.state !== 'running') return;
    musicStep = Math.max(0, Math.min(7, musicStep + [-2, -1, 1, 1, 2][Math.floor(Math.random() * 5)]!));
    const at = context.currentTime + 0.02;
    tone(context, master, at, 'triangle', PENTATONIC[musicStep]! / 4, PENTATONIC[musicStep]! / 4, 0.05, 1.4);
    if (musicStep % 3 === 0) tone(context, master, at, 'sine', PENTATONIC[(musicStep + 2) % 8]! / 2, PENTATONIC[(musicStep + 2) % 8]! / 2, 0.025, 1.8);
  };
  const syncMusic = () => {
    const want = musicOn && context !== null;
    if (want && !musicTimer) musicTimer = setInterval(playMusicNote, 720) as unknown as number;
    if (!want && musicTimer) {
      clearInterval(musicTimer);
      musicTimer = 0;
    }
  };

  const play = (voice: keyof typeof VOICES, pitch = 1, delay = 0) => {
    if (!context || !master || muted || context.state !== 'running') return;
    // ±4% pitch so repeated sounds never grate.
    VOICES[voice](context, master, context.currentTime + delay, pitch * (0.96 + Math.random() * 0.08));
  };

  return {
    unlock() {
      if (typeof AudioContext === 'undefined') return;
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = 0.6;
        master.connect(context.destination);
      }
      if (context.state === 'suspended') void context.resume();
      syncMusic();
    },
    onEvents(events) {
      let harvested = 0;
      for (const event of events) {
        switch (event.type) {
          case 'Planted': play('plant'); break;
          case 'StageReached': play('pop', event.stage === 'Sprout' ? 1 : event.stage === 'Growing' ? 1.12 : 1.25); break;
          case 'Harvestable': play('ripe'); break;
          case 'Watered': play('water'); break;
          case 'Harvested': {
            if (!context) break;
            // The coin ladder climbs while harvests keep coming and resets after 1.2 s of quiet.
            if (context.currentTime - lastHarvestAt > 1.2) combo = 0;
            lastHarvestAt = context.currentTime;
            play('harvest', 1, harvested * 0.07);
            play('coin', PENTATONIC[Math.min(combo, PENTATONIC.length - 1)]!, 0.12 + harvested * 0.07);
            combo += 1;
            harvested += 1;
            break;
          }
          default: break;
        }
      }
    },
    setMuted(next) {
      muted = next;
    },
    setMusic(on) {
      musicOn = on;
      syncMusic();
    },
    get muted() {
      return muted;
    },
    dispose() {
      musicOn = false;
      syncMusic();
      void context?.close();
      context = null;
      master = null;
    },
  };
}
