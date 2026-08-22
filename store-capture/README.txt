How to run:
(.venv) ➜  aislefinder git:(feature/woodmans-store-support) ✗ pwd
/Users/kristian/Programs/aislefinder
(.venv) ➜  aislefinder git:(feature/woodmans-store-support) ✗ source ./.venv/bin/activate
PYTHONPATH=.. python ./store-capture/capture_store.py --chain woodmans --store-id 407077 --limit 68 --items "ginger, chard, kale" --out ./grocery_organizer/data/stores/woodmans-407077.csv
