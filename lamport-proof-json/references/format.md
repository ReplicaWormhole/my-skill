# Lamport proof JSON, version 1

The input is UTF-8 JSON. The top-level fields are:

| Field | Value |
| --- | --- |
| `version` | Required integer `1`. |
| `title` | Required site title in plain text. |
| `proof` | Required root node with ID `1`. |
| `hypotheses` | Optional ordered array of hypotheses, definitions, or notation entries. |
| `references` | Optional ordered array of literature or imported-result entries. |
| `tex_macros` | Optional array of single-line TeX macro definitions used in the math. |
| `source` | Optional provenance for the proof as a whole. |

A proof node requires `id`, `title` and `body`. Titles are plain text. A body
is Markdown with TeX math, for example `$x^2$` or a display between `$$` on
separate lines. Empty bodies are permitted for intermediate grouping nodes.
Children go in the optional `steps` array. Their identifiers must append
`.1`, `.2`, etc. to the parent ID in order. Depth expresses refinement of a
proof step. A heading within a body is ordinary prose structure.

A hypothesis or reference entry uses the same fields, with a distinct
identifier beginning with a letter and containing only letters, digits,
hyphens or underscores. It has no `steps` array.

Optional fields on nodes and entries:

- `kind` is a short label such as `Lemma`, `Definition` or `Case`.
- `status` is `assumption`, `imported` or `gap`. An omitted status leaves the
  proof's verification status unspecified.
- `uses` is an array of distinct IDs of nodes or entries that this item
  logically relies on. Nesting records the proof outline. Only record a
  dependency in `uses` if it helps explain the inference.
- `source` is an object with a required `label` and optional `locator` and
  `url` strings. The locator can give an equation, page, theorem, or source
  line number. URLs may use HTTPS or HTTP.

Markdown links to proof steps use anchors such as `#step-1.2`. Links to
supporting entries use anchors such as `#entry-rationality`. Anchors added in
bodies with Pandoc's bracketed span syntax (e.g. `[]{#eq-compression}`) must
be unique across the document. The explorer supports text, Markdown
structure, math and links. Inline HTML and images are outside this format.

Use the validator for structure and explicit dependencies. To check that the
proof is sound, review what each child establishes and whether its hypotheses
are available at the point of use.
