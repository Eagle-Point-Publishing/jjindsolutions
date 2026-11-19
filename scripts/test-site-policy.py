#!/usr/bin/env python3
"""Regression cases for the owner's service corrections and preview promotion."""
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("site_policy", ROOT / "scripts/validate-site.py")
POLICY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(POLICY)


class SitePolicy(unittest.TestCase):
    def setUp(self):
        self.source = (ROOT / "index.html").read_text()

    def test_current_site_passes(self):
        self.assertEqual(POLICY.validate(self.source), [])

    def test_removed_capabilities_are_rejected(self):
        for claim in ("Timken certified", "Vibration analysis", "turbine repairs", "Turbines"):
            with self.subTest(claim=claim):
                errors = POLICY.validate(self.source.replace("</body>", f"<p>{claim}</p></body>"))
                self.assertIn("owner-removed service or qualification remains", errors)

    def test_preview_assets_and_noindex_are_rejected(self):
        for content in ('<script src="assets/preview.js"></script>', '<meta name="robots" content="noindex">', '<aside>REVIEW PREVIEW</aside>'):
            with self.subTest(content=content):
                self.assertIn("review-only content leaked into production", POLICY.validate(self.source + content))

    def test_general_bearing_maintenance_is_allowed(self):
        self.assertEqual(POLICY.validate(self.source + "<p>Bearing replacement and equipment alignment</p>"), [])

    def test_removed_commercial_terms_are_rejected(self):
        samples = {
            "<p>$" + "95 / hr</p>": "published dollar amount remains",
            "<p>Standard four-" + "hour minimum applies.</p>": "removed commercial term remains",
        }
        for sample, expected in samples.items():
            with self.subTest(sample=sample):
                errors = POLICY.validate(self.source.replace("</body>", sample + "</body>"))
                self.assertIn(expected, errors)


if __name__ == "__main__":
    unittest.main()
