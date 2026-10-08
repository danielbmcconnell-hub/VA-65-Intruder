from pathlib import Path
import json,hashlib,numpy as np
from PIL import Image
p=Path(__file__).resolve().parents[1];m=json.loads((p/'assets/processed/manifest.json').read_text())
for name,v in m.items():
 old=Image.open(p/v['source']).convert('RGBA');new=Image.open(p/'assets/processed'/f'{name}.webp').convert('RGBA');old.load();new.load()
 assert old.size==new.size
 assert np.array_equal(np.asarray(old)[:,:,:3],np.asarray(new)[:,:,:3]),name+' original RGB pixels changed'
 assert hashlib.sha256((p/v['source']).read_bytes()).hexdigest()==v['sourceSHA256']
 assert hashlib.sha256((p/'assets/processed'/f'{name}.webp').read_bytes()).hexdigest()==v['outputSHA256']
 assert len(v['frames'])==48
 assert all(0<f['height']<=1 and 0<=f['bottom']<1 for f in v['frames'])
print('PASS: seven strictly decoded derived atlases, unchanged dimensions and original photographic RGB, exact manifest hashes and48anchors each')
