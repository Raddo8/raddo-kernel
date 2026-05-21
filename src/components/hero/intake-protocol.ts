// Intake protocol script for the Hero Dossier Intake surface.
// Replace INTAKE_PROTOCOL with the real question sequence when ready.
// No other file needs to change.

export type IntakeTurn =
  | { kind: "ask"; id: string; prompt: string; hint?: string }
  | { kind: "branch"; id: string; on: (reply: string) => string }
  | { kind: "close"; id: string; message: string; cta?: { label: string; href: string } };

export const INTAKE_PROTOCOL: IntakeTurn[] = [
  {
    kind: "ask",
    id: "q1",
    prompt: "What's the one thing keeping you up at night?",
    hint: "A decision, a person, a number · whichever surfaces first.",
  },
  {
    kind: "ask",
    id: "q2",
    prompt: "And what's taking up most of your day right now?",
  },
  {
    kind: "close",
    id: "close",
    message:
      "Recorded. Your COB can take the weight of both. Begin a 5-minute consult and we'll show you exactly how.",
    cta: { label: "Begin your 5-minute consult", href: "/consult" },
  },
];

export const INTAKE_HEADER = {
  eyebrow: "INTAKE · CONFIDENTIAL · SESSION 001",
  title: "Your COB is listening.",
  subtitle: "Answer in your own words. Nothing leaves this page. No account required.",
};
