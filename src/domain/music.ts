/**
 * @file 音楽理論の純粋ロジック (型・定数・変換関数)
 *
 * 役割:
 * - 音名/MIDI/半音/VexFlow キー/Tone.js キーの相互変換
 * - 調号・スケール・オッターヴァ等の音楽理論定数
 *
 * 設計上の前提:
 * - ブラウザ API に依存しない (テスト容易性のため)
 * - 出題・描画・再生の各モジュールで共有される基礎ユーティリティ
 */

// --- Types ---

/** 1 つの音符に関する情報。出題・描画・再生の各モジュールで共有する。 */
export interface NoteInfo {
  /** 実際の音高名 ("C", "F#", "Bb" 等) */
  name: string;
  /** MIDI 準拠のオクターブ番号 (C4 = 4) */
  octave: number;
  /** VexFlow 描画用キー ("f#/4", "bb/4" 等) */
  vexKey: string;
  /** Tone.js 再生用キー ("F#4", "Bb4" 等) */
  toneKey: string;
  /** 五線譜に表示する臨時記号。"#", "b", "n", "##", "bb" のいずれか。不要なら undefined. */
  displayAccidental?: string;
}

/** 8va / 8vb のオッターヴァ表示情報 */
export interface OttavaInfo {
  /** 表示用オクターブシフト: -1 (8va: 実音より1オクターブ下に表記) / +1 (8vb) */
  shift: -1 | 1;
  /** 譜面上のラベル ("8va" or "8vb") */
  label: string;
  /** アノテーションの配置位置 */
  position: "top" | "bottom";
}

export type Clef = "treble" | "bass";
export type KeySig = "C" | "G" | "D" | "A" | "E" | "B" | "F" | "Bb" | "Eb" | "Ab";

// --- Constants ---

/** 幹音名 (C D E F G A B) */
export const NOTE_NAMES = ["C", "D", "E", "F", "G", "A", "B"];

/** 調号ごとの変化記号マップ。キー: 幹音名、値: "#" or "b" */
export const KEY_SIG_MAP: Record<KeySig, Record<string, string>> = {
  C:  {},
  G:  { F: "#" },
  D:  { F: "#", C: "#" },
  A:  { F: "#", C: "#", G: "#" },
  E:  { F: "#", C: "#", G: "#", D: "#" },
  B:  { F: "#", C: "#", G: "#", D: "#", A: "#" },
  F:  { B: "b" },
  Bb: { B: "b", E: "b" },
  Eb: { B: "b", E: "b", A: "b" },
  Ab: { B: "b", E: "b", A: "b", D: "b" },
};

/** 幹音名 → 半音番号 (C=0, D=2, ..., B=11) */
export const LETTER_SEMITONES: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
};

/** 半音番号 (0-11) → シャープ表記の音名 */
export const SEMITONE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** PC キーボードのキー → 音名マッピング (ピアノ配列: a=C, w=C#, s=D, ...) */
export const KEY_MAP: Record<string, string> = {
  a: "C", w: "C#", s: "D", e: "D#", d: "E",
  f: "F", t: "F#", g: "G", y: "G#", h: "A",
  u: "A#", j: "B",
};

/** 音名 → PC キーラベルの逆引き。鍵盤 UI のキーボードレイアウト表示に使用。 */
export const NOTE_TO_KEY: Record<string, string> = {};
for (const [key, note] of Object.entries(KEY_MAP)) {
  NOTE_TO_KEY[note] = key.toUpperCase();
}

/** 1 オクターブ分の鍵盤定義 (白鍵/黒鍵) */
export const OCTAVE_KEYS = [
  { name: "C",  black: false },
  { name: "C#", black: true  },
  { name: "D",  black: false },
  { name: "D#", black: true  },
  { name: "E",  black: false },
  { name: "F",  black: false },
  { name: "F#", black: true  },
  { name: "G",  black: false },
  { name: "G#", black: true  },
  { name: "A",  black: false },
  { name: "A#", black: true  },
  { name: "B",  black: false },
];

// --- Functions ---

/**
 * 音名を半音番号 (0-11) に変換する。"#" / "b" を任意個数処理する。
 * @returns 半音番号 (0=C, 1=C#, ..., 11=B) 無効な音名なら -1
 * @example noteToSemitone("F#") // => 6
 * @example noteToSemitone("Bb") // => 10
 */
export function noteToSemitone(name: string): number {
  const letter = name.charAt(0).toUpperCase();
  const base = LETTER_SEMITONES[letter];
  if (base === undefined) return -1;
  let semitone = base;
  for (let i = 1; i < name.length; i++) {
    if (name[i] === "#") semitone++;
    else if (name[i] === "b") semitone--;
  }
  return ((semitone % 12) + 12) % 12;
}

/** 半音番号をシャープ表記の音名に変換する。負値や 12 以上もラップする。 */
export function semitoneToToneName(semitone: number): string {
  return SEMITONE_NAMES[((semitone % 12) + 12) % 12];
}

/**
 * 調号に基づくスケール音名 (7 音) を返す。
 * @example getScaleNotes("G") // => ["C", "D", "E", "F#", "G", "A", "B"]
 */
export function getScaleNotes(keySig: KeySig): string[] {
  const alterations = KEY_SIG_MAP[keySig];
  return NOTE_NAMES.map(letter => {
    const alt = alterations[letter];
    return alt ? letter + alt : letter;
  });
}

/** VexFlow の音符キー文字列を組み立てる ("C", "#", 4 → "c#/4") */
export function buildVexKey(letter: string, accidental: string, octave: number): string {
  return `${letter.toLowerCase()}${accidental}/${octave}`;
}

/**
 * MIDI ノート番号を音名・オクターブに分解する。調号は考慮しない (常にシャープ表記)
 * @example midiToNoteName(60) // => { full: "C4", noteName: "C", octave: 4 }
 */
export function midiToNoteName(midi: number): { full: string; noteName: string; octave: number } {
  const octave = Math.floor(midi / 12) - 1;
  const noteIndex = midi % 12;
  return {
    full: `${SEMITONE_NAMES[noteIndex]}${octave}`,
    noteName: SEMITONE_NAMES[noteIndex],
    octave,
  };
}

/**
 * 加線が多くなる音域に対して 8va / 8vb 情報を返す。
 * 通常の五線譜範囲内なら null.
 *
 * 閾値: treble 48-83, bass 36-71 が通常範囲。
 */
export function getOttava(midi: number, clef: Clef): OttavaInfo | null {
  if (clef === "treble") {
    if (midi >= 84) return { shift: -1, label: "8va", position: "top" };
    if (midi < 48)  return { shift: 1,  label: "8vb", position: "bottom" };
  } else {
    if (midi >= 72) return { shift: -1, label: "8va", position: "top" };
    if (midi < 36)  return { shift: 1,  label: "8vb", position: "bottom" };
  }
  return null;
}
