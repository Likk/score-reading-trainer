/**
 * @file 画面下部のピアノ鍵盤 (DOM) の生成と操作
 *
 * 役割:
 * - 設定音域に応じた鍵盤 DOM を生成 (buildKeyboard)
 * - pointer events でタッチ/マウス入力を統合的に扱う
 * - ヒント表示 (押した音を譜面に表示, 正解キーを表示, 音名表示, キーボードレイアウト表示)
 *
 * 設計上の前提:
 * - pointerup/pointercancel は document レベルで監視する
 *   element からドラッグで指/カーソルが外れた場合の取りこぼしを防ぐため
 * - pointerleave も併用して鍵盤外への移動で離鍵扱いとする
 * - 鍵盤サイズは fit (画面幅収まる) / scroll (固定幅) の 2 モード
 */

import { noteToSemitone, NOTE_TO_KEY, OCTAVE_KEYS } from "../domain/music";

export interface KeyboardOptions {
  rangeLow: number;
  rangeHigh: number;
  keyboardMode: "fit" | "scroll";
  hintNoteLabelEnabled: boolean;
  onKeyDown: (noteName: string, octave: number, pointerType: string) => void;
  onKeyUp: (noteName: string, octave: number, pointerType: string) => void;
}

type PointerPress = {
  name: string;
  octave: number;
  pointerType: string;
  el: HTMLElement;
  onKeyUp: KeyboardOptions["onKeyUp"];
};

// 押下中の pointer を pointerId で追跡する。
// 同時にマルチタッチを扱うため Map. pointerup/leave/cancel で削除する。
const activePointers = new Map<number, PointerPress>();

let pointerDocumentInstalled = false;

// document レベルの pointerup/pointercancel を 1 度だけ install する。
// 鍵盤外でのリリース (要素外にドラッグした後で指を離す等) を確実に拾うため、
// buildKeyboard が呼ばれる度に install されないよう pointerDocumentInstalled でガードする。
function ensurePointerDocumentListeners(): void {
  if (pointerDocumentInstalled) return;
  pointerDocumentInstalled = true;
  const release = (e: PointerEvent) => {
    const p = activePointers.get(e.pointerId);
    if (!p) return;
    activePointers.delete(e.pointerId);
    p.onKeyUp(p.name, p.octave, p.pointerType);
  };
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
}

// 指定 MIDI 範囲内の白鍵数を数える (fit モードの鍵盤幅算出に使う)
function countWhiteKeys(rangeLow: number, rangeHigh: number): number {
  let count = 0;
  for (let midi = rangeLow; midi <= rangeHigh; midi++) {
    if (!OCTAVE_KEYS[midi % 12].black) count++;
  }
  return count;
}

/**
 * 鍵盤 DOM を構築して `.keyboard-area` に差し込む
 *
 * 音域変更/モード切替/音名表示切替時に呼ばれる既存の鍵盤 DOM はクリアして作り直す。
 * 各鍵に pointerdown/pointerleave を bind し、 document レベルでも pointerup/cancel を監視する
 *
 * 鍵盤サイズ計算:
 * - "fit"   : area の幅に収まるよう白鍵幅を逆算 (最小 12px, 最大 44px)
 * - "scroll": 白鍵 44px 固定で水平スクロール
 * - 高さは画面が低い場合 (innerHeight <= 500) に圧縮する
 */
export function buildKeyboard(options: KeyboardOptions): void {
  const { rangeLow, rangeHigh, keyboardMode, hintNoteLabelEnabled, onKeyDown, onKeyUp } = options;
  const area = document.querySelector(".keyboard-area") as HTMLElement;
  if (!area) return;
  area.innerHTML = "";

  ensurePointerDocumentListeners();

  const piano = document.createElement("div");
  piano.className = "piano";
  // touchAction: none でブラウザのスクロール/ズームジェスチャを抑止し pointer events に専念
  piano.style.touchAction = "none";

  const whiteKeyCount = countWhiteKeys(rangeLow, rangeHigh);

  // ww: 白鍵幅, bw: 黒鍵幅, wh/bh: 高さ, fontSize/blackFontSize: 音名表示用
  let ww: number;
  let bw: number;
  let wh: number;
  let bh: number;
  let fontSize: number;
  let blackFontSize: number;

  const compact = window.innerHeight <= 500;
  const maxWh = compact ? 120 : 160;

  if (keyboardMode === "fit") {
    area.style.overflowX = "hidden";
    const availableWidth = area.clientWidth - 20;
    const fullRangeWw = Math.floor(availableWidth / 52);
    const maxWw = Math.min(fullRangeWw, 44);
    ww = Math.min(Math.floor(availableWidth / whiteKeyCount), maxWw);
    ww = Math.max(ww, 12);
    bw = Math.round(ww * 0.636);
    wh = Math.min(maxWh, Math.max(80, ww * 3.6));
    bh = Math.round(wh * 0.625);
    fontSize = Math.max(7, Math.min(11, ww * 0.28));
    blackFontSize = Math.max(0, fontSize - 2);
  } else {
    area.style.overflowX = "auto";
    ww = 44;
    bw = 28;
    wh = maxWh;
    bh = Math.round(maxWh * 0.625);
    fontSize = 11;
    blackFontSize = 9;
  }

  piano.style.height = `${wh}px`;

  let whiteKeyIndex = 0;

  for (let midi = rangeLow; midi <= rangeHigh; midi++) {
    const semitone = midi % 12;
    const octave = Math.floor(midi / 12) - 1;
    const keyDef = OCTAVE_KEYS[semitone];

    const el = document.createElement("div");
    el.dataset.note = keyDef.name;
    el.dataset.octave = String(octave);

    if (keyDef.black) {
      el.className = "black-key";
      el.style.width = `${bw}px`;
      el.style.height = `${bh}px`;
      el.style.left = `${whiteKeyIndex * ww - Math.round(bw / 2)}px`;
      el.style.fontSize = `${blackFontSize}px`;
    } else {
      el.className = "white-key";
      el.style.width = `${ww}px`;
      el.style.height = `${wh}px`;
      el.style.fontSize = `${fontSize}px`;
      // 音名表示ヒント: 白鍵に C4, D4 等のラベルを置く。鍵盤幅が狭すぎる時は省略。
      if (hintNoteLabelEnabled && ww >= 20) {
        el.textContent = `${keyDef.name}${octave}`;
      }
      whiteKeyIndex++;
    }

    el.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, {
        name: keyDef.name,
        octave,
        pointerType: e.pointerType,
        el,
        onKeyUp,
      });
      onKeyDown(keyDef.name, octave, e.pointerType);
    });
    // pointerleave: 押下中の pointer が鍵盤要素から外に出た時点で離鍵扱いにする(タッチで鍵盤をなぞるとずるずる音が残るのを防ぐ)
    el.addEventListener("pointerleave", (e) => {
      const p = activePointers.get(e.pointerId);
      if (!p || p.el !== el) return;
      activePointers.delete(e.pointerId);
      p.onKeyUp(p.name, p.octave, p.pointerType);
    });
    piano.appendChild(el);
  }

  area.appendChild(piano);
}

/**
 * 正解キーを表示ヒント: 正解の鍵盤に `.hint` クラスを付ける。
 * 既存のヒントは一度全て解除してから付け直す (前問の残留を防ぐ)
 */
export function updateKeyboardHint(targets: { name: string; octave: number }[]): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.querySelectorAll(".hint").forEach(el => el.classList.remove("hint"));

  const wanted = targets.map(t => ({
    semitone: noteToSemitone(t.name),
    octave: String(t.octave),
  }));
  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    const sem = noteToSemitone(key.dataset.note!);
    const oct = key.dataset.octave;
    if (wanted.some(w => w.semitone === sem && w.octave === oct)) {
      key.classList.add("hint");
    }
  }
}

// 正解キーを表示のクリア (機能 OFF 切替や次問遷移時に呼ぶ)
export function clearKeyboardHint(): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;
  piano.querySelectorAll(".hint").forEach(el => el.classList.remove("hint"));
}

/**
 * キーボードレイアウト表示ヒント: 鍵盤上に対応する PC キー名 (A, W, S 等) を重ね表示する
 *
 * `enabled` が false なら既存ラベルを削除して終了
 * 黒鍵は `position: absolute` で配置するため, ラベル span 追加時に position を調整する
 */
export function updateKbLayoutLabels(enabled: boolean): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  piano.querySelectorAll(".key-label").forEach(el => el.remove());

  if (!enabled) return;

  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    const noteName = key.dataset.note!;
    const label = NOTE_TO_KEY[noteName];
    if (label) {
      const labelEl = document.createElement("span");
      labelEl.className = "key-label";
      labelEl.textContent = label;
      key.style.position = key.classList.contains("black-key") ? "absolute" : "relative";
      key.appendChild(labelEl);
    }
  }
}

// 入力ハイライト解除用のタイマーを鍵盤要素ごとに保持。
// 連打時に旧タイマーを clearTimeout して新しい 200ms 表示に置き換える。
const highlightTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

/**
 * 入力された鍵盤を短時間 (200ms) ハイライトして入力を可視化する
 * (`.active` クラスの付与/解除で実現) MIDI/タッチ/マウス/PC キー全ソースから呼ばれる
 */
export function highlightKey(noteName: string, octave: number): void {
  const piano = document.querySelector(".piano");
  if (!piano) return;

  const keys = piano.querySelectorAll("[data-note]") as NodeListOf<HTMLElement>;
  for (const key of keys) {
    if (key.dataset.note === noteName && key.dataset.octave === String(octave)) {
      const prev = highlightTimers.get(key);
      if (prev !== undefined) clearTimeout(prev);
      key.classList.add("active");
      highlightTimers.set(key, setTimeout(() => {
        key.classList.remove("active");
        highlightTimers.delete(key);
      }, 200));
    }
  }
}
