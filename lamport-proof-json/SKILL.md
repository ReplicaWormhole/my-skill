---
name: lamport-proof-json
description: Encode a mathematical theorem and proof as a numbered Lamport-style JSON tree for review or a proof explorer. Use for proofs supplied as prose, LaTeX, lecture notes, or a structured outline.
---

Read [the proof format](references/format.md) and, if helpful, [the example](references/example.json). Write a `proof.json` at the requested location. Use the existing JSON's identifiers and structure when editing a proof unless the requested change requires renumbering.

1. Identify the theorem, its hypotheses, and the shortest complete argument at the top level. Make `1` the theorem and `1.1`, `1.2`, and so on the steps needed to prove it.
2. For each step that merits explanation, state its local claim, then give child steps that justify it at the next level. Make steps small enough that a reader can ask about one inference at a time. Where a case split or temporary assumption is used, introduce its scope and show how it is discharged.
3. Put shared hypotheses and notation in `hypotheses`, and imported results or literature in `references`. Use `uses` for actual logical dependencies. Include source locators when available. Preserve the argument's assumptions, quantifiers, signs and conventions. Mark imports and gaps explicitly, and distinguish any elaboration from a source quotation.
4. Run `python3 -B scripts/validate.py /path/to/proof.json` (resolve `scripts/` relative to this skill). Correct structure and unresolved dependencies. Compare the tree with the source and report unresolved mathematical gaps separately from validation.

Use `$lamport-proof-site` when the user also wants a browsable site.
