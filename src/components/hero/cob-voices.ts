export type VoiceId = "cob" | "michael";

export const VOICES: { id: VoiceId; label: string; tagline: string }[] = [
  { id: "cob", label: "COB", tagline: "Your Chief of Business." },
  { id: "michael", label: "Michael Scott", tagline: "World's Best Boss. Allegedly." },
];

export const DEFAULT_VOICE: VoiceId = "cob";

export const VOICE_STORAGE_KEY = "cob-chat-voice";

export function readStoredVoice(): VoiceId {
  if (typeof window === "undefined") return DEFAULT_VOICE;
  try {
    const v = window.sessionStorage.getItem(VOICE_STORAGE_KEY);
    return v === "michael" ? "michael" : "cob";
  } catch {
    return DEFAULT_VOICE;
  }
}

export function writeStoredVoice(v: VoiceId) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(VOICE_STORAGE_KEY, v);
  } catch {
    // ignore
  }
}
