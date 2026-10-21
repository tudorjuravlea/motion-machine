# Brand skill template

`mm skill new --brand <name> [--motion <name>] --out <folder>` fills this template. Files:

- `SKILL.md`: router for the thin skill. Placeholders: `{{name}}`, `{{title}}`, `{{description}}`,
  `{{compatibility}}`, `{{license}}`, `{{version}}`, `{{brand}}`, `{{motion}}`, `{{engine_skill}}`,
  `{{style_path}}`, `{{brand_path}}`, `{{motion_path}}`, `{{bans_section}}`.
- `facts.md`: an empty facts table for the brand (placeholder `{{title}}`).

The scaffold also writes `style/` (the two halves and the composed style, with `from` and font paths
relative to the skill folder) and `fonts/` (only the files the brand uses, with their licence files).
No absolute path is ever written. The engine stays shared and brand-free; the thin skill is private
to its owner.
