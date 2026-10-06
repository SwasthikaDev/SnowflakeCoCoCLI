"""Assemble the final demo video: per-scene segments (slide or recorded clip + voiceover), concatenated,
with burned-in captions. Output: video/MuleTrace_demo.mp4 and video/MuleTrace_demo.srt
"""
import json
import subprocess
from pathlib import Path

import imageio_ffmpeg

from narration import SCENES

ROOT = Path(__file__).parent
BUILD = ROOT / "build"
SEG = BUILD / "segments"
FF = imageio_ffmpeg.get_ffmpeg_exe()
META = json.loads((BUILD / "audio" / "meta.json").read_text(encoding="utf-8"))
OFFSETS = json.loads((BUILD / "clips" / "offsets.json").read_text())
PAD = 0.6  # silence after each scene's narration
FPS = 30
ENC = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", str(FPS),
       "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2"]


def run(args):
    subprocess.run([FF, "-y", "-loglevel", "error", *args], check=True)


def segment(scene):
    sid = scene["id"]
    dur = META[sid]["duration"] + PAD
    audio = str(BUILD / "audio" / f"{sid}.mp3")
    out = SEG / f"{sid}.mp4"
    afilter = f"[1:a]apad,atrim=0:{dur:.2f},aresample=48000[a]"
    if scene["kind"] == "slide":
        frames = int(dur * FPS)
        img = str(BUILD / "slides" / f"slide{scene['slide']}.png")
        vf = (f"[0:v]scale=3840:2160,zoompan=z='min(1+0.03*on/{frames},1.03)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'"
              f":d={frames}:s=1920x1080:fps={FPS},format=yuv420p[v]")
        run(["-loop", "1", "-framerate", str(FPS), "-t", f"{dur:.2f}", "-i", img, "-i", audio,
             "-filter_complex", f"{vf};{afilter}", "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", *ENC, str(out)])
    else:
        clip = str(BUILD / "clips" / f"{sid}.webm")
        off = OFFSETS[sid]
        vf = f"[0:v]fps={FPS},scale=1920:1080,tpad=stop_mode=clone:stop_duration=10,trim=0:{dur:.2f},setpts=PTS-STARTPTS[v]"
        run(["-ss", f"{off:.2f}", "-i", clip, "-i", audio,
             "-filter_complex", f"{vf};{afilter}", "-map", "[v]", "-map", "[a]", "-t", f"{dur:.2f}", *ENC, str(out)])
    return out, dur


SPOKEN_TO_SHOWN = {"F zero zero one": "F001", "F zero zero two": "F002", "F zero zero three": "F003",
                   "F zero zero five": "F005", "ninety-nine point nine five percent": "99.95%",
                   "one hundred percent": "100%"}


def srt_time(t):
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h):02d}:{int(m):02d}:{int(s):02d},{int(round((s % 1) * 1000)):03d}"


def main():
    SEG.mkdir(parents=True, exist_ok=True)
    parts, srt, clock, n = [], [], 0.0, 1
    for scene in SCENES:
        out, dur = segment(scene)
        parts.append(out)
        for start, end, text in META[scene["id"]]["captions"]:
            for spoken, shown in SPOKEN_TO_SHOWN.items():
                text = text.replace(spoken, shown)
            srt.append(f"{n}\n{srt_time(clock + start)} --> {srt_time(clock + end + 0.15)}\n{text}\n")
            n += 1
        clock += dur
        print(f"{scene['id']}: {dur:.1f}s (total {clock:.1f}s)")
    (BUILD / "captions.srt").write_text("\n".join(srt), encoding="utf-8")
    (ROOT / "MuleTrace_demo.srt").write_text("\n".join(srt), encoding="utf-8")
    (BUILD / "concat.txt").write_text("".join(f"file '{p.as_posix()}'\n" for p in parts), encoding="utf-8")
    run(["-f", "concat", "-safe", "0", "-i", str(BUILD / "concat.txt"), "-c", "copy", str(BUILD / "joined.mp4")])
    style = ("FontName=Segoe UI,FontSize=11,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,"
             "BorderStyle=4,Outline=0,Shadow=0,MarginV=22,Bold=0")
    subprocess.run([FF, "-y", "-loglevel", "error", "-i", "joined.mp4",
                    "-vf", f"subtitles=captions.srt:fontsdir='C\\:/Windows/Fonts':force_style='{style}'",
                    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "copy",
                    "-movflags", "+faststart", str((ROOT / "MuleTrace_demo.mp4").resolve())], check=True, cwd=BUILD)
    size = (ROOT / "MuleTrace_demo.mp4").stat().st_size / 1e6
    print(f"done: MuleTrace_demo.mp4 · {clock:.1f}s ({int(clock // 60)}:{int(clock % 60):02d}) · {size:.1f} MB")


if __name__ == "__main__":
    main()
