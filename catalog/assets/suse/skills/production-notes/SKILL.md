---
name: suse-production-notes
description: SUSE production notes maintained by Lolly - PMS builds, tonal ramps, gradients, logo markup, voice and the house component rules for SUSE artwork. Read the SUSE brand standards (suse-brand) first; they are the official source and win wherever the two differ.
---

# SUSE production notes

Lolly maintains these notes. The SUSE brand team's [brand standards](suse/skill/brand) are the official source and win wherever the two differ.

SUSE's look is green, confident and open. Bright Jungle green carried on deep Pine, generous white space, one typeface family everywhere, and flat, crisp vector shapes. Warm and human, never corporate-stiff.

Canonical sources in the SUSE design system: the tokens asset `suse/tokens/brand` (DTCG), the credentialed logos in the `suse/logo/` family and the SUSE font files.

## Palette

### Core colours

| Name | Hex | CMYK | Spot (PMS) | Role |
|---|---|---|---|---|
| Pine | `#0c322c` | 65/0/35/85 | 627 C | The dark green. Text on light, background of dark surfaces |
| Jungle | `#30ba78` | 70/0/65/0 | 7479 C | The hero green. Primary accent, the geeko |
| Mint | `#90ebcd` | 40/0/30/0 | 565 C | Soft green. Secondary accent on dark |
| Persimmon | `#fe7c3f` | 0/60/80/0 | 1575 C | Warm accent. Use sparingly, for emphasis and energy |
| Midnight | `#192072` | 100/85/0/30 | 2756 C | Deep blue for depth and contrast |
| Waterhole | `#2453ff` | 90/50/0/0 | 285 C | Bright blue, links and info |
| Fog | `#efefef` | 0/0/0/7 | Cool Gray 1 | Light neutral surface |
| White | `#ffffff` | 0/0/0/0 | - | Primary light surface |
| Black | `#000000` | 0/0/0/100 | - | Text on Jungle |
| Ultra Black | `#050505` | 80/70/60/100 | - | Rich black for print-dark work |

The hex values are the canonical digital tokens; CMYK and Pantone are print references only, never a source to re-derive screen colours from. (One known source quirk: some print references list Fog as `rgb(247 247 247)` - ignore that, `#efefef` is canonical.)

Green leads. Most compositions are Jungle + Pine + White with Fog as the quiet neutral. Persimmon is the one warm note and it works best as a small dose, not a field. Midnight and Waterhole extend the range for data and depth.

### Colour combinations

These come from earlier SUSE guidance and remain brand-approved combinations - follow them unless there is a deliberate reason not to. Pine, Jungle, White and Fog are the workhorse backgrounds; prefer foregrounds from the table and treat unlisted pairings with suspicion. The table is also machine-readable: in `brand.json` each background token carries it as `$extensions["com.suse.lolly"].combinations`, with `text` and `graphic` foreground lists (graphics-only pairings appear in `graphic` but not `text`). A "graphics only" pairing may colour shapes, lines, icons and chart marks but never readable text - and words inside an SVG, chart or illustration still count as text.

| Background | Text + graphics | Graphics only |
|---|---|---|
| Pine | Mint, Persimmon, Jungle, Fog, White | - |
| Jungle | Pine, Midnight | Fog, White |
| White | Pine, Waterhole, Midnight | Jungle |
| Fog | Pine, Waterhole, Midnight | Jungle |

The one everyone gets wrong: **Jungle makes a poor text colour on White or Fog** (the contrast is genuinely low). On light surfaces Jungle is a background or a graphic accent; light-surface text is Pine, Waterhole or Midnight. Revalidate hover, focus, disabled and dark-mode states whenever either side changes, and don't trust opacity, gradients or overlays to preserve an approved pair - check the resulting effective colours.

In the app's semantic tokens this lands as: light surfaces run Pine text on White with Fog 7 `#dcdbdc` hairlines and Fog 4 `#6f6f6f` muted text; dark surfaces run White text on Pine with Jungle primary controls (Black foreground on them), Mint as the secondary accent, Fog 2 `#3e3e3e` hairlines and Fog 5 `#999999` muted text.

### Tonal ramps (1 = darkest, 8 = lightest)

| Ramp | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|---|---|---|---|---|---|---|---|---|
| Jungle | `#0c322c` | `#025937` | `#008657` | `#30ba78` | `#42d29f` | `#83e1be` | `#c0efde` | `#eafaf4` |
| Pine (teal) | `#0c322c` | `#01564a` | `#008878` | `#00bda7` | `#38d5b4` | `#90ebcd` | `#bff1ea` | `#eafaf8` |
| Persimmon | `#47190d` | `#8e2810` | `#bd3314` | `#ff5a2b` | `#fe7c3f` | `#ffb184` | `#ffd3bd` | `#ffefe9` |
| Blue | `#0a112b` | `#192072` | `#0b41b7` | `#2453ff` | `#3c8eef` | `#81aefc` | `#c8dafc` | `#e6edfe` |
| Fog | `#1d1d1d` | `#3e3e3e` | `#525252` | `#6f6f6f` | `#999999` | `#bababa` | `#dcdbdc` | `#efefef` |

Use ramp steps for tinted fills, charts and states instead of ad-hoc alpha over brand colours. Shades support the named colours, they never replace them: `#42d29f` is a Jungle-family shade, not Jungle. The combination policy above covers the named colours only, so when a shade sits behind text, validate the contrast yourself. (The historical brand docs call the teal ramp the Mint family and the blue ramp the Waterhole family; in the app tokens they live at `color.ramp.pine` and `color.ramp.blue`.)

### Infographics palette (charts and data viz only)

Teal `#00bda7`, Lime `#a1ef8b`, Sky `#7dc6e2`, Lilac `#e8c1f7`, Amethyst `#5d4f99`, Peach `#f9cabf`, Marigold `#fcb244`, Rust `#bd3314`. (The app tokens call this set `color.spectrum`.)

This secondary palette fills gaps in the colour wheel for infographics, charts and other data visualisations - and that is its whole job. Do not use it for primary situations (illustrations, icons, UI chrome) and never as a replacement for the primary colours or their shades. Even in a chart, don't crowd colours from many different spectrums into one composition.

### Gradients

Interpolate in OKLab/OKLCH, never linear RGB (linear RGB goes muddy in the middle). Good gradients run along one ramp (Jungle 2 to Jungle 5) or between the greens (Pine to Jungle). Keep the logo out of gradients entirely.

## Typography

One family, everywhere: **SUSE**, a sans serif hybrid of geometric and monospaced features, custom-built as a celebration of SUSE's open source roots (461 languages). Code and data readouts: **SUSE Mono**. Both are open source and on Google Fonts, and ship in this catalog as variable fonts (`SUSE[wght].ttf`, `SUSEMono[wght].ttf`, plus true italics) covering Thin 100 to ExtraBold 800.

```css
font-family: 'SUSE', system-ui, sans-serif;                       /* UI, body, headings */
font-family: 'SUSE Mono', 'Roboto Mono', ui-monospace, monospace; /* code, readouts */
```

If SUSE can't load, fall back to the platform faces. The old Verdana fallback rule is retired - keep Verdana out of SUSE stacks. Roboto Mono is a fine mono stand-in (it ships on Android) and Noto Sans covers Chinese, Japanese and Korean.

- **Headlines are set in Medium (500), never any other weight and never all caps.** Body runs Regular to Medium (400 to 500). Stay inside those weights in primary settings; the outer weights of the variable range are for expressive display work, not everyday layouts.
- **Text is left-aligned.** No centered or right-aligned formatting.
- Real italics exist for both families, use them rather than faux oblique.
- There is no secondary display face. Contrast comes from size, colour and spacing, not from mixing families or piling on weight.
- Inside Lolly, always reach for the tokens: `var(--font-brand)` and `var(--font-mono)`, so a branded profile's faces win.

## Logo

The mark is the geeko (chameleon) plus the SUSE wordmark. Variants in `catalog/assets/suse/logo/` follow the pattern `SUSE_logo-{hor|vert}-{pos|neg}-{green|white|black}.svg`:

- **pos-green** on light backgrounds: Pine wordmark, Jungle geeko. The default.
- **neg-white** on dark backgrounds (Pine, Ultra Black, photography): all white.
- **pos-black / neg-green** for one-colour contexts.

Rules: never recolour beyond these variants, never stretch, rotate, outline or add shadows or gradients, and give it generous clear space. Do not set the wordmark in the SUSE typeface as a substitute, the wordmark is drawn letterforms.

The two workhorse lockups are inlined below so generated content can embed them directly. These copies have the C2PA `<metadata>` blocks stripped for portability; the credentialed originals live in the catalog, so prefer those files when publishing final assets.

### Horizontal, positive, green (light backgrounds)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210.6 38.09"><path fill="#0c322c" d="M208.462 27.027h-13.555a1.9 1.9 0 0 1-1.896-1.896v-6.848h13.084a2.036 2.036 0 1 0 0-4.073H193.01V7.471c0-1.046.85-1.897 1.896-1.897h13.555a2.137 2.137 0 1 0 0-4.273h-13.555a6.177 6.177 0 0 0-6.17 6.17v17.66a6.177 6.177 0 0 0 6.17 6.17h13.555a2.136 2.136 0 1 0 0-4.274m-39.86-12.76c-2.866-.516-4.86-1.124-5.974-1.834q-1.675-1.063-1.675-2.873 0-1.944 1.719-3.19 1.72-1.244 4.844-1.245 3.167-.001 5.069 1.222 1.023.659 1.863 1.752a2.32 2.32 0 1 0 3.567-2.962 12 12 0 0 0-3.507-2.727Q171.588.917 167.47.917q-3.531 0-6.177 1.221-2.649 1.222-4.051 3.303a8.1 8.1 0 0 0-1.403 4.617q-.001 2.399 1.109 4.072 1.108 1.676 3.553 2.806 2.442 1.132 6.56 1.901 4.12.77 5.77 1.765 1.654.996 1.653 2.623.001 2.04-1.834 3.147-1.831 1.11-5.045 1.11-3.394 0-5.68-1.269a8.6 8.6 0 0 1-2.34-1.92c-.867-1.007-2.425-1.03-3.364-.09l-.008.01c-.86.857-.926 2.25-.115 3.154q3.874 4.323 11.552 4.322 3.53 0 6.224-1.064 2.691-1.062 4.184-3.053 1.495-1.992 1.495-4.618 0-2.442-1.086-4.094-1.086-1.651-3.463-2.76-2.375-1.109-6.403-1.834m-66.832.01q-4.299-.772-5.973-1.834-1.675-1.063-1.674-2.875 0-1.945 1.719-3.189t4.843-1.245q3.165 0 5.068 1.222 1.026.66 1.865 1.752a2.319 2.319 0 1 0 3.566-2.961 12 12 0 0 0-3.507-2.728q-2.92-1.493-7.038-1.493-3.53 0-6.176 1.221-2.649 1.222-4.051 3.305a8.1 8.1 0 0 0-1.403 4.615q-.001 2.4 1.109 4.072 1.11 1.677 3.552 2.807 2.444 1.132 6.562 1.901 4.117.77 5.77 1.765 1.651.995 1.652 2.624 0 2.037-1.832 3.145-1.835 1.11-5.046 1.11-3.396 0-5.681-1.269a8.6 8.6 0 0 1-2.337-1.919c-.868-1.008-2.427-1.03-3.368-.09l-.007.008c-.86.858-.926 2.251-.115 3.155q3.873 4.323 11.553 4.322 3.53 0 6.222-1.063t4.186-3.055q1.493-1.99 1.493-4.616 0-2.443-1.086-4.095t-3.463-2.76q-2.374-1.11-6.403-1.833M146.343 3.36v16.428q0 5.882-3.122 8.892-3.123 3.01-9.095 3.01-5.976 0-9.098-3.01-3.121-3.01-3.121-8.892V3.36a2.444 2.444 0 0 1 4.887 0V19.2q0 4.254 1.787 6.267t5.545 2.014q3.755 0 5.542-2.014 1.788-2.012 1.788-6.268V3.36a2.443 2.443 0 0 1 4.887 0"/><path fill="#30ba78" d="M71.408 13.461a1.24 1.24 0 0 1-1.353 0 1.232 1.232 0 0 1-.192-1.896 1.206 1.206 0 0 1 1.737 0c.535.533.47 1.455-.192 1.896m1.936-2.687c.772 3.284-2.18 6.237-5.464 5.465a4.58 4.58 0 0 1-3.392-3.39c-.77-3.282 2.18-6.233 5.464-5.464a4.58 4.58 0 0 1 3.392 3.39m-22.112 17.66c.375.54.687 1.06.862 1.581.124.37.283.858.648 1.054q.029.017.06.027c.67.244 2.393.203 2.393.203h3.169c.27.004 2.652-.003 2.592-.269-.287-1.273-1.76-1.5-2.88-2.167-1.033-.616-2.013-1.314-2.457-2.515-.232-.62-.095-2.05.304-2.57a2.04 2.04 0 0 1 1.18-.729c.512-.109 1.042-.015 1.553.037.63.064 1.252.178 1.88.256 1.212.158 2.436.221 3.658.188 2.017-.056 4.039-.377 5.95-1.029 1.336-.448 2.65-1.054 3.786-1.897 1.29-.959.95-.869-.357-.735-1.566.16-3.146.184-4.717.091-1.466-.085-2.912-.258-4.238-.939-1.044-.539-1.941-1.079-2.77-1.914-.123-.126-.2-.494.027-.729.22-.228.686-.096.829.026 1.444 1.207 3.598 2.201 5.828 2.31 1.206.06 2.379.081 3.586.03.603-.029 1.513-.025 2.118-.03.312-.005 1.163.085 1.322-.246.048-.096.044-.207.04-.315-.177-4.826-.534-10.269-5.584-12.576C66.246 3.856 60.597 1.187 58.21.08c-.553-.263-1.2.153-1.2.77 0 1.611.082 3.927.083 6.035-1.143-1.164-3.068-1.899-4.535-2.573a43 43 0 0 0-5.136-1.957C43.9 1.265 40.253.592 36.587.228a41.5 41.5 0 0 0-12.483.63C17.36 2.256 10.73 5.5 5.699 10.242 2.609 13.152.186 17.29.022 21.488c-.234 5.943 1.43 9.134 4.49 12.423 4.88 5.242 15.384 5.976 19.638-.24 1.914-2.798 2.329-6.593.94-9.686-1.39-3.09-4.582-5.325-7.967-5.439-2.627-.087-5.426 1.25-6.433 3.678-.768 1.855-.331 4.147 1.068 5.587.545.562 1.283 1.022 2.089.842.475-.106.872-.463.944-.945.106-.71-.516-1.172-.9-1.718-.69-.985-.55-2.464.315-3.3.73-.708 1.81-.917 2.827-.914.946.002 1.913.171 2.729.648 1.147.675 1.909 1.911 2.173 3.217.787 3.903-2.386 7.074-6.688 7.323-2.201.13-4.441-.448-6.16-1.83-4.35-3.5-5.416-10.655-.443-14.474 4.72-3.625 10.68-2.69 14.195-.807 2.812 1.507 4.908 3.973 6.496 6.7.797 1.37 1.476 2.803 2.106 4.258.606 1.4 1.173 2.81 2.386 3.834.803.68 1.794.656 2.846.656h6.005c.816 0 .617-.544.265-.904-.796-.814-1.94-.998-3-1.289-2.42-.666-2.173-3.87-1.503-3.87 2.164 0 2.232.064 4.128.04 2.736-.038 3.564-.197 5.704.594 1.144.424 2.243 1.542 2.96 2.564"/></svg>
```

### Horizontal, negative, white (dark backgrounds)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 210.179 37.666"><path fill="#fff" d="M194.698 30.871a5.964 5.964 0 0 1-5.958-5.957V7.255a5.966 5.966 0 0 1 5.958-5.959h13.555c1.062 0 1.926.864 1.926 1.925a1.927 1.927 0 0 1-1.926 1.924h-13.555a2.11 2.11 0 0 0-2.107 2.11v6.95h13.294c1.006 0 1.824.819 1.824 1.825a1.826 1.826 0 0 1-1.824 1.824h-13.294v7.06c0 1.163.945 2.107 2.107 2.107h13.555c1.062 0 1.926.865 1.926 1.926a1.926 1.926 0 0 1-1.926 1.924zm-60.782.389c-3.909 0-6.92-.992-8.95-2.95-2.028-1.954-3.056-4.894-3.056-8.739V3.143c0-1.231 1-2.232 2.23-2.232a2.234 2.234 0 0 1 2.232 2.232v15.839c0 2.877.62 5.034 1.843 6.408 1.229 1.384 3.146 2.085 5.701 2.085 2.553 0 4.472-.701 5.701-2.085 1.222-1.375 1.841-3.531 1.841-6.408V3.143a2.235 2.235 0 0 1 2.233-2.232 2.234 2.234 0 0 1 2.232 2.232v16.428c0 3.843-1.03 6.783-3.059 8.739-2.03 1.958-5.039 2.95-8.948 2.95m33.526 0c-5.033 0-8.868-1.43-11.394-4.25-.731-.816-.685-2.075.106-2.865l.008-.009.008-.008a2.1 2.1 0 0 1 1.499-.616c.599 0 1.163.255 1.55.703a8.8 8.8 0 0 0 2.396 1.966c1.547.859 3.493 1.294 5.783 1.294 2.173 0 3.907-.383 5.154-1.14 1.284-.776 1.936-1.895 1.936-3.327 0-1.158-.59-2.103-1.754-2.805-1.132-.681-3.042-1.266-5.84-1.791-2.718-.507-4.909-1.141-6.513-1.885-1.586-.734-2.751-1.651-3.464-2.731-.713-1.072-1.074-2.403-1.074-3.956 0-1.639.46-3.153 1.367-4.498.909-1.348 2.242-2.435 3.963-3.229 1.73-.798 3.778-1.202 6.088-1.202 2.7 0 5.034.494 6.941 1.47a11.9 11.9 0 0 1 3.448 2.68c.77.861.698 2.194-.163 2.971a2.105 2.105 0 0 1-3.08-.28c-.572-.744-1.216-1.35-1.917-1.8-1.296-.833-3.039-1.255-5.183-1.255-2.116 0-3.787.432-4.966 1.284-1.199.867-1.808 1.999-1.808 3.362 0 1.279.596 2.306 1.773 3.052 1.143.727 3.122 1.337 6.049 1.863 2.656.477 4.792 1.089 6.35 1.816 1.54.717 2.677 1.621 3.377 2.686.697 1.061 1.05 2.399 1.05 3.977 0 1.696-.488 3.207-1.45 4.491-.97 1.291-2.348 2.295-4.093 2.984-1.762.695-3.829 1.048-6.147 1.048m-66.83.008c-5.035 0-8.868-1.431-11.395-4.251-.731-.815-.684-2.074.106-2.865l.012-.012c.402-.4.936-.62 1.504-.62.6 0 1.165.256 1.549.703a8.8 8.8 0 0 0 2.395 1.966c1.548.86 3.494 1.295 5.784 1.295 2.172 0 3.906-.383 5.155-1.14 1.284-.776 1.935-1.895 1.935-3.326 0-1.16-.591-2.103-1.754-2.805-1.133-.683-3.044-1.269-5.841-1.794-2.717-.506-4.908-1.141-6.513-1.883-1.585-.735-2.752-1.654-3.464-2.731-.712-1.073-1.073-2.404-1.073-3.956 0-1.64.46-3.152 1.366-4.497.909-1.35 2.243-2.436 3.964-3.23C96.07 1.325 98.118.92 100.43.92c2.7 0 5.036.495 6.94 1.47a11.9 11.9 0 0 1 3.447 2.68 2.106 2.106 0 0 1-1.571 3.511 2.1 2.1 0 0 1-1.67-.82 7.7 7.7 0 0 0-1.917-1.801c-1.297-.834-3.04-1.256-5.183-1.256-2.117 0-3.787.433-4.968 1.285-1.198.87-1.806 2.001-1.806 3.362 0 1.279.596 2.306 1.772 3.053 1.144.727 3.122 1.336 6.051 1.863 2.653.475 4.79 1.086 6.351 1.815 1.54.72 2.674 1.624 3.374 2.685.698 1.06 1.052 2.398 1.052 3.979 0 1.697-.488 3.207-1.452 4.489-.97 1.292-2.347 2.297-4.094 2.986-1.761.695-3.828 1.047-6.144 1.047M70.967 11.386a1.165 1.165 0 0 0-1.677 0 1.19 1.19 0 0 0 .186 1.83c.39.259.913.259 1.305 0a1.192 1.192 0 0 0 .186-1.83m-1.554-4.188c-3.283-.768-6.232 2.181-5.463 5.463a4.58 4.58 0 0 0 3.392 3.392c3.284.772 6.236-2.182 5.463-5.465a4.58 4.58 0 0 0-3.392-3.39M14.598 37.666c-3.895.001-7.78-1.576-10.141-4.111-2.913-3.13-4.671-6.274-4.436-12.271.148-3.779 2.246-7.929 5.613-11.099C10.489 5.607 16.99 2.294 23.937.853a41 41 0 0 1 8.245-.834c1.385 0 2.789.07 4.172.208 3.862.384 7.493 1.097 10.795 2.12a42 42 0 0 1 5.11 1.947q.339.154.703.315c1.327.588 2.828 1.254 3.769 2.212l.363.37-.001-.519c0-1.121-.022-2.279-.044-3.401-.018-.967-.036-1.88-.036-2.634 0-.393.329-.637.636-.637q.136 0 .261.059c.766.356 1.868.873 3.135 1.466 2.722 1.277 6.11 2.865 8.67 4.035 2.206 1.008 3.681 2.715 4.505 5.217.719 2.178.862 4.637.955 7.175.003.084.006.164-.018.211-.012.026-.094.137-.674.137a10 10 0 0 1-.431-.009l-.031.001-.517.004c-.541.003-1.155.006-1.606.024-.46.021-.92.032-1.406.032-.662 0-1.369-.02-2.161-.06-1.995-.098-4.127-.943-5.703-2.261-.138-.117-.394-.198-.62-.198a.66.66 0 0 0-.496.189c-.313.322-.224.822-.026 1.024.836.843 1.734 1.391 2.824 1.954 1.293.665 2.664.864 4.322.961.618.036 1.238.055 1.844.055.985 0 1.964-.049 2.908-.147l.233-.024c.208-.022.386-.04.526-.05q-.186.158-.552.43c-1.001.743-2.254 1.372-3.725 1.866-1.815.618-3.796.96-5.889 1.019q-.309.007-.619.007c-.994 0-2.006-.065-3.007-.194a37 37 0 0 1-.776-.11c-.361-.053-.736-.109-1.11-.148q-.13-.013-.26-.029a7 7 0 0 0-.793-.059c-.206 0-.391.018-.563.055a2.24 2.24 0 0 0-1.304.805c-.458.599-.582 2.118-.337 2.775.485 1.309 1.57 2.04 2.549 2.624.317.189.66.341.99.491.816.365 1.526.683 1.757 1.414-.304.079-1.216.136-2.226.136h-3.295c-.005 0-.113.002-.286.002-.956 0-1.698-.07-2.034-.191l-.011-.005-.019-.009c-.288-.155-.429-.579-.544-.92l-.005-.017c-.162-.479-.436-.983-.891-1.635-.894-1.275-2.038-2.262-3.06-2.64-1.477-.547-2.359-.647-3.563-.647-.346 0-.717.008-1.146.019-.324.006-.678.014-1.071.02-.304.003-.561.005-.788.005-.525 0-.875-.009-1.28-.019-.492-.011-1.05-.026-2.058-.026-.324 0-.564.348-.642.932-.146 1.077.291 2.858 2.09 3.353q.245.068.493.13c.875.225 1.779.456 2.412 1.104.207.211.266.396.24.455-.012.031-.103.089-.353.089h-6.219c-1.042 0-1.832-.043-2.494-.605-1.115-.94-1.66-2.204-2.237-3.54l-.093-.217c-.741-1.712-1.415-3.072-2.118-4.281-1.827-3.137-4.04-5.419-6.578-6.779-2.001-1.072-4.492-1.688-6.833-1.688-2.825 0-5.45.869-7.59 2.514-2.151 1.649-3.351 4.054-3.381 6.77-.034 3.034 1.429 6.113 3.819 8.036 1.519 1.221 3.538 1.895 5.688 1.895q.308 0 .618-.019c2.403-.14 4.516-1.169 5.793-2.827 1.046-1.357 1.433-3.044 1.089-4.749-.29-1.436-1.14-2.691-2.273-3.357-.765-.448-1.719-.677-2.837-.678h-.018c-1.294 0-2.289.327-2.957.973-.934.906-1.086 2.509-.338 3.575.099.143.215.279.326.41.323.383.601.715.535 1.155-.055.369-.368.677-.779.768a1.4 1.4 0 0 1-.313.036c-.651 0-1.218-.444-1.579-.817-1.339-1.38-1.76-3.583-1.023-5.359 1.016-2.454 3.744-3.552 5.996-3.552q.117 0 .233.003c3.275.112 6.403 2.248 7.782 5.316 1.34 2.982.977 6.704-.923 9.48-1.881 2.748-5.222 4.326-9.165 4.326m57.07-26.042a3.299 3.299 0 1 1-6.599 0 3.299 3.299 0 1 1 6.599 0"/></svg>
```

## Voice

Warm, direct and human. Short sentences, plain words, no corporate compounds or marketing stiffness. Confidence comes from clarity, not superlatives.

- Use a plain hyphen `-` as the dash, never an em-dash. Unspaced en-dashes stay only in numeric ranges (`0–1`, `A–Z`).
- No Oxford comma: `A, B and C`.

## Component rules

House rules that apply to any SUSE-branded UI or layout, learned the hard way. These sit on top of the palette and type above.

1. **Never put an accent-coloured border on a rounded shape.** Not a one-sided stripe (`border-left: 3px solid green` on a rounded card) and not a full coloured outline (a green or orange 1px ring around a rounded pill or card). Both read as templated AI output. Carry the accent with a **tinted background fill** from the ramps (Jungle 7/8, Persimmon 7/8) and/or a soft shadow instead. If an edge is genuinely needed for definition, use a neutral hairline (Fog 7 light, Fog 2 dark), uniform on all sides. A transient accent border on `:hover`/`:focus` is fine, the tell is the resting state. A tab underline on a non-rounded nav link is fine.
2. **A dashed border means "you can drop something here" and nothing else.** Never use dashed for empty, invalid, optional or unreachable states. For an unreachable range, use the colour at ~13% opacity; for invalid input, use colour and messaging, not a border style.
3. **Cards differentiate by fill and elevation, not by outline.** Neutral uniform border or none at all; state and hierarchy come from background tint, shadow, an icon or a badge.
4. **Vector first.** Previews, illustrations and diagrams are SVG (or animated HTML) whenever physically possible. Raster is an export format, not a design surface. Every standalone SVG carries explicit `width`/`height` attributes alongside its `viewBox`.
