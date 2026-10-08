#!/usr/bin/env python3
"""Conservative, reproducible derived masks. Never changes original photographic RGB.
Requires Pillow, numpy and scipy. No generated or painted replacement pixels.
Open missing limbs/source crops cannot be recovered by this process.
"""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
from scipy import ndimage as nd
root=Path(__file__).resolve().parents[1]; out=root/'assets/processed';out.mkdir(exist_ok=True)
manifest={}
for name in ['aviator','cow','farmer','female_vc','militia','nva','vegetation']:
 source=root/'assets'/f'{name}.webp'; image=Image.open(source).convert('RGBA'); rgba=np.asarray(image).copy();h,w=rgba.shape[:2];cw,ch=w//8,h//6
 frames=[];recovered=removed=0
 for frame in range(48):
  row,col=divmod(frame,8);cell=rgba[row*ch:(row+1)*ch,col*cw:(col+1)*cw];rgb=cell[:,:,:3].astype(np.int16); mask=cell[:,:,3]>127
  original=mask.copy()
  if name=='vegetation':
   # Numbers underneath plants and disconnected cell-edge fragments are not foliage.
   labels,count=nd.label(mask); keep=np.zeros_like(mask)
   sizes=np.bincount(labels.ravel())
   for label in range(1,count+1):
    ys,xs=np.where(labels==label)
    if sizes[label]>=max(20,sizes[1:].max()*0.012) and not (ys.min()>ch*.84 and sizes[label]<cw*ch*.015):keep|=labels==label
   mask=keep
  else:
   # Recover nearby original coloured source pixels discarded by the transferred
   # binary matte. Reject neutral grey bands and near-black background pixels.
   chromatic=(rgb.max(2)-rgb.min(2)>12)&(rgb.max(2)>22)
   near=nd.distance_transform_edt(~mask)<=3
   mask|=chromatic&near
   enclosed=nd.binary_fill_holes(mask)&~mask
   labels,count=nd.label(enclosed)
   sizes=np.bincount(labels.ravel())
   for label in range(1,count+1):
    hole=labels==label
    # Only closed holes with surviving photographic data; do not fabricate gaps.
    if sizes[label]<=cw*ch*.12:mask|=hole&(rgb.max(2)>12)&((rgb.max(2)-rgb.min(2))>3)
  recovered+=int((mask&~original).sum());removed+=int((original&~mask).sum());cell[:,:,3]=mask.astype('uint8')*255
  ys,xs=np.where(mask)
  # Keep source pixels/cell layout intact. Renderer uses exact visible bottom.
  bbox=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)] if len(xs) else [0,0,0,0]
  frames.append(dict(bbox=bbox,bottom=round(1-bbox[3]/ch,6),height=round((bbox[3]-bbox[1])/ch,6)))
 output=out/f'{name}.webp';Image.fromarray(rgba).save(output,format='WEBP',lossless=True,exact=True,method=6)
 manifest[name]=dict(source='assets/'+source.name,sourceSHA256=hashlib.sha256(source.read_bytes()).hexdigest(),outputSHA256=hashlib.sha256(output.read_bytes()).hexdigest(),width=w,height=h,cols=8,rows=6,recoveredAlphaPixels=recovered,removedAlphaPixels=removed,frames=frames)
 print(name,'recovered',recovered,'removed',removed)
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
# Include the clean original 8-direction, 9-row photographic fallback used by NVA.
meta={n:{'width':v['width'],'height':v['height'],'frames':v['frames']} for n,v in manifest.items()}
im=np.asarray(Image.open(root/'assets/figures-original.png').convert('RGBA'));frames=[]
for row in range(9):
 for col in range(8):
  ys,xs=np.where(im[row*384:(row+1)*384,col*192:(col+1)*192,3]>127)
  bbox=[int(xs.min()),int(ys.min()),int(xs.max()+1),int(ys.max()+1)]
  frames.append(dict(bbox=bbox,bottom=1-bbox[3]/384,height=(bbox[3]-bbox[1])/384))
meta['people']=dict(width=1536,height=3456,frames=frames)
# Small synchronous runtime metadata avoids asynchronous anchor popping.
(root/'assets/atlas-metadata.js').write_text('const PHOTO_ATLAS = '+json.dumps(meta,separators=(',',':'))+';\n')
