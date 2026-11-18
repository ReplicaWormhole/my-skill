#!/usr/bin/env python3
"""Read and validate a Lamport proof JSON document using the standard library."""

import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlsplit


ENTRY_ID = re.compile(r"[A-Za-z][A-Za-z0-9_-]*")
ITEM_FIELDS = {"id", "title", "body", "uses", "kind", "status", "source"}
TOP_FIELDS = {"version", "title", "proof", "hypotheses", "references", "tex_macros", "source"}
STATUSES = {"assumption", "imported", "gap"}


def obj(value, at, fields, required=()):
    if not isinstance(value, dict):
        raise ValueError(f"{at} must be an object")
    missing = set(required) - value.keys()
    extra = value.keys() - fields
    if missing or extra:
        raise ValueError(f"{at}: missing {sorted(missing)}, unexpected {sorted(extra)}")
    return value


def string(value, at, *, empty=False):
    if not isinstance(value, str) or (not empty and not value.strip()):
        raise ValueError(f"{at} must be a {'possibly empty' if empty else 'nonempty'} string")
    return value


def array(value, at):
    if not isinstance(value, list):
        raise ValueError(f"{at} must be an array")
    return value


def web_url(value):
    if not isinstance(value, str) or re.search(r"[\x00-\x20\\\x7f]", value):
        return False
    parsed = urlsplit(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.hostname)


def source(value, at):
    value = obj(value, at, {"label", "locator", "url"}, {"label"})
    for key in value:
        string(value[key], f"{at}.{key}")
    if "url" in value and not web_url(value["url"]):
        raise ValueError(f"{at}.url must use HTTP or HTTPS")


def validate(value):
    obj(value, "document", TOP_FIELDS, {"version", "title", "proof"})
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("version must be the integer 1")
    string(value["title"], "title")
    if "source" in value:
        source(value["source"], "source")
    for macro in array(value.get("tex_macros", []), "tex_macros"):
        if not isinstance(macro, str) or "\n" in macro or "\r" in macro or not re.match(
            r"^\\(?:newcommand|renewcommand|DeclareMathOperator)\*?\b", macro
        ):
            raise ValueError("tex_macros entries must be single-line TeX macro definitions")

    items = {}

    def add(item, at, expected=None):
        fields = ITEM_FIELDS | {"steps"} if expected else ITEM_FIELDS
        obj(item, at, fields, {"id", "title", "body"})
        key = string(item["id"], f"{at}.id")
        if expected and key != expected:
            raise ValueError(f"{at}.id must be {expected!r}, got {key!r}")
        if not expected and not ENTRY_ID.fullmatch(key):
            raise ValueError(f"{at}.id must start with a letter and use letters, digits, - or _")
        if key in items:
            raise ValueError(f"Duplicate identifier: {key}")
        items[key] = item
        string(item["title"], f"{key}.title")
        string(item["body"], f"{key}.body", empty=True)
        if "kind" in item:
            string(item["kind"], f"{key}.kind")
        if "status" in item and string(item["status"], f"{key}.status") not in STATUSES:
            raise ValueError(f"{key}.status must be one of {sorted(STATUSES)}")
        if "source" in item:
            source(item["source"], f"{key}.source")
        uses = [string(ref, f"{key}.uses item") for ref in array(item.get("uses", []), f"{key}.uses")]
        if len(set(uses)) != len(uses) or key in uses:
            raise ValueError(f"{key}.uses contains a duplicate or self-reference")
        for index, child in enumerate(array(item.get("steps", []), f"{key}.steps"), 1):
            add(child, f"{key}.steps[{index - 1}]", f"{key}.{index}")

    add(value["proof"], "proof", "1")
    for group in ("hypotheses", "references"):
        for index, entry in enumerate(array(value.get(group, []), group)):
            add(entry, f"{group}[{index}]")
    for key, item in items.items():
        missing = set(item.get("uses", [])) - items.keys()
        if missing:
            raise ValueError(f"{key}.uses contains unknown identifiers: {sorted(missing)}")

    visited = set()
    visiting = set()

    def visit(key):
        if key in visiting:
            raise ValueError(f"Cycle in explicit dependencies involving {key}")
        if key in visited:
            return
        visiting.add(key)
        for ref in items[key].get("uses", []):
            visit(ref)
        visiting.remove(key)
        visited.add(key)

    for key in items:
        visit(key)
    return items


def unique_fields(pairs):
    result = {}
    for name, value in pairs:
        if name in result:
            raise ValueError(f"Duplicate JSON field: {name}")
        result[name] = value
    return result


def load(path):
    value = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique_fields)
    return value, validate(value)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("proof", type=Path)
    args = parser.parse_args()
    try:
        _, items = load(args.proof)
    except (OSError, ValueError, RecursionError) as error:
        parser.error(str(error))
    print(f"Valid Lamport proof JSON ({len(items)} nodes and entries).")
