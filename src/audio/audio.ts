import { PolySynth, Synth, Sampler, start as toneStart, type OscillatorType } from "tone";
import { midiToNoteName } from "../domain/music";

export type Voice = "synth" | "piano";

const synth = new PolySynth(Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.5 },
  volume: -10,
}).toDestination();

let piano: Sampler | null = null;
let pianoLoading: Promise<void> | null = null;
let currentVolumeDb = -10;
let activeVoice: Voice = "synth";

const SALAMANDER_URLS: Record<string, string> = {
  "A0": "A0.mp3", "C1": "C1.mp3", "D#1": "Ds1.mp3", "F#1": "Fs1.mp3",
  "A1": "A1.mp3", "C2": "C2.mp3", "D#2": "Ds2.mp3", "F#2": "Fs2.mp3",
  "A2": "A2.mp3", "C3": "C3.mp3", "D#3": "Ds3.mp3", "F#3": "Fs3.mp3",
  "A3": "A3.mp3", "C4": "C4.mp3", "D#4": "Ds4.mp3", "F#4": "Fs4.mp3",
  "A4": "A4.mp3", "C5": "C5.mp3", "D#5": "Ds5.mp3", "F#5": "Fs5.mp3",
  "A5": "A5.mp3", "C6": "C6.mp3", "D#6": "Ds6.mp3", "F#6": "Fs6.mp3",
  "A6": "A6.mp3", "C7": "C7.mp3", "D#7": "Ds7.mp3", "F#7": "Fs7.mp3",
  "A7": "A7.mp3", "C8": "C8.mp3",
};

export function loadPiano(): Promise<void> {
  if (piano) return Promise.resolve();
  if (pianoLoading) return pianoLoading;
  pianoLoading = new Promise<void>((resolve, reject) => {
    const s = new Sampler({
      urls: SALAMANDER_URLS,
      baseUrl: "audio/salamander/",
      release: 1,
      onload: () => {
        s.volume.value = currentVolumeDb;
        piano = s;
        resolve();
      },
      onerror: (err) => {
        pianoLoading = null;
        reject(err);
      },
    }).toDestination();
  });
  return pianoLoading;
}

export function setVoice(v: Voice): void {
  activeVoice = v;
}

export function setSynthOscillator(type: OscillatorType): void {
  synth.set({ oscillator: { type } });
}

export function setVolume(db: number): void {
  currentVolumeDb = db;
  synth.volume.value = db;
  if (piano) piano.volume.value = db;
}

function usePiano(): boolean {
  return activeVoice === "piano" && piano !== null;
}

export function triggerAttack(note: string): void {
  if (usePiano()) piano!.triggerAttack(note);
  else synth.triggerAttack(note);
}

export function triggerRelease(note: string): void {
  if (usePiano()) piano!.triggerRelease(note);
  else synth.triggerRelease(note);
}

export function triggerAttackRelease(note: string, duration: string | number): void {
  if (usePiano()) piano!.triggerAttackRelease(note, duration);
  else synth.triggerAttackRelease(note, duration);
}

export { toneStart, midiToNoteName, type OscillatorType };

export interface MidiCallbacks {
  onNoteOn: (noteName: string, octave: number, midi: number) => void;
  onNoteOff: (noteName: string, octave: number) => void;
}

function updateMidiStatus(deviceNames: string[]): void {
  const el = document.getElementById("midiStatus");
  if (!el) return;
  if (deviceNames.length === 0) {
    el.textContent = "MIDI: 未接続";
    el.style.color = "#999";
  } else {
    el.textContent = `MIDI: ${deviceNames.join(", ")}`;
    el.style.color = "#2ecc40";
  }
}

let midiOffset = 0;

export function setMidiOffset(offset: number): void {
  midiOffset = offset;
}

export function initMidi(callbacks: MidiCallbacks): void {
  if (!navigator.requestMIDIAccess) {
    updateMidiStatus([]);
    return;
  }

  const handleMessage = (msg: WebMidi.MIDIMessageEvent) => {
    const data = msg.data;
    if (!data || data.length < 3) return;
    const [status, rawNote, velocity] = data;
    const noteNum = rawNote + midiOffset;
    const name = midiToNoteName(noteNum);
    const isNoteOn = status >= 0x90 && status <= 0x9f && velocity > 0;
    const isNoteOff = (status >= 0x80 && status <= 0x8f) ||
                      (status >= 0x90 && status <= 0x9f && velocity === 0);

    if (isNoteOn) {
      callbacks.onNoteOn(name.noteName, name.octave, noteNum);
    } else if (isNoteOff) {
      callbacks.onNoteOff(name.noteName, name.octave);
    }
  };

  const bindInputs = (access: WebMidi.MIDIAccess) => {
    const names: string[] = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = handleMessage;
      names.push(input.name ?? "Unknown MIDI Device");
    }
    updateMidiStatus(names);
  };

  navigator.requestMIDIAccess().then((access) => {
    bindInputs(access);
    access.onstatechange = () => bindInputs(access);
  }).catch(() => {
    updateMidiStatus([]);
  });
}
