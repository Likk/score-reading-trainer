import { PolySynth, Synth, start as toneStart, type OscillatorType } from "tone";
import { midiToNoteName } from "../domain/music";

export const synth = new PolySynth(Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.5 },
  volume: -10,
}).toDestination();

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
