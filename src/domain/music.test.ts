import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  noteToSemitone,
  semitoneToToneName,
  getScaleNotes,
  buildVexKey,
  getOttava,
  midiToNoteName,
  NOTE_NAMES,
  KEY_SIG_MAP,
  LETTER_SEMITONES,
} from "./music";

// --- noteToSemitone ---

describe("noteToSemitone", () => {
  it("natural notes map to correct semitones", () => {
    assert.equal(noteToSemitone("C"), 0);
    assert.equal(noteToSemitone("D"), 2);
    assert.equal(noteToSemitone("E"), 4);
    assert.equal(noteToSemitone("F"), 5);
    assert.equal(noteToSemitone("G"), 7);
    assert.equal(noteToSemitone("A"), 9);
    assert.equal(noteToSemitone("B"), 11);
  });

  it("sharp raises by 1 semitone", () => {
    assert.equal(noteToSemitone("C#"), 1);
    assert.equal(noteToSemitone("F#"), 6);
    assert.equal(noteToSemitone("G#"), 8);
  });

  it("flat lowers by 1 semitone", () => {
    assert.equal(noteToSemitone("Db"), 1);
    assert.equal(noteToSemitone("Eb"), 3);
    assert.equal(noteToSemitone("Bb"), 10);
  });

  it("double sharp raises by 2 semitones", () => {
    assert.equal(noteToSemitone("C##"), 2);
    assert.equal(noteToSemitone("F##"), 7);
  });

  it("double flat lowers by 2 semitones", () => {
    assert.equal(noteToSemitone("Dbb"), 0);
    assert.equal(noteToSemitone("Ebb"), 2);
  });

  it("wraps around at octave boundary", () => {
    assert.equal(noteToSemitone("B#"), 0);  // B(11) + 1 = 12 -> 0
    assert.equal(noteToSemitone("Cb"), 11); // C(0) - 1 = -1 -> 11
  });

  it("returns -1 for invalid input", () => {
    assert.equal(noteToSemitone("X"), -1);
    assert.equal(noteToSemitone(""), -1);
  });
});

// --- semitoneToToneName ---

describe("semitoneToToneName", () => {
  it("maps all 12 semitones", () => {
    assert.equal(semitoneToToneName(0), "C");
    assert.equal(semitoneToToneName(1), "C#");
    assert.equal(semitoneToToneName(6), "F#");
    assert.equal(semitoneToToneName(11), "B");
  });

  it("wraps negative values", () => {
    assert.equal(semitoneToToneName(-1), "B");
    assert.equal(semitoneToToneName(-12), "C");
  });

  it("wraps values >= 12", () => {
    assert.equal(semitoneToToneName(12), "C");
    assert.equal(semitoneToToneName(13), "C#");
  });
});

// --- getScaleNotes ---

describe("getScaleNotes", () => {
  it("C major has no alterations", () => {
    assert.deepEqual(getScaleNotes("C"), ["C", "D", "E", "F", "G", "A", "B"]);
  });

  it("G major has F#", () => {
    const scale = getScaleNotes("G");
    assert.equal(scale[3], "F#"); // F -> F#
    assert.equal(scale[0], "C");  // C unchanged
  });

  it("D major has F# and C#", () => {
    const scale = getScaleNotes("D");
    assert.ok(scale.includes("F#"));
    assert.ok(scale.includes("C#"));
    assert.equal(scale.length, 7);
  });

  it("F major has Bb", () => {
    const scale = getScaleNotes("F");
    assert.ok(scale.includes("Bb"));
  });

  it("Bb major has Bb and Eb", () => {
    const scale = getScaleNotes("Bb");
    assert.ok(scale.includes("Bb"));
    assert.ok(scale.includes("Eb"));
  });

  it("C major returns unaltered scale", () => {
    assert.deepEqual(getScaleNotes("C"), ["C", "D", "E", "F", "G", "A", "B"]);
  });
});

// --- buildVexKey ---

describe("buildVexKey", () => {
  it("natural note", () => {
    assert.equal(buildVexKey("C", "", 4), "c/4");
  });

  it("sharp note", () => {
    assert.equal(buildVexKey("F", "#", 4), "f#/4");
  });

  it("flat note", () => {
    assert.equal(buildVexKey("B", "b", 3), "bb/3");
  });
});

// --- getOttava ---

describe("getOttava", () => {
  describe("treble clef", () => {
    it("returns 8va for midi >= 84", () => {
      const result = getOttava(84, "treble");
      assert.notEqual(result, null);
      assert.equal(result!.shift, -1);
      assert.equal(result!.label, "8va");
      assert.equal(result!.position, "top");
    });

    it("returns 8vb for midi < 48", () => {
      const result = getOttava(47, "treble");
      assert.notEqual(result, null);
      assert.equal(result!.shift, 1);
      assert.equal(result!.label, "8vb");
      assert.equal(result!.position, "bottom");
    });

    it("returns null for normal range (48-83)", () => {
      assert.equal(getOttava(48, "treble"), null);
      assert.equal(getOttava(60, "treble"), null);
      assert.equal(getOttava(83, "treble"), null);
    });
  });

  describe("bass clef", () => {
    it("returns 8va for midi >= 72", () => {
      const result = getOttava(72, "bass");
      assert.notEqual(result, null);
      assert.equal(result!.shift, -1);
    });

    it("returns 8vb for midi < 36", () => {
      const result = getOttava(35, "bass");
      assert.notEqual(result, null);
      assert.equal(result!.shift, 1);
    });

    it("returns null for normal range (36-71)", () => {
      assert.equal(getOttava(36, "bass"), null);
      assert.equal(getOttava(60, "bass"), null);
      assert.equal(getOttava(71, "bass"), null);
    });
  });
});

// --- midiToNoteName ---

describe("midiToNoteName", () => {
  it("C4 = midi 60", () => {
    const r = midiToNoteName(60);
    assert.equal(r.noteName, "C");
    assert.equal(r.octave, 4);
    assert.equal(r.full, "C4");
  });

  it("A4 = midi 69", () => {
    const r = midiToNoteName(69);
    assert.equal(r.noteName, "A");
    assert.equal(r.octave, 4);
  });

  it("A0 = midi 21", () => {
    const r = midiToNoteName(21);
    assert.equal(r.noteName, "A");
    assert.equal(r.octave, 0);
  });

  it("C8 = midi 108", () => {
    const r = midiToNoteName(108);
    assert.equal(r.noteName, "C");
    assert.equal(r.octave, 8);
  });

  it("sharps use # notation", () => {
    const r = midiToNoteName(61); // C#4
    assert.equal(r.noteName, "C#");
    assert.equal(r.octave, 4);
  });

  it("midi 0 = C at octave -1", () => {
    const r = midiToNoteName(0);
    assert.equal(r.noteName, "C");
    assert.equal(r.octave, -1);
  });

  it("offset +12 converts C3 (midi 48) to C4", () => {
    const raw = 48;
    const offset = 12;
    const r = midiToNoteName(raw + offset);
    assert.equal(r.noteName, "C");
    assert.equal(r.octave, 4);
    assert.equal(r.full, "C4");
  });

  it("offset +12 preserves note name across octave", () => {
    const offset = 12;
    for (let raw = 36; raw <= 71; raw++) {
      const without = midiToNoteName(raw);
      const with_ = midiToNoteName(raw + offset);
      assert.equal(with_.noteName, without.noteName, `midi ${raw}: note name should be same`);
      assert.equal(with_.octave, without.octave + 1, `midi ${raw}: octave should be +1`);
    }
  });
});

// --- Constants consistency ---

describe("constants", () => {
  it("NOTE_NAMES has 7 entries", () => {
    assert.equal(NOTE_NAMES.length, 7);
  });

  it("LETTER_SEMITONES covers all NOTE_NAMES", () => {
    for (const name of NOTE_NAMES) {
      assert.notEqual(LETTER_SEMITONES[name], undefined, `missing: ${name}`);
    }
  });

  it("KEY_SIG_MAP keys only alter notes in NOTE_NAMES", () => {
    for (const [keySig, alterations] of Object.entries(KEY_SIG_MAP)) {
      for (const letter of Object.keys(alterations)) {
        assert.ok(
          NOTE_NAMES.includes(letter),
          `${keySig}: altered note ${letter} not in NOTE_NAMES`,
        );
      }
    }
  });
});
