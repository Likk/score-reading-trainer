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

const SYNTH_OSCS = new Set(["triangle", "sawtooth", "square", "sine"]);

function parseVoiceValue(value: string): VoiceSelection | null {
  if (value === "piano") return { kind: "piano" };
  if (SYNTH_OSCS.has(value)) return { kind: "synth", osc: value as OscillatorType };
  return null;
}

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
