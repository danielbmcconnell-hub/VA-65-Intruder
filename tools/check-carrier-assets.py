#!/usr/bin/env python3
"""Measure complete flight-deck photographs without changing source pixels.

--encode performs only exact lossless PNG-to-WebP container conversion. All
decoded RGBA bytes, including hidden RGB, are compared before registration.
"""
from pathlib import Path
import argparse, hashlib, json, shutil, subprocess, statistics
import numpy as np
from PIL import Image
from scipy.ndimage import label, find_objects

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'assets/carrier/hires'
ROLES = ('yellow', 'green', 'red', 'blue', 'brown', 'white')
CLIPS = {'yellow': {'signal': ['a', 'b']}, 'green': {'inspect': ['a']}, 'blue': {'walk': ['a', 'b']}}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def load(file, encode=False):
    png = FOLDER / file
    webp = png.with_suffix('.webp')
    source = np.array(Image.open(png).convert('RGBA'))
    if min(source.shape[:2]) < 1024:
        raise ValueError(f'{file}: source below required full photographic plate resolution')
    if encode and (not webp.exists() or not np.array_equal(source, np.array(Image.open(webp).convert('RGBA')))):
        encoder = shutil.which('cwebp') or '/tmp/intruder-motion-webp/usr/bin/cwebp'
        subprocess.run([encoder, '-quiet', '-lossless', '-exact', '-q', '100', '-m', '6', str(png), '-o', str(webp)], check=True)
    if not webp.is_file() or not np.array_equal(source, np.array(Image.open(webp).convert('RGBA'))):
        raise ValueError(f'{file}: runtime WebP must match every decoded source RGBA byte')
    return source, {'sourcePNG': png.relative_to(ROOT).as_posix(), 'sourceSHA256': sha(png.read_bytes()),
                    'runtimeWebP': webp.relative_to(ROOT).as_posix(), 'runtimeSHA256': sha(webp.read_bytes()),
                    'width': source.shape[1], 'height': source.shape[0], 'sourceBytes': png.stat().st_size,
                    'runtimeBytes': webp.stat().st_size, 'decodedRGBA_SHA256': sha(source.tobytes()),
                    'decodedRGBAIdentical': True, 'includesInvisibleRGB': True}

def details(rgba, mask, x=0, y=0):
    alpha = rgba[:, :, 3]
    core = mask & (alpha > 128)
    ys, xs = np.where(core)
    if len(xs) < 15000:
        raise ValueError('Empty or tiny photographic crew body')
    box = [int(xs.min()), int(ys.min()), int(xs.max() + 1), int(ys.max() + 1)]
    top = int(box[1] + (box[3] - box[1]) * .23)
    bottom = int(box[1] + (box[3] - box[1]) * .60)
    band = np.where(core[top:bottom], alpha[top:bottom], 0).astype(np.float64)
    columns = band.sum(axis=0)
    center = float(np.dot(columns, np.arange(rgba.shape[1]) + .5) / columns.sum())
    solid = float(np.mean(alpha[core] >= 240))
    if solid < .85:
        raise ValueError('Patchy body interior')
    return {'coreBounds': box, 'torsoX': center, 'opaqueInteriorFraction': solid,
            'opaquePixels': int(len(xs)), 'lowerBodyRGBA_SHA256': sha(rgba[int(box[1]+(box[3]-box[1])*.55):box[3], box[0]:box[2]].tobytes())}

def four(rgba, filename):
    labels, _ = label(rgba[:, :, 3] > 8, structure=np.ones((3, 3), dtype=np.uint8))
    sizes = np.bincount(labels.ravel())
    if len(sizes) < 5:
        raise ValueError(f'{filename}: four separate complete figures are required')
    ids = [int(v) for v in np.argsort(sizes[1:])[-4:] + 1]
    objects = find_objects(labels)
    rows = []
    for component in ids:
        sy, sx = objects[component - 1]
        box = [sx.start, sy.start, sx.stop, sy.stop]
        if box[0] == 0 or box[1] == 0 or box[2] == rgba.shape[1] or box[3] == rgba.shape[0]:
            raise ValueError(f'{filename}: complete figure is clipped at source edge {box}')
        rows.append({'component': component, 'box': box})
    rows.sort(key=lambda r: (r['box'][1]+r['box'][3]) / 2)
    rows = sorted(rows[:2], key=lambda r:r['box'][0]) + sorted(rows[2:], key=lambda r:r['box'][0])
    result = []
    for row in rows:
        left, top, right, bottom = row['box']
        foreign = [v for v in ids if v != row['component']]
        for guard in (4, 3, 2, 1, 0):
            x, y = max(0, left-guard), max(0, top-guard)
            endx, endy = min(rgba.shape[1], right+guard), min(rgba.shape[0], bottom+guard)
            alien = int(np.isin(labels[y:endy, x:endx], foreign).sum())
            if not alien:
                break
        if alien:
            raise ValueError(f'{filename}: rectangular extraction includes another figure')
        detail = details(rgba, labels == row['component'])
        result.append({'sourceRegion': [x, y, endx-x, endy-y], 'componentBounds': row['box'],
                       'foreignFigurePixels': alien, 'complete': True, 'guardPixels': guard, **detail})
    return result

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--encode', action='store_true')
    args = parser.parse_args()
    manifest = {'version': 1, 'roles': {}}
    receipts = []
    for name in ROLES:
        rgba, receipt = load(name+'-idle.png', args.encode)
        alpha = rgba[:, :, 3]
        ys, xs = np.where(alpha > 8)
        if xs.min() == 0 or ys.min() == 0 or xs.max() == rgba.shape[1]-1 or ys.max() == rgba.shape[0]-1:
            raise ValueError(name+': idle body touches source edge')
        d = details(rgba, alpha > 8)
        h,w = rgba.shape[:2]
        manifest['roles'][name] = {'idle': {'file': name+'-idle.webp', 'frameSize': [w,h],
          'bounds': [int(xs.min()), int(ys.min()), int(xs.max()+1), int(ys.max()+1)],
          'baseline': d['coreBounds'][3]/h, 'center': d['torsoX']/w,
          'bodyHeight': (d['coreBounds'][3]-d['coreBounds'][1])/h}, 'animations': {}}
        receipt['measurement'] = d
        receipts.append(receipt)
        for action, suffixes in CLIPS.get(name, {}).items():
            frames = []
            plates = []
            for suffix in suffixes:
                filename = name+'-'+action+'-'+suffix+'.png'
                pixels, rec = load(filename, args.encode)
                measured = four(pixels, filename)
                rec['frames'] = measured
                receipts.append(rec)
                frames += measured
                plates.append(filename.replace('.png','.webp'))
            if action == 'walk' and len({f['lowerBodyRGBA_SHA256'] for f in frames}) < len(frames):
                raise ValueError(f'{name}:{action}: duplicate lower-body photographic poses')
            width = max(f['sourceRegion'][2] for f in frames)+16
            height = max(f['sourceRegion'][3] for f in frames)+16
            regions, bounds, registration = [], [], []
            for frame in frames:
                x,y,w,h = frame['sourceRegion']
                dest = [8, height-8-h]
                b = frame['coreBounds']
                translated = [b[0]-x+dest[0], b[1]-y+dest[1], b[2]-x+dest[0], b[3]-y+dest[1]]
                regions.append({'source': [x,y,w,h], 'dest': dest})
                bounds.append(translated)
                registration.append({'baseline': translated[3]/height, 'center': (frame['torsoX']-x+dest[0])/width})
            clip = {'plates': plates, 'frames': len(frames), 'cols': 2, 'rows': 2,
                    'frameSize': [width,height], 'sourceRegions': regions, 'bounds': bounds,
                    'registration': registration,
                    'bodyHeight': statistics.median(f['coreBounds'][3]-f['coreBounds'][1] for f in frames)/height}
            if action == 'signal': clip['weights'] = [1.3,1.1,.9,.8,.8,.9,1.1,1.3]
            if action == 'walk': clip['stride'] = 1.4
            manifest['roles'][name]['animations'][action] = clip
    assert len(receipts)==11
    proof = {'version': 1, 'method': 'Image-generation/editing tool photographic derivatives guided by user carrier crew references; original PNG bytes preserved.',
             'limitations': 'Reconstructed discrete photographic poses, not filmed motion capture; they depict period deck clothing rather than identifying specific people in the supplied photos.',
             'sourceImages': len(receipts), 'idlePoses': 6, 'animationPoses': 20,
             'allDecodedRGBAIdentical': True, 'files': receipts}
    (FOLDER/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    (FOLDER/'provenance.json').write_text(json.dumps(proof,indent=2)+'\n')
    print(json.dumps({'passed':True,'sourceImages':len(receipts),'idlePoses':6,'animationPoses':20,
                      'runtimeBytes':sum(r['runtimeBytes'] for r in receipts),'manifestSHA256':sha((FOLDER/'manifest.json').read_bytes())},indent=2))

if __name__ == '__main__':
    main()
