import { describe, it, expect } from "vitest";
import {
  parseLaunchEnv,
  applyEnvPreset,
  isEnvPresetActive,
  toggleEnvPreset,
  ENV_PRESETS,
  WRAPPER_PRESETS,
} from "./launchPresets";

describe("launchPresets", () => {
  it("parses KEY=VALUE lines, dropping blanks and comments", () => {
    expect(parseLaunchEnv("A=1\n# note\n\nB=2")).toEqual([
      ["A", "1"],
      ["B", "2"],
    ]);
  });

  it("merges preset vars and lets the preset win on collision", () => {
    expect(applyEnvPreset("A=old\nB=2", { A: "new", C: "3" })).toBe("A=new\nB=2\nC=3");
  });

  it("applies a preset onto an empty block", () => {
    expect(applyEnvPreset("", { MANGOHUD: "1" })).toBe("MANGOHUD=1");
  });

  it("detects an active preset only when all its keys are present", () => {
    expect(isEnvPresetActive("MANGOHUD=1\nMANGOHUD_CONFIG=fps", { MANGOHUD: "1", MANGOHUD_CONFIG: "fps,gpu_temp,cpu_temp,ram" })).toBe(true);
    expect(isEnvPresetActive("MANGOHUD=1", { MANGOHUD: "1", MANGOHUD_CONFIG: "fps,gpu_temp,cpu_temp,ram" })).toBe(false);
    expect(isEnvPresetActive("", { A: "1" })).toBe(false);
  });

  it("toggles a preset: applies when off, strips its keys when on", () => {
    const vars = { __NV_PRIME_RENDER_OFFLOAD: "1", __GLX_VENDOR_LIBRARY_NAME: "nvidia" };
    const on = toggleEnvPreset("MANGOHUD=1", vars);
    expect(isEnvPresetActive(on, vars)).toBe(true);
    const off = toggleEnvPreset(on, vars);
    expect(off).toBe("MANGOHUD=1");
  });

  it("ships unique, non-empty preset labels", () => {
    const labels = [...ENV_PRESETS, ...WRAPPER_PRESETS].map((p) => p.label);
    expect(labels.every((l) => l.length > 0)).toBe(true);
    expect(new Set(ENV_PRESETS.map((p) => p.label)).size).toBe(ENV_PRESETS.length);
  });
});
