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

    # Matches the start of a checkbox marker, used to split lines where
    # multiple checkbox items got pasted onto one line (newlines lost).
    _CHECKBOX_BOUNDARY = re.compile(r'(?=[-*+•]\s*\[[xX\s]*\])')

    @classmethod
    def parse_text(cls, text):
        """Parse grocery-list text directly (no file needed)."""
        items = []
        for line in text.splitlines():
            for segment in cls._split_checkbox_items(line):
                # Split on commas to support comma-separated items
                for part in segment.split(','):
                    cleaned_item = cls.clean_line(part.strip().lower())
                    if cleaned_item:
                        items.append(cleaned_item)
        return items

    @classmethod
    def _split_checkbox_items(cls, line):
        """Split a line into segments on each embedded checkbox marker."""
        segments = [s for s in cls._CHECKBOX_BOUNDARY.split(line) if s.strip()]
        return segments or [line]

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
