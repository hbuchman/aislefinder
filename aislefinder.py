import subprocess
#from fuzzywuzzy import fuzz

#subprocess.run(["xdg-open", "www.google.com"])
#https://www.smithsfoodanddrug.com/search?query=mustard&searchType=default_search&fulfillment=ais
file = open("list.txt", "r")
list = ""
url = "https://www.smithsfoodanddrug.com/search?query=REPLACE&searchType=default_search&fulfillment=ais"
for line in file:
    line.strip()
    if (line != ""):
        url = url.replace("REPLACE", line)
        subprocess.run(["xdg-open", url])
        url = "https://www.smithsfoodanddrug.com/search?query=REPLACE&searchType=default_search&fulfillment=ais"

