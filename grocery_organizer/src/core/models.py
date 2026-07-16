from dataclasses import dataclass


@dataclass
class FullProduct:
    """A grocery item after a store lookup.

    aisle_number is -1 when the store has no aisle data for the product;
    formatting then falls back to grouping by category. `category` is
    "Not Found" when the store returned no usable match at all.
    """
    input_name: str      # what the user typed
    found_product: str   # store's product description
    category: str
    aisle_number: int

    def __str__(self):
        # Output lists show the user's own words, not the store SKU name
        return self.input_name
