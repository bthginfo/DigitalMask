"""Render the actual app recording with captions; no runtime video dependencies."""
import json
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT=Path(__file__).resolve().parents[2]
WORK=ROOT/'.local/tutorial-release'
OUT=ROOT/'public/tutorials/v1'
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
font=lambda size,bold=False: ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',size)

def timestamp(seconds):return f'{int(seconds//3600):02}:{int(seconds//60)%60:02}:{seconds%60:06.3f}'
def wrap(draw,text,size,width):
    lines,line=[],''
    for word in text.split():
        candidate=f'{line} {word}'.strip()
        if line and draw.textlength(candidate,font=font(size))>width:lines.append(line);line=word
        else:line=candidate
    if line:lines.append(line)
    return lines

def render_push():
    timeline=json.loads((WORK/'push-timeline.json').read_text(encoding='utf-8'))
    duration=timeline['duration'];stages=timeline['stages']
    command=[ffmpeg,'-y','-hide_banner','-loglevel','error','-i',str(WORK/'push.webm')]
    filters=[f"[0:v]trim=start={timeline['recordingOffset']:.3f}:duration={duration:.3f},setpts=PTS-STARTPTS,fps=20,scale=720:1012:flags=lanczos,setsar=1,pad=720:1280:0:72:color=0xf5f8f4[base]"]
    previous='base';cues=['WEBVTT','']
    for index,stage in enumerate(stages):
        panel=Image.new('RGBA',(720,1280),(0,0,0,0));draw=ImageDraw.Draw(panel)
        draw.rectangle((0,0,720,71),fill='#f5f8f4');draw.text((24,18),'digitalmask',font=font(26,True),fill='#14745e')
        draw.text((230,25),'SO GEHT’S',font=font(16,True),fill='#52645c')
        draw.text((696,24),'Beispieldaten',font=font(17),fill='#52645c',anchor='ra')
        draw.rectangle((0,1084,720,1280),fill='#f5f8f4')
        draw.line((0,1084,720,1084),fill='#dce5de',width=2)
        draw.ellipse((24,1110,78,1164),fill='#14745e')
        if stage['step']:draw.text((51,1135),str(stage['step']),font=font(25,True),fill='white',anchor='mm')
        else:draw.polygon([(45,1125),(45,1149),(63,1137)],fill='white')
        draw.text((98,1104),stage['title'],font=font(29,True),fill='#20382f')
        for number,line in enumerate(wrap(draw,stage['text'],25,588)):draw.text((98,1148+number*33),line,font=font(25),fill='#52645c')
        for dot in range(5):draw.rounded_rectangle((98+dot*24,1252,114+dot*24,1257),radius=2,fill='#14745e' if dot<stage['step'] else '#dce5de')
        path=WORK/f'push-caption-{index}.png';panel.save(path)
        command+=['-loop','1','-framerate','20','-i',str(path)]
        end=stages[index+1]['at'] if index+1<len(stages) else duration
        filters.append(f"[{previous}][{index+1}:v]overlay=0:0:enable='gte(t,{stage['at']:.3f})*lt(t,{end:.3f})'[s{index}]")
        previous=f's{index}'
        cues += [f"{timestamp(stage['at'])} --> {timestamp(end)}",f"{stage['title']}. {stage['text']}",'']
    video=OUT/'push-enable.mp4'
    command+=['-filter_complex',';'.join(filters),'-map',f'[{previous}]','-an','-c:v','libx264','-preset','fast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart','-t',f'{duration:.3f}',str(video)]
    subprocess.run(command,check=True)
    (OUT/'push-enable.vtt').write_text('\n'.join(cues),encoding='utf-8')
    poster=WORK/'push-poster.png'
    subprocess.run([ffmpeg,'-y','-hide_banner','-loglevel','error','-ss',str(stages[2]['at']+1),'-i',str(video),'-frames:v','1',str(poster)],check=True)
    Image.open(poster).resize((360,640),Image.Resampling.LANCZOS).save(OUT/'push-enable.webp',quality=76,method=6)
    print(json.dumps({'name':'push-enable','durationSeconds':round(duration),'bytes':video.stat().st_size}))

def prepare_attendance():
    # The approved demo clip is copied separately; derive the same accessible text track.
    timeline=json.loads((ROOT/'.local/tutorial-demo/timeline.json').read_text(encoding='utf-8'))
    cues=['WEBVTT','']
    for index,stage in enumerate(timeline['stages']):
        end=timeline['stages'][index+1]['at'] if index+1<len(timeline['stages']) else timeline['duration']
        cues += [f"{timestamp(stage['at'])} --> {timestamp(end)}",f"{stage['title']}. {stage['text']}",'']
    (OUT/'attendance.vtt').write_text('\n'.join(cues),encoding='utf-8')
    Image.open(ROOT/'artifacts/tutorial-demo/anwesenheit-nachtragen.jpg').resize((360,640),Image.Resampling.LANCZOS).save(OUT/'attendance.webp',quality=76,method=6)

if __name__=='__main__':
    import sys
    if len(sys.argv)>1 and sys.argv[1]=='attendance':prepare_attendance()
    else:render_push()
