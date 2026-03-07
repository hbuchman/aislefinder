# aislefinder

## Set-Up
Currently the client secret is handeled via gitignore. Create grocery_organizer/src/core/secrets.py and copy in CLIENT_SECRET = "[secret]"
The secret can be obtained via written request.

## Test Runs
For the moment I recommend running main.py using PyCharm. If you'd like to run it on the command line add aislefinder to your python path eg.
```export PYTHONPATH=$PYTHONPATH:/path/to/aislefinder```
Then, run ```python grocery_organizer/main.py --file=./grocery_organizer/list.txt```


## Upcomming Changes
There are a number of TODOs left in the comments. These focus on feature additions and error checking.
