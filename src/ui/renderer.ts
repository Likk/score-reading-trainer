/**
 * @file 五線譜の描画 (VexFlow Wrapper)
 *
 * 役割:
 * - 出題音符を VexFlow Stave + StaveNote として描画
 * - 押した音を譜面に表示ヒント ON 時は入力中の音を 2nd Voice として青色で重ね描き
 * - 高音/低音域は 8va/8vb 表記に切り替えて加線を抑える
 *
 * 設計上の前提:
 * - サイズ不変なら Renderer (SVG ルート) を使い回し、子要素だけクリアして再描画
 *   コスト削減目的。ただし VexFlow 内部状態が漏れない範囲に注意 (現実装は毎回 new Stave/Voice するので問題なし)
 * - 入力音の重ね描きは 2 つの Voice を Mode.SOFT で並走させる (時間軸を共有させず両方を同じ位置に描かせるため)
 */

import { Renderer, Stave, StaveNote, Voice, Formatter, Accidental, Annotation } from "vexflow";
import { type NoteInfo, type Clef, type KeySig, noteToSemitone, getOttava } from "../domain/music";
import { midiToNoteInfoForKey } from "../domain/noteGenerator";

// Renderer (SVG ルート) のキャッシュ. サイズ不変かつ同一要素なら使い回す
let cachedRenderer: Renderer | null = null;
let cachedEl: HTMLElement | null = null;
let cachedWidth = 0;
let cachedHeight = 0;

// NoteInfo から MIDI 番号を計算 (ottava 判定 / 和音内ソートで使う)
function midiOf(note: NoteInfo): number {
  return (note.octave + 1) * 12 + noteToSemitone(note.name);
}

/**
 * NoteInfo[] (1 音 or 和音) から VexFlow の StaveNote を構築する
 *
 * - 入力を MIDI 昇順でソートし ottava 判定は最低音で決める
 * - 8va/8vb 適用時は vexKey のオクターブ部分をシフトして実音より上下に描く (例: 8va 上の C7 を 1 オクターブ下げて C6 として描画 + "8va" 注釈)
 * - 各音の displayAccidental があれば addModifier で臨時記号を付ける
 */
function makeStaveNote(notes: NoteInfo[], duration: string, clef: Clef): StaveNote {
  const sorted = [...notes].sort((a, b) => midiOf(a) - midiOf(b));
  const ottava = getOttava(midiOf(sorted[0]), clef);

  const keys = sorted.map(n => {
    if (ottava) {
      const parts = n.vexKey.split("/");
      return `${parts[0]}/${n.octave + ottava.shift}`;
    }
    return n.vexKey;
  });

  const staveNote = new StaveNote({ keys, duration, clef, autoStem: true });

  sorted.forEach((n, i) => {
    if (n.displayAccidental) {
      staveNote.addModifier(new Accidental(n.displayAccidental), i);
    }
  });

  if (ottava) {
    const ann = new Annotation(ottava.label);
    ann.setFont("Arial", 12, "italic");
    ann.setVerticalJustification(
      ottava.position === "top"
        ? Annotation.VerticalJustify.TOP
        : Annotation.VerticalJustify.BOTTOM
    );
    staveNote.addModifier(ann);
  }

  return staveNote;
}

/**
 * Renderer をキャッシュから取り出すか新規作成する
 *
 * 同一要素 + 同一サイズなら既存 SVG の中身だけ消して使い回す (生成コスト削減)
 * サイズが変わった場合はコンテナごと作り直す
 *
 * 注意: VexFlow Renderer の内部状態を完全にクリアする保証は無いので、呼び出し側は毎回 new Stave / new Voice すること
 */
function getOrCreateRenderer(el: HTMLElement, width: number, height: number): Renderer {
  if (cachedRenderer && cachedEl === el && cachedWidth === width && cachedHeight === height) {
    const svg = el.querySelector("svg");
    if (svg) {
      svg.innerHTML = "";
      return cachedRenderer;
    }
  }

  el.innerHTML = "";
  const renderer = new Renderer(el, Renderer.Backends.SVG);
  renderer.resize(width, height);
  cachedRenderer = renderer;
  cachedEl = el;
  cachedWidth = width;
  cachedHeight = height;
  return renderer;
}

/**
 * 出題と (オプションで) 入力中の音を五線譜に描画する
 *
 * @param pressedMidis 入力中の MIDI 番号配列. 渡されると押した音を譜面に表示ヒントとして青色の 2nd Voice で出題音符に重ねて描く
 *
 * レイアウト:
 * - 横幅は親要素 (.score-area) に合わせて max 400px
 * - 画面が低い場合 (innerHeight <= 500) は高さと top 余白を圧縮する
 *
 * Voice 構成:
 * - voice1: 出題音符
 * - voice2: 入力音符 (青色 fillStyle/strokeStyle で着色)
 * - 両方 Mode.SOFT + Formatter で同位置に並べて重ね描きする
 */
export function renderNote(notes: NoteInfo[], clef: Clef, keySig: KeySig, pressedMidis?: number[]): void {
  const el = document.querySelector(".score-area") as HTMLElement;
  if (!el) return;

  const width = Math.min(400, el.clientWidth - 2);
  const compact = window.innerHeight <= 500;
  const height = compact ? 140 : 200;
  const staveY = compact ? 15 : 40;

  const renderer = getOrCreateRenderer(el, width, height);
  const context = renderer.getContext();

  const stave = new Stave(10, staveY, width - 20);
  stave.addClef(clef);
  if (keySig !== "C") {
    stave.addKeySignature(keySig);
  }
  stave.setContext(context).draw();

  const questionNote = makeStaveNote(notes, "w", clef);
  const voice1 = new Voice({ numBeats: 4, beatValue: 4 });
  voice1.setMode(Voice.Mode.SOFT);
  voice1.addTickables([questionNote]);

  if (pressedMidis && pressedMidis.length > 0) {
    const pressedInfos = pressedMidis.map(m => midiToNoteInfoForKey(m, keySig));
    const pressedNote = makeStaveNote(pressedInfos, "w", clef);
    pressedNote.setStyle({ fillStyle: "#4488ff", strokeStyle: "#4488ff" });

    const voice2 = new Voice({ numBeats: 4, beatValue: 4 });
    voice2.setMode(Voice.Mode.SOFT);
    voice2.addTickables([pressedNote]);

    new Formatter().joinVoices([voice1]).joinVoices([voice2]).format([voice1, voice2], width - 60);
    voice1.draw(context, stave);
    voice2.draw(context, stave);
  } else {
    new Formatter().joinVoices([voice1]).format([voice1], width - 60);
    voice1.draw(context, stave);
  }
}
