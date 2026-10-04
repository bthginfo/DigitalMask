"""Check shipping tutorial budgets and decode every MP4, without application access."""
import json
import subprocess
from pathlib import Path
from PIL import Image
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'public/tutorials'
videos=sorted(PUBLIC.rglob('*.mp4'))
assert videos,'No tutorial videos'
results=[]
for video in videos:
    name=str(video.relative_to(PUBLIC))
    poster=video.with_suffix('.webp')
    captions=video.with_suffix('.vtt')
    assert video.stat().st_size<=1500000,f'{name}: video exceeds budget'
    assert poster.stat().st_size<=30000,f'{name}: poster exceeds budget'
    assert Image.open(poster).size==(360,640),f'{name}: poster proportions'
    assert captions.read_text(encoding='utf-8').startswith('WEBVTT\n'),f'{name}: missing text track'
    # Faststart is material for playback startup: metadata must precede media data.
    payload=video.read_bytes();position=0;boxes=[]
    while position+8<=len(payload):
        size=int.from_bytes(payload[position:position+4],'big')
        kind=payload[position+4:position+8].decode('ascii')
        if size==1:size=int.from_bytes(payload[position+8:position+16],'big')
        assert size>=8,f'{name}: invalid MP4 box'
        boxes.append(kind);position+=size
    assert boxes.index('moov')<boxes.index('mdat'),f'{name}: missing faststart'
    decoded=subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(),'-hide_banner','-loglevel','error','-i',str(video),'-f','null','-'],capture_output=True)
    assert decoded.returncode==0 and not decoded.stderr,(name,decoded.stderr)
    results.append({'name':name,'bytes':len(payload),'decoded':True,'faststart':True,'posterBytes':poster.stat().st_size})
assets=[path for path in PUBLIC.rglob('*') if path.is_file()]
total=sum(path.stat().st_size for path in assets)
assert total<=6000000,'Collection exceeds budget'
assert len(assets)==len(videos)*3,'Unreferenced or missing media'
print(json.dumps({'allAssetBytes':total,'videos':results}))
