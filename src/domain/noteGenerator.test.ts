import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { midiToNoteInfoForKey, buildMidiPool, randomNote, randomChord } from "./noteGenerator";
import { type KeySig, noteToSemitone } from "./music";

// --- midiToNoteInfoForKey ---

describe("midiToNoteInfoForKey", () => {
  describe("C major (no alterations)", () => {
    it("C4 (midi 60)", () => {
      const info = midiToNoteInfoForKey(60, "C");
      assert.equal(info.name, "C");
      assert.equal(info.octave, 4);
      assert.equal(info.vexKey, "c/4");
      assert.equal(info.displayAccidental, undefined);
    });

    it("E4 (midi 64)", () => {
      const info = midiToNoteInfoForKey(64, "C");
      assert.equal(info.name, "E");
      assert.equal(info.octave, 4);
    });

    it("B4 (midi 71)", () => {
      const info = midiToNoteInfoForKey(71, "C");
      assert.equal(info.name, "B");
      assert.equal(info.octave, 4);
    });

    it("C#4 (midi 61) shows sharp accidental", () => {
      const info = midiToNoteInfoForKey(61, "C");
      assert.equal(info.name, "C#");
      assert.equal(info.octave, 4);
      assert.equal(info.displayAccidental, "#");
    });

    it("A0 (midi 21) lowest piano note", () => {
      const info = midiToNoteInfoForKey(21, "C");
      assert.equal(info.name, "A");
      assert.equal(info.octave, 0);
    });

    it("C8 (midi 108) highest piano note", () => {
      const info = midiToNoteInfoForKey(108, "C");
      assert.equal(info.name, "C");
      assert.equal(info.octave, 8);
    });
  });

  describe("G major (F#)", () => {
    it("F#4 (midi 66) is diatonic, no displayAccidental", () => {
      const info = midiToNoteInfoForKey(66, "G");
      assert.equal(info.name, "F#");
      assert.equal(info.octave, 4);
      assert.equal(info.displayAccidental, undefined);
    });

    it("F4 (midi 65) needs natural sign", () => {
      const info = midiToNoteInfoForKey(65, "G");
      assert.equal(info.name, "F");
      assert.equal(info.octave, 4);
      assert.equal(info.displayAccidental, "n");
    });

    it("G4 (midi 67) is diatonic, no accidental", () => {
      const info = midiToNoteInfoForKey(67, "G");
      assert.equal(info.name, "G");
      assert.equal(info.displayAccidental, undefined);
    });
  });

  describe("F major (Bb)", () => {
    it("Bb3 (midi 58) is diatonic, no displayAccidental", () => {
      const info = midiToNoteInfoForKey(58, "F");
      assert.equal(info.name, "Bb");
      assert.equal(info.octave, 3);
      assert.equal(info.displayAccidental, undefined);
    });

    it("B3 (midi 59) needs natural sign", () => {
      const info = midiToNoteInfoForKey(59, "F");
      assert.equal(info.name, "B");
      assert.equal(info.octave, 3);
      assert.equal(info.displayAccidental, "n");
    });
  });

  describe("D major (F#, C#)", () => {
    it("C#5 (midi 73) is diatonic", () => {
      const info = midiToNoteInfoForKey(73, "D");
      assert.equal(info.name, "C#");
      assert.equal(info.displayAccidental, undefined);
    });

    it("C5 (midi 72) needs natural sign", () => {
      const info = midiToNoteInfoForKey(72, "D");
      assert.equal(info.name, "C");
      assert.equal(info.displayAccidental, "n");
    });
  });

  describe("Eb major (Bb, Eb, Ab)", () => {
    it("Eb4 (midi 63) is diatonic", () => {
      const info = midiToNoteInfoForKey(63, "Eb");
      assert.equal(info.name, "Eb");
      assert.equal(info.displayAccidental, undefined);
    });

    it("Ab4 (midi 68) is diatonic", () => {
      const info = midiToNoteInfoForKey(68, "Eb");
      assert.equal(info.name, "Ab");
      assert.equal(info.displayAccidental, undefined);
    });

    it("E4 (midi 64) needs natural sign", () => {
      const info = midiToNoteInfoForKey(64, "Eb");
      assert.equal(info.name, "E");
      assert.equal(info.displayAccidental, "n");
    });
  });

  describe("octave boundaries", () => {
    it("midi 0 -> C at octave -1", () => {
      const info = midiToNoteInfoForKey(0, "C");
      assert.equal(info.name, "C");
      assert.equal(info.octave, -1);
    });

    it("midi 127 -> G at octave 9", () => {
      const info = midiToNoteInfoForKey(127, "C");
      assert.equal(info.octave, 9);
    });
  });

  describe("semitone consistency", () => {
    it("name always matches the MIDI semitone", () => {
      for (const keySig of ["C", "G", "D", "F", "Bb", "Eb", "Ab"] as KeySig[]) {
        for (let midi = 21; midi <= 108; midi++) {
          const info = midiToNoteInfoForKey(midi, keySig);
          const semitone = noteToSemitone(info.name);
          assert.equal(
            semitone, midi % 12,
            `keySig=${keySig}, midi=${midi}: name="${info.name}" -> semitone ${semitone}, expected ${midi % 12}`,
          );
        }
      }
    });

    it("octave is always Math.floor(midi/12) - 1", () => {
      for (let midi = 21; midi <= 108; midi++) {
        const info = midiToNoteInfoForKey(midi, "C");
        assert.equal(info.octave, Math.floor(midi / 12) - 1, `midi=${midi}`);
      }
    });
  });
});

// --- buildMidiPool ---

describe("buildMidiPool", () => {
  it("C major pool contains only diatonic notes", () => {
    const pool = buildMidiPool(60, 71, "C", false);
    const diatonic = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
    for (const midi of pool) {
      assert.ok(diatonic.includes(midi % 12), `midi ${midi} (semitone ${midi % 12}) should be diatonic`);
    }
    assert.equal(pool.length, 7); // C D E F G A B in one octave
  });

  it("accidentals enabled includes all chromatic notes", () => {
    const pool = buildMidiPool(60, 71, "C", true);
    assert.equal(pool.length, 12); // all 12 semitones
  });

  it("G major pool includes F# but not F", () => {
    const pool = buildMidiPool(60, 71, "G", false);
    const semitones = pool.map(m => m % 12);
    assert.ok(semitones.includes(6), "should include F# (semitone 6)");
    assert.ok(!semitones.includes(5), "should not include F (semitone 5)");
  });

  it("empty range returns empty pool", () => {
    const pool = buildMidiPool(71, 60, "C", false); // inverted
    assert.equal(pool.length, 0);
  });

  it("single note range", () => {
    const pool = buildMidiPool(60, 60, "C", false);
    assert.equal(pool.length, 1);
    assert.equal(pool[0], 60);
  });

  it("pool respects range boundaries", () => {
    const pool = buildMidiPool(60, 83, "C", true);
    for (const midi of pool) {
      assert.ok(midi >= 60 && midi <= 83, `midi ${midi} out of range`);
    }
  });
});

// --- randomNote ---

describe("randomNote", () => {
  it("returns a valid NoteInfo", () => {
    const note = randomNote(60, 83, "C", false);
    assert.ok(note.name);
    assert.ok(typeof note.octave === "number");
    assert.ok(note.vexKey);
    assert.ok(note.toneKey);
  });

  it("returned note is within the pool", () => {
    for (let i = 0; i < 50; i++) {
      const note = randomNote(60, 71, "C", false);
      const midi = (note.octave + 1) * 12 + noteToSemitone(note.name);
      assert.ok(midi >= 60 && midi <= 71, `note ${note.name}${note.octave} (midi ${midi}) out of range`);
    }
  });

  it("falls back to C4 on empty pool", () => {
    const note = randomNote(71, 60, "C", false); // inverted range
    assert.equal(note.name, "C");
    assert.equal(note.octave, 4);
  });

  it("respects key signature", () => {
    for (let i = 0; i < 50; i++) {
      const note = randomNote(60, 71, "G", false);
      const semitone = noteToSemitone(note.name);
      const gMajorSemitones = [0, 2, 4, 6, 7, 9, 11]; // C D E F# G A B
      assert.ok(
        gMajorSemitones.includes(semitone),
        `note ${note.name} (semitone ${semitone}) not in G major scale`,
      );
    }
  });
});

// --- randomChord ---

describe("randomChord", () => {
  const midiOf = (n: { name: string; octave: number }) =>
    (n.octave + 1) * 12 + noteToSemitone(n.name);

  it("returns `size` notes", () => {
    for (const size of [1, 2, 3, 4]) {
      const chord = randomChord(60, 83, "C", true, size);
      assert.equal(chord.length, size);
    }
  });

  it("notes are distinct by MIDI", () => {
    for (let i = 0; i < 50; i++) {
      const chord = randomChord(60, 83, "C", true, 4);
      const midis = chord.map(midiOf);
      assert.equal(new Set(midis).size, midis.length);
    }
  });

  it("notes are MIDI-ascending", () => {
    for (let i = 0; i < 50; i++) {
      const chord = randomChord(60, 83, "C", true, 4);
      const midis = chord.map(midiOf);
      for (let j = 1; j < midis.length; j++) {
        assert.ok(midis[j] > midis[j - 1], `not ascending: ${midis}`);
      }
    }
  });

  it("all notes within range", () => {
    for (let i = 0; i < 50; i++) {
      const chord = randomChord(60, 71, "C", false, 3);
      for (const note of chord) {
        const midi = midiOf(note);
        assert.ok(midi >= 60 && midi <= 71, `midi ${midi} out of range`);
      }
    }
  });

  it("returns whole pool when size exceeds pool", () => {
    // C major, 1 オクターブ → 7 音プール
    const chord = randomChord(60, 71, "C", false, 10);
    assert.equal(chord.length, 7);
  });

  it("falls back to single C4 on empty pool", () => {
    const chord = randomChord(71, 60, "C", false, 3);
    assert.equal(chord.length, 1);
    assert.equal(chord[0].name, "C");
    assert.equal(chord[0].octave, 4);
  });
});
