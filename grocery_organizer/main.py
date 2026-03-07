import argparse
from src.core.processor import GroceryListProcessor

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="./list.txt")
    parser.add_argument("--output_format", choices=["aisle","category"], default="aisle")
    parser.add_argument("--store", default="4500S Smiths")

    args = parser.parse_args()

    processor = GroceryListProcessor(file=args.file, store=args.store, output_format=args.output_format)
    checklist = processor.process_list()

    print(checklist)

if __name__ == "__main__":
    main()


