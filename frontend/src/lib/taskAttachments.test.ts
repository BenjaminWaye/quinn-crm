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
  assert.equal(attachmentIconLabel("video/mp4"), "🎬");
  assert.equal(attachmentIconLabel("audio/mpeg"), "🎵");
  assert.equal(attachmentIconLabel("application/pdf"), "📄");
  assert.equal(attachmentIconLabel("text/csv"), "📊");
  assert.equal(attachmentIconLabel("application/vnd.ms-excel"), "📊");
  assert.equal(attachmentIconLabel("application/json"), "🧾");
  assert.equal(attachmentIconLabel("application/vnd.api+json"), "🧾");
  assert.equal(attachmentIconLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "📘");
  assert.equal(attachmentIconLabel("application/vnd.ms-powerpoint"), "📽️");
  assert.equal(attachmentIconLabel("application/zip"), "🗜️");
  assert.equal(attachmentIconLabel("text/plain"), "📝");
  assert.equal(attachmentIconLabel("application/octet-stream"), "📎");
});

test("attachmentIconLabel covers office and media MIME types", () => {
  assert.equal(attachmentIconLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "📘");
  assert.equal(attachmentIconLabel("application/vnd.ms-excel"), "📊");
  assert.equal(attachmentIconLabel("application/vnd.ms-powerpoint"), "📽️");
  assert.equal(attachmentIconLabel("application/vnd.ms-excel.sheet.macroenabled.12"), "📊");
  assert.equal(attachmentIconLabel("application/vnd.oasis.opendocument.spreadsheet"), "📊");
  assert.equal(attachmentIconLabel("text/csv"), "📊");
  assert.equal(attachmentIconLabel("audio/mpeg"), "🎵");
  assert.equal(attachmentIconLabel("video/mp4"), "🎬");
  assert.equal(attachmentIconLabel("application/x-7z-compressed"), "🗜️");
  assert.equal(attachmentIconLabel("application/x-xz"), "🗜️");
  assert.equal(attachmentIconLabel("application/json"), "🧾");
  assert.equal(attachmentIconLabel("application/toml"), "📝");
});
