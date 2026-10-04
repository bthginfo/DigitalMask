"""Generate silent, schematic OS walkthroughs. Requires Pillow and imageio-ffmpeg.

Never records a real phone or personal information. Bump the public version directory
before replacing an asset that has already shipped with immutable caching.
"""
import json
import math
import subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/tutorials/v1'
OUT.mkdir(parents=True, exist_ok=True)
GREEN, INK, MUTED, BG, LINE = '#14745e', '#20382f', '#52645c', '#f4f7f2', '#dce5de'
FONT_DIR = Path('C:/Windows/Fonts')
def font(size, bold=False):
    return ImageFont.truetype(str(FONT_DIR / ('segoeuib.ttf' if bold else 'segoeui.ttf')), size)

def paragraph(draw, text, position, width, size=26, fill=MUTED, bold=False, spacing=7):
    face = font(size,bold)
    line, lines = '', []
    for word in text.split():
        candidate = f'{line} {word}'.strip()
        if line and draw.textlength(candidate,font=face) > width:
            lines.append(line); line = word
        else: line = candidate
    if line: lines.append(line)
    for index,line in enumerate(lines):
        draw.text((position[0],position[1]+index*(size+spacing)),line,font=face,fill=fill)
    return len(lines)*(size+spacing)

ICON = Image.open(ROOT/'public/icon-192.png').convert('RGBA')
def app_icon(image, x, y, size=80):
    image.paste(ICON.resize((size,size),Image.Resampling.LANCZOS),(x,y),ICON.resize((size,size),Image.Resampling.LANCZOS))

def button(draw, box, label, primary=False, size=25):
    draw.rounded_rectangle(box,radius=16,fill=GREEN if primary else 'white',outline=GREEN if primary else LINE,width=2)
    draw.text(((box[0]+box[2])/2,(box[1]+box[3])/2),label,font=font(size,True),fill='white' if primary else INK,anchor='mm')

def phone_base(platform):
    image=Image.new('RGB',(720,1280),BG);draw=ImageDraw.Draw(image)
    draw.text((24,24),'digitalmask',font=font(28,True),fill=GREEN)
    draw.text((696,29),'iPhone / iPad' if platform=='ios' else 'Android',font=font(23,True),fill=INK,anchor='ra')
    draw.text((24,79),'HANDY-MENÜS · VEREINFACHTE ANSICHT',font=font(17,True),fill=MUTED)
    draw.rounded_rectangle((83,136,637,1050),radius=44,fill='#263a31')
    draw.rounded_rectangle((92,145,628,1041),radius=37,fill='white')
    draw.text((126,171),'9:41',font=font(21,True),fill=INK)
    draw.rounded_rectangle((542,173,591,194),radius=5,outline=INK,width=2)
    draw.rounded_rectangle((547,178,578,189),radius=2,fill=INK)
    draw.rectangle((592,179,596,188),fill=INK)
    draw.rounded_rectangle((322,166,398,188),radius=11,fill='#263a31')
    draw.rounded_rectangle((126,232,594,293),radius=20,fill='#edf1ed')
    draw.text((146,251),'digitalmask.vercel.app',font=font(23),fill=INK)
    app_icon(image,128,325,45)
    draw.text((187,326),'digitalmask',font=font(29,True),fill=INK)
    draw.text((128,392),'Heute im Theater',font=font(32,True),fill=INK)
    draw.text((128,442),'Alles für euren Tag.',font=font(24),fill=MUTED)
    draw.rounded_rectangle((124,508,596,641),radius=18,fill=BG,outline=LINE,width=2)
    draw.text((146,531),'Anwesenheit diese Woche',font=font(23),fill=MUTED)
    draw.text((146,575),'0 h',font=font(34,True),fill=INK)
    draw.rounded_rectangle((124,674,596,831),radius=18,fill='white',outline=LINE,width=2)
    draw.text((146,695),'Neu für dich',font=font(25,True),fill=INK)
    draw.text((146,749),'Alles auf dem neuesten Stand.',font=font(21),fill=MUTED)
    if platform=='ios':
        draw.line((114,918,606,918),fill=LINE,width=2)
        draw.line((156,950,141,965,156,980),fill=GREEN,width=4)
        draw.rounded_rectangle((330,940,464,999),radius=18,fill='#edf1ed')
        draw.text((351,955),'Safari',font=font(23),fill=INK)
        # Share glyph: square with arrow, using vectors rather than unsupported font glyphs.
        draw.line((523,960,523,980,551,980,551,960),fill=GREEN,width=3)
        draw.line((537,967,537,944),fill=GREEN,width=3)
        draw.line((530,951,537,944,544,951),fill=GREEN,width=3)
    else:
        for y in (251,264,277):draw.ellipse((568,y-3,574,y+3),fill=INK)
    draw.rounded_rectangle((283,1021,437,1027),radius=3,fill='#263a31')
    return image

def ios_scene(index):
    image=phone_base('ios');draw=ImageDraw.Draw(image)
    target=(344,264)
    if index==1:
        target=(537,965)
        draw.rounded_rectangle((504,934,573,996),radius=17,outline=GREEN,width=3)
    elif index==2:
        draw.rounded_rectangle((112,481,608,1008),radius=27,fill='#f8faf7',outline=LINE,width=2)
        draw.text((144,510),'Teilen',font=font(30,True),fill=INK)
        app_icon(image,144,571,58)
        draw.text((220,581),'DigitalMask',font=font(25,True),fill=INK)
        draw.text((143,689),'Link kopieren',font=font(23),fill=MUTED)
        draw.text((143,751),'Lesezeichen hinzufügen',font=font(23),fill=MUTED)
        draw.rounded_rectangle((132,815,588,929),radius=17,fill='#e4f0e8',outline=GREEN,width=3)
        paragraph(draw,'Zu Home-Bildschirm hinzufügen',(152,837),410,size=25,fill=GREEN,bold=True)
        target=(363,870)
    elif index==3:
        draw.rounded_rectangle((110,302,610,890),radius=25,fill='white',outline=LINE,width=2)
        draw.text((139,330),'Zum Home-Bildschirm',font=font(27,True),fill=INK)
        app_icon(image,153,405,84)
        draw.text((262,426),'DigitalMask',font=font(28,True),fill=INK)
        draw.text((140,550),'Als Web-App öffnen',font=font(24),fill=INK)
        draw.rounded_rectangle((489,549,577,591),radius=21,fill=GREEN)
        draw.ellipse((536,553,573,588),fill='white')
        draw.text((140,611),'Falls diese Auswahl angezeigt wird.',font=font(20),fill=MUTED)
        button(draw,(139,717,581,793),'Hinzufügen',True)
        target=(360,755)
    elif index==4:
        draw.rounded_rectangle((100,217,620,1005),radius=28,fill='#edf4eb')
        draw.text((132,276),'Dein Home-Bildschirm',font=font(29,True),fill=INK)
        app_icon(image,167,438,104)
        draw.text((219,567),'DigitalMask',font=font(23),fill=INK,anchor='ma')
        paragraph(draw,'Öffne die App über dieses Symbol.',(142,687),420,size=28,fill=INK)
        paragraph(draw,'Melde dich an. Schalte anschließend in der App die Mitteilungen ein.',(142,780),420,size=24)
        target=(219,490)
    return image,target

def android_scene(index):
    image=phone_base('android');draw=ImageDraw.Draw(image);target=(340,264)
    if index==1:
        draw.rounded_rectangle((230,299,609,815),radius=19,fill='white',outline=LINE,width=2)
        draw.text((254,332),'Chrome-Menü',font=font(27,True),fill=INK)
        draw.text((254,412),'Neuer Tab',font=font(23),fill=MUTED)
        draw.text((254,478),'Verlauf',font=font(23),fill=MUTED)
        draw.text((254,543),'Teilen …',font=font(23),fill=MUTED)
        draw.rounded_rectangle((245,610,593,747),radius=14,fill='#e4f0e8',outline=GREEN,width=3)
        paragraph(draw,'Zum Startbildschirm hinzufügen',(260,633),310,size=26,fill=GREEN,bold=True)
        target=(572,264)
    elif index==2:
        draw.rounded_rectangle((118,405,602,828),radius=24,fill='white',outline=LINE,width=3)
        app_icon(image,151,448,74)
        paragraph(draw,'DigitalMask installieren?',(247,454),322,size=26,fill=INK,bold=True)
        draw.text((151,562),'digitalmask.vercel.app',font=font(23),fill=MUTED)
        button(draw,(141,669,315,747),'Abbrechen',size=22)
        button(draw,(331,669,578,747),'Installieren',True)
        target=(452,709)
    elif index==3:
        draw.rounded_rectangle((100,217,620,1005),radius=28,fill='#edf4eb')
        draw.text((132,276),'Dein Startbildschirm',font=font(29,True),fill=INK)
        app_icon(image,167,438,104)
        draw.text((219,567),'DigitalMask',font=font(23),fill=INK,anchor='ma')
        paragraph(draw,'Öffne die App über dieses Symbol und melde dich an.',(142,687),420,size=28,fill=INK)
        target=(219,490)
    elif index==4:
        draw.rounded_rectangle((108,215,612,1003),radius=25,fill='white')
        draw.text((133,262),'Einstellungen',font=font(31,True),fill=INK)
        paragraph(draw,'Mitteilungen auf diesem Gerät',(133,363),440,size=28,fill=INK,bold=True)
        paragraph(draw,'Du entscheidest für jedes Handy einzeln.',(133,452),440,size=25)
        button(draw,(134,590,586,674),'Mitteilungen aktivieren',True,size=24)
        paragraph(draw,'Erlauben → Testmitteilung',(135,733),440,size=25,fill=INK)
        target=(359,633)
    return image,target

STEPS={
 'ios':[
  ('Safari öffnen','Öffne digitalmask.vercel.app in Safari.'),
  ('Teilen öffnen','Tippe auf Teilen. Je nach Ansicht findest du es im Seitenmenü oder unter Mehr (…).'),
  ('Zum Home-Bildschirm','Wähle Zu Home-Bildschirm hinzufügen. Fehlt der Eintrag? Suche Aktionen bearbeiten.'),
  ('App hinzufügen','Lass Als Web-App öffnen eingeschaltet, falls angezeigt. Tippe auf Hinzufügen.'),
  ('App starten','Öffne das neue Symbol und melde dich an. Danach: Mehr → Einstellungen → Mitteilungen aktivieren.'),
 ],
 'android':[
  ('Chrome öffnen','Öffne digitalmask.vercel.app in Chrome.'),
  ('Installation auswählen','Öffne das Dreipunkt-Menü. Alternativ: App installieren direkt in DigitalMask.'),
  ('Installation bestätigen','Wähle Zum Startbildschirm hinzufügen und dann Installieren. Namen können abweichen.'),
  ('App starten','Öffne das neue App-Symbol und melde dich an.'),
  ('Mitteilungen einschalten','Unter Mehr → Einstellungen: Mitteilungen aktivieren, erlauben und Testmitteilung senden.'),
 ]
}

def timestamp(seconds):
    return f'{int(seconds//3600):02}:{int(seconds//60)%60:02}:{seconds%60:06.3f}'

def generate(platform):
    frames_per_second, scene_seconds=12,5
    name=f'{platform}-install'
    cmd=[imageio_ffmpeg.get_ffmpeg_exe(),'-y','-hide_banner','-loglevel','error','-f','rawvideo','-vcodec','rawvideo','-pix_fmt','rgb24','-s','720x1280','-r',str(frames_per_second),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',str(OUT/f'{name}.mp4')]
    process=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    previous=(355,780)
    cues=['WEBVTT','']
    for index,(title,text) in enumerate(STEPS[platform]):
        scene,target=(ios_scene if platform=='ios' else android_scene)(index)
        draw=ImageDraw.Draw(scene)
        draw.line((0,1070,720,1070),fill=LINE,width=2)
        draw.ellipse((24,1100,78,1154),fill=GREEN)
        draw.text((51,1127),str(index+1),font=font(25,True),fill='white',anchor='mm')
        draw.text((98,1095),title,font=font(29,True),fill=INK)
        paragraph(draw,text,(98,1142),588,size=25,spacing=8)
        for dot in range(5):draw.rounded_rectangle((98+dot*24,1253,114+dot*24,1258),radius=2,fill=GREEN if dot<=index else LINE)
        if index==2:
            scene.resize((360,640),Image.Resampling.LANCZOS).save(OUT/f'{name}.webp',quality=76,method=6)
        cues += [f'{timestamp(index*scene_seconds)} --> {timestamp((index+1)*scene_seconds)}',f'{title}. {text}','']
        for frame_index in range(scene_seconds*frames_per_second):
            image=scene.copy();overlay=Image.new('RGBA',image.size,(0,0,0,0));ring=ImageDraw.Draw(overlay)
            t=min(1,frame_index/(frames_per_second*.8));eased=3*t*t-2*t*t*t
            x=previous[0]+(target[0]-previous[0])*eased;y=previous[1]+(target[1]-previous[1])*eased
            ring.ellipse((x-14,y-14,x+14,y+14),fill=(184,236,208,110),outline=(20,116,94,255),width=3)
            pulse=frame_index/frames_per_second-.85
            if 0<=pulse<.7:
                radius=18+40*pulse/.7
                ring.ellipse((x-radius,y-radius,x+radius,y+radius),outline=(20,116,94,int(255*(1-pulse/.7))),width=3)
            image=Image.alpha_composite(image.convert('RGBA'),overlay).convert('RGB')
            process.stdin.write(image.tobytes())
        previous=target
    process.stdin.close()
    if process.wait():raise RuntimeError('Video encoder failed')
    (OUT/f'{name}.vtt').write_text('\n'.join(cues),encoding='utf-8')
    return {'name':name,'durationSeconds':len(STEPS[platform])*scene_seconds,'bytes':(OUT/f'{name}.mp4').stat().st_size}

if __name__=='__main__':print(json.dumps([generate('ios'),generate('android')]))
