"""Read image alpha to measure repaired sprite cells; never edits image pixels."""
from pathlib import Path
from PIL import Image
import hashlib,json,math
root=Path(__file__).resolve().parents[1]
metadata={}
for name in ['nva','aviator']:
    path=root/'assets/sprites'/f'{name}-repaired.png'
    image=Image.open(path).convert('RGBA');w,h=image.size
    frames=[]
    for row in range(6):
        for col in range(8):
            x0,y0=round(col*w/8),round(row*h/6)
            x1,y1=round((col+1)*w/8),round((row+1)*h/6)
            alpha=image.getchannel('A').crop((x0,y0,x1,y1))
            bbox=alpha.point(lambda a:255 if a>128 else 0).getbbox()
            if not bbox:raise ValueError(f'Empty {name} cell {row*8+col}')
            bottom=max(0,1-(y0+bbox[3]-row*h/6)/(h/6))
            height=min(1,(bbox[3]-bbox[1])/(h/6))
            frames.append(dict(bbox=list(bbox),bottom=bottom,height=height))
    metadata[name]=dict(width=w,height=h,frames=frames)
image=Image.open(root/'assets/sprites/nva-front-repaired.png').convert('RGBA');w,h=image.size
bbox=image.getchannel('A').point(lambda a:255 if a>128 else 0).getbbox()
metadata['nva_front']=dict(width=w,height=h,cols=1,rows=1,frames=[dict(bbox=list(bbox),bottom=1-bbox[3]/h,height=(bbox[3]-bbox[1])/h)])
(root/'assets/sprites/atlas-metadata.js').write_text('/* Alpha bounds measured from repaired derivatives; originals remain unchanged. */\nObject.assign(PHOTO_ATLAS,'+json.dumps(metadata,separators=(',',':'))+');\n')
print('Measured 96 repaired pose anchors without changing source pixels')
