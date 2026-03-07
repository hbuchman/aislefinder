class FullProduct:
    def __init__(self, input_name, found_product, category, aisle_number):
        self.input_name = input_name
        self.found_product = found_product
        self.category = category
        self.aisle_number = aisle_number

    def __str__(self):
        return self.input_name