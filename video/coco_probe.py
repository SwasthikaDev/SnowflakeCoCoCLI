"""Start interactive CoCo CLI in a pseudo-terminal, send a few inputs, and dump the rendered screen."""
import glob
import os
import sys
import threading
import time

import pyte
from winpty import PtyProcess

COLS, ROWS = 160, 48
CORTEX = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\cortex\*\cortex.exe")))[-1]
REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

screen = pyte.Screen(COLS, ROWS)
stream = pyte.Stream(screen)
lock = threading.Lock()
proc = PtyProcess.spawn([CORTEX, "-c", "muletrace"], cwd=REPO, dimensions=(ROWS, COLS))


def reader():
    while True:
        try:
            data = proc.read(65536)
        except EOFError:
            return
        if data:
            with lock:
                stream.feed(data)


threading.Thread(target=reader, daemon=True).start()


def show(label):
    with lock:
        text = "\n".join(line.rstrip() for line in screen.display if line.strip())
    print(f"===== {label}\n{text}", flush=True)


time.sleep(20)
show("startup")
for arg in sys.argv[1:]:
    wait = 20
    if "::" in arg:
        arg, wait = arg.split("::")
        wait = int(wait)
    proc.write(arg)
    time.sleep(0.4)
    proc.write("\r")
    time.sleep(wait)
    show(arg)
proc.write("\x03")
time.sleep(1)
proc.terminate(force=True)
