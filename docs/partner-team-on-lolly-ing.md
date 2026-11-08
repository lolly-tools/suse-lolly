# The partner team on lolly.ing

A starting point for SUSE's partner team on lolly.ing, the preview instance that runs Lolly Work with the SUSE pack.
It gives what the public guide cannot: the example programme's names and ids, which pieces lolly.ing runs today,
how admins act on it, who holds the example token, and how to take the example down again. Everything else is in
the public reference, [Partner programmes](https://lolly.ing/info/manage/partner-programmes) (also on
[lolly.tools](https://lolly.tools/info/manage/partner-programmes.html)).

lolly.ing is a preview, not SUSE's production instance. Keep real partner names, logos, addresses and contact
details off it until the team decides otherwise.

## The example programme

Everything in the example is fictional. Every name starts with "Example:" and every id with `example-`.

| What | Id | Notes |
|---|---|---|
| Programme | `example-resellers` | "Example: Resellers". Tools: Badges, Partner Lockup, Design, Pricing, Logo Wall, Certificate. Owning team: none yet (`-`). Its group is `programme-example-resellers` |
| Company | `example-northwind` | "Example: Northwind IT". Profile with a `.example` website and address, so nothing reaches a real person. Its group is `company-example-northwind` |
| Logos | `inst/AuF4QqG1lOo` (light), `inst/Tb1tq6YA3Jo` (dark), `inst/POj6DlY8pgg` (mark) | Drawn placeholders, one ink each |
| Badge template | `inst/6KqStUlXq3g` | "Example: Partner event badge", for the whole programme. Partners change first and last name, pronouns, job title and tracks; the company name comes from the profile |
| Lockup template | `inst/n1OAj5BGAuc` | "Example: Northwind lockup", for Northwind only, with its logo fixed. Partner Lockup is templates only in this programme |
| Agent token | `tok_a0Hv2iEq64I` | "Example: Northwind agent". Placed in Northwind; scopes `render` and `catalog.read`; Badges only; 2,000 renders a day; expires 2026-12-07. Andy minted it and holds the secret, which is in no file or message |
| Data sheet rules file | none | Not drawn yet. The partner team's designer or the brand team draws it in Design, depending on the arrangement |

`lw templates ls example-resellers` lists the templates, `lw companies ls example-resellers` the company and
`lw tokens ls --programme example-resellers` the tokens.

No partner accounts are in the programme. Please don't add any until the remaining partner-scope fixes (lolly-work
#353) have shipped; the coordinator says when.

## What lolly.ing runs, 2026-11-07

Checked at about 23:30Z. lolly.ing serves Work `7cf84909` with Lolly `e47127c03` (engine 1.333.0) and SUSE
`0da75f3` on the `suse` profile. The render worker runs Work `7cf84909` (Work #335), image `db1d811a`, since
22:47Z.

| Piece | Console (ships with Work) | App (ships with the Lolly pin) |
|---|---|---|
| Programmes, companies, profiles, logos | live | company values fill the tool (Lolly #799) |
| Templates, templates only, Use | live | live: shelf, Use, Start chooser, templates only, welcome skip |
| Preview as a company | live | not yet: View as partner is in review (lolly-work #344) |
| Company card on the partner's home | n/a | next re-pin (Lolly #800) |
| The partner recorded in exports and in Verify | server renders live (Work #330) | next re-pin (Lolly #801) |
| Ending a company, Reopen, scheduled ends | live | access-ends line at the next re-pin (Lolly #806) |
| Programme tokens, limits, counts, MCP brand resources | live | n/a |
| Licence report (M4) | merging now; lolly.ing stays in report mode and holds nothing back | n/a |
| Partner kits (M8) | not built | not built |
| Server renders of Badges and Top & Tail Video | SVG works; PNG and PDF answer 502 until the worker fixes ship (lolly-work PRs in review) | n/a |

The app half moves only when Work re-pins Lolly, which the coordinator and lolly-c2 sequence. The console moves with
each Work deploy.

## How admins act on lolly.ing

- **The console**, signed in as yourself: <https://lolly.ing/admin>, then Partner programmes.
- **`lw`**, the Lolly Work command line, against lolly.ing: run `lw` with `LW_BASE=https://lolly.ing` from a
  `lolly-work` checkout (`node cli/lw.ts …`). `lw login` prints a device code that you confirm at
  <https://lolly.ing/activate> in your own signed-in browser. The session is yours; never share or copy the session
  file.

Both act as the person signed in. Create nothing in anyone else's name.

## Start-here message

The inbox announcement "Start here: the example partner programme" goes to the `partner-team` group only, never to
Everyone. It repeats the example's ids, the phase and the clean-up list in short form. Update this page and the
message together when a phase changes.

## Clean-up, in this order

1. `lw people exit --company example-northwind`, read the dry run, then run it again with `--apply`. It ends the
   company, retires the lockup template published only to Northwind and revokes tokens placed there. Reopen stays
   offered for 30 days; do not use Reopen for the example.
2. `lw tokens revoke tok_a0Hv2iEq64I --programme example-resellers`, if the token outlived the exit.
3. `lw templates retire example-resellers inst/6KqStUlXq3g`, then revoke the two templates and the three logos in the
   console's Catalog with the lifecycle Revoke control, so they leave every feed.
4. `lw companies rm example-resellers example-northwind` (the profile, its history, and the grants and collection
   entries for its group).
5. `lw programmes rm example-resellers` (its grants, its group and the templates-only switch).
6. Update this page. The start-here message has no end command yet, so each recipient dismisses the message.

Nothing else on lolly.ing was touched by the example.
