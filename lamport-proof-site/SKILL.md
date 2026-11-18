---
name: lamport-proof-site
description: Build a local interactive Lamport-style proof explorer from proof JSON. Use for expandable proofs with TeX math, per-passage chats, nested discussions, saved highlights, and links back to the selected text.
---

The paired `lamport-proof-json` skill defines and validates the input format.
Keep both skills in the same skills directory. When the user supplies a
manuscript instead of JSON, use `$lamport-proof-json` to encode it first.

Run the build script with Python 3 and Pandoc on `PATH`:

```sh
python3 -B /path/to/lamport-proof-site/scripts/build.py proof.json --output proof-site/index.html
```

Open the generated, self-contained HTML to read the proof offline. For live
chat, use the local server with a signed-in Codex CLI:

```sh
python3 -B /path/to/lamport-proof-site/scripts/serve.py proof-site/index.html
```

The server prints its loopback URL. Select a passage to start a discussion,
select inside a reply to branch, and click a saved highlight to reopen its
chat. Use `--port` to choose a separate origin for another explorer. Chat
excerpts and relevant proof context go to the model when a question is sent.
History is stored in the browser for the site origin and proof revision.

Use the build command with `--check` to verify an existing HTML output.
[Verification notes](references/verification.md) describe checks for the
generated explorer. Honor the user's delivery scope for hosting.
