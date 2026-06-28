from grocery_organizer.src.core.models import FullProduct
from collections import defaultdict

# TODO need to consider output_format option in main
class OutputFormatter:
    def __init__(self, products: list[FullProduct], output_format: str):
        self.products = products
        self.output_format = output_format

    def format_output(self):
        if self.output_format == "aisle":
            return self.aisle_format()
        else:
            return self.category_format()

    def aisle_format(self):
        aisle_groups = defaultdict(list)
        for product in self.products:
            if product.aisle_number > 0:
                aisle_groups[product.aisle_number].append(product)
            else:
                aisle_groups[product.category].append(product)

        formatted_sections = []

        # Optimal shopping order with food safety considerations
        def sort_key(element):
            key, products = element
            if isinstance(key, str):
                lower_key = key.lower()
                if key == "Produce":
                    return (0, 0, "Produce")
                elif key == "Bakery":
                    return (0, 1, "Bakery")
                elif key == "Deli":
                    return (0, 2, "Deli")
                elif lower_key in ["meat & seafood", "meat and seafood"]:
                    return (0, 3, key)
                elif lower_key in ["dairy", "milk", "dairy products"]:
                    return (3, 0, key)
                elif lower_key in ["frozen", "frozen foods", "frozen section"]:
                    return (3, 1, key)
                elif key == "Not Found":
                    return (4, 0, key)
                else:
                    return (1, 0, key)  # Alphabetical
            else:
                return (2, key, "")  # Numbered aisles in ascending order

        # Sort all items
        sorted_items = sorted(aisle_groups.items(), key=sort_key)
        
        for aisle, products in sorted_items:
            if isinstance(aisle, str):
                section = '## ' + aisle + '\n'
            else:
                section = '## Aisle ' + str(aisle) + '\n'
            for product in products:
                section += '- ' + str(product) + '\n'
            formatted_sections.append(section.strip())

        return '\n\n'.join(formatted_sections)

    def category_format(self):
        # Group items by their section in the store
        grouped_items = defaultdict(list)
        for item in self.products:
            grouped_items[item.category].append(item)

        formatted_sections = []
        
        # Use same optimal shopping order as aisle format
        def category_sort_key(category):
            lower_cat = category.lower()
            if category == "Produce":
                return (0, 0, "Produce")
            elif category == "Bakery":
                return (0, 1, "Bakery")
            elif category == "Deli":
                return (0, 2, "Deli")
            elif lower_cat in ["meat & seafood", "meat and seafood"]:
                return (0, 3, category)
            elif lower_cat in ["dairy", "milk", "dairy products"]:
                return (2, 0, category)
            elif lower_cat in ["frozen", "frozen foods", "frozen section"]:
                return (2, 1, category)
            elif category == "Not Found":
                return (3, 0, category)
            else:
                return (1, 0, category)
        
        sorted_categories = sorted(grouped_items.keys(), key=category_sort_key)
        
        for category in sorted_categories:
            products = grouped_items[category]
            section = '## ' + category + '\n'
            for product in products:
                section += '- ' + str(product) + '\n'
            formatted_sections.append(section.strip())

        return '\n\n'.join(formatted_sections)