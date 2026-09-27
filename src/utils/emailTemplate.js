const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g;

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderEmailTemplate(template, values, { html = false } = {}) {
  return String(template ?? "").replace(PLACEHOLDER_PATTERN, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      throw new Error(`Unsupported email template placeholder: {{${key}}}`);
    }

    const value = values[key] ?? "";
    return html ? escapeHtml(value) : String(value);
  });
}

export function renderEmailSubject(template, values) {
  return renderEmailTemplate(template, values)
    .replace(/[\r\n]+/g, " ")
    .trim();
}
