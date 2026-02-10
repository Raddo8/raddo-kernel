/**
 * Template rendering engine with allow-listed variables.
 *
 * Only the variables below may be interpolated. Any unknown {{variable}}
 * is replaced with "[unknown: variable]" and recorded in renderErrors.
 * renderErrors are ALWAYS returned and ALWAYS persisted to result_json
 *, even when the render itself succeeds (constraint 4).
 */

const ALLOWED_VARIABLES = new Set([
  "item.title",
  "item.amount",
  "item.due_date",
  "item.id",
  "account.name",
  "contact.name",
  "contact.email",
  "contact.phone",
]);

export interface TemplateContext {
  item?: {
    id?: string;
    title?: string;
    amount?: number | null;
    due_date?: string | null;
  };
  account?: {
    name?: string;
  };
  contact?: {
    name?: string;
    email?: string | null;
    phone?: string | null;
  };
}

export interface RenderResult {
  subject: string;
  body: string;
  renderErrors: string[];
}

function resolve(path: string, ctx: TemplateContext): string | undefined {
  const [root, key] = path.split(".");
  const obj = ctx[root as keyof TemplateContext] as Record<string, unknown> | undefined;
  if (!obj || !(key in obj)) return undefined;
  const val = obj[key];
  if (val === null || val === undefined) return "";
  return String(val);
}

function renderString(template: string, ctx: TemplateContext, errors: string[]): string {
  return template.replace(/\{\{(\s*[\w.]+\s*)\}\}/g, (_match, raw: string) => {
    const variable = raw.trim();
    if (!ALLOWED_VARIABLES.has(variable)) {
      errors.push(`Unknown variable: ${variable}`);
      return `[unknown: ${variable}]`;
    }
    const value = resolve(variable, ctx);
    if (value === undefined) {
      errors.push(`Variable "${variable}" could not be resolved from context`);
      return "";
    }
    return value;
  });
}

export function renderTemplate(
  subject: string | null,
  body: string,
  ctx: TemplateContext
): RenderResult {
  const renderErrors: string[] = [];
  return {
    subject: renderString(subject || "", ctx, renderErrors),
    body: renderString(body, ctx, renderErrors),
    renderErrors,
  };
}
