// Brand wordmarks embedded as data URIs so the pasted signature stays
// self-contained — email clients don't fetch tool-relative assets. Standard is
// the green wordmark; Grey is the greyscale variant for low-colour / mono
// contexts (it keeps its alpha, so it also survives a dark background).
//
// The pair is 204x38 and the footer renders it at 102x19 — a deliberate 2x, no
// more. Some clients and signature editors re-save the pasted HTML and drop an
// <img>'s width/height (attributes AND inline CSS), leaving the wordmark at its
// intrinsic size; at the old 3x that blew the footer apart. 2x is the retina
// factor every mail client honours, and it halves the damage when sizing is lost.
// If you re-export these, keep them at exactly 2x the template's display size.
//
// BOTH CARRY CONTENT CREDENTIALS. The `html` output has no container that could
// hold a C2PA manifest, so the inlined PNG is the only place provenance can live
// on the pasted path: pull the logo out of a received signature, drop it into
// Verify, and it reads valid + identity-verified — author SUSE, delivered by
// Lolly. That is why these are NOT hand-pasted base64: the masters beside this
// file (suse.png / suse-grey.png) are signed in place and their base64 synced
// here by `npm run sign:signature-logos`. Re-exporting a logo by hand silently
// drops the credential — run the script instead. There is deliberately no pixel
// imprint; on a small flat wordmark it dies to any re-encode or resize, and the
// one case it survives is the case where this credential already verifies
// (measured — see scripts/sign-inline-logos.ts).
var LOGO_STANDARD = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMwAAAAmCAMAAAC/I4QkAAAH3mNhQlgAAAfeanVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAB7hqdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3Vybjp1dWlkOjU2MWE4NTU4LTI1MWMtNGYwYi1hMDk1LTVhMmQ2MDUzMjc5NQAAAAKYanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAnWp1bWIAAAApanVtZGNib3IAEQAQgAAAqgA4m3EDYzJwYS5hY3Rpb25zLnYyAAAAAGxjYm9yoWdhY3Rpb25zgaNmYWN0aW9ubmMycGEucHVibGlzaGVkbXNvZnR3YXJlQWdlbnSiZG5hbWVlTG9sbHlndmVyc2lvbmYxLjcwLjBkd2hlbnQyMDI2LTA3LTI4VDE0OjA4OjA1WgAAAKtqdW1iAAAAKGp1bWRjYm9yABEAEIAAAKoAOJtxA2MycGEuaGFzaC5kYXRhAAAAAHtjYm9ypWpleGNsdXNpb25zgaJlc3RhcnQYIWZsZW5ndGgZB+pkbmFtZW5qdW1iZiBtYW5pZmVzdGNhbGdmc2hhMjU2ZGhhc2hYIJO4C8PldpbWWDdRfFI/+kV0nmiSgkTAimKBTCG38HQkY3BhZEgAAAAAAAAAAAAAAJxqdW1iAAAALGp1bWRjYm9yABEAEIAAAKoAOJtxA3Rvb2xzLmxvbGx5LmV4cG9ydAAAAABoY2JvcqRkdG9vbG9lbWFpbC1zaWduYXR1cmVmZm9ybWF0Y3BuZ2dzdXJmYWNleCFsb2xseS50b29scy90b29scy9lbWFpbC1zaWduYXR1cmVmZW5naW5lbExvbGx5IDEuNzAuMAAAAINqdW1iAAAAJ2p1bWRqc29uABEAEIAAAKoAOJtxA2Nhd2cubWV0YWRhdGEAAAAAVGpzb257IkBjb250ZXh0Ijp7ImRjIjoiaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8ifSwiZGM6Y3JlYXRvciI6WyJTVVNFIl19AAACXWp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAIuY2JvcqZoZGM6dGl0bGVtU1VTRSB3b3JkbWFya2ppbnN0YW5jZUlEeC11cm46dXVpZDpjNTBhZGJkYy0yNWMwLTRjOGMtYWU0My00ZWZmNTgxODhiZTF0Y2xhaW1fZ2VuZXJhdG9yX2luZm+iZG5hbWVlTG9sbHlndmVyc2lvbmYxLjcwLjByY3JlYXRlZF9hc3NlcnRpb25zhKJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFggfVL2TNdBxSuRLusAdSmV3FyLHprrpUpO13HCaIxI/yeiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFggXdbnbVmaa6POXpmvvCf0AVSkCNT54Be4OnX1AA+tV/+iY3VybHgtc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvdG9vbHMubG9sbHkuZXhwb3J0ZGhhc2hYIJABvcwsoITxTif3IkXiJrMzbfVYE6q9fc0JYyvIyvhFomN1cmx4KHNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2Nhd2cubWV0YWRhdGFkaGFzaFgg1omBlAOzTcp3AZFivQc03resdE5TIY14JdbB267OqrJpc2lnbmF0dXJleBlzZWxmI2p1bWJmPWMycGEuc2lnbmF0dXJlY2FsZ2ZzaGEyNTYAAAJ0anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAAAJEY2JvctKEWQHzogEmGCGBWQHqMIIB5jCCAYygAwIBAgIJR55J49awURjOMAoGCCqGSM49BAMCMCMxDjAMBgNVBAoMBUxvbGx5MREwDwYDVQQDDAhMb2xseSBDQTAeFw0yNjA3MjgxNDA4MDVaFw0yODEwMDUxNDA5MDVaMDQxDjAMBgNVBAoMBUxvbGx5MSIwIAYDVQQDDBlMb2xseSBDb250ZW50IENyZWRlbnRpYWxzMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE8uqDbFCTxi9AEeywpVcTbIPDEf15kpcFZp/XQEGDGaDtYJIFw3pswXTu2fz1uYaDU8kXTahvQLNNQpIsZ2P2c6OBlzCBlDAJBgNVHRMEAjAAMA4GA1UdDwEB/wQEAwIHgDATBgNVHSUEDDAKBggrBgEFBQcD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';
var LOGO_GREY     = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMwAAAAmCAMAAAC/I4QkAAAH5WNhQlgAAAflanVtYgAAAB5qdW1kYzJwYQARABCAAACqADibcQNjMnBhAAAAB79qdW1iAAAAR2p1bWRjMm1hABEAEIAAAKoAOJtxA3Vybjp1dWlkOjYxODAwYWQ5LWYyY2UtNGM4ZS04NDViLWMxZDNiNDM2Mjg5NAAAAAKYanVtYgAAAClqdW1kYzJhcwARABCAAACqADibcQNjMnBhLmFzc2VydGlvbnMAAAAAnWp1bWIAAAApanVtZGNib3IAEQAQgAAAqgA4m3EDYzJwYS5hY3Rpb25zLnYyAAAAAGxjYm9yoWdhY3Rpb25zgaNmYWN0aW9ubmMycGEucHVibGlzaGVkbXNvZnR3YXJlQWdlbnSiZG5hbWVlTG9sbHlndmVyc2lvbmYxLjcwLjBkd2hlbnQyMDI2LTA3LTI4VDE0OjA4OjA1WgAAAKtqdW1iAAAAKGp1bWRjYm9yABEAEIAAAKoAOJtxA2MycGEuaGFzaC5kYXRhAAAAAHtjYm9ypWpleGNsdXNpb25zgaJlc3RhcnQYIWZsZW5ndGgZB/FkbmFtZW5qdW1iZiBtYW5pZmVzdGNhbGdmc2hhMjU2ZGhhc2hYIA7O7/v1tcsc08PVJjQQ2tsGndDQG/rMXsMGEjcDVnsuY3BhZEgAAAAAAAAAAAAAAJxqdW1iAAAALGp1bWRjYm9yABEAEIAAAKoAOJtxA3Rvb2xzLmxvbGx5LmV4cG9ydAAAAABoY2JvcqRkdG9vbG9lbWFpbC1zaWduYXR1cmVmZm9ybWF0Y3BuZ2dzdXJmYWNleCFsb2xseS50b29scy90b29scy9lbWFpbC1zaWduYXR1cmVmZW5naW5lbExvbGx5IDEuNzAuMAAAAINqdW1iAAAAJ2p1bWRqc29uABEAEIAAAKoAOJtxA2Nhd2cubWV0YWRhdGEAAAAAVGpzb257IkBjb250ZXh0Ijp7ImRjIjoiaHR0cDovL3B1cmwub3JnL2RjL2VsZW1lbnRzLzEuMS8ifSwiZGM6Y3JlYXRvciI6WyJTVVNFIl19AAACZGp1bWIAAAAnanVtZGMyY2wAEQAQgAAAqgA4m3EDYzJwYS5jbGFpbS52MgAAAAI1Y2JvcqZoZGM6dGl0bGV0U1VTRSB3b3JkbWFyayAoZ3JleSlqaW5zdGFuY2VJRHgtdXJuOnV1aWQ6ZGZjOTUxZTEtZDk3Yy00ZjExLWFiZWQtMzJmY2VmNWVhYWFmdGNsYWltX2dlbmVyYXRvcl9pbmZvomRuYW1lZUxvbGx5Z3ZlcnNpb25mMS43MC4wcmNyZWF0ZWRfYXNzZXJ0aW9uc4SiY3VybHgqc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5hY3Rpb25zLnYyZGhhc2hYIH1S9kzXQcUrkS7rAHUpldxcix6a66VKTtdxwmiMSP8nomN1cmx4KXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaGFzaC5kYXRhZGhhc2hYICm0QmJR6W5ESyz0iYareHWxWdhNAmQoZB08lB5D4NLUomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL3Rvb2xzLmxvbGx5LmV4cG9ydGRoYXNoWCCQAb3MLKCE8U4n9yJF4iazM231WBOqvX3NCWMryMr4RaJjdXJseChzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jYXdnLm1ldGFkYXRhZGhhc2hYINaJgZQDs03KdwGRYr0HNN63rHROUyGNeCXWwduuzqqyaXNpZ25hdHVyZXgZc2VsZiNqdW1iZj1jMnBhLnNpZ25hdHVyZWNhbGdmc2hhMjU2AAACdGp1bWIAAAAoanVtZGMyY3MAEQAQgAAAqgA4m3EDYzJwYS5zaWduYXR1cmUAAAACRGNib3LShFkB86IBJhghgVkB6jCCAeYwggGMoAMCAQICCUeeSePWsFEYzjAKBggqhkjOPQQDAjAjMQ4wDAYDVQQKDAVMb2xseTERMA8GA1UEAwwITG9sbHkgQ0EwHhcNMjYwNzI4MTQwODA1WhcNMjgxMDA1MTQwOTA1WjA0MQ4wDAYDVQQKDAVMb2xseTEiMCAGA1UEAwwZTG9sbHkgQ29udGVudCBDcmVkZW50aWFsczBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABPLqg2xQk8YvQBHssKVXE2yDwxH9eZKXBWaf10BBgxmg7WCSBcN6bMF07tn89bmGg1PJF02ob0CzTUKSLGdj9nOjgZcwgZQwCQYDVR0TBAIwADAOBgNVHQ8BAf8EBAMCB4AwEwYDVR0lBAwwCgYI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';

function logoSrc(key) {
  return key === 'grey' ? LOGO_GREY : LOGO_STANDARD;
}

// Colour palette, keyed off the logo selection. Standard keeps the brand
// greens/teals; Grey collapses every text and border colour to 50% grey
// (#808080) to match the grey wordmark for low-colour / mono contexts. Only
// text and borders are affected — images (headshot, promo, logo) are never
// recoloured, and the append block keeps its own muted styling.
function palette(logoKey) {
  if (logoKey === 'grey') {
    return { cText: '#808080', cMuted: '#808080', cAccent: '#808080', cBorder: '#808080', cSep: '#808080' };
  }
  return {
    cText:   '#0c322c',
    cMuted:  '#4b7a70',
    cAccent: '#30ba78',
    cBorder: 'rgba(12,50,44,0.1)',
    cSep:    'rgba(12,50,44,0.2)',
  };
}

// Custom links: the `links` blocks input, turned into a render-ready list.
//
// Only http(s), mailto and tel are allowed through. A signature is HTML that
// gets pasted into other people's mail, so `javascript:` / `data:` in an href
// would ride along as a live link — those rows are dropped, not sanitised into
// something half-working. A bare address ("calendar.suse.com/you", which is what
// people actually type) gets https:// so it doesn't resolve relative to whatever
// page the signature is being edited on.
var SAFE_SCHEME = /^(https?:|mailto:|tel:)/i;

function normaliseHref(raw) {
  var url = String(raw == null ? '' : raw).trim();
  if (!url) return '';
  if (SAFE_SCHEME.test(url)) return url;
  // A scheme we don't allow — including javascript:/data: — is refused outright.
  // Anything before a colon that looks like a scheme counts; "suse.com:8080/x"
  // does not (a port is digits).
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[a-z][a-z0-9+.-]*:\d/i.test(url)) return '';
  if (url.indexOf('@') > 0 && url.indexOf('/') === -1) return 'mailto:' + url;
  return 'https://' + url;
}

function linkList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.reduce(function (out, row) {
    if (!row) return out;
    var title = String(row.title == null ? '' : row.title).trim();
    var href  = normaliseHref(row.url);
    // Both halves are required: a title with no address isn't a link, and an
    // address with no title has nothing to render as.
    if (title && href) out.push({ title: title, href: href });
    return out;
  }, []);
}

// Raster inputs (headshot, promo) are shrunk client-side so the data URI we
// inline stays small enough to paste. Aspect is preserved; the image is
// flattened onto white (the signature background) and emitted as JPEG.
var PHOTO_MAX   = 100;  // headshot: square-ish cap on both axes
var PROMO_MAX_W = 400;  // promo banner box
var PROMO_MAX_H = 200;

function resizeImage(assetRef, maxW, maxH) {
  if (!assetRef || !assetRef.url) return Promise.resolve('');
  // Headless shells (CLI/Tauri) have no Image/canvas — skip the image-derived
  // bit gracefully so the rest of the patch (palette, logo, append) still lands.
  if (typeof document === 'undefined' || typeof Image === 'undefined' || !document.createElement) {
    return Promise.resolve('');
  }
  return new Promise(function(resolve) {
    var img = new Image();
    img.onload = function() {
      var w = img.naturalWidth;
      var h = img.naturalHeight;
      var scale = Math.min(1, maxW / w, maxH / h);
      var cw = Math.max(1, Math.round(w * scale));
      var ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement('canvas');
      canvas.width  = cw;
      canvas.height = ch;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      ctx.drawImage(img, 0, 0, cw, ch);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = function() { resolve(''); };
    img.src = assetRef.url;
  });
}

async function onInit({ model }) {
  var val = function(id) {
    var i = model.find(function(x) { return x.id === id; });
    return i ? i.value : null;
  };
  var logo = val('logo') || 'standard';
  return Object.assign({
    appendHtml: appendBlock(val('append') || 'none'),
    linkList:   linkList(val('links')),
    photoSrc:   await resizeImage(val('headshot'),   PHOTO_MAX, PHOTO_MAX),
    promoSrc:   await resizeImage(val('emailPromo'), PROMO_MAX_W, PROMO_MAX_H),
    logoSrc:    logoSrc(logo),
  }, palette(logo));
}

async function onInput({ id, value }) {
  if (id === 'links')      return { linkList: linkList(value) };
  if (id === 'append')     return { appendHtml: appendBlock(value) };
  if (id === 'headshot')   return { photoSrc: await resizeImage(value, PHOTO_MAX, PHOTO_MAX) };
  if (id === 'emailPromo') return { promoSrc: await resizeImage(value, PROMO_MAX_W, PROMO_MAX_H) };
  if (id === 'logo')       return Object.assign({ logoSrc: logoSrc(value) }, palette(value));
}

function appendBlock(key) {
  switch (key) {
    case 'germany':
      return '<p style="margin:0 0 3px 0;">SUSE Software Solutions Germany GmbH &bull; Maxfeldstr. 5 &bull; 90409 N&uuml;rnberg &bull; Germany</p>'
           + '<p style="margin:0;">Registergericht: Amtsgericht N&uuml;rnberg &bull; HRB 36994 &bull; Gesch&auml;ftsf&uuml;hrer: Andy Macdonald</p>';
    case 'business':
      return '<p style="margin:0;">This email and any attachments may be confidential and are intended solely for the use of the individual to whom it is addressed. '
           + 'If you are not the intended recipient, please notify the sender immediately and delete this message. '
           + 'Any unauthorised use, disclosure, or copying is strictly prohibited.</p>';
    case 'wellbeing':
      return '<p style="margin:0;">I am an advocate for wellbeing. I manage my working hours in a way that helps me support global teams, that works for my family and my own wellbeing. This means I sometimes choose to work at early/late hours.  If you are receiving this email at an unsociable hour, please only reply at a time that works for you.</p>';
    default:
      return '';
  }
}
