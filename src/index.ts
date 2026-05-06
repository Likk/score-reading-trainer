/**
 * @file アプリケーション本体: モジュールレベル state, 入力統合, 起動配線
 *
 * 役割:
 * - 出題条件 (clef/keySig/range/和音数等) と現在の出題内容を保持
 * - 4 系統の入力ソース (MIDI / タッチ / マウス / PC キーボード) を統合
 * - audio / renderer / keyboard / settings を起動時にワイヤリング
 *
 * 設計上の前提:
 * - 入力ソースごとに押下集合を分けている (judgmentHeld 参照)
 *   オクターブが取れない PC キーボード/マウスを和音判定から除外
 * - 和音判定は CHORD_SETTLE_MS 経過後に最終評価する(MIDI/タッチでも同時押しは数十 ms ずれることを許容したい)
 * - DOMContentLoaded 後のオーバーレイクリックで toneStart() を呼ぶ
 *   ブラウザのオートプレイ規制で AudioContext 開始にユーザー操作起点が必要
 */

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

// 出題条件 (UI 設定と同期される)
let currentClef: Clef = "treble";
let currentKeySig: KeySig = "C";
let accidentalsEnabled = false;
let rangeLow = 60;   // C4 (MIDI number)
let rangeHigh = 83;  // B5 (MIDI number)
let keyboardMode: "fit" | "scroll" = "fit";

// ヒント機能 4 種の有効/無効 (UI のチェックボックス相当)
// hintStaffEnabled    : 押した音を譜面に表示
// hintKeyEnabled      : 正解キーを表示
// hintKbLayoutEnabled : キーボードレイアウト表示
// hintNoteLabelEnabled: 音名表示
let hintStaffEnabled = false;
let hintKeyEnabled = false;
let hintKbLayoutEnabled = false;
let hintNoteLabelEnabled = true;

let chordSize = 1;

// 現在の出題 (1 音 or 和音). 正解後は null になり、次の nextQuestion() で再生成される
let currentNotes: NoteInfo[] | null = null;

// 入力ソース別の押下中 MIDI 集合
// ソース毎に分けるのは:
// - 押した音を譜面に表示は全ソースを集約 (displayHeld) するが, 和音判定は MIDI/タッチのみ (judgmentHeld) PC キーボード/マウスはオクターブが暗黙の既定値になるため判定対象から外す
// - 同じ音を別ソースから押した時、一方を離しても他方が残るよう独立に集合管理
const heldFromMidi  = new Set<number>();
const heldFromTouch = new Set<number>();
const heldFromMouse = new Set<number>();
const heldFromKbd   = new Set<number>();

// PC キーボードの keydown <-> keyup 対応付け
// keydown 時の (toneKey, midi) を保持し、 keyup 時に正しい音を release する
const pressedKeys = new Map<string, { toneKey: string; midi: number }>();

// 連続入力時の誤判定防止用 (50ms 以内の重複は無視)
let lastAnswerTime = 0;

// 和音判定の遅延タイマー (settle 待ち)
let chordSettleTimer: ReturnType<typeof setTimeout> | null = null;

// 和音判定までの遅延 (ms)
// MIDI/タッチの同時押しは入力タイミングが数十 ms ずれることを許容。
// 最後の入力から settle するのを待ってから判定する。
const CHORD_SETTLE_MS = 80;

// 押した音を譜面に表示ヒント用。 全ソースから入力中の音を集める (renderer.ts に渡す)
function displayHeld(): Set<number> {
  return new Set([...heldFromMidi, ...heldFromTouch, ...heldFromMouse, ...heldFromKbd]);
}

// 和音正誤判定用。 オクターブが正確に取れる MIDI/タッチのみを対象とする (PC キーボード/マウスは判定から除外)
function judgmentHeld(): Set<number> {
  return new Set([...heldFromMidi, ...heldFromTouch]);
}

// --- main logic ---

// 鍵盤 DOM を再構築。 音域変更/音名ラベル切替/keyboardMode 切替時に呼ぶ
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

// 現在の出題を MIDI 番号配列に変換 (和音判定用)
function expectedMidis(): number[] {
  if (!currentNotes) return [];
  return currentNotes.map(n => (n.octave + 1) * 12 + noteToSemitone(n.name));
}

/**
 * 次の出題を生成して画面に反映する
 *
 * 副作用:
 * - 全ソースの押下集合と settle タイマーをクリア
 * - 五線譜を再描画
 * - 正解キーを表示ヒントが ON なら正解鍵をハイライト、 OFF なら以前のハイライトを消す
 */
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

/**
 * 和音モードの正誤判定
 *
 * settle 待ち (CHORD_SETTLE_MS) を挟んでから判定する:
 * - 期待外の音が含まれていれば即不正解
 * - 全期待音が押されていれば正解
 * - どちらでもなければ判定保留
 */
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

/**
 * 単音モードの正誤判定 (即時)
 *
 * オクターブの扱い:
 * - MIDI/タッチ: 受信した octave をそのまま比較
 * - PC キーボード: 呼び出し側で currentNotes[0].octave を渡すので必ず一致する
 */
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

// 正誤フィードバックを表示し、正解なら次の問題へ進む
// 表示時間: 正解 800ms / 不正解 400ms (正解時は次問への切替遅延を兼ねる)
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

// 押した音を譜面に表示ヒントの再描画 (ヒント ON 時のみ)
function renderHintStaff(): void {
  if (!hintStaffEnabled || !currentNotes) return;
  renderNote(currentNotes, currentClef, currentKeySig, [...displayHeld()]);
}

/**
 * 鍵盤押下時のハンドラ (タッチ / マウス / pointerdown 全般)
 *
 * pointerType に応じて該当する held 集合に追加し、単音/和音モードに合わせて判定をトリガーする。
 * タッチは和音判定 (settle 待ち) マウスは和音判定をスキップする (画面上のクリックは単発入力が基本のため)
 */
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

// 鍵盤離鍵時のハンドラ。 該当 held 集合から削除し release する。
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

// PC キーは音名のみで判定 (オクターブは現在の出題から借りる)
// e.repeat ガードで autorepeat による多重入力を防ぐ
// pressedKeys で keydown <-> keyup を対応付ける (フォーカス変化等での取りこぼし対策)
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

/**
 * 起動シーケンス
 *
 * 1. オーバーレイ表示中: ユーザー操作 (クリック or キー押下) を待つ
 * 2. ユーザー操作で toneStart() (AudioContext resume) → オーバーレイ解除
 * 3. settings / midi / keyboard を初期化し、 1問目を出題
 *
 * オーバーレイを挟むのはブラウザのオートプレイ規制対策 (AudioContext の resume にユーザー操作起点が必要)
 */
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
