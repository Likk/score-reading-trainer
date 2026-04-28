import { type NoteInfo, type Clef, type KeySig, KEY_MAP, noteToSemitone } from "./domain/music";
import { randomChord } from "./domain/noteGenerator";
import { renderNote } from "./ui/renderer";
import { buildKeyboard, updateKeyboardHint, clearKeyboardHint, updateKbLayoutLabels, highlightKey } from "./ui/keyboard";
import {
  toneStart, initMidi, setMidiOffset,
  triggerAttack, triggerRelease,
  setVolume, setSynthOscillator, setVoice, loadPiano,
} from "./audio/audio";
import { initSettings } from "./ui/settings";

// --- State ---

let currentClef: Clef = "treble";
let currentKeySig: KeySig = "C";
let accidentalsEnabled = false;
let rangeLow = 60;   // C4 (MIDI number)
let rangeHigh = 83;  // B5 (MIDI number)
let keyboardMode: "fit" | "scroll" = "fit";
let hintStaffEnabled = false;
let hintKeyEnabled = false;
let hintKbLayoutEnabled = false;
let hintNoteLabelEnabled = true;
let chordSize = 1;
let currentNotes: NoteInfo[] | null = null;
const heldFromMidi  = new Set<number>();
const heldFromTouch = new Set<number>();
const heldFromMouse = new Set<number>();
const heldFromKbd   = new Set<number>();
const pressedKeys = new Map<string, { toneKey: string; midi: number }>();
let lastAnswerTime = 0;
let chordSettleTimer: ReturnType<typeof setTimeout> | null = null;
const CHORD_SETTLE_MS = 80;

function displayHeld(): Set<number> {
  return new Set([...heldFromMidi, ...heldFromTouch, ...heldFromMouse, ...heldFromKbd]);
}

function judgmentHeld(): Set<number> {
  return new Set([...heldFromMidi, ...heldFromTouch]);
}

// --- Game logic ---

function rebuildKeyboard(): void {
  buildKeyboard({
    rangeLow,
    rangeHigh,
    keyboardMode,
    hintNoteLabelEnabled,
    onKeyDown: onPianoKeyDown,
    onKeyUp: onPianoKeyUp,
  });
  updateKbLayoutLabels(hintKbLayoutEnabled);
}

function expectedMidis(): number[] {
  if (!currentNotes) return [];
  return currentNotes.map(n => (n.octave + 1) * 12 + noteToSemitone(n.name));
}

function nextQuestion(): void {
  currentNotes = randomChord(rangeLow, rangeHigh, currentKeySig, accidentalsEnabled, chordSize);
  heldFromMidi.clear();
  heldFromTouch.clear();
  heldFromMouse.clear();
  heldFromKbd.clear();
  if (chordSettleTimer) {
    clearTimeout(chordSettleTimer);
    chordSettleTimer = null;
  }
  renderNote(currentNotes, currentClef, currentKeySig);
  if (hintKeyEnabled && currentNotes) {
    updateKeyboardHint(currentNotes.map(n => ({ name: n.name, octave: n.octave })));
  } else {
    clearKeyboardHint();
  }
}

function checkChordAnswer(): void {
  if (!currentNotes) return;
  if (chordSettleTimer) clearTimeout(chordSettleTimer);
  chordSettleTimer = setTimeout(() => {
    chordSettleTimer = null;
    if (!currentNotes) return;
    const now = Date.now();
    if (now - lastAnswerTime < 50) return;
    const expected = expectedMidis();
    const expectedSet = new Set(expected);
    const held = judgmentHeld();
    const hasExtra = [...held].some(m => !expectedSet.has(m));
    if (hasExtra) {
      lastAnswerTime = now;
      showFeedback(false);
      return;
    }
    if (held.size === expected.length && expected.every(m => held.has(m))) {
      lastAnswerTime = now;
      showFeedback(true);
    }
  }, CHORD_SETTLE_MS);
}

function checkSingleAnswer(inputNoteName: string, inputOctave: number): void {
  if (!currentNotes || currentNotes.length !== 1) return;
  const now = Date.now();
  if (now - lastAnswerTime < 50) return;
  lastAnswerTime = now;
  const target = currentNotes[0];
  const expectedSemitone = noteToSemitone(target.name);
  const inputSemitone = noteToSemitone(inputNoteName);
  const semitoneMatch = expectedSemitone === inputSemitone && expectedSemitone !== -1;
  const octaveMatch = inputOctave === target.octave;
  showFeedback(semitoneMatch && octaveMatch);
}

function showFeedback(correct: boolean): void {
  const el = document.querySelector(".score-area") as HTMLElement;
  if (!el) return;

  if (correct) {
    currentNotes = null;
  }

  el.style.outlineColor = correct ? "#22c55e" : "#ef4444";

  const delay = correct ? 800 : 400;
  setTimeout(() => {
    el.style.outlineColor = "";
    if (correct) nextQuestion();
  }, delay);
}

function renderHintStaff(): void {
  if (!hintStaffEnabled || !currentNotes) return;
  renderNote(currentNotes, currentClef, currentKeySig, [...displayHeld()]);
}

function onPianoKeyDown(noteName: string, octave: number, pointerType: string): void {
  const toneKey = `${noteName}${octave}`;
  const midi = (octave + 1) * 12 + noteToSemitone(noteName);
  triggerAttack(toneKey);
  highlightKey(noteName, octave);
  if (pointerType === "touch") {
    heldFromTouch.add(midi);
  } else {
    heldFromMouse.add(midi);
  }
  renderHintStaff();
  if (chordSize === 1) {
    checkSingleAnswer(noteName, octave);
  } else if (pointerType === "touch") {
    checkChordAnswer();
  }
}

function onPianoKeyUp(noteName: string, octave: number, pointerType: string): void {
  const toneKey = `${noteName}${octave}`;
  const midi = (octave + 1) * 12 + noteToSemitone(noteName);
  triggerRelease(toneKey);
  if (pointerType === "touch") {
    heldFromTouch.delete(midi);
  } else {
    heldFromMouse.delete(midi);
  }
  renderHintStaff();
}

// --- Input: PC keyboard ---

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const key = e.key.toLowerCase();
  const noteName = KEY_MAP[key];
  if (!noteName) return;
  if (pressedKeys.has(key)) return;
  const octave = currentNotes?.[0]?.octave ?? 4;
  const toneKey = `${noteName}${octave}`;
  const midi = (octave + 1) * 12 + noteToSemitone(noteName);
  triggerAttack(toneKey);
  highlightKey(noteName, octave);
  heldFromKbd.add(midi);
  pressedKeys.set(key, { toneKey, midi });
  renderHintStaff();
  if (chordSize === 1) {
    checkSingleAnswer(noteName, octave);
  }
});

document.addEventListener("keyup", (e) => {
  const key = e.key.toLowerCase();
  const info = pressedKeys.get(key);
  if (!info) return;
  triggerRelease(info.toneKey);
  heldFromKbd.delete(info.midi);
  pressedKeys.delete(key);
  renderHintStaff();
});

// --- Init ---

document.addEventListener("DOMContentLoaded", () => {
  const overlay = document.getElementById("startOverlay");
  if (overlay) {
    let started = false;
    const start = async () => {
      if (started) return;
      started = true;
      await toneStart();
      overlay.classList.add("hidden");

      initSettings({
        onClefChange: (clef) => { currentClef = clef; nextQuestion(); },
        onKeySigChange: (keySig) => { currentKeySig = keySig; nextQuestion(); },
        onRangeChange: (low, high) => { rangeLow = low; rangeHigh = high; rebuildKeyboard(); nextQuestion(); },
        onAccidentalsChange: (enabled) => { accidentalsEnabled = enabled; nextQuestion(); },
        onHintStaffChange: (enabled) => { hintStaffEnabled = enabled; },
        onHintKeyChange: (enabled) => {
          hintKeyEnabled = enabled;
          if (hintKeyEnabled && currentNotes) {
            updateKeyboardHint(currentNotes.map(n => ({ name: n.name, octave: n.octave })));
          } else {
            clearKeyboardHint();
          }
        },
        onHintNoteLabelChange: (enabled) => { hintNoteLabelEnabled = enabled; rebuildKeyboard(); },
        onHintKbLayoutChange: (enabled) => { hintKbLayoutEnabled = enabled; updateKbLayoutLabels(enabled); },
        onVolumeChange: (value) => { setVolume(value); },
        onVoiceChange: async (selection) => {
          if (selection.kind === "synth") {
            setSynthOscillator(selection.osc);
            setVoice("synth");
          } else {
            await loadPiano();
            setVoice("piano");
          }
        },
        onKbModeChange: (mode) => { keyboardMode = mode; rebuildKeyboard(); },
        onMidiOffsetChange: (offset) => { setMidiOffset(offset); },
        onChordSizeChange: (size) => { chordSize = size; nextQuestion(); },
      });

      initMidi({
        onNoteOn: (noteName, octave, midi) => {
          triggerAttack(`${noteName}${octave}`);
          highlightKey(noteName, octave);
          heldFromMidi.add(midi);
          renderHintStaff();
          if (chordSize === 1) {
            checkSingleAnswer(noteName, octave);
          } else {
            checkChordAnswer();
          }
        },
        onNoteOff: (noteName, octave) => {
          triggerRelease(`${noteName}${octave}`);
          const midi = (octave + 1) * 12 + noteToSemitone(noteName);
          heldFromMidi.delete(midi);
          renderHintStaff();
        },
      });

      window.addEventListener("resize", () => {
        if (keyboardMode === "fit") rebuildKeyboard();
      });

      rebuildKeyboard();
      nextQuestion();

      overlay.removeEventListener("click", start);
      document.removeEventListener("keydown", start);
    };
    overlay.addEventListener("click", start);
    document.addEventListener("keydown", start);
  }
});
