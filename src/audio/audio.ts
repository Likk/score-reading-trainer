/**
 * @file 音声出力 (Tone.js シンセ / Salamander ピアノサンプラー) と Web MIDI 入力
 *
 * 設計上の前提:
 * - Tone.js の AudioContext は `tone` を import した時点で確保される。
 *   そのため `synth` はモジュールトップレベルで生成しておく (生成を遅らせるとAudioContext 整合性の問題が起きるケースがある)。
 * - 実際の発音はブラウザのオートプレイ規制があるため、
 *   ユーザー操作後に `toneStart` を呼んで AudioContext を resume してから可能になる。
 * - ピアノ音色は mp3 サンプル群を `loadPiano` で遅延 load する。
 *   ユーザーがピアノを選ぶまで fetch は走らない。
 * - 音色切替時の発音ルーティングは `triggerAttack` 等が `activeVoice` を見て分岐する。
 *   `"piano"` 選択中でもサンプル未 load なら synth に fallback.
 */

import { PolySynth, Synth, Sampler, start as toneStart, type OscillatorType } from "tone";
import { midiToNoteName } from "../domain/music";

/** 発音に使う音源の種別。`"synth"` は組み込みシンセ、`"piano"` は Salamander サンプラー。 */
export type Voice = "synth" | "piano";

/**
 * シンセ音源 (PolySynth)。
 *
 * モジュールトップレベルで生成しているのは Tone.js の AudioContext 管理上の都合。(詳細はファイル冒頭参照)
 * `new PolySynth` 自体は AudioContext suspended 状態でも呼べる。
 */
const synth = new PolySynth(Synth, {
  oscillator: { type: "triangle" },
  envelope: { attack: 0.005, decay: 0.1, sustain: 0.2, release: 0.5 },
  volume: -10,
}).toDestination();

// ピアノサンプラー実体。loadPiano 完了まで null
let piano: Sampler | null = null;

// ピアノ load 中の Promise。
// 役割:
// - 多重呼び出しを束ねる (loadPiano を 2 回呼んでも実 fetch は 1 回)
// - load 成功後は null に戻さず Promise を保持し、再呼び出し時は即時 Promise.resolve を返す
// - load 失敗時は null に戻し、リトライ可能にする
let pianoLoading: Promise<void> | null = null;

// 現在の音量 (単位は dB)。
// ピアノは遅延 load されるため、load 完了時点で最新の音量を反映できるよう変数に保持する
// (loadPiano の onload 内で s.volume.value = currentVolumeDb する)
let currentVolumeDb = -10;

// 現在選択中の音源。"piano" でもピアノ未 load なら synth に fallback (usePiano 参照)
let activeVoice: Voice = "synth";

/**
 * Salamander Grand Piano の mp3 サンプル URL マップ
 *
 * Tone.js の `Sampler` は登録された音から最も近いサンプルをピッチシフトして発音するため、全 88 鍵分のファイルを置く必要はない。
 * メモリ・帯域削減のため毎 3 半音 (各オクターブのA, C, D#, F#) に絞っている。
 *
 * ファイル名の `Ds1` / `Fs1` は URL に `#` を使えないので `s` に置換した形 (Tone.js 慣例)
 * キー側 (`"D#1"` 等) は Tone.js が音名として解釈する文字列。
 */
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

/**
 * Salamander サンプル群を非同期に load する
 *
 * 設定 UI でピアノ音色が選ばれたタイミングで呼ぶ想定。
 * 同時/連続で呼ばれても fetch は 1 回に集約され、同じ Promise が共有される (pianoLoading)
 * load 失敗時は reject + 内部状態を初期化するので、再度呼べば再fetchが走る。
 */
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

/**
 * 発音に使う音源を切り替える
 *
 * `"piano"` を渡してもサンプル未 load 時は内部的に synth で鳴る (usePiano)
 * 呼び出し側はピアノを選ぶ前に {@link loadPiano} を await するのが望ましい。
 */
export function setVoice(v: Voice): void {
  activeVoice = v;
}

/** synth の波形 (triangle / sawtooth / square / sine 等) を変更する。 */
export function setSynthOscillator(type: OscillatorType): void {
  synth.set({ oscillator: { type } });
}

/**
 * 音量を dB で設定する。synth と ( load 済みなら) piano の両方に反映する。
 * ピアノ未 load 時の値も保持し、 load 完了時にその時の値が適用される。
 */
export function setVolume(db: number): void {
  currentVolumeDb = db;
  synth.volume.value = db;
  if (piano) piano.volume.value = db;
}

// ピアノ音源で発音すべきか。"piano" 選択中かつサンプルが load 済みなら true.
function usePiano(): boolean {
  return activeVoice === "piano" && piano !== null;
}

/**
 * 指定音を鳴らし続ける (発音開始のみ、自動で止まらない)
 * 鍵盤を押している間鳴らすために使う。停止は {@link triggerRelease} を呼ぶこと。
 */
export function triggerAttack(note: string): void {
  if (usePiano()) piano!.triggerAttack(note);
  else synth.triggerAttack(note);
}

/** {@link triggerAttack} で鳴らした音を停止する。release エンベロープに従ってフェードアウト。 */
export function triggerRelease(note: string): void {
  if (usePiano()) piano!.triggerRelease(note);
  else synth.triggerRelease(note);
}

/**
 * 発音と停止をセットで予約する短音用。
 * @param duration `"8n"` (8 分音符) のような Tone.js Time 表記または秒数。
 */
export function triggerAttackRelease(note: string, duration: string | number): void {
  if (usePiano()) piano!.triggerAttackRelease(note, duration);
  else synth.triggerAttackRelease(note, duration);
}

export { toneStart, midiToNoteName, type OscillatorType };

/** MIDI 入力イベントのコールバック。{@link initMidi} に渡す */
export interface MidiCallbacks {
  /** Note On 受信時: `midi` は {@link setMidiOffset} 適用後の値 */
  onNoteOn: (noteName: string, octave: number, midi: number) => void;
  /** Note Off 受信時 (velocity 0 の Note On も含む)。 */
  onNoteOff: (noteName: string, octave: number) => void;
}

// 画面下部の MIDI ステータス表示を更新する。デバイス名が空なら未接続表示。
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

// 受信した MIDI ノート番号に加算するオフセット (半音単位、12 で 1 オクターブ)
// 機種ごとの中心 C の番号差を吸収する用途。詳しくは setMidiOffset。
let midiOffset = 0;

/**
 * MIDI 入力のオクターブ補正オフセットを設定する。
 *
 * 機種により中心 C の MIDI 番号が異なるための補正。
 * 例えば KEYSTATION 61 は中心 C を MIDI 48 として送信するので `+12` を渡すと一般的な C4=60 と揃う。
 * 設定 UI のドロップダウンから呼ばれる。
 */
export function setMidiOffset(offset: number): void {
  midiOffset = offset;
}

/**
 * Web MIDI API を初期化し、入力デバイスのイベントを `callbacks` に流す。
 *
 * 挙動:
 * - Web MIDI 非対応ブラウザでは何もしないで戻る (ステータスは "未接続" 表示)
 * - デバイス抜き差しは `onstatechange` で検知し、入力ハンドラをバインドし直す。
 * - Note On with velocity 0 は MIDI 規格上 Note Off と同義として扱う (一部キーボードはこの形式を使う)
 */
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
    // ステータスバイト上位 4 bit: 0x9 = Note On, 0x8 = Note Off。下位 4 bit はチャンネル番号。
    // velocity 0 の Note On は Note Off 扱い (MIDI 1.0 仕様の running status の慣習的手法)
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
