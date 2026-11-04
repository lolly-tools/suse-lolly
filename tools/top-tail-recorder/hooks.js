/**
 * Top & Tail Video hooks - the subtitle sidecars.
 *
 * The picture is all template + CSS and needs no hook; this one exists for the
 * .srt / .vtt exports. Whatever dialect arrived in the `transcript` input (the
 * shell's Transcribe button writes SRT, a dropped-in file may be either) is
 * parsed once and written back as one clean dialect, so the subtitle file that
 * travels with the video is the same shape whichever way it got here - and shifted
 * onto the composited timeline, which opens with the intro card (see INTRO_SEC).
 *
 * The cues are NOT burned into the picture: the video compositor
 * (bridge/export.ts renderTopTail) rasterises each card layer once and draws
 * that bitmap for the whole phase, so a caption drawn in the DOM would freeze on
 * one cue for the length of the clip. A sidecar is the honest answer until the
 * compositor can draw a caption per frame.
 *
 * DOM-free, no host.* API required, and it never throws.
 */

// === lolly:shared cues - generated from community/_shared/captions.js; edit there and run npm run sync:shared ===
function pad(n, w) { var s = String(n); while (s.length < w) s = '0' + s; return s; }
function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

/** "00:00:01,500", "00:01.5" or "1:02:03.250" to seconds, or null. */
function stampToSeconds(raw) {
  var m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})$/.exec(String(raw == null ? '' : raw).trim());
  if (!m) return null;
  var hours = m[1] ? Number(m[1]) : 0;
  // One or two digits after the separator are tenths and hundredths, not
  // milliseconds: "0.5" is half a second.
  var frac = Number((m[4] + '00').slice(0, 3));
  return hours * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac / 1000;
}

/** Seconds to HH:MM:SS<sep>mmm. The engine's `stamp`, mirrored. */
function fmtStamp(seconds, sep) {
  var ms = Math.max(0, Math.round(seconds * 1000));
  var h = Math.floor(ms / 3600000);
  var m = Math.floor((ms % 3600000) / 60000);
  var s = Math.floor((ms % 60000) / 1000);
  return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + sep + pad(ms % 1000, 3);
}

/** The five entities a subtitle file is allowed to carry. `&amp;` goes last, so
 *  "&amp;lt;" decodes to "&lt;" and not to "<". */
function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Cue payload to one clean line: tags out, entities decoded, runs of
 *  whitespace (line breaks included) collapsed to single spaces. */
function cleanText(s) {
  return decodeEntities(String(s).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * Parse SRT or WebVTT into cues, plus the warnings worth telling the user about.
 * Source order is kept: a file whose cues are out of order is reported, never
 * quietly rewritten, because the person who owns the file should decide.
 */
function parseCues(raw) {
  var warnings = [];
  var cues = [];
  var text = String(raw == null ? '' : raw)
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n');
  if (!text.trim()) return { cues: cues, warnings: warnings };

  var blocks = text.split(/\n{2,}/);
  var malformed = 0;
  for (var b = 0; b < blocks.length; b++) {
    var block = blocks[b].trim();
    if (!block) continue;
    var lines = block.split('\n');
    // WebVTT metadata blocks. A NOTE may hold anything, an arrow included.
    if (/^(NOTE|STYLE|REGION)\b/.test(lines[0])) continue;
    var at = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('-->') >= 0) { at = i; break; }
    }
    // No timing line. The WEBVTT signature is the one block that is meant to
    // look like this (matched on its own text rather than on being block zero,
    // so a file that opens with blank lines still reads as a header). Anything
    // else is words that will never reach the screen, so it is counted rather
    // than dropped in silence - the whole point of the warnings.
    if (at < 0) {
      if (!/^WEBVTT/.test(block)) malformed++;
      continue;
    }
    var parts = lines[at].split('-->');
    var start = stampToSeconds(parts[0]);
    // Cue settings (line:90%, align:start, …) trail the out-point on the same line.
    var end = stampToSeconds(String(parts[1] == null ? '' : parts[1]).trim().split(/\s+/)[0]);
    if (start === null || end === null) { malformed++; continue; }
    // Lines before the timing are the optional cue id, which carries no meaning
    // once the cues are renumbered on the way out.
    var body = cleanText(lines.slice(at + 1).join(' '));
    // Timed, but nothing left after the tags come out. Counted too: a cue that
    // vanishes is exactly the kind of quiet loss the count exists to surface.
    if (!body) { malformed++; continue; }
    cues.push({ start: start, end: end, text: body });
  }

  if (!cues.length) {
    warnings.push('No timed cues found. Paste SRT or WebVTT text, or transcribe the clip.');
  }
  if (malformed) {
    warnings.push(plural(malformed,
      'block was skipped: it is not a readable cue.',
      'blocks were skipped: they are not readable cues.'));
  }
  var backwards = 0;
  var overlaps = 0;
  var unordered = 0;
  for (var c = 0; c < cues.length; c++) {
    if (cues[c].end <= cues[c].start) backwards++;
    if (c > 0) {
      if (cues[c].start < cues[c - 1].start) unordered++;
      else if (cues[c].start < cues[c - 1].end) overlaps++;
    }
  }
  if (backwards) warnings.push(plural(backwards, 'cue ends before it starts.', 'cues end before they start.'));
  if (unordered) warnings.push(plural(unordered, 'cue starts before the one before it.', 'cues start before the ones before them.'));
  if (overlaps) warnings.push(plural(overlaps, 'cue overlaps the one before it.', 'cues overlap the ones before them.'));
  return { cues: cues, warnings: warnings };
}

/** SubRip: 1-based numbered blocks, comma milliseconds. Empty in, empty out -
 *  never a file holding one lonely newline. */
function toSrt(cues) {
  if (!cues.length) return '';
  var out = [];
  for (var i = 0; i < cues.length; i++) {
    out.push((i + 1) + '\n' + fmtStamp(cues[i].start, ',') + ' --> ' + fmtStamp(cues[i].end, ',') + '\n' + cues[i].text);
  }
  return out.join('\n\n') + '\n';
}

/**
 * WebVTT cue text may not carry a bare `&` or `<` (the grammar reads them as an
 * escape and a tag opener), so both go back out encoded. `decodeEntities` is the
 * exact inverse, so re-importing our own file gives the same text back.
 * SubRip has no such rule and plenty of players print an entity literally, so
 * the .srt sidecar keeps the characters as the author wrote them.
 */
function vttEscape(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

/** WebVTT: header, dot milliseconds, no numbering. */
function toVtt(cues) {
  if (!cues.length) return '';
  var out = [];
  for (var i = 0; i < cues.length; i++) {
    out.push(fmtStamp(cues[i].start, '.') + ' --> ' + fmtStamp(cues[i].end, '.') + '\n' + vttEscape(cues[i].text));
  }
  return 'WEBVTT\n\n' + out.join('\n\n') + '\n';
}

/** Index of the cue on screen at `t`, or -1 during silence. A cue covers
 *  [start, end) - at exactly `end` it has left, the engine's `cueAt` rule.
 *  Where cues overlap the earlier one wins, which is what a player does. */
function cueIndexAt(cues, t) {
  for (var i = 0; i < cues.length; i++) {
    if (t >= cues[i].start && t < cues[i].end) return i;
  }
  return -1;
}
// === /lolly:shared cues ===

// Parsing is the one thing a keystroke in another field must not redo, so it gets
// its own memo keyed on the transcript text.
var _key = null;
var _val = null;

function cuesOf(raw) {
  var key = String(raw == null ? '' : raw);
  if (key === _key) return _val;
  _key = key;
  _val = parseCues(key).cues;
  return _val;
}

/**
 * The exported video opens with the intro card and only then plays the clip, so a
 * cue timed against the clip is INTRO_SEC early against the finished file. The
 * sidecar is shifted by that much, because it travels with the export, not with
 * the raw take. 1600 ms is template.html's `data-intro-ms`, which is what the
 * compositor reads (shells/web/src/bridge/export.ts, renderTopTail) - change both
 * or neither.
 */
var INTRO_SEC = 1.6;

function shifted(cues, by) {
  var out = [];
  for (var i = 0; i < cues.length; i++) {
    out.push({ start: cues[i].start + by, end: cues[i].end + by, text: cues[i].text });
  }
  return out;
}

function compute(model) {
  var raw = '';
  for (var i = 0; i < (model || []).length; i++) {
    if (model[i].id === 'transcript') raw = model[i].value;
  }
  var cues;
  try {
    cues = shifted(cuesOf(raw), INTRO_SEC);
  } catch {
    // A patch is always returned: an unreadable transcript means empty sidecars,
    // never a broken render.
    return { ttSrt: '', ttVtt: '', ttCueCount: 0 };
  }
  return { ttSrt: toSrt(cues), ttVtt: toVtt(cues), ttCueCount: cues.length };
}

function onInit({ model }) { return compute(model); }

function onInput({ model }) { return compute(model); }
