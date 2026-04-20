/**
 * Markdown-lite renderer for log bodies.
 *
 * Supports only what the design doc asks for:
 *   - **bold**  → <strong>
 *   - *italic*  → <em>
 *   - double newline → paragraph break
 *   - single newline → hard break
 *
 * Deliberately does NOT support links, headings, lists, or raw HTML. The
 * input is HTML-escaped first, so user text can never inject markup —
 * only the three patterns above are rehydrated into real tags.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

export function renderMarkdownLite(raw: string): string {
  const escaped = escapeHtml(raw);
  // Split on paragraphs (two or more consecutive newlines).
  const paragraphs = escaped.split(/\n{2,}/);
  const html = paragraphs
    .map((para) => {
      const withInline = para
        .replace(/\*\*([^\n*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^\n*]+)\*/g, '$1<em>$2</em>')
        .replace(/\n/g, '<br>');
      return `<p>${withInline}</p>`;
    })
    .join('');
  return html;
}

export function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatLogDate(iso: string): string {
  // Keep the ISO date raw — it's already readable and avoids locale-dependent
  // rendering bugs. If we ever want prettier ("20 April 2026"), do it here.
  return iso;
}
