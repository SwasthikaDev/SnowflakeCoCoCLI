"""Record a REAL interactive CoCo CLI session as video frames.

Spawns `cortex` in a pseudo-terminal, types each prompt like a person would, waits for CoCo to finish, and renders
the terminal screen (via the pyte emulator) to PNG frames whenever it changes. Long idle stretches (model thinking)
are compressed and marked "sped up" in the frame. Output: build/coco/<name>/frames + timeline.json, and
build/coco/<name>.mp4 via ffmpeg.

    python coco_record.py              # full INPUT → PROCESSING → OUTPUT workflow
"""
import glob
import json
import os
import subprocess
import threading
import time
from pathlib import Path

import imageio_ffmpeg
import pyte
from PIL import Image, ImageDraw, ImageFont
from winpty import PtyProcess

COLS, ROWS = 150, 46
ROOT = Path(__file__).parent
REPO = ROOT.parent
OUT = ROOT / "build" / "coco"
CORTEX = sorted(glob.glob(os.path.expandvars(r"%LOCALAPPDATA%\cortex\*\cortex.exe")))[-1]
FONT_PATHS = [r"C:\Windows\Fonts\CascadiaMono.ttf", r"C:\Windows\Fonts\consola.ttf"]
FONT_BOLD = [r"C:\Windows\Fonts\CascadiaMono.ttf", r"C:\Windows\Fonts\consolab.ttf"]
FS = 17
W, H = 1920, 1080

STEPS = [
    ("INPUT", "#29B5E8", "$muletrace-ingest verify the MuleTrace input data is loaded: row counts for transactions, accounts and "
                          "policy sections, plus a 5-row sample of transactions (query only, do not reload)"),
    ("PROCESSING", "#E8A33D", "$muletrace-detect run the Snowpark graph detector now (CALL MULETRACE.CORE.RUN_DETECTOR()), "
                               "then show the ranked alert queue and the risk breakdown of the top finding"),
    ("OUTPUT", "#1B998B", "$muletrace-investigate F001: show the evidence pack and the policy clause it breaches, record an "
                           "escalation in CASES with note 'Structuring ring, escalate to Principal Officer', then draft the STR "
                           "with CALL MULETRACE.CORE.DRAFT_STR('F001') and show the grounds of suspicion"),
]

PALETTE = {
    "default": None, "black": (12, 12, 12), "red": (231, 72, 86), "green": (22, 198, 12), "brown": (193, 156, 0),
    "yellow": (249, 241, 165), "blue": (59, 120, 255), "magenta": (180, 0, 158), "cyan": (97, 214, 214),
    "white": (204, 204, 204), "brightblack": (118, 118, 118), "brightred": (231, 72, 86), "brightgreen": (22, 198, 12),
    "brightyellow": (249, 241, 165), "brightblue": (59, 120, 255), "brightmagenta": (180, 0, 158),
    "brightcyan": (97, 214, 214), "brightwhite": (242, 242, 242),
}
FG, BG = (204, 204, 204), (12, 12, 12)


def color(c, default):
    if c in PALETTE:
        return PALETTE[c] or default
    if isinstance(c, str) and len(c) == 6:
        try:
            return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
        except ValueError:
            pass
    return default


class Recorder:
    def __init__(self, name):
        self.dir = OUT / name
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob("*.png"):
            f.unlink()
        self.screen = pyte.Screen(COLS, ROWS)
        self.stream = pyte.Stream(self.screen)
        self.lock = threading.Lock()
        self.frames = []  # (t, filename, label)
        self.last_text, self.last_change = None, time.time()
        self.t0 = time.time()
        self.phase = None
        font_path = next(p for p in FONT_PATHS if os.path.exists(p))
        self.font = ImageFont.truetype(font_path, FS)
        self.bold = ImageFont.truetype(next(p for p in FONT_BOLD if os.path.exists(p)), FS)
        self.badge_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeuib.ttf", 22)
        self.title_font = ImageFont.truetype(r"C:\Windows\Fonts\segoeui.ttf", 16)
        bbox = self.font.getbbox("M")
        self.cw, self.ch = self.font.getlength("M"), int(FS * 1.32)
        self.proc = PtyProcess.spawn([CORTEX, "-c", "muletrace"], cwd=str(REPO), dimensions=(ROWS, COLS))
        threading.Thread(target=self._reader, daemon=True).start()
        threading.Thread(target=self._snapper, daemon=True).start()

    def _reader(self):
        while True:
            try:
                data = self.proc.read(65536)
            except EOFError:
                return
            if data:
                with self.lock:
                    self.stream.feed(data)

    def text(self):
        with self.lock:
            return "\n".join(self.screen.display)

    def _snapper(self):
        while True:
            time.sleep(0.2)
            t = self.text()
            if t != self.last_text:
                self.last_text, self.last_change = t, time.time()
                self.snap()

    def snap(self):
        with self.lock:
            buf = {y: dict(self.screen.buffer[y]) for y in range(ROWS)}
            cursor = (self.screen.cursor.x, self.screen.cursor.y)
        img = Image.new("RGB", (W, H), (24, 24, 24))
        d = ImageDraw.Draw(img)
        # window chrome
        x0, y0 = 40, 30
        tw, th = int(COLS * self.cw) + 40, ROWS * self.ch + 70
        d.rounded_rectangle([x0, y0, x0 + tw, y0 + th], 12, fill=BG, outline=(60, 60, 60))
        d.rectangle([x0 + 1, y0 + 1, x0 + tw - 1, y0 + 40], fill=(31, 31, 31))
        for i, c in enumerate([(255, 95, 87), (254, 188, 46), (40, 200, 64)]):
            d.ellipse([x0 + 16 + i * 22, y0 + 14, x0 + 28 + i * 22, y0 + 26], fill=c)
        d.text((x0 + 90, y0 + 10), "cortex — Snowflake CoCo CLI · bank-account-tracking (connection: muletrace)", font=self.title_font, fill=(210, 210, 210))
        ox, oy = x0 + 20, y0 + 52
        for y in range(ROWS):
            row = buf[y]
            for x in range(COLS):
                ch = row.get(x)
                if ch is None:
                    continue
                fg, bg = color(ch.fg, FG), color(ch.bg, BG)
                if ch.reverse:
                    fg, bg = bg, fg
                px, py = ox + x * self.cw, oy + y * self.ch
                if bg != BG:
                    d.rectangle([px, py, px + self.cw, py + self.ch], fill=bg)
                if ch.data.strip():
                    d.text((px, py), ch.data, font=self.bold if ch.bold else self.font, fill=fg)
        if self.phase:
            label, col = self.phase
            w = d.textlength(label, font=self.badge_font) + 40
            d.rounded_rectangle([W - w - 50, 42, W - 50, 82], 20, fill=col)
            d.text((W - w - 30, 47), label, font=self.badge_font, fill=(255, 255, 255))
        name = f"f{len(self.frames):05d}.png"
        img.save(self.dir / name)
        self.frames.append((time.time() - self.t0, name))

    def type(self, s, delay=0.018):
        for ch in s:
            self.proc.write(ch)
            time.sleep(delay)

    def wait_idle(self, quiet=6.0, timeout=420, ready_marker="Type your message"):
        start = time.time()
        while time.time() - start < timeout:
            time.sleep(0.5)
            t = self.text()
            if "Enter select" in t and "1. Yes" in t and time.time() - self.last_change > 1.2:
                self.proc.write("1")  # CoCo's "Execute SQL?" menu: choose 1. Yes
                time.sleep(0.4)
                self.proc.write(chr(13))
                time.sleep(1.5)
                continue
            low = t.lower()
            asking = any(k in low for k in ("allow", "approve", "(y/n)", "[y]", "do you want to run", "proceed?"))
            if asking and "esc to interrupt" not in low and time.time() - self.last_change > 1.5:
                self.proc.write("y")  # approve the tool call CoCo asks about
                time.sleep(1)
                continue
            busy = "esc to interrupt" in t or "Romping" in t or "Thinking" in t
            if time.time() - self.last_change > quiet and not busy and time.time() - start > 8:
                return True
        return False

    def close(self):
        self.proc.write("\x03")
        time.sleep(0.5)
        self.proc.terminate(force=True)


def encode(rec, name, max_hold=1.4, final_hold=3.0):
    """Build an ffmpeg concat list; compress idle gaps to max_hold seconds."""
    lines, total = [], 0.0
    for i, (t, f) in enumerate(rec.frames):
        nxt = rec.frames[i + 1][0] if i + 1 < len(rec.frames) else t + final_hold
        dur = min(nxt - t, max_hold) if i + 1 < len(rec.frames) else final_hold
        dur = max(dur, 0.05)
        lines += [f"file '{(rec.dir / f).as_posix()}'", f"duration {dur:.3f}"]
        total += dur
    lines.append(f"file '{(rec.dir / rec.frames[-1][1]).as_posix()}'")
    (rec.dir / "list.txt").write_text("\n".join(lines), encoding="utf-8")
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    out = OUT / f"{name}.mp4"
    subprocess.run([ff, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(rec.dir / "list.txt"),
                    "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "18", str(out)], check=True)
    json.dump({"frames": rec.frames, "duration": total}, open(rec.dir / "timeline.json", "w"))
    print(f"{out.name}: {len(rec.frames)} frames, {total:.1f}s after compressing idle time")


def main():
    rec = Recorder("workflow")
    rec.wait_idle(quiet=4, timeout=90)
    for label, col, prompt in STEPS:
        rec.phase = (label, col)
        rec.snap()
        rec.type(prompt)
        time.sleep(0.6)
        rec.proc.write("\r")
        ok = rec.wait_idle()
        print(f"{label}: {'done' if ok else 'TIMEOUT'} at {time.time() - rec.t0:.0f}s", flush=True)
        (rec.dir / f"screen_{label}.txt").write_text(rec.text(), encoding="utf-8")
        time.sleep(2)
        rec.snap()
    rec.close()
    encode(rec, "workflow")


if __name__ == "__main__":
    main()
