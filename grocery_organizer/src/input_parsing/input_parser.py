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
                cleaned_line = self.clean_line(line.strip().lower())
                if cleaned_line:  # Only add non-empty lines
                    items.append(cleaned_line)

        return items
    
    def clean_line(self, line):
        """Clean line by removing markdown checkboxes, bullets, and other formatting"""
        # Remove markdown checkboxes: - [ ], - [x], - [X], etc.
        line = re.sub(r'^[\s]*[-*+]\s*\[[xX\s]*\]\s*', '', line)
        
        # Remove bullet points: -, *, +, •, etc.
        line = re.sub(r'^[\s]*[-*+•]\s*', '', line)
        
        # Remove numbered lists: 1., 2), etc.
        line = re.sub(r'^[\s]*\d+[.)]\s*', '', line)
        
        # Remove extra whitespace
        line = line.strip()
        
        return line