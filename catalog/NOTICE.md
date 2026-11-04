# NOTICE - catalog/

`catalog/` mixes three distinct licensing regimes. The `lolly` monorepo's
MPL-2.0 license does **not** apply uniformly here.

## 1. `catalog/assets/` - proprietary

SUSE brand assets and trademarks (logos, icons, brand palettes/tokens).
**Proprietary to SUSE - all rights reserved.** NOT licensed under MPL-2.0.
This private repository is the home the open-sourcing plan reserved for them
(see the `lolly` monorepo's `README.md` "Open-sourcing plan" and
`SOVEREIGNTY.md`).

Photos, campaign images, executive portraits, backgrounds and illustrations
were removed from the bundled catalog on 2026-10-06. The configured Brandfolder
connector supplies those assets under their own source records and terms.
Logos and dynamic icons remain in this pack.

**`catalog/assets/suse/music/` (removed 2026-08-29):** the PremiumBeat
(Shutterstock) stock-music tracks that used to live here have been deleted from
this repository and dropped from `catalog/assets/index.json`. No
PremiumBeat-licensed audio ships in any Lolly pack or catalog. (These tracks were
once in the public `lolly-suse-catalog` repo; that repo still needs to be
archived/scrubbed of them.)

**`catalog/assets/lolly/loops/`, `modules/` and `songs/` (removed 2026-11-04):**
the public-domain and CC0 focus music (lo-fi loops, tracker modules and ZzFXM
songs) is no longer bundled with the SUSE pack, so the pack carries no audio at
all. The same tracks remain in Lolly's own `lolly-start` and `lolly-demo`
catalogs. On lolly.ing, music beds come from the Brandfolder connector or from
a person's own uploads.

## 2. `catalog/fonts/` - SIL OFL 1.1

The SUSE and SUSE Mono typefaces are licensed under the **SIL Open Font License,
Version 1.1**. The full license text is in `catalog/fonts/OFL.txt`. Note that
"SUSE" is a trademark of SUSE; the OFL covers the font software, not the mark.

The pack ships the static TrueType faces (`ttf/`, used for text outlines and
headless rendering), the variable faces (`variable/`) and the web fonts
(`webfonts/`). The OpenType copies of the same static faces were removed on
2026-11-04; desktop installers are on Brandfolder ("SUSE Font" and "SUSE
monospace font").

## 3. `catalog/tools/index.json` - generated registry (MPL-2.0)

A generated registry derived from the active profile's tool manifests by the
monorepo's `scripts/build-catalog-index.ts`. As generated build output of the
open-source toolchain, it is covered by **MPL-2.0**. (The underlying `tools/`
content it indexes remains proprietary - see `tools/NOTICE.md`.)
