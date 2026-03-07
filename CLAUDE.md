# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a grocery list organization system that processes shopping lists and organizes items by store aisle or category using the Kroger API. The system takes text-based grocery lists and outputs them grouped by store location for efficient shopping.

## Architecture

The codebase follows a modular pipeline architecture:

1. **InputParser** (`grocery_organizer/src/input_parsing/`) - Parses text files containing grocery lists
2. **KrogerAPI** (`grocery_organizer/src/store_api/`) - Interfaces with Kroger's API to find products and aisle locations  
3. **FullProduct Model** (`grocery_organizer/src/core/models.py`) - Data structure containing product name, category, and aisle info
4. **OutputFormatter** (`grocery_organizer/src/output_formatting/`) - Formats organized lists by aisle or category
5. **GroceryListProcessor** (`grocery_organizer/src/core/processor.py`) - Main orchestrator coordinating the entire workflow

## Running the Application

The main entry point is `grocery_organizer/main.py`. Run with:

```bash
# Add project to Python path
export PYTHONPATH=$PYTHONPATH:/path/to/aislefinder

# Run the application
python grocery_organizer/main.py --file=./grocery_organizer/list.txt --output_format=aisle --store="4500S Smiths"
```

Command line options:
- `--file`: Path to grocery list file (default: `./list.txt`)
- `--output_format`: Either `aisle` or `category` (default: `aisle`)
- `--store`: Store name (default: `"4500S Smiths"`)

## Configuration

### API Credentials

The Kroger API requires authentication. Create `grocery_organizer/src/core/secrets.py`:

```python
CLIENT_SECRET = "[your_client_secret_here]"
```

The client ID is hardcoded as `aislefinder4000-bbc6d2p3` in the API client.

### Store Configuration

The default store ID is `01400943` in the KrogerAPI class. Store selection via command line is not yet fully implemented (see TODO in api.py:14).

## Key Components

### Error Handling Patterns

- Products without aisle locations fall back to category grouping (api.py:54)
- API responses assume at least one product result (api.py:47) - no error handling for empty results yet

### Data Flow

1. Text file → InputParser.text_parser() → list of lowercase strings
2. Each item → KrogerAPI.find_product() → FullProduct object  
3. List of FullProduct objects → OutputFormatter → formatted string output

### Token Management

The KrogerAPI class implements automatic token refresh with 1-minute buffer before expiration (api.py:21-38).

## Development Notes

- Input files should contain one grocery item per line
- The system currently only supports text file input (handwriting recognition planned per TODO in input_parser.py:8-9)
- Category fallback is used when aisle information is unavailable
- The legacy `aislefinder.py` script opens browser tabs for manual searching (not part of main workflow)