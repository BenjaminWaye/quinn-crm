import { formatDateTime } from "./time";

const CODE_TOKEN_PREFIX = "@@CODE_";
const CODE_TOKEN_SUFFIX = "@@";

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, "\n");
}

function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function protectCodeSpans(input: string): { text: string; codeTokens: string[] } {
  const codeTokens: string[] = [];
  const text = input.replace(/`([^`\n]+)`/g, (_match, codeBody: string) => {
    const tokenIndex = codeTokens.length;
    const token = `${CODE_TOKEN_PREFIX}${tokenIndex}${CODE_TOKEN_SUFFIX}`;
    codeTokens.push(`<code class="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.9em]">${codeBody}</code>`);
    return token;
  });
  return { text, codeTokens };
}

function restoreCodeSpans(input: string, codeTokens: string[]): string {
  let out = input;
  codeTokens.forEach((tokenHtml, index) => {
    const token = `${CODE_TOKEN_PREFIX}${index}${CODE_TOKEN_SUFFIX}`;
    out = out.split(token).join(tokenHtml);
  });
  return out;
}

function applyInlineMarkdown(input: string): string {
  const withLinks = input.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_match, label: string, rawUrl: string) => {
    const safeUrl = sanitizeUrl(rawUrl);
    if (!safeUrl) {
      return label;
    }
    return `<a href="${safeUrl}" target="_blank" rel="noreferrer" class="text-blue-600 hover:underline">${label}</a>`;
  });

  const withBold = withLinks.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  return withBold.replace(/(^|[\s(])\*([^*\n]+)\*(?=[$\s).,!?:;]|$)/g, "$1<em>$2</em>");
}

export function renderCommentBodyHtml(body: string): string {
  const normalized = normalizeNewlines(body);
  const escaped = escapeHtml(normalized);
  const { text: protectedText, codeTokens } = protectCodeSpans(escaped);
  const withMarkdown = applyInlineMarkdown(protectedText);
  const withCode = restoreCodeSpans(withMarkdown, codeTokens);
  return withCode.replace(/\n/g, "<br />");
}

export function renderCommentMeta(authorType: string, createdAt: unknown): string {
  return `${authorType} • ${formatDateTime(createdAt)}`;
}
