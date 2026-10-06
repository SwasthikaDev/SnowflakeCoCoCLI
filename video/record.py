"""Record each app/terminal scene with Playwright (headless Chromium, 1920x1080), timed to the voiceover.

Writes build/clips/<scene>.webm and build/clips/offsets.json (seconds to trim from the start of each clip,
i.e. the page-loading time before the scene actually begins).
"""
import json
import shutil
import sys
import time
import urllib.parse
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
CLIPS = BUILD / "clips"
APP = "https://muletrace.pages.dev"
META = json.loads((BUILD / "audio" / "meta.json").read_text(encoding="utf-8"))
W, H = 1920, 1080

CURSOR_JS = """
(() => {
  const add = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24"><path d="M3 2l7 19 2.6-7.4L20 11z" fill="#111827" stroke="#fff" stroke-width="1.5"/></svg>';
    Object.assign(c.style, {position:'fixed', left:'960px', top:'600px', zIndex:2147483647, pointerEvents:'none',
      transition:'left .55s cubic-bezier(.4,0,.2,1), top .55s cubic-bezier(.4,0,.2,1)'});
    document.body.appendChild(c);
    const ring = document.createElement('div');
    ring.id = '__ring';
    Object.assign(ring.style, {position:'fixed', width:'36px', height:'36px', marginLeft:'-14px', marginTop:'-14px', borderRadius:'50%',
      border:'3px solid #E4572E', opacity:0, zIndex:2147483646, pointerEvents:'none', transition:'opacity .25s, transform .25s'});
    document.body.appendChild(ring);
  };
  if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
})();
"""


class Scene:
    def __init__(self, page, duration):
        self.page, self.duration, self.t0 = page, duration, time.monotonic()

    def elapsed(self):
        return time.monotonic() - self.t0

    def wait(self, s):
        self.page.wait_for_timeout(int(s * 1000))

    def until(self, t):
        """Wait until t seconds into the scene."""
        rest = t - self.elapsed()
        if rest > 0:
            self.wait(rest)

    def move(self, loc):
        loc.scroll_into_view_if_needed()
        b = loc.bounding_box()
        x, y = b["x"] + min(b["width"] / 2, 60), b["y"] + b["height"] / 2
        self.page.evaluate(f"(() => {{ const c = document.getElementById('__cur'); c.style.left='{x}px'; c.style.top='{y}px'; }})()")
        self.wait(0.6)
        return x, y

    def click(self, loc):
        x, y = self.move(loc)
        self.page.evaluate(f"""(() => {{ const r = document.getElementById('__ring'); r.style.left='{x}px'; r.style.top='{y}px';
            r.style.opacity=1; r.style.transform='scale(1.3)'; setTimeout(() => {{ r.style.opacity=0; r.style.transform='scale(1)'; }}, 350); }})()""")
        loc.click()
        self.wait(0.4)

    def type(self, loc, text, delay=28):
        self.click(loc)
        loc.press_sequentially(text, delay=delay)

    def scroll_panel(self, selector, target_selector=None, by=None, steps=12):
        """Smoothly scroll the right-hand panel to bring target into view (or by N px)."""
        js = f"""(() => {{
          const p = document.querySelector('{selector}');
          const t = {'document.evaluate(' + json.dumps(target_selector) + ', document, null, 9, null).singleNodeValue' if target_selector else 'null'};
          const goal = t ? p.scrollTop + t.getBoundingClientRect().top - p.getBoundingClientRect().top - 10 : p.scrollTop + {by or 0};
          return goal;
        }})()"""
        goal = self.page.evaluate(js)
        start = self.page.evaluate(f"document.querySelector('{selector}').scrollTop")
        for i in range(1, steps + 1):
            v = start + (goal - start) * (i / steps)
            self.page.evaluate(f"document.querySelector('{selector}').scrollTop = {v}")
            self.wait(0.05)


def open_app(page, query=""):
    page.goto(f"{APP}/{query}")
    page.get_by_text("Alert queue").first.wait_for()
    page.wait_for_timeout(700)


# ------------------------------------------------------------------ scenes

def s_overview(sc):
    p = sc.page
    sc.until(1.5)
    sc.move(p.locator(".kpis > div").nth(0)); sc.until(4)
    sc.move(p.locator(".kpis > div").nth(2)); sc.until(6)
    sc.move(p.locator(".kpis > div").nth(3)); sc.until(9)
    sc.move(p.locator("button.alert").nth(1)); sc.until(11.5)
    sc.click(p.locator(".qhead select"))
    p.locator(".qhead select").select_option("layering"); sc.until(14)
    p.locator(".qhead select").select_option("all"); sc.until(15.5)
    sc.move(p.locator(".canvas")); sc.until(19)
    sc.click(p.get_by_role("button", name="Fit"))


def s_evidence(sc):
    p = sc.page
    sc.until(1)
    sc.click(p.locator("button.alert", has_text="F001")); sc.until(6)
    sc.move(p.locator(".pbody .score")); sc.until(9.5)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Why this score')]"); sc.until(15)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Policy applied')]"); sc.until(20)
    sc.move(p.locator("details.policy").first); sc.until(23)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Accounts (')]"); sc.until(27)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Transactions (')]"); sc.until(29)
    sc.move(p.get_by_role("button", name="⭳ Evidence CSV"))


def s_account(sc):
    p = sc.page
    sc.until(0.8)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Accounts (')]")
    sc.click(p.locator("button.link", has_text="AC79448796").first); sc.until(3)
    sc.scroll_panel(".pbody", by=-5000, steps=8)
    sc.move(p.locator(".flags")); sc.until(9)
    sc.move(p.locator(".kv")); sc.until(13)
    sc.move(p.locator(".account .tbl")); sc.until(16)
    sc.move(p.locator(".canvas")); sc.until(19)
    sc.move(p.locator(".account .muted").first)


def s_typologies(sc):
    p = sc.page
    sc.until(1.5)
    sc.click(p.locator("button.alert", has_text="F005")); sc.until(10.5)
    sc.click(p.locator("button.alert", has_text="F002")); sc.until(18.5)
    sc.click(p.locator("button.alert", has_text="F003"))


def s_copilot(sc):
    p = sc.page
    box = p.locator(".composer input")
    sc.until(0.8)
    sc.type(box, "Which accounts received over ₹5 lakh in sub-₹1,000 transfers?", delay=22)
    box.press("Enter"); sc.until(8.5)
    sc.move(p.locator(".cite").first); sc.until(11)
    sc.type(box, "Where did the money from AC11913291 go within 48 hours?", delay=22)
    box.press("Enter"); sc.until(21)
    sc.type(box, "What is our STR filing deadline?", delay=24)
    box.press("Enter"); sc.until(29)
    sc.move(p.locator(".cite.policy").last)


def s_decision(sc):
    p = sc.page
    sc.until(0.6)
    sc.scroll_panel(".pbody", "//h4[contains(., 'Decision')]")
    sc.type(p.locator(".pbody textarea"), "100 unrelated senders, identical ₹500 transfers, collector opened 31 days ago. Escalating.", delay=14)
    sc.click(p.get_by_role("button", name="Escalate to Principal Officer")); sc.until(7)
    sc.click(p.locator(".role select"))
    p.locator(".role select").select_option("principal"); sc.until(10)
    sc.click(p.get_by_role("button", name="STR draft")); sc.until(13)
    for _ in range(4):
        sc.scroll_panel(".pbody", by=420, steps=10); sc.wait(1.4)
    sc.until(22)
    sc.scroll_panel(".pbody", by=-5000, steps=8)
    sc.click(p.get_by_role("button", name="Mark as filed")); sc.until(26)
    sc.click(p.get_by_role("button", name="Audit (", exact=False))


def s_terminal(sc):
    sc.until(sc.duration)


APP_SCENES = {
    "04_overview": ("", s_overview),
    "05_evidence": ("", s_evidence),
    "06_account": ("?finding=F001", s_account),
    "07_typologies": ("", s_typologies),
    "08_copilot": ("?finding=F001&tab=copilot", s_copilot),
    "09_decision_str": ("?finding=F001", s_decision),
}


def record(name, setup, body, pw):
    duration = META[name]["duration"] + 0.6
    browser = pw.chromium.launch()
    ctx = browser.new_context(viewport={"width": W, "height": H}, record_video_dir=str(CLIPS / "tmp"),
                              record_video_size={"width": W, "height": H}, device_scale_factor=1)
    ctx.add_init_script(CURSOR_JS)
    t_start = time.monotonic()
    page = ctx.new_page()
    setup(page)
    offset = time.monotonic() - t_start
    sc = Scene(page, duration)
    body(sc)
    sc.until(duration + 0.3)
    page.close()
    ctx.close()
    browser.close()
    src = next((CLIPS / "tmp").glob("*.webm"))
    shutil.move(src, CLIPS / f"{name}.webm")
    print(f"{name}: offset {offset:.2f}s, scene {sc.elapsed():.1f}s (target {duration:.1f}s)")
    return offset


def main():
    only = sys.argv[1:]
    CLIPS.mkdir(parents=True, exist_ok=True)
    offsets_file = CLIPS / "offsets.json"
    offsets = json.loads(offsets_file.read_text()) if offsets_file.exists() else {}
    term = json.loads((BUILD / "terminal.json").read_text(encoding="utf-8-sig"))
    term_url = (ROOT / "terminal.html").resolve().as_uri() + "#" + urllib.parse.quote(json.dumps(term))
    with sync_playwright() as pw:
        jobs = {"03_pipeline": (lambda p: (p.goto(term_url), p.wait_for_timeout(200)), s_terminal)}
        for name, (q, body) in APP_SCENES.items():
            jobs[name] = ((lambda q: (lambda p: open_app(p, q)))(q), body)
        for name, (setup, body) in jobs.items():
            if only and name not in only:
                continue
            offsets[name] = record(name, setup, body, pw)
    offsets_file.write_text(json.dumps(offsets, indent=1))


if __name__ == "__main__":
    main()
