#!/usr/bin/env python3
"""Build a standalone, interactive HTML explorer from Lamport proof JSON."""

import argparse
import hashlib
import html
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.parse import unquote


HERE = Path(__file__).resolve().parent
AUTHORS = HERE.parents[1] / "lamport-proof-json/scripts"
ASSETS = HERE.parent / "assets"
if not (AUTHORS / "validate.py").is_file():
    raise SystemExit("Install the lamport-proof-json skill beside lamport-proof-site.")
sys.path.insert(0, str(AUTHORS))

from validate import load, web_url


MARKDOWN = (
    "markdown-raw_html-raw_attribute-auto_identifiers-smart"
    "+tex_math_single_backslash+tex_math_double_backslash"
)
ATTR_INDEX = {
    "Code": 0, "CodeBlock": 0, "Div": 0, "Figure": 0,
    "Header": 1, "Link": 0, "Span": 0, "Table": 0,
}
BODY_MARKER = "proof-body-fragment-"
VALID_ID = re.compile(r"[A-Za-z][A-Za-z0-9_.:-]*")
STATUS = {"assumption": "Assumption", "imported": "Imported", "gap": "Open gap"}


def anchor(key):
    return f"step-{key}" if key[0].isdigit() else f"entry-{key}"


def pandoc(source, *arguments):
    result = subprocess.run(
        ["pandoc", "--sandbox", "--fail-if-warnings", *arguments],
        input=source, encoding="utf-8", capture_output=True, timeout=90,
    )
    if result.returncode:
        raise ValueError(result.stderr.strip() or "Pandoc conversion failed")
    return result.stdout


def inspect_body(value, ids, links, owner):
    if isinstance(value, list):
        for child in value:
            inspect_body(child, ids, links, owner)
    if not isinstance(value, dict):
        return
    kind = value.get("t")
    contents = value.get("c")
    if kind in {"RawInline", "RawBlock", "Image"}:
        raise ValueError(f"Unsupported {kind} in proof body. Use Markdown text, math, and links.")
    if kind in ATTR_INDEX:
        attributes = contents[ATTR_INDEX[kind]]
        identifier = attributes[0]
        if identifier:
            if (
                not VALID_ID.fullmatch(identifier)
                or identifier.startswith((BODY_MARKER, "step-", "entry-", "chat-"))
                or identifier in ids
            ):
                raise ValueError(f"Duplicate or reserved body anchor: {identifier}")
            ids[identifier] = owner
        attributes[:] = [identifier, [], []]
    if kind == "Link":
        url = contents[2][0]
        if url.startswith("#"):
            links.add(unquote(url[1:]))
        elif not web_url(url):
            raise ValueError(f"Unsupported link target: {url!r}. Use an internal anchor or HTTP(S).")
    if kind == "Table":
        # Cell and row attributes occupy nested triples in Pandoc tables.
        # Keep table structure and text, but clear its presentation attributes.
        for part in contents[1:]:
            strip_table_attributes(part)
    inspect_body(contents, ids, links, owner)


def strip_table_attributes(value):
    if not isinstance(value, list):
        return
    if (
        len(value) == 3 and isinstance(value[0], str)
        and all(isinstance(part, list) for part in value[1:])
    ):
        value[:] = ["", [], []]
        return
    for child in value:
        strip_table_attributes(child)


def render_bodies(document, items):
    max_colons = max(
        [2, *(len(run) for item in items.values() for run in re.findall(r":+", item["body"]))]
    )
    fence = ":" * (max_colons + 1)
    markers = [f"{BODY_MARKER}{index}" for index in range(len(items))]
    wrapped = [
        f"{fence} {{#{marker}}}\n\n{item['body']}\n\n{fence}"
        for marker, item in zip(markers, items.values())
    ]
    tex = "\n".join(document.get("tex_macros", []))
    parsed = json.loads(pandoc(tex + "\n\n" + "\n\n".join(wrapped), "-f", MARKDOWN, "-t", "json"))
    actual = [
        block["c"][0][0] if block["t"] == "Div" else None for block in parsed["blocks"]
    ]
    if actual != markers:
        raise ValueError("Proof bodies did not parse as separate blocks. Check the TeX macros and unclosed markup.")
    ids = {anchor(key): anchor(key) for key in items}
    ids.update(dict.fromkeys({
        "setup", "references", "proof-tree", "theorem-title", "proof-heading", "setup-heading",
        "references-heading", "open-selection-chats", "proof-chat", "proof-chat-data",
        "ask-selection", "expand", "collapse",
    }))
    links = {key: set() for key in items}
    for key, fragment in zip(items, parsed["blocks"]):
        inspect_body(fragment["c"][1], ids, links[key], anchor(key))
    missing_links = set().union(*links.values()) - ids.keys()
    if missing_links:
        raise ValueError(f"Unknown internal link targets: {sorted(missing_links)}")
    linked_nodes = {
        key: sorted({ids[target] for target in targets if ids[target]} - {anchor(key)})
        for key, targets in links.items()
    }
    parsed["meta"] = {}
    rendered = pandoc(json.dumps(parsed), "-f", "json", "-t", "html5", "--mathml", "--wrap=none")
    fragments = re.split(rf'<div id="{BODY_MARKER}\d+">\s*', rendered)
    if fragments[0].strip() or len(fragments) != len(items) + 1:
        raise ValueError("Pandoc changed the proof body boundaries")
    bodies = {}
    for key, fragment in zip(items, fragments[1:]):
        body, ending = fragment.rsplit("</div>", 1)
        if ending.strip():
            raise ValueError(f"Unexpected HTML after body of {key}")
        bodies[key] = re.sub(
            r'(<math display="block"[^>]*>.*?</math>)',
            r'<span class="display-math">\1</span>', body.strip(), flags=re.DOTALL,
        )
    return bodies, linked_nodes


def source_label(source):
    label = html.escape(source["label"])
    if "url" in source:
        label = f'<a href="{html.escape(source["url"])}">{label}</a>'
    if "locator" in source:
        label += " · " + html.escape(source["locator"])
    return label


def disclosure(item, content, style, *, numbered=False):
    key = item["id"]
    id_ = anchor(key)
    title = html.escape(item["title"])
    number = f'<span class="step-number">{key}</span>' if numbered else ""
    permalink = (
        f'<a class="permalink" href="#{id_}" aria-label="Link to step {key}">#</a>' if numbered else ""
    )
    return f"""
<div class="node {style}">
  <details id="{id_}">
    <summary>{number}<span class="node-title">{title}</span></summary>
    <div class="node-body">{content}</div>
  </details>
  {permalink}
  <button class="ask-node" type="button" data-chat-node="{id_}" hidden>Ask</button>
</div>
"""


def build(document, items):
    bodies, linked_nodes = render_bodies(document, items)
    root = document["proof"]

    def content(item):
        key = item["id"]
        labels = [item[field] for field in ("kind",) if field in item]
        if "status" in item:
            labels.append(STATUS[item["status"]])
        heading = f'<p class="group-label">{html.escape(" · ".join(labels))}</p>' if labels else ""
        requires = ""
        if item.get("uses"):
            refs = [
                f'<a href="#{anchor(ref)}">{html.escape(ref if ref[0].isdigit() else items[ref]["title"])}</a>'
                for ref in item["uses"]
            ]
            requires = '<p class="source-location">Uses ' + ", ".join(refs) + "</p>"
        source = (
            f'<p class="source-location">{source_label(item["source"])}</p>' if "source" in item else ""
        )
        return heading + bodies[key] + requires + source

    def proof_step(item, depth=1):
        children = "".join(proof_step(child, depth + 1) for child in item.get("steps", []))
        style = "branch" if depth == 1 else "claim" if depth == 2 else "step"
        return disclosure(item, content(item) + children, style, numbered=True)

    steps = root.get("steps", [])
    navigation = "\n".join(
        f'<a href="#{anchor(item["id"])}"><span>{item["id"]}</span>'
        f'<span class="nav-title">{html.escape(item["title"])}</span></a>'
        for item in steps
    )
    support_navigation = []
    support = []
    for group, id_, title in (
        ("hypotheses", "setup", "Hypotheses and notation"),
        ("references", "references", "References"),
    ):
        if document.get(group):
            support_navigation.append(f'<a href="#{id_}">{title}</a>')
            entries = "".join(disclosure(item, content(item), "reference") for item in document[group])
            support.append(
                f'<section class="support-section" id="{id_}" tabindex="-1" aria-labelledby="{id_}-heading">'
                f'<h2 id="{id_}-heading">{title}</h2>{entries}</section>'
            )

    snapshot = hashlib.sha256(
        json.dumps(document, sort_keys=True, ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    chat_data = {
        "snapshot": snapshot,
        "macros": document.get("tex_macros", []),
        "nodes": {
            anchor(key): {
                "title": item["title"], "text": item["body"],
                "uses": [anchor(ref) for ref in item.get("uses", [])],
                "links": linked_nodes[key],
                **{field: item[field] for field in ("source", "status") if field in item},
            }
            for key, item in items.items()
        },
    }
    replacements = {
        "title": html.escape(document["title"]),
        "root_title": html.escape(root["title"]),
        "root_kind": html.escape(root.get("kind", "Theorem")),
        "style": (ASSETS / "style.css").read_text(encoding="utf-8"),
        "script": (ASSETS / "navigation.js").read_text(encoding="utf-8"),
        "chat_script": "\n".join(
            (ASSETS / name).read_text(encoding="utf-8")
            for name in ("chat-math.js", "passage-highlights.js", "selection.js", "chat.js")
        ),
        "chat_data": json.dumps(chat_data, ensure_ascii=False).replace("<", r"\u003c"),
        "snapshot": snapshot,
        "source": f'<footer>{source_label(document["source"])}</footer>' if "source" in document else "",
        "navigation": navigation,
        "statement": content(root),
        "branches": "\n".join(proof_step(item) for item in steps),
        "support_navigation": "\n".join(support_navigation),
        "support_sections": "\n".join(support),
    }
    template = (ASSETS / "page.html").read_text(encoding="utf-8")
    page = re.sub(r"@@(\w+)@@", lambda match: replacements[match[1]], template)
    return "\n".join(line.rstrip() for line in page.splitlines()) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("proof", type=Path)
    parser.add_argument("--output", type=Path, default=Path("index.html"))
    parser.add_argument("--check", action="store_true", help="Compare with an existing HTML build.")
    args = parser.parse_args()
    try:
        if args.proof.resolve() == args.output.resolve():
            raise ValueError("The JSON and HTML paths must be different")
        page = build(*load(args.proof))
        if args.check:
            if args.output.read_text(encoding="utf-8") != page:
                raise ValueError(f"{args.output} differs from the current build")
        else:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(page, encoding="utf-8")
    except (OSError, ValueError, RecursionError, subprocess.TimeoutExpired) as error:
        parser.error(str(error))
    print(f"{'Verified' if args.check else 'Built'} {args.output}")


if __name__ == "__main__":
    main()
