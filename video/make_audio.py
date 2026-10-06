"""Generate one voiceover MP3 per scene with edge-tts, plus sentence-level caption timings."""
import asyncio
import json
import re
from pathlib import Path

import edge_tts

from narration import RATE, SCENES, VOICE

OUT = Path(__file__).parent / "build" / "audio"


async def synth(scene):
    comm = edge_tts.Communicate(scene["text"], VOICE, rate=RATE, boundary="WordBoundary")
    audio = bytearray()
    words = []  # (start_s, end_s, text)
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio.extend(chunk["data"])
        elif chunk["type"] == "WordBoundary":
            start = chunk["offset"] / 1e7
            words.append((start, start + chunk["duration"] / 1e7, chunk["text"]))
    (OUT / f"{scene['id']}.mp3").write_bytes(bytes(audio))
    return words


def chunks_of(text, max_chars=70):
    """Split the script into caption-sized chunks: sentences, then clauses, then words."""
    out = []
    for sent in re.split(r"(?<=[.?!])\s+", text.strip()):
        parts, cur = re.split(r"(?<=[,:;])\s+", sent), ""
        for part in parts:
            if cur and len(cur) + 1 + len(part) > max_chars:
                out.append(cur)
                cur = part
            else:
                cur = f"{cur} {part}".strip()
            while len(cur) > max_chars:
                cut = cur.rfind(" ", 0, max_chars)
                out.append(cur[:cut])
                cur = cur[cut + 1:]
        if cur:
            out.append(cur)
    return out


def captions_from_words(text, words):
    """Time each script chunk by mapping its character span onto the spoken word boundaries."""
    norm = lambda s: re.sub(r"[^a-z0-9]", "", s.lower())
    ends, total = [], 0
    for w in words:
        total += len(norm(w[2]))
        ends.append(total)
    chunks = chunks_of(text)
    script_total = sum(len(norm(c)) for c in chunks) or 1
    lines, pos, wi = [], 0, 0
    for c in chunks:
        start_word = wi
        pos += len(norm(c))
        target = pos * total / script_total
        while wi < len(words) - 1 and ends[wi] < target - 0.5:
            wi += 1
        lines.append((words[start_word][0], words[wi][1], c))
        wi = min(wi + 1, len(words) - 1)
    return lines


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for s in SCENES:
        words = await synth(s)
        dur = words[-1][1] if words else 0
        meta[s["id"]] = {"duration": round(dur, 2), "captions": captions_from_words(s["text"], words)}
        print(f"{s['id']}: {dur:.1f}s")
    (OUT / "meta.json").write_text(json.dumps(meta, indent=1), encoding="utf-8")
    print(f"total speech: {sum(m['duration'] for m in meta.values()):.0f}s")


asyncio.run(main())
