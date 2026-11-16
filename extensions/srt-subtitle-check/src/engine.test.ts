import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  applyEdits,
  countChars,
  fixNumberingEdits,
  formatTime,
  lintSrt,
  normalizeTimestampEdits,
  parseSRT,
  parseTimestampLine,
  wrapLongLineEdits,
} from "./engine";

const fixture = readFileSync(join(process.cwd(), "fixtures", "sample-issues.srt"), "utf8");

test("countChars uses graphemes for CJK and emoji", () => {
  assert.equal(countChars("你好"), 2);
  assert.equal(countChars("hello"), 5);
  assert.equal(countChars("👩‍💻"), 1);
});

test("milliseconds are right-padded: 5 and 50 both become 500ms", () => {
  const a = parseTimestampLine("00:00:01,5 --> 00:00:02,0");
  const b = parseTimestampLine("00:00:01,50 --> 00:00:02,0");
  assert.equal(a.ok, true);
  assert.equal(a.start, 1500);
  assert.equal(b.start, 1500);
  assert.equal(formatTime(1500), "00:00:01,500");
});

test("short timestamps and dots are format-odd but parseable", () => {
  const short = parseTimestampLine("0:0:9,00 --> 00:00:12,000");
  assert.equal(short.ok, true);
  assert.equal(short.formatOdd, true);
  assert.equal(short.normalized, "00:00:09,000 --> 00:00:12,000");
  const dots = parseTimestampLine("00:00:13.000 --> 00:00:20.000");
  assert.equal(dots.ok, true);
  assert.equal(dots.formatOdd, true);
  assert.equal(dots.normalized, "00:00:13,000 --> 00:00:20,000");
});

test("sample fixture reports the expected issue codes", () => {
  const { issues, stats } = lintSrt(fixture);
  const codes = issues.map((i) => i.code);
  assert.ok(stats.cues >= 7);
  for (const needed of [
    "badNumber",
    "longLine",
    "missingNumber",
    "overlap",
    "endBeforeStart",
    "tsFormat",
    "cps",
    "empty",
  ]) {
    assert.ok(codes.includes(needed), `missing ${needed}, got ${codes.join(",")}`);
  }
});

test("CJK line length uses the 16-character default", () => {
  const text = `1
00:00:00,000 --> 00:00:02,000
你好你好你好你好你好你好你好你好你好
`;
  const { issues } = lintSrt(text);
  const long = issues.find((i) => i.code === "longLine");
  assert.ok(long);
  assert.equal(long!.params!.len, 18);
  assert.equal(long!.params!.limit, 16);
});

test("overlap is an error; exact abutment is allowed", () => {
  const overlap = `1
00:00:01,000 --> 00:00:03,000
One

2
00:00:02,500 --> 00:00:04,000
Two
`;
  assert.ok(lintSrt(overlap).issues.some((i) => i.code === "overlap"));
  const abut = `1
00:00:01,000 --> 00:00:03,000
One

2
00:00:03,000 --> 00:00:04,000
Two
`;
  assert.equal(lintSrt(abut).issues.filter((i) => i.code === "overlap").length, 0);
});

test("end before start and zero duration are errors", () => {
  const neg = `1
00:00:06,000 --> 00:00:05,000
X
`;
  assert.ok(lintSrt(neg).issues.some((i) => i.code === "endBeforeStart"));
  const zero = `1
00:00:06,000 --> 00:00:06,000
X
`;
  assert.ok(lintSrt(zero).issues.some((i) => i.code === "zeroDuration"));
});

test("CPS warning uses the English default of 21", () => {
  const text = `1
00:00:21,000 --> 00:00:21,200
Hi CPS is too fast here!!!
`;
  const cps = lintSrt(text).issues.find((i) => i.code === "cps");
  assert.ok(cps);
  assert.equal(cps!.params!.limit, 21);
});

test("webvtt files are rejected", () => {
  const { issues } = lintSrt("WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nHi\n");
  assert.ok(issues.some((i) => i.code === "webvtt"));
});

test("renumber quick fix inserts a missing index and corrects a wrong one", () => {
  const text = `2
00:00:01,000 --> 00:00:02,000
Hi

00:00:03,000 --> 00:00:04,000
There
`;
  const parsed = parseSRT(text);
  const fixed = applyEdits(text, fixNumberingEdits(parsed));
  const after = lintSrt(fixed);
  assert.equal(after.issues.filter((i) => i.code === "missingNumber" || i.code === "badNumber").length, 0);
  assert.match(fixed, /^1\n/);
  assert.match(fixed, /\n2\n00:00:03/);
});

test("normalize timestamp quick fix rewrites odd formats in place", () => {
  const text = `1
0:0:9,00 --> 00:00:12,000
Hello
`;
  const parsed = parseSRT(text);
  const fixed = applyEdits(text, normalizeTimestampEdits(parsed));
  assert.match(fixed, /00:00:09,000 --> 00:00:12,000/);
  assert.equal(lintSrt(fixed).issues.filter((i) => i.code === "tsFormat").length, 0);
});

test("wrap long line quick fix breaks an English line at a space", () => {
  const long =
    "This is a line that is definitely way too long for a forty-two character English subtitle limit and should fail";
  const text = `1
00:00:01,000 --> 00:00:04,000
${long}
`;
  const parsed = parseSRT(text);
  const edits = wrapLongLineEdits(parsed);
  assert.ok(edits.length >= 1);
  const fixed = applyEdits(text, edits);
  const after = lintSrt(fixed);
  assert.equal(after.issues.filter((i) => i.code === "longLine").length, 0);
});

test("issue ranges point inside the document", () => {
  const { issues } = lintSrt(fixture);
  for (const issue of issues) {
    assert.ok(issue.range.start >= 0, issue.code);
    assert.ok(issue.range.end <= fixture.length, issue.code);
    assert.ok(issue.range.end >= issue.range.start, issue.code);
  }
  const long = issues.find((i) => i.code === "longLine");
  assert.ok(long);
  assert.ok(fixture.slice(long!.range.start, long!.range.end).includes("forty-two"));
});

test("CRLF files keep CRLF when inserting a cue number", () => {
  const text = "00:00:01,000 --> 00:00:02,000\r\nHello\r\n";
  const parsed = parseSRT(text);
  assert.equal(parsed.eol, "\r\n");
  const fixed = applyEdits(text, fixNumberingEdits(parsed));
  assert.ok(fixed.startsWith("1\r\n00:00:01,000"));
  assert.equal(lintSrt(fixed).issues.filter((i) => i.code === "missingNumber").length, 0);
});
