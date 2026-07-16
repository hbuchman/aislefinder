"""Tests for InputParser — text cleanup and item extraction."""

from grocery_organizer.src.input_parsing.input_parser import InputParser


class TestParseText:
    def test_one_item_per_line(self):
        assert InputParser.parse_text("Milk\nEggs\nBread") == ["milk", "eggs", "bread"]

    def test_comma_separated_items(self):
        assert InputParser.parse_text("milk, eggs, bread") == ["milk", "eggs", "bread"]

    def test_mixed_lines_and_commas(self):
        assert InputParser.parse_text("milk, eggs\nbread") == ["milk", "eggs", "bread"]

    def test_blank_lines_skipped(self):
        assert InputParser.parse_text("milk\n\n\neggs\n") == ["milk", "eggs"]

    def test_lowercases_items(self):
        assert InputParser.parse_text("BANANAS") == ["bananas"]

    def test_empty_input(self):
        assert InputParser.parse_text("") == []

    def test_multi_word_items_preserved(self):
        assert InputParser.parse_text("peanut butter\nolive oil") == ["peanut butter", "olive oil"]


class TestCleanLine:
    def test_markdown_checkbox_removed(self):
        assert InputParser.clean_line("- [ ] milk") == "milk"
        assert InputParser.clean_line("- [x] milk") == "milk"
        assert InputParser.clean_line("- [X] milk") == "milk"

    def test_bullets_removed(self):
        assert InputParser.clean_line("- milk") == "milk"
        assert InputParser.clean_line("* milk") == "milk"
        assert InputParser.clean_line("+ milk") == "milk"
        assert InputParser.clean_line("• milk") == "milk"

    def test_numbered_list_removed(self):
        assert InputParser.clean_line("1. milk") == "milk"
        assert InputParser.clean_line("2) eggs") == "eggs"

    def test_brackets_removed(self):
        assert InputParser.clean_line("milk (whole)") == "milk whole"
        assert InputParser.clean_line("eggs [large]") == "eggs large"

    def test_plain_line_untouched(self):
        assert InputParser.clean_line("milk") == "milk"


class TestFileParsing:
    def test_reads_items_from_file(self, tmp_path):
        list_file = tmp_path / "list.txt"
        list_file.write_text("- [ ] Milk\n2. eggs, bread\n")
        assert InputParser(str(list_file)).text_parser() == ["milk", "eggs", "bread"]
