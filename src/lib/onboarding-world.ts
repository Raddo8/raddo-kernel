/**
 * "Your world" extractor: parses raw intake answers into structured cards
 * shown in the side panel during intake and on the dashboard.
 * Deliberately permissive: split on newlines and commas, trim, dedupe.
 */
export interface WorldSlice {
  entities: string[];   // chapter 3, q12 (and q3 as fallback)
  people: string[];     // chapter 4, q17-19
  priorities: string[]; // chapter 8, q42
  systems: string[];    // chapter 10, q52-59
}

function splitList(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\n|,|;|·|•/g)
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 120)
    .slice(0, 12);
}

function firstLine(raw: string | undefined | null): string {
  if (!raw) return "";
  return (raw.split(/\n/)[0] || "").trim();
}

export function extractWorld(answers: Record<string, { answer: string | null } | undefined>): WorldSlice {
  const a = (k: string) => answers[k]?.answer || "";
  const entitiesRaw = a("q12") || a("q3");
  const entities = splitList(entitiesRaw).map(firstLine);
  const people = [
    ...splitList(a("q17")),
    ...splitList(a("q18")),
    ...splitList(a("q19")),
  ].slice(0, 10);
  const priorities = splitList(a("q42"));
  const systems = [
    a("q52") && `Email · ${firstLine(a("q52"))}`,
    a("q53") && `Calendar · ${firstLine(a("q53"))}`,
    a("q54") && `Files · ${firstLine(a("q54"))}`,
    a("q55") && `Accounting · ${firstLine(a("q55"))}`,
    a("q56") && `CRM · ${firstLine(a("q56"))}`,
    a("q57") && `Payroll · ${firstLine(a("q57"))}`,
    a("q58") && `Industry · ${firstLine(a("q58"))}`,
    a("q59") && `Team chat · ${firstLine(a("q59"))}`,
    a("q60") && `AI · ${firstLine(a("q60"))}`,
  ].filter(Boolean) as string[];
  return { entities, people, priorities, systems };
}
