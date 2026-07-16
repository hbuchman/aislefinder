"""GroceryListProcessor - Main orchestrator for the grocery list pipeline."""

from concurrent.futures import ThreadPoolExecutor, as_completed

from grocery_organizer.src.core.models import FullProduct
from grocery_organizer.src.input_parsing.input_parser import InputParser
from grocery_organizer.src.output_formatting.output_formatter import OutputFormatter
from grocery_organizer.src.store_api.kroger import KrogerAPI


class GroceryListProcessor:
    """Coordinates the grocery list workflow:

    1. Parse items from a file or raw text
    2. Look up each item's aisle/category via the Kroger API (in parallel)
    3. Format the organized list as markdown (`## Section\\n- item`)
    """

    def __init__(self, file=None, store=None, output_format="aisle",
                 store_id="01400943", text=None):
        if file is None and text is None:
            raise ValueError("Provide either a file path or raw text")
        self.file = file
        self.text = text
        self.store = store
        self.output_format = output_format
        self.store_id = store_id

    def process_list(self):
        if self.text is not None:
            grocery_list = InputParser.parse_text(self.text)
        else:
            grocery_list = InputParser(self.file).text_parser()

        api_client = KrogerAPI(self.store_id)
        api_client.get_auth_token()  # Pre-fetch token before parallel calls

        # Look items up in parallel; a failed lookup becomes a "Not Found"
        # entry rather than failing the whole list.
        # 10 workers so typical lists complete in one wave of Kroger calls —
        # this request is the longest wait in the UI
        product_data = [None] * len(grocery_list)
        with ThreadPoolExecutor(max_workers=10) as executor:
            futures = {executor.submit(api_client.find_product, item): i
                       for i, item in enumerate(grocery_list)}
            for future in as_completed(futures):
                idx = futures[future]
                try:
                    product_data[idx] = future.result()
                except Exception as e:
                    item_name = grocery_list[idx]
                    print(f"Failed to look up '{item_name}': {e}")
                    product_data[idx] = FullProduct(
                        item_name,
                        f"{item_name} (lookup failed)",
                        "Not Found",
                        -1,
                    )

        return OutputFormatter(product_data, self.output_format).format_output()
