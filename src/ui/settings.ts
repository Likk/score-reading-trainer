import type { OscillatorType } from "tone";
import type { Clef, KeySig } from "../domain/music";

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
  onOscillatorChange: (type: OscillatorType) => void;
  onKbModeChange: (mode: "fit" | "scroll") => void;
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

  const oscSelect = document.getElementById("oscillatorType") as HTMLSelectElement;
  if (oscSelect) {
    oscSelect.addEventListener("change", () => {
      callbacks.onOscillatorChange(oscSelect.value as OscillatorType);
    });
  }

  const kbFitCheckbox = document.getElementById("kbFit") as HTMLInputElement;
  if (kbFitCheckbox) {
    kbFitCheckbox.addEventListener("change", () => {
      callbacks.onKbModeChange(kbFitCheckbox.checked ? "fit" : "scroll");
    });
  }
}
