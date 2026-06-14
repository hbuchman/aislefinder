"""
GroceryListProcessor - Main orchestrator for the grocery list parsing system
"""

from typing import List, Dict, Optional, Tuple
from pathlib import Path
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from grocery_organizer.src.input_parsing.input_parser import InputParser
from grocery_organizer.src.output_formatting.output_formatter import OutputFormatter

from grocery_organizer.src.store_api.api import KrogerAPI


class GroceryListProcessor:
    """
    Main processor that coordinates the entire grocery list parsing workflow.

    Orchestrates:
    1. Handwriting recognition and text extraction
    2. Item parsing and standardization
    3. Store API lookups for aisle locations
    4. Final grocery list generation and formatting
    """

    def __init__(self, file, store, output_format, store_id="01400943"):
        self.file = file
        self.store = store
        self.output_format = output_format
        self.store_id = store_id

    def process_list(self):
        # Parse file
        parser = InputParser(self.file)
        grocery_list = parser.text_parser()

        # Call API (parallel for speed)
        api_client = KrogerAPI(store_id=self.store_id)
        api_client.get_auth_token()  # Pre-fetch token before parallel calls

        product_data = [None] * len(grocery_list)
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = {executor.submit(api_client.find_product, item): i
                       for i, item in enumerate(grocery_list)}
            for future in as_completed(futures):
                idx = futures[future]
                product_data[idx] = future.result()

        formatter = OutputFormatter(product_data, self.output_format)

        # Format list
        return formatter.format_output()


