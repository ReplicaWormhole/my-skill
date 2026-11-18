"""Checks for the shared proof format, HTML build, and local chat context."""

from copy import deepcopy
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from build import AUTHORS, build
from serve import load_page, node_context, prepare_prompt
from validate import load, validate


class ProofPipeline(unittest.TestCase):
    def setUp(self):
        self.document, _ = load(AUTHORS.parent / "references/example.json")

    def test_build_preserves_numbering_math_and_dependencies(self):
        first = build(self.document, validate(self.document))
        other = deepcopy(self.document)
        self.assertEqual(first, build(other, validate(other)))
        self.assertIn('<details id="step-1.2.2">', first)
        self.assertIn('<math display="block"', first)
        self.assertIn('href="#entry-induction"', first)

    def test_rejects_invalid_numbering_and_dependency_cycles(self):
        self.document["proof"]["steps"][0]["id"] = "1.5"
        with self.assertRaisesRegex(ValueError, "must be '1.1'"):
            validate(self.document)
        self.document["proof"]["steps"][0]["id"] = "1.1"
        self.document["proof"]["steps"][0]["uses"] = ["1.3"]
        with self.assertRaisesRegex(ValueError, "Cycle in explicit dependencies"):
            validate(self.document)

    def test_checks_body_anchors_and_rejects_unsafe_links(self):
        root = self.document["proof"]
        for text, error in [
            ("[missing](#step-1.9)", "Unknown internal link targets"),
            ("[unsafe](javascript:alert%281%29)", "Unsupported link target"),
            ("![image](https://example.com/x.png)", "Unsupported Image"),
        ]:
            root["body"] = text
            with self.subTest(text=text), self.assertRaisesRegex(ValueError, error):
                build(self.document, validate(self.document))

    def test_removes_author_supplied_html_attributes(self):
        self.document["proof"]["body"] = '[word]{#custom-anchor onclick="arbitrary()"}'
        page = build(self.document, validate(self.document))
        self.assertIn('<span id="custom-anchor">word</span>', page)
        self.assertNotIn('onclick="arbitrary()"', page)

    def test_chat_uses_the_built_proofs_context_and_selected_excerpt(self):
        with TemporaryDirectory() as folder:
            page = Path(folder) / "index.html"
            page.write_text(build(self.document, validate(self.document)), encoding="utf-8")
            _, data = load_page(page)
        context = node_context(data, "step-1.3")
        self.assertEqual(context["selected"]["title"], "Conclude by induction")
        self.assertIn("entry-induction", context["references"])
        prompt = prepare_prompt(data, {
            "snapshot": data["snapshot"], "node": "step-1.3",
            "question": "Why can we conclude?", "history": [],
            "selections": [{"text": "base case and induction step", "source": "proof", "message": ""}],
        })
        self.assertIn("base case and induction step", prompt)


if __name__ == "__main__":
    unittest.main()
