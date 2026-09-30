# SUSE icon illustration conformance spec

Version 1.1, 29 September 2026. A working specification inferred from the stored SUSE catalog, for agents drawing additions to that family. This is a generation and review contract, not a claim that every historical asset follows every rule.

## Authority and scope

Use the actual vectors in [catalog/assets/suse/icons](catalog/assets/suse/icons/) as the primary geometry reference. Use [icon-themes.json](catalog/assets/suse/palette/icon-themes.json) for the two color roles and [suse-brand-skill.md](suse-brand-skill.md) for wider brand guidance. The supplied guideline screenshots are supporting explanations. Their orange annotation circles are not artwork and must never be reproduced as decoration.

The baseline inspected before the approved additions contained 122 SVGs: 112 square icon compositions and 10 wide `infinity-stream-*` patterns. The patterns are outside this specification's pictorial scope. Of the square compositions, 91 use `viewBox="0 0 40 40"`; the others use different coordinate scales. Compare those at equivalent rendered size before measuring line weight. Across all 122 files, 22 contain exactly two paths, the median is four paths and the range is two to nineteen. Two paths is an economical delivery target, not the historical definition of the style.

Every file declares `.c1{fill:#30ba78}.c2{fill:#0c322c}`. Six also contain explicit Fog fills: `can`, `config`, `controls`, `grid`, `regulation` and `train`. Those are legacy exceptions to the two-color contract requested for new work. Do not introduce a third paint or a background-colored patch in new icons.

## Review refinement: recognition comes first

The first review established that mechanically opening outlines can weaken the metaphor. Keep the camera housing and main lens closed, join a magnet's pole caps to its horseshoe, connect hourglass sides to their rims and preserve the continuity of a paperclip. An anchor should use a full circular eye with centered, mirrored arms. A chair benefits from a clear side profile; umbrella ribs should run confidently from crown to canopy folds.

Treat these decisions as binding guidance for subsequent generations. Gaps are a compositional device used where needed, not a quota. A visible join, closed contour or symmetric construction is preferable to a broken silhouette when recognition depends on continuity. The battery and loudspeaker from the first review were accepted as useful examples of restrained openings.

## Visual character

Draw a flat, open, constructed emblem. Most of the image is empty space bounded by bands of even thickness. The character comes from long straight runs, broad controlled bends, square-cut ends, repeated parallel lines and occasional angular facets. The result can feel architectural or Art Deco: that is a useful visual analogy, not a requirement to add ornament or a historical attribution.

The distinctive contrast is between a smooth large curve and a crisp change of direction elsewhere. `bug` pairs rounded shoulders with square legs and diagonal feet. `lightbulb` pairs a circular crown with faceted shoulders and base. `flame`, `chilli` and `linux` simplify organic subjects into angular silhouettes with selected curved transitions. `cloud-computing` makes a cloud from straight plateaus and broad rounded shoulders. Avoid turning every bend into the same small rounded corner.

## Construction rules

| Property | Default for new work | Deliberate exception |
|---|---|---|
| Artboard | `40 × 40`, square, transparent | Use another scale only for a documented delivery need; preserve normalized proportions |
| Working grid | 1-unit coordinates, with 2-unit spacing as the main rhythm | Fractions for curve handles, diagonal offsets and optical corrections |
| Nominal band width | 2 units, equivalent to 5% of the artboard | Small optical corrections at tight joins; no independent thin-detail weight |
| Extent | Start with roughly 32 to 36 units on the longest axis | A narrow object can be taller; a broad object can be shorter. Adjust perceived scale beside catalog references |
| Padding | Start with 2 to 4 units from the visible outline to each relevant edge | Unequal padding for visual balance; no clipping or geometry outside the viewBox |
| Directions | Horizontal, vertical and 45-degree diagonals | Other angles when essential to the object's silhouette, as in `vision` and `energy` |
| Curve construction | Tangent circular or near-circular bends; straight runs between broad shoulders | Shaped cubic curves for organic subjects or concave transitions |
| Endings | Flat cuts perpendicular to the line direction | A pointed corner belonging to the object, such as an arrow or facet |
| Inter-element clearance | Begin near 1 unit only where separate or overlapping parts need separation | Enlarge toward 2 units if a crossing is dense. Connect structural anatomy without gaps |
| Repeated marks | Same thickness and interval, usually 2 or 3 parallel marks | Vary length to communicate level, flow or hierarchy |

The numerical grid, padding and clearance defaults are recommended construction targets inferred from the family, not an official universal grid recovered from all files. The old set has fractional coordinates, varied extents and occasional out-of-artboard geometry. Preserve the visual discipline, not old export defects.

### Weight, terminals and joins

1. Keep horizontal, vertical, diagonal and curved bands optically equal. A diagonal has a 2-unit perpendicular thickness, not a 2-unit horizontal offset. At 45 degrees that involves offsets near 1.414 in an expanded outline.
2. Use square corners for rectilinear structures and intentional facets. Curved geometry must be drawn as geometry, rather than obtained by making all stroke joins round.
3. During construction, a 2-unit stroke with `stroke-linecap="butt"` and `stroke-linejoin="miter"` is useful. Expand that stroke to filled outlines for delivery. In SVG, `butt` gives a flat terminal at the chosen endpoint; `square` also has a flat end but extends beyond the endpoint by half the weight.
4. Inspect acute miters. Cut back a spike or alter the angle when the corner becomes heavier than the rest of the illustration.
5. Small squares and short bars are allowed as indicators, nodes and line endings. Avoid large filled pictorial areas. A filled SVG path describing a hollow outline is correct; a solid filled battery body is not.

### Curves and facets

Use as few curve segments as recognition permits. A rounded shoulder should leave a vertical or horizontal run tangentially and settle onto another deliberate run. In `cloud-computing`, several outer shoulders have a radius near 6 units and an inner radius near 4, preserving the 2-unit band. Treat those as examples, not a mandatory radius for every subject.

Use nested curves to echo the parallel-line rhythm. Match their centers or construct proper offsets so the gap stays steady. Where a contour changes from a curve to a facet, make the transition intentional and legible. Do not approximate a natural arc with many short polygon edges or add bevels and highlights to imply volume.

### Open contours and overlaps

Open a complex outer contour only where another part takes visual priority or where a small interruption demonstrably improves legibility. `cloud-computing` leaves space around the server stack; `education` and `collection` interrupt outlines at overlaps; `run-sap-solutions` opens the gear beside the repeated bars. Empty space should separate the parts without requiring a painted eraser.

An open visual contour is different from an unclosed SVG subpath. Expanded outline bands will normally have closed subpaths ending in `Z`, even when their visible centerline is open.

Do not cut every shape arbitrarily. Small lenses, poles, nodes and structural frames can close. A chair leg should still connect to its seat; an anchor's arms should connect to its shank. At a true overlap, interrupt the subordinate contour with actual transparency only if the crossing becomes confusing. Start with about half a band width of visible clearance from the foreground edge and increase only as needed. Do not let unrelated bands fuse into a dense knot.

### Composition and asymmetry

Use one immediately recognizable primary metaphor and the minimum secondary detail needed to identify the subject. Balance the visible ink, including its color weight, rather than simply centering its bounding box.

Asymmetry can come from a side attachment, offset secondary object, unequal line lengths, an open contour or an unequal allocation of the two colors. The catalog's `phone`, `calendar`, `vision` and `developer-optimization` provide useful examples. Do not add a dot, circle, sparkle or extra object just to manufacture asymmetry.

Symmetry is permitted where it is intrinsic to the subject. `bug`, `automotive`, `combined` and `data-center` provide evidence. An anchor, horseshoe magnet, front-facing chair or hourglass can remain substantially symmetric. Record the reason and assess the whole composition rather than enforcing asymmetry as a geometric test.

### Flatness and detail

Use a front view or a clear flat side profile. Do not add perspective, isometric extrusions, cast shadows, highlights, gradients, lighting or texture. The old `boxes`, `retail` and `database` drawings contain depth cues, but these are not a reason to add new three-dimensional icons against the supplied guidance.

Preserve generous counters. Prefer three readable bars to seven crowded ones. Do not place labels, tiny lettering or simulated texture inside a pictogram. A camera needs its housing and lens; it does not need every control on a real camera.

## Two-color contract

Use exactly two opaque foreground paints per new icon. The default catalog pairing is:

| Role | Class | Default | Typical use |
|---|---|---|---|
| Accent | `c1` | Jungle `#30ba78` | Functional detail, secondary component, signal or a meaningful section of the silhouette |
| Base | `c2` | Pine `#0c322c` | Main structure or counterweight |

Allocate colors to meaningful geometry, not alternating segments or arbitrary left/right halves. The accent can carry a large component, such as the cloud in `cloud-computing`; no fixed area ratio is supported by the set. Both roles must remain visibly present at 40 px.

Keep the roles stable under recoloring. Use the complete pair from `icon-themes.json` rather than independently choosing two attractive swatches. The default review colors are Jungle and Pine; Waterhole uses `#2453ff` / `#192072`; Paper uses `#ffffff` / `#efefef` on Pine. Other stored themes are available when their intended background is suitable. A theme's existence does not guarantee visibility on every surface.

Transparency is empty space, not a third paint. White or Fog patches, opacity tricks, blend modes, gradient transitions and bitmap fragments violate this new-work contract. Do not count antialiased edge pixels as authored additional colors.

## SVG delivery

Deliver one self-contained SVG per metaphor, with explicit `width="40"`, `height="40"` and `viewBox="0 0 40 40"`. Use the catalog's class convention:

```xml
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
  <title>Subject</title>
  <defs><style>.c1{fill:#30ba78}.c2{fill:#0c322c}</style></defs>
  <path class="c1" d="..."/>
  <path class="c2" d="..."/>
</svg>
```

Prefer one compound path per role, with disconnected components as subpaths. Union intersecting geometry within a role where necessary; preserve holes and correct winding. Do not blindly concatenate overlapping even-odd paths, which can create unwanted holes. More than two paths is acceptable if needed for accurate geometry or deliberate paint order; explain the exception. Exactly two colors remains mandatory.

Expand strokes, bake transforms and remove editor state before delivery. Retain useful title/description text. Do not include scripts, external links, embedded raster images, font dependencies, filters, clipping masks or background rectangles. Any review grid belongs to the review page, never the asset.

Do not copy an existing asset's C2PA manifest into a new file. Drafts identify themselves as review candidates. Credentials, catalog IDs and registry entries are separate publication work after selection. Existing permanent IDs must not be reused for a different metaphor.

## Agent workflow and acceptance

1. Inventory existing names and look at the actual artwork. Check for equivalent metaphors under unexpected names: the set already has a clapperboard under `video`, a key inside `trust` and a notification bell under `warning`.
2. Pick three nearby references: one for silhouette, one for curves and one for the handling of gaps or color. State their filenames. Do not use only generic icon-library conventions or the screenshot colors.
3. Sketch the centerline geometry on a 40-unit artboard. State the intended metaphor, color allocation and any deliberate exception to the grid or symmetry preference.
4. Compare at the same display size beside stored icons. Resolve the silhouette first, then line rhythm, curve shape, gaps and optical centering. Remove details that need an explanation to read.
5. Expand to filled paths and compare the result with the construction source. Check counters, acute corners and subpath winding after simplification.
6. Render at 160, 40 and 24 px. At 40 px, all essential gaps and both colors must survive. At 24 px, the metaphor should remain recognizable; this does not turn the illustration into a separately optimized UI glyph. Simplify if detail collapses.
7. Inspect on White and Fog, plus Paper on Pine. Test both color roles independently. An icon must not depend on a background-colored patch or inherited paint.
8. Validate the SVG as XML: two visible paints, expected class mapping, no unsupported dependencies, no clipping, explicit dimensions and preferably two paths. Automated validation cannot approve visual likeness.
9. Deliver individual SVGs, a labeled overview, same-size reference comparisons and brief exception notes. Keep proposals outside the live catalog while they are under review.

Reject a draft with rounded pill-like ends, inconsistent line weight, crowded counters, arbitrary decoration, filled pictorial masses, accidental tangencies, forced perspective or three authored colors. A technically valid two-path file can still fail the style review.

### Reusable generation brief

> Draw [metaphor] as a SUSE catalog icon. Inspect [three catalog filenames] first and follow this conformance spec. Use a transparent 40 × 40 artboard, nominal 2-unit bands, flat square-cut terminals, deliberate straight runs, broad tangent curves and selective facets. Keep essential silhouettes continuous. Use small contour breaks only where competing parts need separation, with parallel lines where they serve the subject. Keep the view flat and the silhouette simple. Use exactly two opaque roles: `c1` Jungle #30ba78 and `c2` Pine #0c322c. Prefer two expanded compound paths. Explain intentional departures from the suggested grid or asymmetry preference. Deliver the SVG plus a 40 px comparison against the named references. Do not add the screenshot's orange annotation circles.
