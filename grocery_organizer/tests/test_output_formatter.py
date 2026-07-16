"""Tests for OutputFormatter — grouping and shopping-order sorting."""

from grocery_organizer.src.core.models import FullProduct
from grocery_organizer.src.output_formatting.output_formatter import OutputFormatter


def product(name, category="Grocery", aisle=-1):
    return FullProduct(name, name, category, aisle)


class TestAisleFormat:
    def test_groups_by_aisle_number(self):
        output = OutputFormatter(
            [product("rice", aisle=5), product("pasta", aisle=5), product("salsa", aisle=12)],
            "aisle",
        ).format_output()
        assert output == "## Aisle 5\n- rice\n- pasta\n\n## Aisle 12\n- salsa"

    def test_falls_back_to_category_without_aisle(self):
        output = OutputFormatter(
            [product("bananas", category="Produce"), product("rice", aisle=5)],
            "aisle",
        ).format_output()
        assert "## Produce\n- bananas" in output
        assert "## Aisle 5\n- rice" in output

    def test_aisles_sorted_numerically(self):
        output = OutputFormatter(
            [product("a", aisle=10), product("b", aisle=2)], "aisle"
        ).format_output()
        assert output.index("Aisle 2") < output.index("Aisle 10")


class TestShoppingOrder:
    def test_fresh_first_cold_last_not_found_at_end(self):
        output = OutputFormatter(
            [
                product("ice cream", category="Frozen"),
                product("milk", category="Dairy"),
                product("mystery", category="Not Found"),
                product("rice", aisle=5),
                product("bananas", category="Produce"),
                product("bread", category="Bakery"),
            ],
            "aisle",
        ).format_output()
        positions = [output.index(section) for section in
                     ("## Produce", "## Bakery", "## Aisle 5", "## Dairy", "## Frozen", "## Not Found")]
        assert positions == sorted(positions)

    def test_section_names_case_insensitive(self):
        output = OutputFormatter(
            [product("milk", category="DAIRY"), product("bananas", category="produce")],
            "category",
        ).format_output()
        assert output.index("produce") < output.index("DAIRY")


class TestCategoryFormat:
    def test_groups_by_category_ignoring_aisles(self):
        output = OutputFormatter(
            [product("rice", category="Grocery", aisle=5), product("beans", category="Grocery")],
            "category",
        ).format_output()
        assert output == "## Grocery\n- rice\n- beans"

    def test_empty_product_list(self):
        assert OutputFormatter([], "aisle").format_output() == ""
