import assert from "node:assert/strict";
import test from "node:test";
import { attachmentIconLabel, formatBytes } from "./taskAttachments";

test("formatBytes handles edge values", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1), "1 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1024 * 1024), "1.0 MB");
});

test("attachmentIconLabel maps known file types", () => {
  assert.equal(attachmentIconLabel("image/png"), "🖼️");
  assert.equal(attachmentIconLabel("application/pdf"), "📄");
  assert.equal(attachmentIconLabel("application/zip"), "🗜️");
  assert.equal(attachmentIconLabel("text/plain"), "📝");
  assert.equal(attachmentIconLabel("application/octet-stream"), "📎");
});
