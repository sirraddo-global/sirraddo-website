import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { cleanCv, docxText } from "../api/_lib/cv.mjs";
import { permFor } from "../api/_lib/staff.mjs";

// A tiny .docx (zip with one deflated word/document.xml), enough for docxText.
function miniDocx(xml) {
  const name = Buffer.from("word/document.xml"), data = deflateRawSync(Buffer.from(xml));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(0, 42);
  const cdOff = 30 + name.length + data.length, end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(46 + name.length, 12); end.writeUInt32LE(cdOff, 16);
  return Buffer.concat([local, name, data, central, name, end]);
}

test("reads the text of an old CV in Word format", () => {
  const t = docxText(miniDocx('<w:document><w:body><w:p><w:r><w:t>Tunde Ade</w:t></w:r></w:p><w:p><w:r><w:t>Sales &amp; Marketing</w:t></w:r></w:p></w:body></w:document>'));
  assert.equal(t, "Tunde Ade\nSales & Marketing");
  assert.equal(docxText(Buffer.from("not a zip")), "");
});

test("a CV is kept to known fields and sizes", () => {
  const cv = cleanCv({ name: "A".repeat(200), experience: [{ role: "Cashier", bullets: ["x", 5, ""] }, { nothing: 1 }], skills: "nope", layout: "fancy", accent: "red", evil: "<script>" });
  assert.equal(cv.name.length, 80);
  assert.equal(cv.experience.length, 1);
  assert.deepEqual(cv.experience[0].bullets, ["x", "5"]);
  assert.deepEqual(cv.skills, []);
  assert.equal(cv.layout, "classic");
  assert.equal(cv.accent, "#13254F");
  assert.equal(cv.referees, "Available on request");
  assert.equal(cv.letter, null);
  assert.ok(!("evil" in cv));
});

test("CV maker actions need the Build permission", () => {
  for (const a of ["cv_get", "cv_save", "cv_draft"]) assert.equal(permFor(a), "build");
});
