# Store listing copy

Draft copy for both stores. Character limits noted where they apply.

## App Store (iOS)

- **Name** (30 max): `AisleFinder — Grocery Lists`
- **Subtitle** (30 max): `Shop aisle by aisle, faster`
- **Promotional text** (170 max): `Stop zig-zagging the store. AisleFinder sorts your grocery list into the order you'll actually walk — fresh food first, frozen last.`
- **Keywords** (100 max): `grocery,list,shopping,aisle,store,organizer,supermarket,food,checklist,meal,kroger,smiths`

## Google Play

- **Title** (30 max): `AisleFinder — Grocery Lists`
- **Short description** (80 max): `Your grocery list, organized by store aisle — get through the store in one pass.`

## Description (both stores)

AisleFinder turns a plain grocery list into an efficient trip through the store. Type or paste your items and AisleFinder looks up where each one lives at your store, then sorts your list aisle by aisle — produce and bakery up front, numbered aisles in order, dairy and frozen last so the cold stuff stays cold.

**Shop in one pass**
No more doubling back for the one thing you missed three aisles ago. Your list follows the path you'd actually walk.

**Built for the cart**
Big checkboxes, progress by aisle, and a "forgot something?" search that tells you which aisle to find it on — one-handed, mid-shop.

**Lists that stick around**
Keep separate lists for weekly staples, taco night, or the cookout. Finished trips are saved to History, so you can re-shop a past list or pull its items into this week's run with one tap.

**Quick to fill**
AisleFinder learns what you buy and suggests your frequent items as you build each list.

**Share the shopping**
Sign in to sync lists across devices and share a list with your household — everyone sees checkoffs as they happen.

Works with Kroger-family stores (Kroger, Smith's, Fred Meyer, King Soopers, and more) for aisle locations; anywhere else, your list is still neatly organized by category.

## Notes

- Screenshots: `appstore/` is 1320×2868 (iPhone 6.9"), `playstore/` is 1080×2400. Suggested order: shop-by-aisle first (it's the pitch), then current-list, my-lists, history.
- Regenerate screenshots after UI changes: serve `build/` (`python3 -m http.server 8321` in `build/`), then `node scripts/store-assets.js`.
- Feature graphic template: `scripts/feature-graphic.html`.
- Play requires the 512×512 icon and feature graphic; App Store takes the 1024×1024 icon from the app binary, `appstore/app-icon-1024.png` is a convenience copy.
