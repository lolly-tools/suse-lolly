/* global onInit, onInput */

/**
 * color-block hook.
 *
 * One job - compute per-block render data, all data-only (no DOM; the template's
 * controller owns layout). For each block it derives parallel arrays the
 * template applies by index:
 *
 *   - blockBg:   the block's own background colour, or the next SUSE palette
 *                colour if it set none (so a freshly-added block looks intentional).
 *   - blockFg:   the user's text-colour override, else black or white - whichever
 *                has the higher contrast on that background (white over a photo,
 *                since the image content is unknown).
 *   - blockLogo: for `logo` blocks only, the URL of the exact SUSE mark - picked
 *                from orientation (horizontal/stacked) × mono/green, flipping
 *                positive⇄negative so the mark always contrasts with the cell
 *                background. The logo is its own grid cell, never an overlay, so
 *                it can't break or sit on top of the grid.
 *   - blockScale: the block's effective --scale - logo blocks read "Logo size"
 *                (the share of the cell the mark fills); other kinds read the
 *                text "Text scale". One source so the template stays logic-less.
 *
 * Doing this here (not in the controller) means the colours and logo are correct
 * even where the layout JS can't run (CLI / first paint).
 */

// SUSE palette cycled for blocks that haven't picked a background.
const PALETTE = ['#0c322c', '#30ba78', '#ffffff', '#90ebcd', '#01564a'];
const INK_DARK = '#0c322c';   // the SUSE near-black used as "black"
const INK_LIGHT = '#ffffff';

function relLuminance(hex) {
  const s = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(s)) return null;
  const h = s.length === 3 ? s.replace(/(.)/g, '$1$1') : s;
  const lin = (i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
}

// WCAG contrast ratio between two luminances.
function contrast(l1, l2) {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// Black or white - whichever reads better on this background.
function inkFor(bgHex) {
  const l = relLuminance(bgHex);
  if (l === null) return INK_LIGHT;
  const dl = relLuminance(INK_DARK), ll = relLuminance(INK_LIGHT);
  return contrast(l, dl) >= contrast(l, ll) ? INK_DARK : INK_LIGHT;
}

// Every brand mark this tool can place: orientation × treatment, as CANONICAL variant keys,
// resolved from the brand's asset.logo.<variant> tokens so it re-skins for any brand.
const LOGO_VARIANTS = [
  'horizontal-mono-reverse', 'horizontal-mono', 'horizontal-primary-reverse', 'horizontal-primary',
  'vertical-mono-reverse',   'vertical-mono',   'vertical-primary-reverse',   'vertical-primary',
];

// SUSE catalog id for a variant - the fallback when a brand declares no asset.logo token.
// neg = reverse (dark bg), white/black = mono ink, green = full-colour (primary).
function suseIdForVariant(variant) {
  const dash = variant.indexOf('-');
  const orient = variant.slice(0, dash) === 'vertical' ? 'vert' : 'hor';
  const treatment = variant.slice(dash + 1);
  const pol = treatment.indexOf('reverse') >= 0 ? 'neg' : 'pos';
  const ink = treatment.indexOf('mono') === 0 ? (pol === 'neg' ? 'white' : 'black') : 'green';
  return 'suse/logo/' + orient + '-' + pol + '-' + ink;
}

// Resolve a variant to a catalog id via the brand's tokens, else the SUSE default.
async function resolveVariantId(variant) {
  try {
    if (host.tokens && host.tokens.resolve) {
      const id = await host.tokens.resolve('{asset.logo.' + variant + '}');
      if (typeof id === 'string' && id && id.indexOf('{') !== 0) return id;
    }
  } catch (e) { /* fall through to the SUSE default */ }
  return suseIdForVariant(variant);
}

// Module-scoped cache so the logo assets resolve once, not on every keystroke. Keyed by VARIANT.
let logoCache;
async function resolveLogos() {
  if (logoCache) return logoCache;
  logoCache = {};
  try {
    const ids = await Promise.all(LOGO_VARIANTS.map(resolveVariantId));
    const refs = await Promise.all(ids.map(id => host.assets.get(id).catch(() => null)));
    LOGO_VARIANTS.forEach((v, i) => { if (refs[i]) logoCache[v] = refs[i]; });
  } catch (e) {
    host.log('warn', 'color-block: logo assets unavailable', { error: String(e) });
  }
  return logoCache;
}

// The VARIANT for a logo block: orientation × treatment. Mono → white on dark / black on
// light; green (primary) stays full-colour but flips reverse⇄normal so it reads against the
// cell. An image background is treated as dark, since the photo's tone is unknown.
function logoVariantFor(block, bg) {
  const orient = block.logoOrient === 'stacked' ? 'vertical' : 'horizontal';
  const onDark = !!block.bgImage || inkFor(bg) === INK_LIGHT;
  if (block.logoColor === 'green') return orient + (onDark ? '-primary-reverse' : '-primary');
  return orient + (onDark ? '-mono-reverse' : '-mono');
}

// The block's effective `--scale`. Logo blocks read their own "Logo size"
// (logoSize) so it can't be confused with the text "Text scale"; every other
// kind reads `scale`. Falls back to the per-kind default when unset/invalid.
function scaleFor(block) {
  const raw = Number(block && (block.kind === 'logo' ? block.logoSize : block.scale));
  if (Number.isFinite(raw) && raw > 0) return raw;
  return block && block.kind === 'logo' ? 0.8 : 1;
}

function compute(blocks, logos) {
  const blockBg = [];
  const blockFg = [];
  const blockLogo = [];
  const blockScale = [];
  blocks.forEach((b, i) => {
    const hasImage = !!(b && b.bgImage);
    const bg = (b && String(b.bgColor || '').trim()) || PALETTE[i % PALETTE.length];
    const fg = (b && String(b.fgColor || '').trim()) || (hasImage ? INK_LIGHT : inkFor(bg));
    blockBg.push(bg);
    blockFg.push(fg);
    blockScale.push(scaleFor(b));
    if (b && b.kind === 'logo') {
      const ref = logos[logoVariantFor(b, bg)];
      blockLogo.push(ref ? (ref.url || '') : '');
    } else {
      blockLogo.push('');
    }
  });
  return { blockBg, blockFg, blockLogo, blockScale };
}

async function patch({ model }) {
  const blocksInput = model.find(i => i.id === 'blocks');
  const blocks = Array.isArray(blocksInput?.value) ? blocksInput.value : [];
  const logos = await resolveLogos();
  return compute(blocks, logos);
}

function onInit(ctx) { return patch(ctx); }

// Recompute only when the blocks themselves change - typing in another control
// leaves the colour / logo arrays intact.
function onInput(ctx) {
  if (ctx.id === 'blocks') return patch(ctx);
}
