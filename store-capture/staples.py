"""Grocery items used to seed a new store's data file.

Chosen for aisle/department *diversity* rather than category depth — one or
two representative items per distinct part of the store, so
store_database.py's similarity fallback has a nearby reference point for
most other items without the store's own catalog needing to be captured
item-by-item. All items here are food/grocery — matching.py's
NON_GROCERY_KEYWORDS filter (soap, lotion, detergent, pet food, vitamin,
etc.) will actively reject correct matches for non-grocery items, so don't
add household/health/pharmacy/baby/pet items here.

Add to this list as you notice gaps (items that keep showing up as
"Not Found" misses in the server logs) — prefer a new department over a new
variant of something already covered.
"""

STAPLE_ITEMS = [
    # Produce
    "bananas", "avocado",

    # Bakery
    "bagels",

    # Deli
    "sliced deli turkey",

    # Meat & seafood
    "chicken breast", "salmon fillet",

    # Dairy & eggs
    "milk", "eggs", "butter", "shredded cheese", "yogurt",

    # Frozen
    "ice cream", "frozen peas", "frozen pizza", "frozen waffles",

    # Beverages (cold)
    "2L soda", "orange juice", "sparkling water", "bottled water", "beer",

    # Coffee & hot beverages
    "cold brew coffee", "hot chocolate", "tea bags",

    # Snacks
    "lays chips", "popcorn", "pretzels", "tortilla chips",

    # Candy
    "chocolate bars",

    # Cookies & crackers
    "oreos", "saltine crackers",

    # Cereal & breakfast
    "cereal", "oatmeal", "pancake mix", "maple syrup",

    # Baking
    "flour", "sugar", "cake mix", "chocolate chips",

    # Canned goods
    "black beans", "canned corn", "canned tomatoes", "chicken noodle soup", "canned tuna",

    # Pasta, rice & international
    "spaghetti", "rice", "rice noodles", "soy sauce", "salsa", "tortillas",

    # Condiments & spreads
    "ketchup", "mayonnaise", "peanut butter", "jelly", "olive oil", "hot sauce",

    # Dried goods / bulk
    "dried beans", "lentils", "trail mix", "almonds",

    # Paper & household staples
    "paper towels", "toilet paper", "napkins", "paper plates", "trash bags", "aluminum foil",

    # Spices & pantry
    "black pepper", "vinegar", "bagged ice",
]
