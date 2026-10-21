---
name: {{name}}
description: "{{description}}"
compatibility: "{{compatibility}}"
license: {{license}}
metadata:
  version: "{{version}}"
---

# {{title}}

A thin brand skill. It adds one brand's look, its motion style and its facts on top of the Motion
Machine engine; it does not repeat the engine's rules.

## Load the engine first

Read the engine's skill before doing anything else, and follow its workflow (seven rounds, each closed by the director's answer:
brief, treatment, style, style frames, animatic, cut, deliver):

- inside a Motion Machine checkout: `{{engine_skill}}` (relative to the repo root);
- anywhere else: the installed skill named `motion-machine`.

If neither is available, stop and say so. Do not improvise the workflow from this file.

## The style is pinned

Every piece made with this skill uses the composed style at `{{style_path}}` (relative to this
skill folder). It is the `{{brand}}` brand half wearing the `{{motion}}` motion half, copied here
as `{{brand_path}}` and `{{motion_path}}`. Pass it to the engine's `mm new` as the piece's style;
do not edit the composed file by hand. To change the look or the tempo, edit the half and compose
again with the engine's `mm style compose`, then show the director the swatch and tempo sheet
(gate 3) before using it.

Fonts are in `fonts/` (SIL OFL, licence files beside them). The style's font paths point there, so
the piece carries its own faces.

## Facts

`facts.md` is the only source of numbers, names, dates and claims for this brand. Copy rows into the
story's `facts` with their source; a figure that is not in the table gets asked for, not invented
(the engine's H-FACTS rule). The table starts empty.

## Bans

{{bans_section}}

## Not in this skill

The engine's gates, patterns, thresholds and render commands. Colours, fonts and motion numbers
reach CSS only through the composed style's `--mm-*` variables; never write them into a piece by hand.
