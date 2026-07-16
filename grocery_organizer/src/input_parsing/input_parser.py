import os.path
import re


class InputParser:
    """Turns raw grocery-list text into a clean list of lowercase item names.

    Accepts one item per line or comma-separated items, and strips common
    list formatting (markdown checkboxes, bullets, numbering, brackets).
    """

    def __init__(self, file=None):
        self.file = os.path.abspath(file) if file else None

    def text_parser(self):
        """Parse the file given at construction time."""
        with open(self.file, "r") as file:
            return self.parse_text(file.read())

    @classmethod
    def parse_text(cls, text):
        """Parse grocery-list text directly (no file needed)."""
        items = []
        for line in text.splitlines():
            # Split on commas to support comma-separated items
            for part in line.split(','):
                cleaned_item = cls.clean_line(part.strip().lower())
                if cleaned_item:
                    items.append(cleaned_item)
        return items

    @staticmethod
    def clean_line(line):
        """Strip markdown checkboxes, bullets, numbering, and brackets."""
        # Remove markdown checkboxes: - [ ], - [x], - [X], etc.
        line = re.sub(r'^[\s]*[-*+]\s*\[[xX\s]*\]\s*', '', line)

        # Remove bullet points: -, *, +, •, etc.
        line = re.sub(r'^[\s]*[-*+•]\s*', '', line)

        # Remove numbered lists: 1., 2), etc.
        line = re.sub(r'^[\s]*\d+[.)]\s*', '', line)

        # Remove parentheses and brackets
        line = re.sub(r'[()[\]{}]', '', line)

        return line.strip()
