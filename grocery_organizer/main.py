"""CLI entry point. Run from the repo root with the project on PYTHONPATH:

    PYTHONPATH=. python grocery_organizer/main.py --file=grocery_organizer/list.txt
"""

import argparse

from grocery_organizer.src.core.processor import GroceryListProcessor


def main():
    parser = argparse.ArgumentParser(description="Organize a grocery list by store aisle or category")
    parser.add_argument("--file", default="./list.txt", help="Path to a text file with one item per line")
    parser.add_argument("--output_format", choices=["aisle", "category"], default="aisle")
    parser.add_argument("--store", default="4500S Smiths", help="Store name (display only)")
    parser.add_argument("--store_id", default="01400943", help="Kroger store location id")

    args = parser.parse_args()

    processor = GroceryListProcessor(
        file=args.file,
        store=args.store,
        output_format=args.output_format,
        store_id=args.store_id,
    )
    print(processor.process_list())


if __name__ == "__main__":
    main()
