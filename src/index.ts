import { type NoteInfo, type Clef, type KeySig, KEY_MAP, noteToSemitone } from "./domain/music";
import { randomChord } from "./domain/noteGenerator";
import { renderNote } from "./ui/renderer";
import { buildKeyboard, updateKeyboardHint, clearKeyboardHint, updateKbLayoutLabels, highlightKey } from "./ui/keyboard";
import {
  toneStart, initMidi, setMidiOffset,
  triggerAttack, triggerRelease, triggerAttackRelease,
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
const heldMidis = new Set<number>();
let lastAnswerTime = 0;

// --- Game logic ---

function rebuildKeyboard(): void {
  buildKeyboard({
    rangeLow,
    rangeHigh,
    keyboardMode,
    hintNoteLabelEnabled,
    onKeyClick: onPianoKeyClick,
  });
  updateKbLayoutLabels(hintKbLayoutEnabled);
}

function expectedMidis(): number[] {
  if (!currentNotes) return [];
  return currentNotes.map(n => (n.octave + 1) * 12 + noteToSemitone(n.name));
}

function nextQuestion(): void {
  currentNotes = randomChord(rangeLow, rangeHigh, currentKeySig, accidentalsEnabled, chordSize);
  heldMidis.clear();
  renderNote(currentNotes, currentClef, currentKeySig);
  if (hintKeyEnabled && currentNotes) {
    updateKeyboardHint(currentNotes.map(n => ({ name: n.name, octave: n.octave })));
  } else {
    clearKeyboardHint();
  }
}

function checkChordAnswer(): void {
  if (!currentNotes) return;
  const now = Date.now();
  if (now - lastAnswerTime < 50) return;
  const expected = expectedMidis();
  if (expected.every(m => heldMidis.has(m))) {
    lastAnswerTime = now;
    showFeedback(true);
  }
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
  renderNote(currentNotes, currentClef, currentKeySig, [...heldMidis]);
}

function onPianoKeyClick(noteName: string, octave: number): void {
  triggerAttackRelease(`${noteName}${octave}`, "8n");
  highlightKey(noteName, octave);
  if (hintStaffEnabled && currentNotes) {
    const pressedMidi = (octave + 1) * 12 + noteToSemitone(noteName);
    renderNote(currentNotes, currentClef, currentKeySig, [pressedMidi]);
  }
  if (chordSize === 1) {
    checkSingleAnswer(noteName, octave);
  }
}

// --- Input: PC keyboard ---

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (noteName) {
    const octave = currentNotes?.[0]?.octave ?? 4;
    triggerAttackRelease(`${noteName}${octave}`, "8n");
    highlightKey(noteName, octave);
    if (hintStaffEnabled && currentNotes) {
      const pressedMidi = (octave + 1) * 12 + noteToSemitone(noteName);
      renderNote(currentNotes, currentClef, currentKeySig, [pressedMidi]);
    }
    if (chordSize === 1) {
      checkSingleAnswer(noteName, octave);
    }
  }
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
          heldMidis.add(midi);
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
          heldMidis.delete(midi);
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
