import test from "node:test";
import assert from "node:assert/strict";

import { renderCommentBodyHtml, renderCommentMeta } from "./commentMarkdown";

test("renderCommentBodyHtml preserves newlines and basic markdown safely", () => {
  const input = "Line 1\nLine 2 with **bold** and *italic* and `code`\n[Docs](https://example.com)";
  const html = renderCommentBodyHtml(input);

  assert.match(html, /Line 1<br \/>Line 2/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>italic<\/em>/);
  assert.match(html, /<code[^>]*>code<\/code>/);
  assert.match(html, /<a href="https:\/\/example.com\/"/);
});

test("renderCommentBodyHtml escapes html/script input", () => {
  const html = renderCommentBodyHtml('<script>alert("xss")</script>');
  assert.equal(html, "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
});

test("renderCommentMeta includes formatted timestamp", () => {
  const meta = renderCommentMeta("agent", "2026-03-12T15:55:00.000Z");
  assert.match(meta, /^agent • /);
  assert.ok(!meta.includes("Unknown time"));
});
