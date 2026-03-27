import os
import glob
files = glob.glob('/home/sergeng/.local/share/xenia-linux-manager/library/artwork/*')
for f in files:
    try:
        os.remove(f)
    except:
        pass
