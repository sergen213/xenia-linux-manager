/**
 * Shared launch-variable presets + env merge helpers.
 *
 * Both the global Settings launch panel and the per-game Aurora details panel
 * edit the same two fields — `launch_environment` (newline `KEY=VALUE` list)
 * and `launch_wrapper` (a command prefix). These presets and helpers back the
 * one-click buttons in both places so the curated list lives in one spot.
 */

/** Parse a newline `KEY=VALUE` block, dropping blanks and `#` comments. */
export function parseLaunchEnv(raw: string): Array<[string, string]> {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .flatMap((line) => {
      const i = line.indexOf("=");
      return i <= 0 ? [] : [[line.slice(0, i).trim(), line.slice(i + 1).trim()] as [string, string]];
    });
}

/** Merge preset vars into an existing env block; preset wins on key collision. */
export function applyEnvPreset(raw: string, vars: Record<string, string>): string {
  const merged = new Map(parseLaunchEnv(raw));
  for (const [k, v] of Object.entries(vars)) merged.set(k, v);
  return Array.from(merged.entries()).map(([k, v]) => `${k}=${v}`).join("\n");
}

/** A preset is "active" when every key it manages is present in the block. */
export function isEnvPresetActive(raw: string, vars: Record<string, string>): boolean {
  const keys = Object.keys(vars);
  if (keys.length === 0) return false;
  const present = new Set(parseLaunchEnv(raw).map(([k]) => k));
  return keys.every((k) => present.has(k));
}

/** Apply the preset if inactive, otherwise strip the keys it manages. */
export function toggleEnvPreset(raw: string, vars: Record<string, string>): string {
  if (!isEnvPresetActive(raw, vars)) return applyEnvPreset(raw, vars);
  const remove = new Set(Object.keys(vars));
  return parseLaunchEnv(raw)
    .filter(([k]) => !remove.has(k))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

export interface EnvPreset {
  label: string;
  vars: Record<string, string>;
}

export interface WrapperPreset {
  label: string;
  command: string;
}

/** Common Linux/Xenia environment presets (merged into the current block). */
export const ENV_PRESETS: EnvPreset[] = [
  { label: "MangoHud", vars: { MANGOHUD: "1", MANGOHUD_CONFIG: "fps,gpu_temp,cpu_temp,ram" } },
  { label: "GameMode", vars: { LD_PRELOAD: "libgamemodeauto.so.0" } },
  { label: "gamescope WSI", vars: { ENABLE_GAMESCOPE_WSI: "1" } },
  { label: "NVIDIA GPU", vars: { __NV_PRIME_RENDER_OFFLOAD: "1", __GLX_VENDOR_LIBRARY_NAME: "nvidia" } },
  { label: "Discrete GPU", vars: { DRI_PRIME: "1" } },
  { label: "No VSync", vars: { vblank_mode: "0" } },
  { label: "DXVK HUD", vars: { DXVK_HUD: "fps,frametimes,gpuload" } },
  { label: "Frame limit 60", vars: { DXVK_FRAME_RATE: "60" } },
  { label: "Async shaders", vars: { RADV_PERFTEST: "gpl", DXVK_ASYNC: "1" } },
  { label: "Shader cache", vars: { __GL_SHADER_DISK_CACHE: "1", MESA_SHADER_CACHE_DISABLE: "false" } },
  { label: "Force X11", vars: { SDL_VIDEODRIVER: "x11" } },
];

/** Common launch-wrapper presets (replace the wrapper field). */
export const WRAPPER_PRESETS: WrapperPreset[] = [
  { label: "GameMode", command: "gamemoderun" },
  { label: "gamescope", command: "gamescope --mangoapp --" },
  { label: "gamescope 1080p", command: "gamescope -W 1920 -H 1080 -f --mangoapp --" },
  { label: "gamescope FSR", command: "gamescope -U --mangoapp --" },
  { label: "MangoHud", command: "mangohud" },
  { label: "prime-run", command: "prime-run" },
];
