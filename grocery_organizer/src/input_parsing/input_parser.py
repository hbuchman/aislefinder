import os.path
import re


class InputParser:
    def __init__(self, file):
        self.file = os.path.abspath(file)

    # TODO branch based on file type
    # Image files should use handwritting recognition
    def text_parser(self):
        items = []
        with open(self.file, "r") as file:
            for line in file:
                # Split on commas to support comma-separated items
                for part in line.split(','):
                    cleaned_item = self.clean_line(part.strip().lower())
                    if cleaned_item:
                        items.append(cleaned_item)

        return items
    
    def clean_line(self, line):
        """Clean line by removing markdown checkboxes, bullets, and other formatting"""
        # Remove markdown checkboxes: - [ ], - [x], - [X], etc.
        line = re.sub(r'^[\s]*[-*+]\s*\[[xX\s]*\]\s*', '', line)
        
        # Remove bullet points: -, *, +, •, etc.
        line = re.sub(r'^[\s]*[-*+•]\s*', '', line)
        
        # Remove numbered lists: 1., 2), etc.
        line = re.sub(r'^[\s]*\d+[.)]\s*', '', line)
        
        # Remove parentheses and brackets
        line = re.sub(r'[()[\]{}]', '', line)

        # Remove extra whitespace
        line = line.strip()
        
        return line