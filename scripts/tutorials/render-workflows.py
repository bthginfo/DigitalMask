"""Render short recordings and generate their catalogue from actual output files."""
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / '.local/tutorial-workflows'
VERSION = os.environ.get('TUTORIAL_MEDIA_VERSION', 'v3')
assert re.fullmatch(r'v[1-9][0-9]*', VERSION), 'Invalid media version'
OUT = ROOT / 'public/tutorials' / VERSION
FONT_PATH = 'C:/Windows/Fonts/'

def font(size, bold=False):
    return ImageFont.truetype(FONT_PATH + ('segoeuib.ttf' if bold else 'segoeui.ttf'), size)

def timestamp(seconds):
    return f'{int(seconds//3600):02}:{int(seconds//60)%60:02}:{seconds%60:06.3f}'

def wrap(draw, text, size, width):
    lines, line = [], ''
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if line and draw.textlength(candidate, font=font(size)) > width:
            lines.append(line)
            line = word
        else:
            line = candidate
    if line:
        lines.append(line)
    return lines

def fixture():
    WORK.mkdir(parents=True, exist_ok=True)
    image = Image.new('RGB', (480, 360), '#e7ede6')
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((26, 22, 454, 338), radius=18, fill='#fffdf6', outline='#b3c8b8', width=3)
    draw.ellipse((176, 76, 304, 230), fill='#ead3ba', outline='#a99885', width=3)
    draw.pieslice((157, 46, 324, 210), 175, 365, fill='#795c47')
    draw.line((184, 181, 197, 173, 208, 180), fill='#795c47', width=3)
    draw.line((273, 181, 286, 173, 296, 180), fill='#795c47', width=3)
    draw.rounded_rectangle((225, 219, 254, 268), radius=10, fill='#ead3ba')
    draw.line((194, 281, 286, 281), fill='#9aaf9f', width=7)
    draw.text((240, 29), 'REFERENZBILD · BEISPIEL', font=font(17, True), fill='#377a68', anchor='ma')
    draw.text((240, 303), 'Besetzung · Perücke', font=font(21), fill='#52645c', anchor='ma')
    image.save(WORK / 'reference.png')

def catalogue_entry(timeline):
    name = timeline['id']
    result = {key: timeline[key] for key in ('id', 'title', 'description', 'guideId')}
    result.update(platform='all', durationSeconds=round(timeline['duration']), bytes=(OUT / f'{name}.mp4').stat().st_size, video=f'/tutorials/{VERSION}/{name}.mp4', poster=f'/tutorials/{VERSION}/{name}.webp', captions=f'/tutorials/{VERSION}/{name}.vtt', steps=[stage['text'] for stage in timeline['stages']], schematic=False)
    return result

def render(directory):
    timeline = json.loads((directory / 'timeline.json').read_text(encoding='utf-8'))
    name = timeline['id']
    duration, stages = timeline['duration'], timeline['stages']
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    metadata = subprocess.run([ffmpeg, '-hide_banner', '-i', str(directory / 'raw.webm')], capture_output=True, text=True, encoding='utf-8', errors='replace')
    clock = re.search(r'Duration: (\d+):(\d+):(\d+\.\d+)', metadata.stderr)
    assert clock, f'{name}: recording duration unavailable'
    raw_duration = int(clock[1]) * 3600 + int(clock[2]) * 60 + float(clock[3])
    assert raw_duration >= duration - .25, f'{name}: incomplete recording'
    # Video begins with the first captured frame, not with newPage/navigation.
    # Align the end of the recorded flow instead of trimming its startup wall time.
    recording_offset = max(0, raw_duration - duration)
    command = [ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-i', str(directory / 'raw.webm')]
    filters = [f"[0:v]trim=start={recording_offset:.3f}:duration={duration:.3f},setpts=PTS-STARTPTS,fps=15,scale=720:1012:flags=lanczos,setsar=1,pad=720:1280:0:72:color=0xf5f8f4[base]"]
    previous, cues = 'base', ['WEBVTT', '']
    for index, stage in enumerate(stages):
        panel = Image.new('RGBA', (720, 1280), (0, 0, 0, 0))
        draw = ImageDraw.Draw(panel)
        draw.rectangle((0, 0, 720, 71), fill='#f5f8f4')
        draw.text((24, 18), 'digitalmask', font=font(26, True), fill='#14745e')
        draw.text((230, 25), 'SO GEHT’S', font=font(16, True), fill='#52645c')
        draw.text((696, 24), 'Beispieldaten', font=font(17), fill='#52645c', anchor='ra')
        draw.rectangle((0, 1084, 720, 1280), fill='#f5f8f4')
        draw.line((0, 1084, 720, 1084), fill='#dce5de', width=2)
        draw.ellipse((24, 1110, 78, 1164), fill='#14745e')
        draw.text((51, 1135), str(stage['step']), font=font(25, True), fill='white', anchor='mm')
        title_size = 29
        while draw.textlength(stage['title'], font=font(title_size, True)) > 598:
            title_size -= 1
        draw.text((98, 1104), stage['title'], font=font(title_size, True), fill='#20382f')
        lines = wrap(draw, stage['text'], 25, 588)
        size = 25 if len(lines) <= 3 else 23
        lines = wrap(draw, stage['text'], size, 588)
        assert len(lines) <= 3, f'{name}: caption too long'
        for number, line in enumerate(lines):
            draw.text((98, 1148 + number * 33), line, font=font(size), fill='#52645c')
        for dot in range(len(stages)):
            draw.rounded_rectangle((98 + dot * 24, 1252, 114 + dot * 24, 1257), radius=2, fill='#14745e' if dot < stage['step'] else '#dce5de')
        path = directory / f'caption-{index}.png'
        panel.save(path)
        command += ['-loop', '1', '-framerate', '15', '-i', str(path)]
        end = stages[index + 1]['at'] if index + 1 < len(stages) else duration
        filters.append(f"[{previous}][{index+1}:v]overlay=0:0:enable='gte(t,{stage['at']:.3f})*lt(t,{end:.3f})'[s{index}]")
        previous = f's{index}'
        cues += [f"{timestamp(stage['at'])} --> {timestamp(end)}", f"{stage['title']}. {stage['text']}", '']
    OUT.mkdir(parents=True, exist_ok=True)
    video = OUT / f'{name}.mp4'
    command += ['-filter_complex', ';'.join(filters), '-map', f'[{previous}]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-t', f'{duration:.3f}', str(video)]
    subprocess.run(command, check=True)
    (OUT / f'{name}.vtt').write_text('\n'.join(cues), encoding='utf-8', newline='\n')
    poster = directory / 'poster.png'
    subprocess.run([ffmpeg, '-y', '-hide_banner', '-loglevel', 'error', '-ss', str(stages[min(2, len(stages)-1)]['at'] + .7), '-i', str(video), '-frames:v', '1', str(poster)], check=True)
    Image.open(poster).resize((360, 640), Image.Resampling.LANCZOS).save(OUT / f'{name}.webp', quality=76, method=6)
    result = catalogue_entry(timeline)
    print(json.dumps({'id': name, 'seconds': result['durationSeconds'], 'bytes': result['bytes']}), flush=True)
    return result

if __name__ == '__main__':
    if sys.argv[1:] == ['fixture']:
        fixture()
    else:
        choices = set(sys.argv[1:])
        directories = sorted(directory for directory in WORK.iterdir() if directory.is_dir() and (directory / 'timeline.json').exists() and (not choices or directory.name in choices))
        assert directories, 'No recordings found'
        catalogue = ROOT / 'src/modules/help/workflow-tutorials.ts'
        entries = {}
        if catalogue.exists():
            # A single re-recording must retain clips whose raw takes were already cleaned up.
            existing = subprocess.run(['node', '--import', 'tsx', '--input-type=module', '-e', 'import { workflowTutorials } from "./src/modules/help/workflow-tutorials.ts"; process.stdout.write(JSON.stringify(workflowTutorials));'], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', check=True)
            entries = {entry['id']: entry for entry in json.loads(existing.stdout)}
        for directory in directories:
            timeline = json.loads((directory / 'timeline.json').read_text(encoding='utf-8'))
            name = timeline['id']
            assert not any((OUT / f'{name}.{suffix}').exists() for suffix in ('mp4', 'webp', 'vtt')), f'{name}: choose a fresh version; published assets are immutable'
            entries[name] = render(directory)
        # Preserve explicit recording order in the help library.
        order = ['calendar-people', 'casting-photos', 'production-tasks', 'mask-plan-blocks', 'look-sections', 'production-time', 'time-history', 'private-chat']
        ordered_entries = sorted(entries.values(), key=lambda entry: order.index(entry['id']))
        catalogue.write_text('import type { HelpTutorial } from "./tutorials";\n\nexport const workflowTutorials: HelpTutorial[] = ' + json.dumps(ordered_entries, ensure_ascii=False, indent=2) + ';\n', encoding='utf-8', newline='\n')
