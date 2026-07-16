from collections import defaultdict

from grocery_organizer.src.core.models import FullProduct

# Sections are walked in an efficient, food-safe shopping order:
#   1. Fresh departments near the entrance (produce, bakery, deli, meat)
#   2. Everything else alphabetically (then numbered aisles, ascending)
#   3. Cold sections last so they stay cold (dairy, frozen)
#   4. "Not Found" items at the very end
_FIRST_SECTIONS = {'produce': 0, 'bakery': 1, 'deli': 2,
                   'meat & seafood': 3, 'meat and seafood': 3}
_LAST_SECTIONS = {'dairy': 0, 'milk': 0, 'dairy products': 0, 'breakfast': 0,
                  'frozen': 1, 'frozen foods': 1, 'frozen section': 1}


def _section_sort_key(section):
    """Sort key for a section, which is an aisle number (int) or name (str)."""
    if isinstance(section, int):
        return (2, section, '')
    lower = section.lower()
    if lower in _FIRST_SECTIONS:
        return (0, _FIRST_SECTIONS[lower], section)
    if lower in _LAST_SECTIONS:
        return (3, _LAST_SECTIONS[lower], section)
    if section == 'Not Found':
        return (4, 0, section)
    return (1, 0, section)  # other named sections, alphabetical


class OutputFormatter:
    """Formats looked-up products as markdown (`## Section\\n- item`).

    output_format "aisle" groups by aisle number, falling back to category
    for items without aisle data; "category" groups by category only.
    """

    def __init__(self, products: list[FullProduct], output_format: str):
        self.products = products
        self.output_format = output_format

    def format_output(self):
        groups = defaultdict(list)
        for product in self.products:
            if self.output_format == "aisle" and product.aisle_number > 0:
                groups[product.aisle_number].append(product)
            else:
                groups[product.category].append(product)
        return self._render(groups)

    @staticmethod
    def _render(groups):
        sections = []
        for section, products in sorted(groups.items(), key=lambda kv: _section_sort_key(kv[0])):
            header = f'## Aisle {section}' if isinstance(section, int) else f'## {section}'
            lines = [header] + [f'- {product}' for product in products]
            sections.append('\n'.join(lines))
        return '\n\n'.join(sections)
