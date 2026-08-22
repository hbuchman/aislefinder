#!/usr/bin/env python3
"""Seed/top up a store's data file in grocery_organizer/data/stores/.

Walks staples.STAPLE_ITEMS, looks each one up via the live (reverse-engineered)
store client, and appends rows to a CSV in the shared data-file format:

    item,found_product,category,aisle_number,raw_location

That CSV is the only thing this tool produces that's meant to be committed —
this script and woodmans_client.py never are (see .gitignore). A developer or
user can add rows to the same CSV by hand after a real shopping trip, using
this same format; the app doesn't care how a row got there.

Usage (run from the repo root so grocery_organizer/ is importable):

    PYTHONPATH=. python store-capture/capture_store.py \\
        --chain woodmans --store-id 407077 --limit 40 \\
        --out grocery_organizer/data/stores/woodmans-407077.csv

To capture a handful of specific items instead of walking the staples list
(e.g. topping up misses you noticed on a real shopping trip), pass --items
with a comma-separated list:

    PYTHONPATH=. python store-capture/capture_store.py \\
        --chain woodmans --store-id 407077 \\
        --items "kale, quinoa, greek yogurt" \\
        --out grocery_organizer/data/stores/woodmans-407077.csv

Deliberately slow: a randomized 2-5s sleep between requests, and a hard
--limit per run. This rides on Instacart's production API using a manually
captured session credential — too much volume risks getting it revoked.
Re-run the command to top up further; already-captured items are skipped.

Session credentials (WOODMANS_AUTH_TOKEN etc.) are loaded from store-capture/.env
if present — that file is covered by the store-capture/ gitignore entry, same
as everything else in this folder.
"""

import argparse
import csv
import os
import random
import sys
import time

def _load_dotenv(path):
    """Minimal KEY='value' .env loader — avoids depending on python-dotenv
    (only guaranteed installed in the main app's .venv, not whatever bare
    `python3` a developer runs this standalone script with)."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            os.environ.setdefault(key, value)


_load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from grocery_organizer.src.store_api.search_terms import preprocess_search_term  # noqa: E402

from staples import STAPLE_ITEMS  # noqa: E402
from woodmans_client import WoodmansAPI  # noqa: E402

CSV_FIELDS = ["item", "found_product", "category", "aisle_number", "raw_location"]

CLIENTS = {
    "woodmans": WoodmansAPI,
}


def load_existing_keys(path):
    if not os.path.exists(path):
        return set()
    with open(path, newline="", encoding="utf-8") as f:
        return {row["item"] for row in csv.DictReader(f)}


def append_row(path, row):
    is_new = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        if is_new:
            writer.writeheader()
        writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--chain", required=True, choices=sorted(CLIENTS))
    parser.add_argument("--store-id", required=True)
    parser.add_argument("--limit", type=int, default=40, help="Max items to look up this run")
    parser.add_argument("--out", required=True, help="Path to the CSV to append to")
    parser.add_argument("--items", help="Comma-separated items to capture instead of the staples list, "
                                         "e.g. \"kale, quinoa, greek yogurt\"")
    parser.add_argument("--min-sleep", type=float, default=2.0)
    parser.add_argument("--max-sleep", type=float, default=5.0)
    args = parser.parse_args()

    client = CLIENTS[args.chain](args.store_id)
    already_have = load_existing_keys(args.out)
    source_items = [s.strip() for s in args.items.split(",") if s.strip()] if args.items else STAPLE_ITEMS
    todo = [item for item in source_items if preprocess_search_term(item) not in already_have]

    print(f"{len(already_have)} items already captured, {len(todo)} remaining, "
          f"doing up to {args.limit} this run")

    done = 0
    for item in todo[: args.limit]:
        key = preprocess_search_term(item)
        try:
            result = client.find_product(item)
        except Exception as exc:  # noqa: BLE001 - one bad item shouldn't kill the run
            print(f"  ERROR '{item}': {exc}")
            continue

        if result["category"] == "Not Found":
            print(f"  miss   '{item}'")
        else:
            print(f"  ok     '{item}' -> {result['found_product']!r} "
                  f"({result['category']}, aisle {result['aisle_number']})")

        append_row(args.out, {
            "item": key,
            "found_product": result["found_product"],
            "category": result["category"],
            "aisle_number": result["aisle_number"],
            "raw_location": result["raw_location"],
        })
        done += 1

        if done < len(todo[: args.limit]):
            time.sleep(random.uniform(args.min_sleep, args.max_sleep))

    print(f"Done: wrote {done} rows to {args.out}")


if __name__ == "__main__":
    main()
