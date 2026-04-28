import {
  type NoteInfo, type KeySig, NOTE_NAMES, KEY_SIG_MAP, LETTER_SEMITONES, SEMITONE_NAMES,
  noteToSemitone, semitoneToToneName, getScaleNotes, buildVexKey,
} from "./music";

/** 半音番号がスケール内にあれば、その調号での音名を返す。スケール外なら null。 */
function scaleNameForSemitone(semitone: number, keySig: KeySig): string | null {
  const scaleNotes = getScaleNotes(keySig);
  return scaleNotes.find(n => noteToSemitone(n) === semitone) ?? null;
}

/**
 * MIDI 番号を調号に基づく NoteInfo に変換する。
 *
 * 変換優先順位:
 * 1. スケール音 → そのまま (displayAccidental なし)
 * 2. 調号で # がある音のナチュラル → displayAccidental: "n"
 * 3. 調号で b がある音のナチュラル → displayAccidental: "n"
 * 4. ダブルシャープ / ダブルフラット
 * 5. 調号にない音のシャープ
 * 6. フォールバック (SEMITONE_NAMES ベース)
 */
export function midiToNoteInfoForKey(midi: number, keySig: KeySig): NoteInfo {
  const alterations = KEY_SIG_MAP[keySig];
  const semitone = midi % 12;
  const octave = Math.floor(midi / 12) - 1;
  const scaleName = scaleNameForSemitone(semitone, keySig);

  if (scaleName) {
    const letter = scaleName.charAt(0);
    const acc = scaleName.substring(1);
    return {
      name: scaleName,
      octave,
      vexKey: buildVexKey(letter, acc, octave),
      toneKey: `${scaleName}${octave}`,
    };
  }

  for (const letter of NOTE_NAMES) {
    const keyAlt = alterations[letter];
    const baseSemitone = LETTER_SEMITONES[letter];

    if (keyAlt === "#" && semitone === baseSemitone) {
      return {
        name: letter, octave,
        vexKey: buildVexKey(letter, "", octave),
        toneKey: `${letter}${octave}`,
        displayAccidental: "n",
      };
    }
    if (keyAlt === "b" && semitone === baseSemitone) {
      return {
        name: letter, octave,
        vexKey: buildVexKey(letter, "", octave),
        toneKey: `${letter}${octave}`,
        displayAccidental: "n",
      };
    }
    if (keyAlt === "#" && semitone === (baseSemitone + 2) % 12) {
      const name = `${letter}##`;
      return {
        name, octave,
        vexKey: buildVexKey(letter, "##", octave),
        toneKey: `${semitoneToToneName(semitone)}${octave}`,
        displayAccidental: "##",
      };
    }
    if (keyAlt === "b" && semitone === ((baseSemitone - 2) % 12 + 12) % 12) {
      const name = `${letter}bb`;
      return {
        name, octave,
        vexKey: buildVexKey(letter, "bb", octave),
        toneKey: `${semitoneToToneName(semitone)}${octave}`,
        displayAccidental: "bb",
      };
    }
    if (!keyAlt && semitone === (baseSemitone + 1) % 12 && letter !== "E" && letter !== "B") {
      const name = `${letter}#`;
      return {
        name, octave,
        vexKey: buildVexKey(letter, "#", octave),
        toneKey: `${name}${octave}`,
        displayAccidental: "#",
      };
    }
  }

  const name = SEMITONE_NAMES[semitone];
  return {
    name, octave,
    vexKey: buildVexKey(name.charAt(0), name.substring(1), octave),
    toneKey: `${name}${octave}`,
    displayAccidental: name.length > 1 ? name.substring(1) : undefined,
  };
}

/**
 * 指定音域・調号に基づく出題候補の MIDI 番号リストを構築する。
 * accidentalsEnabled が false ならスケール音のみ、true なら全半音を含む。
 */
export function buildMidiPool(rangeLow: number, rangeHigh: number, keySig: KeySig, accidentalsEnabled: boolean): number[] {
  const scaleNotes = getScaleNotes(keySig);
  const scaleSemitones = scaleNotes.map(n => noteToSemitone(n));
  const pool: number[] = [];
  for (let midi = rangeLow; midi <= rangeHigh; midi++) {
    if (accidentalsEnabled || scaleSemitones.includes(midi % 12)) {
      pool.push(midi);
    }
  }
  return pool;
}

function fallbackNote(): NoteInfo {
  return {
    name: "C",
    octave: 4,
    vexKey: "c/4",
    toneKey: "C4",
  };
}

/** プールからランダムに 1 音を選び NoteInfo を返す。プールが空なら C4 にフォールバック。 */
export function randomNote(rangeLow: number, rangeHigh: number, keySig: KeySig, accidentalsEnabled: boolean): NoteInfo {
  const pool = buildMidiPool(rangeLow, rangeHigh, keySig, accidentalsEnabled);
  if (pool.length === 0) return fallbackNote();
  const midi = pool[Math.floor(Math.random() * pool.length)];
  return midiToNoteInfoForKey(midi, keySig);
}

/**
 * プールから重複なく `size` 個を抽選し、MIDI 昇順で NoteInfo[] を返す。
 * プールが `size` に満たない場合はプール全体を返す。空なら C4 単音にフォールバック。
 */
export function randomChord(
  rangeLow: number, rangeHigh: number, keySig: KeySig, accidentalsEnabled: boolean, size: number,
): NoteInfo[] {
  const pool = buildMidiPool(rangeLow, rangeHigh, keySig, accidentalsEnabled);
  if (pool.length === 0) return [fallbackNote()];
  const n = Math.min(size, pool.length);
  const picks = new Set<number>();
  const work = [...pool];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * work.length);
    picks.add(work[idx]);
    work.splice(idx, 1);
  }
  return [...picks].sort((a, b) => a - b).map(m => midiToNoteInfoForKey(m, keySig));
}
