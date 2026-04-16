import { type NoteInfo, type Clef, type KeySig, KEY_MAP, noteToSemitone } from "./domain/music";
import { randomNote } from "./domain/noteGenerator";
import { renderNote } from "./ui/renderer";
import { buildKeyboard, updateKeyboardHint, clearKeyboardHint, updateKbLayoutLabels, highlightKey } from "./ui/keyboard";
import { synth, toneStart, initMidi } from "./audio/audio";
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
let currentNote: NoteInfo | null = null;
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

function nextQuestion(): void {
  currentNote = randomNote(rangeLow, rangeHigh, currentKeySig, accidentalsEnabled);
  renderNote(currentNote, currentClef, currentKeySig);
  if (hintKeyEnabled && currentNote) {
    updateKeyboardHint(currentNote.name, currentNote.octave);
  } else {
    clearKeyboardHint();
  }
}

function checkAnswer(inputNoteName: string, inputOctave?: number): void {
  if (!currentNote) return;
  const now = Date.now();
  if (now - lastAnswerTime < 50) return;
  lastAnswerTime = now;
  const expectedSemitone = noteToSemitone(currentNote.name);
  const inputSemitone = noteToSemitone(inputNoteName);
  const semitoneMatch = expectedSemitone === inputSemitone && expectedSemitone !== -1;
  const octaveMatch = inputOctave === undefined || inputOctave === currentNote.octave;
  showFeedback(semitoneMatch && octaveMatch);
}

function showFeedback(correct: boolean): void {
  const el = document.querySelector(".score-area") as HTMLElement;
  if (!el) return;

  if (correct) {
    currentNote = null;
  }

  el.style.outlineColor = correct ? "#22c55e" : "#ef4444";

  const delay = correct ? 800 : 400;
  setTimeout(() => {
    el.style.outlineColor = "";
    if (correct) nextQuestion();
  }, delay);
}

function onPianoKeyClick(noteName: string, octave: number): void {
  synth.triggerAttackRelease(`${noteName}${octave}`, "8n");
  highlightKey(noteName, octave);
  if (hintStaffEnabled && currentNote) {
    const pressedMidi = (octave + 1) * 12 + noteToSemitone(noteName);
    renderNote(currentNote, currentClef, currentKeySig, pressedMidi);
  }
  checkAnswer(noteName, octave);
}

// --- Input: PC keyboard ---

document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const noteName = KEY_MAP[e.key.toLowerCase()];
  if (noteName) {
    const octave = currentNote?.octave ?? 4;
    synth.triggerAttackRelease(`${noteName}${octave}`, "8n");
    highlightKey(noteName, octave);
    if (hintStaffEnabled && currentNote) {
      const pressedMidi = (octave + 1) * 12 + noteToSemitone(noteName);
      renderNote(currentNote, currentClef, currentKeySig, pressedMidi);
    }
    checkAnswer(noteName, octave);
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
          if (hintKeyEnabled && currentNote) {
            updateKeyboardHint(currentNote.name, currentNote.octave);
          } else {
            clearKeyboardHint();
          }
        },
        onHintNoteLabelChange: (enabled) => { hintNoteLabelEnabled = enabled; rebuildKeyboard(); },
        onHintKbLayoutChange: (enabled) => { hintKbLayoutEnabled = enabled; updateKbLayoutLabels(enabled); },
        onVolumeChange: (value) => { synth.volume.value = value; },
        onOscillatorChange: (type) => { synth.set({ oscillator: { type } }); },
        onKbModeChange: (mode) => { keyboardMode = mode; rebuildKeyboard(); },
      });

      initMidi({
        onNoteOn: (noteName, octave, midi) => {
          synth.triggerAttack(`${noteName}${octave}`);
          highlightKey(noteName, octave);
          if (hintStaffEnabled && currentNote) {
            renderNote(currentNote, currentClef, currentKeySig, midi);
          }
          checkAnswer(noteName, octave);
        },
        onNoteOff: (noteName, octave) => {
          synth.triggerRelease(`${noteName}${octave}`);
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
