/**
 * @file 設定 UI のイベント配線
 *
 * 役割:
 * - 設定 DOM (radio / select / checkbox / slider) の change/input を SettingsCallbacks 経由で index.ts へ伝える
 * - 不正な値 (range の low >= high, 未知の voice 値) は前値へ rollback する
 * - voice 切替時のロード状態を select の option text で示す ("（読込中…）")
 *
 * 設計上の前提:
 * - DOM 取得は initSettings 1 回のみ。 要素が存在しない設定は黙ってスキップする。(HTML 側で隠す/消すの柔軟性を残したい)
 */

import type { OscillatorType } from "tone";
import type { Clef, KeySig } from "../domain/music";

export type VoiceSelection =
  | { kind: "synth"; osc: OscillatorType }
  | { kind: "piano" };

export interface SettingsCallbacks {
  onClefChange: (clef: Clef) => void;
  onKeySigChange: (keySig: KeySig) => void;
  onRangeChange: (low: number, high: number) => void;
  onAccidentalsChange: (enabled: boolean) => void;
  onHintStaffChange: (enabled: boolean) => void;
  onHintKeyChange: (enabled: boolean) => void;
  onHintNoteLabelChange: (enabled: boolean) => void;
  onHintKbLayoutChange: (enabled: boolean) => void;
  onVolumeChange: (value: number) => void;
  onVoiceChange: (selection: VoiceSelection) => Promise<void> | void;
  onKbModeChange: (mode: "fit" | "scroll") => void;
  onMidiOffsetChange: (offset: number) => void;
  onChordSizeChange: (size: number) => void;
}

// voice select の synth 系オプションの値 (Tone.js の OscillatorType サブセット)
const SYNTH_OSCS = new Set(["triangle", "sawtooth", "square", "sine"]);

// voice select の値を VoiceSelection に解釈する。 未知の値は null.
function parseVoiceValue(value: string): VoiceSelection | null {
  if (value === "piano") return { kind: "piano" };
  if (SYNTH_OSCS.has(value)) return { kind: "synth", osc: value as OscillatorType };
  return null;
}

/**
 * 設定 UI のイベントハンドラを一括で配線する
 *
 * 各設定項目は対応する DOM 要素が存在する場合のみ処理される (HTML 側で要素が無くてもエラーにならない)
 */
export function initSettings(callbacks: SettingsCallbacks): void {
  const clefRadios = document.querySelectorAll('input[name="clef"]');
  for (const radio of clefRadios) {
    radio.addEventListener("change", (e) => {
      callbacks.onClefChange((e.target as HTMLInputElement).value as Clef);
    });
  }

  const keySigSelect = document.getElementById("keySig") as HTMLSelectElement;
  if (keySigSelect) {
    keySigSelect.addEventListener("change", () => {
      callbacks.onKeySigChange(keySigSelect.value as KeySig);
    });
  }

  // 音域 (low/high) の妥当性チェック付き反映
  // low >= high になる選択は無効として lastLow/lastHigh の値で UI を rollback する
  const rangeLowSelect = document.getElementById("rangeLow") as HTMLSelectElement;
  const rangeHighSelect = document.getElementById("rangeHigh") as HTMLSelectElement;
  if (rangeLowSelect && rangeHighSelect) {
    let lastLow = parseInt(rangeLowSelect.value, 10);
    let lastHigh = parseInt(rangeHighSelect.value, 10);
    const updateRange = () => {
      const low = parseInt(rangeLowSelect.value, 10);
      const high = parseInt(rangeHighSelect.value, 10);
      if (low < high) {
        lastLow = low;
        lastHigh = high;
        callbacks.onRangeChange(low, high);
      } else {
        rangeLowSelect.value = String(lastLow);
        rangeHighSelect.value = String(lastHigh);
      }
    };
    rangeLowSelect.addEventListener("change", updateRange);
    rangeHighSelect.addEventListener("change", updateRange);
  }

  const accidentalCheckbox = document.getElementById("accidentals") as HTMLInputElement;
  if (accidentalCheckbox) {
    accidentalCheckbox.addEventListener("change", () => {
      callbacks.onAccidentalsChange(accidentalCheckbox.checked);
    });
  }

  const hintStaffCheckbox = document.getElementById("hintStaff") as HTMLInputElement;
  if (hintStaffCheckbox) {
    hintStaffCheckbox.addEventListener("change", () => {
      callbacks.onHintStaffChange(hintStaffCheckbox.checked);
    });
  }

  const hintKeyCheckbox = document.getElementById("hintKey") as HTMLInputElement;
  if (hintKeyCheckbox) {
    hintKeyCheckbox.addEventListener("change", () => {
      callbacks.onHintKeyChange(hintKeyCheckbox.checked);
    });
  }

  const hintNoteLabelCheckbox = document.getElementById("hintNoteLabel") as HTMLInputElement;
  if (hintNoteLabelCheckbox) {
    hintNoteLabelCheckbox.addEventListener("change", () => {
      callbacks.onHintNoteLabelChange(hintNoteLabelCheckbox.checked);
    });
  }

  const hintKbLayoutCheckbox = document.getElementById("hintKbLayout") as HTMLInputElement;
  if (hintKbLayoutCheckbox) {
    hintKbLayoutCheckbox.addEventListener("change", () => {
      callbacks.onHintKbLayoutChange(hintKbLayoutCheckbox.checked);
    });
  }

  const volumeSlider = document.getElementById("volume") as HTMLInputElement;
  if (volumeSlider) {
    volumeSlider.addEventListener("input", () => {
      callbacks.onVolumeChange(parseInt(volumeSlider.value, 10));
    });
  }

  // 音色切替: piano 選択時はサンプル load を待つ間 UI を無効化し、選択中 option の text に "（読込中…）" を一時的に追記する。
  // 失敗時は prev (前回値) へロールバックする。
  const voiceSelect = document.getElementById("voiceSelect") as HTMLSelectElement;
  if (voiceSelect) {
    let lastValue = voiceSelect.value;
    voiceSelect.addEventListener("change", async () => {
      const selection = parseVoiceValue(voiceSelect.value);
      if (!selection) {
        voiceSelect.value = lastValue;
        return;
      }
      const prev = lastValue;
      lastValue = voiceSelect.value;
      const originalText = voiceSelect.options[voiceSelect.selectedIndex]?.text ?? "";
      if (selection.kind === "piano") {
        voiceSelect.disabled = true;
        const opt = voiceSelect.options[voiceSelect.selectedIndex];
        if (opt) opt.text = originalText + "（読込中…）";
      }
      try {
        await callbacks.onVoiceChange(selection);
      } catch (err) {
        console.error("voice load failed", err);
        voiceSelect.value = prev;
        lastValue = prev;
      } finally {
        const opt = voiceSelect.options[voiceSelect.selectedIndex];
        if (opt && selection.kind === "piano") opt.text = originalText;
        voiceSelect.disabled = false;
      }
    });
  }

  const kbFitCheckbox = document.getElementById("kbFit") as HTMLInputElement;
  if (kbFitCheckbox) {
    kbFitCheckbox.addEventListener("change", () => {
      callbacks.onKbModeChange(kbFitCheckbox.checked ? "fit" : "scroll");
    });
  }

  const midiOffsetSelect = document.getElementById("midiOffset") as HTMLSelectElement;
  if (midiOffsetSelect) {
    midiOffsetSelect.addEventListener("change", () => {
      callbacks.onMidiOffsetChange(parseInt(midiOffsetSelect.value, 10));
    });
  }

  const chordSizeSelect = document.getElementById("chordSize") as HTMLSelectElement;
  if (chordSizeSelect) {
    chordSizeSelect.addEventListener("change", () => {
      callbacks.onChordSizeChange(parseInt(chordSizeSelect.value, 10));
    });
  }
}
