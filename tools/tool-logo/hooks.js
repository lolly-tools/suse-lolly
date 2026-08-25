/* global onInit, onInput */

/**
 * tool-logo - reference implementation of an auto-switching brand logo.
 *
 * It picks one of the catalog logo SVGs by background darkness + orientation +
 * ink, resolves it to an AssetRef via host.assets.get(), and hands the template
 * a ready-to-place <image> (href + geometry). The logo is the actual SVG asset
 * (not a font/ligature lockup), so it stays crisp and exports as vector.
 *
 * Reusing this in another org: keep the structure, swap the `suse/logo/...`
 * id prefix below for your own logo namespace (same hor/vert · neg/pos · ink
 * variant matrix). The naming convention: neg = for dark backgrounds.
 */

const VIEWBOX = 1200; // square canvas units - keep in sync with template viewBox

// WCAG relative luminance of a #hex colour (0 = black, 1 = white).
function relLuminance(hex) {
  const s = String(hex || '#000000').replace('#', '');
  const h = s.length === 3 ? s.replace(/(.)/g, '$1$1') : (s + '000000').slice(0, 6);
  const lin = (i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}

// Controls → canonical brand-logo VARIANT (orientation × treatment). treatment:
// primary = full-colour, mono = one-colour; the `-reverse` forms are for dark backgrounds.
function logoVariant(inputs) {
  const dark   = relLuminance(inputs.background) < 0.5;
  const orient = inputs.orientation === 'vertical' ? 'vertical' : 'horizontal';
  const treat  = inputs.ink === 'mono' ? (dark ? 'mono-reverse' : 'mono') : (dark ? 'primary-reverse' : 'primary');
  return `${orient}-${treat}`;
}

// SUSE catalog id for a variant - the fallback when a brand declares no asset.logo token.
// neg = dark bg, white/black = mono ink, green = full-colour.
function suseFallbackId(inputs) {
  const dark   = relLuminance(inputs.background) < 0.5;
  const orient = inputs.orientation === 'vertical' ? 'vert' : 'hor';
  const treat  = dark ? 'neg' : 'pos';
  const ink    = inputs.ink === 'mono' ? (dark ? 'white' : 'black') : 'green';
  return `suse/logo/${orient}-${treat}-${ink}`;
}

// Resolve the variant to a catalog asset id via the BRAND'S asset.logo.<variant> tokens,
// so this re-skins for any brand - not just SUSE. Falls back to the SUSE catalog id when the
// brand declares no such token (or host.tokens is absent), so nothing regresses.
async function logoId(inputs) {
  const variant = logoVariant(inputs);
  try {
    if (host.tokens && host.tokens.resolve) {
      const id = await host.tokens.resolve('{asset.logo.' + variant + '}');
      if (typeof id === 'string' && id && id.indexOf('{') !== 0) return id;
    }
  } catch (e) { /* fall through to the SUSE default */ }
  return suseFallbackId(inputs);
}

async function patch({ model }) {
  const inputs = Object.fromEntries(model.map(i => [i.id, i.value]));
  // Centred square clear-space box (fixed 12%); the <image>'s own preserveAspectRatio
  // keeps the logo's aspect inside it (a wide logo just sits in a band).
  const m = Math.round(VIEWBOX * 0.12);
  const out = { logoX: m, logoY: m, logoSize: VIEWBOX - 2 * m };

  const id = await logoId(inputs);
  try {
    out.logo = await host.assets.get(id);
  } catch (e) {
    host.log('warn', 'tool-logo: asset not found', { id, error: String(e) });
  }
  return out;
}

function onInit(ctx)  { return patch(ctx); }
function onInput(ctx) { return patch(ctx); }
