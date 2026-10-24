#!/usr/bin/env python3
"""Read-only full-body swim alpha/RGBA audit; optionally write render metadata.

This script never alters image pixels. Source regions are complete alpha>8
connected figures, including limbs crossing nominal atlas cells. The actual
portrait 1x4 source layout is recorded explicitly. Runtime registration aligns
the dense pelvis/torso band at a shared scale instead of stretching silhouettes.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

import numpy as np
from PIL import Image
from scipy.ndimage import find_objects, label, uniform_filter1d

ROOT = Path(__file__).resolve().parents[1]
FOLDER = ROOT / 'assets/sprites/hires'
SUBJECTS = ('nva', 'militia', 'aviator')
ORDER = [7, 6, 5, 0, 1, 2, 3, 4]
RAW_SOURCES = {
    'nva-a': ('/workspace/generated_images/exec-1b58d2d3-8998-4d0c-a779-511ed3e5d693.png', '68704f90499b9cc251f7d4164b3008082fdeffd86d75024d76781f9fc0bf9bf3'),
    'nva-b': ('/workspace/generated_images/exec-22535de6-08e4-48bb-aafb-f57ac0683cbd.png', 'e694900f5ff7cc4c9b5882990eb0c01747663a8edb30b99a81cc04234624f415'),
    'militia-a': ('/workspace/generated_images/exec-d2680034-493a-4e70-be71-91cfe2df7762.png', '06eff7d4bb5aa32c1ca45bdc6db839f4c566b793e57ba5dde5826dd43c752f56'),
    'militia-b': ('/workspace/generated_images/exec-7e20a02c-9908-44d8-9b9e-61fcf491cac1.png', '7e71c5b342067884ddd57dc7426837cf0407cc42cfc5e2368a881bcccbcaf517'),
    'aviator-a': ('/workspace/generated_images/exec-0c43490f-8b3d-405a-9022-083c026b465a.png', 'de1b93ae22e7e7290f513e47532f3b5b349407ec5d3b7e24dccd9f50ebb93694'),
    'aviator-b': ('/workspace/generated_images/exec-d93ba03e-c6ac-48cd-9df5-f247ea45b073.png', '2d752646a959bc539c48db3f2e3e50ac81b3f57152a97d45b89f21e17761d3c6'),
}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def relative(file):
    return file.relative_to(ROOT).as_posix()

def audit_subject(subject):
    cells, plates = [], []
    # One common camera/pixel scale is kept for all eight poses, including
    # recovery arms that extend above the body and pulls below the waterline.
    width, height, torso_x, torso_y, baseline_y, body_pixels = 1152, 512, 450, 280, 460, 400
    for plate_index, part in enumerate('ab'):
        source = FOLDER / f'{subject}-swim-{part}.png'
        runtime = source.with_suffix('.webp')
        generated_original, original_sha = RAW_SOURCES[f'{subject}-{part}']
        if sha(source.read_bytes()) != original_sha:
            raise ValueError(f'{source.name}: raw generated source bytes changed')
        raw = np.array(Image.open(source).convert('RGBA'))
        encoded = np.array(Image.open(runtime).convert('RGBA'))
        if raw.shape != (1536, 1024, 4) or not np.array_equal(raw, encoded):
            raise ValueError(f'{source.name}: size or exact decoded runtime RGBA mismatch')
        labels, _ = label(raw[:, :, 3] > 8, structure=np.ones((3, 3), dtype=np.uint8))
        counts = np.bincount(labels.ravel())
        ids = [int(n) for n in np.argsort(counts[1:])[-4:] + 1]
        objects = find_objects(labels)
        if len(ids) != 4 or min(counts[n] for n in ids) < 10000:
            raise ValueError(f'{source.name}: expected four complete separate figures')
        ids.sort(key=lambda n: objects[n-1][0].start)
        for slot, component in enumerate(ids):
            sy, sx = objects[component-1]
            left, top, right, bottom = sx.start, sy.start, sx.stop, sy.stop
            if min(left, top) < 1 or right >= raw.shape[1] or bottom >= raw.shape[0]:
                raise ValueError(f'{source.name}:{slot}: figure touches source outer edge')
            for guard in (4, 3, 2, 1, 0):
                x, y = max(0, left-guard), max(0, top-guard)
                end_x, end_y = min(raw.shape[1], right+guard), min(raw.shape[0], bottom+guard)
                foreign = int(np.isin(labels[y:end_y, x:end_x], [n for n in ids if n != component]).sum())
                if not foreign:
                    break
            if foreign:
                raise ValueError(f'{source.name}:{slot}: neighbor figure in full-body ROI')
            mask = (labels == component) & (raw[:, :, 3] > 128)
            opaque = float((raw[:, :, 3][mask] >= 240).mean())
            if opaque < .90:
                raise ValueError(f'{source.name}:{slot}: patchy photographic interior')
            # This fixed anatomical band intersects pelvis/torso, avoiding the
            # recovery hand/head and flutter-kick extremities. Dense rows locate
            # its core; only a +/-50px core contributes to the vertical anchor.
            mass = mask[top:bottom, 330:550].sum(axis=1)
            peak = int(np.argmax(uniform_filter1d(mass.astype(float), 51)))
            lo, hi = max(0, peak-50), min(len(mass), peak+51)
            core_y = float((np.arange(lo, hi)*mass[lo:hi]).sum()/mass[lo:hi].sum()+top)
            dest = [int(width/2-torso_x+x), int(round(torso_y-core_y+y))]
            if min(dest) < 0 or dest[0]+end_x-x > width or dest[1]+end_y-y > height:
                raise ValueError(f'{source.name}:{slot}: complete body does not fit common frame')
            region = raw[y:end_y, x:end_x]
            ys, xs = np.nonzero(mask[y:end_y, x:end_x])
            bounds = [int(xs.min())+dest[0], int(ys.min())+dest[1], int(xs.max())+1+dest[0], int(ys.max())+1+dest[1]]
            cells.append({
                'storedFrame': plate_index*4+slot,
                'sourceRegion': [x, y, end_x-x, end_y-y],
                'sourceComponentBounds': [left, top, right, bottom],
                'destination': dest, 'registeredBounds': bounds,
                'sourceTorsoCenter': [torso_x, round(core_y, 6)],
                'registeredTorsoY': round(core_y-y+dest[1], 6),
                'componentPixels': int(counts[component]), 'visiblePixels': int(mask.sum()),
                'opaqueInteriorFraction': round(opaque, 6), 'guardPixels': guard,
                'componentComplete': True, 'foreignFigurePixels': 0,
                'rgbaSHA256': sha(region.tobytes()),
            })
        if Path(generated_original).exists() and source.read_bytes() != Path(generated_original).read_bytes():
            raise ValueError(f'{source.name}: source differs from raw image-generation output')
        plates.append({
            'sourcePNG': relative(source), 'sourceSHA256': sha(source.read_bytes()),
            'runtimeWebP': relative(runtime), 'runtimeSHA256': sha(runtime.read_bytes()),
            'sourceBytes': source.stat().st_size, 'runtimeBytes': runtime.stat().st_size,
            'width': 1024, 'height': 1536, 'sourceLayout': {'cols': 1, 'rows': 4},
            'decodedRGBA_SHA256': sha(raw.tobytes()), 'decodedRGBAIdentical': True,
            'generatedOriginal': generated_original, 'generatedSourceSHA256': original_sha,
        })
    logical = [dict(cells[stored], frame=frame) for frame, stored in enumerate(ORDER)]
    if len({cell['rgbaSHA256'] for cell in logical}) != 8:
        raise ValueError(f'{subject}: duplicated swim photos')
    registration = [{'baseline': baseline_y/height, 'center': .5} for _ in logical]
    animation = {
        'plates': [Path(p['runtimeWebP']).name for p in plates],
        'cols': 1, 'rows': 4, 'frames': 8, 'order': ORDER,
        'stride': .9, 'baseline': baseline_y/height, 'bodyHeight': body_pixels/height,
        'worldHeight': .70, 'facing': 'right', 'frameSize': [width, height],
        'sourceRegions': [{'source': c['sourceRegion'], 'dest': c['destination']} for c in logical],
        'registration': registration,
    }
    report = {
        'subject': subject, 'clip': 'swim', 'frames': 8, 'plates': plates, 'cells': logical,
        'frameSize': [width, height], 'worldHeight': .70, 'bodyPixels': body_pixels,
        'registeredTorsoY': torso_y, 'registeredBaselineY': baseline_y,
        'registeredPixelsPerMeter': body_pixels/.70,
        'scaleCorrection': 'None: common unchanged source pixel scale across all eight poses',
        'orderReason': 'Hip/glide, raised-back recovery, raised-forward recovery, catch/pull/push, glide; generated approximations, not recorded stroke footage.',
    }
    return animation, report

def audit_harness(manifest):
    source = FOLDER/'aviator-harness.png'
    runtime = source.with_suffix('.webp')
    source_sha = '056acd409d066a9839ef471e540dc4cbb287147fb8ebe6a34ca0a53ea2bcdb7f'
    runtime_sha = '184ef1ca84ece18b6d7660dcdb23d12612e7a13d41a262248f8bf9305ad8c769'
    raw_path = Path('/workspace/generated_images/exec-fec1ebe9-016f-4351-875d-b0fffd7926d0.png')
    if sha(source.read_bytes()) != source_sha or sha(runtime.read_bytes()) != runtime_sha:
        raise ValueError('Proper suspended-harness photographic source/runtime bytes changed')
    if raw_path.exists() and raw_path.read_bytes() != source.read_bytes():
        raise ValueError('Harness PNG differs from raw image-tool output')
    rgba = np.array(Image.open(source).convert('RGBA'))
    encoded = np.array(Image.open(runtime).convert('RGBA'))
    if rgba.shape != (1536, 1024, 4) or not np.array_equal(rgba, encoded):
        raise ValueError('Harness exact decoded RGBA mismatch')
    alpha = rgba[:, :, 3]
    if max(alpha[0].max(), alpha[-1].max(), alpha[:, 0].max(), alpha[:, -1].max()) != 0:
        raise ValueError('Suspended body/risers touch source outer border')
    labels, _ = label(alpha > 8, structure=np.ones((3, 3)))
    counts = np.bincount(labels.ravel())[1:]
    if int((counts > 32).sum()) != 1 or int(counts.max()) < 400000:
        raise ValueError('Suspended harness must contain one complete body with risers')
    ys, xs = np.nonzero(alpha > 128)
    bounds = [int(xs.min()), int(ys.min()), int(xs.max())+1, int(ys.max())+1]
    opaque = float((alpha[alpha > 128] >= 240).mean())
    if opaque < .95:
        raise ValueError('Suspended body has patchy alpha')
    if manifest['subjects']['aviator']['poses'].get('harness') != {'file': 'aviator-harness.webp', 'heightRatio': 1.68/1.76}:
        raise ValueError('Harness manifest entry differs from reviewed physical height')
    return {
        'subject': 'aviator', 'pose': 'harness', 'worldHeight': 1.68,
        'sourcePNG': relative(source), 'sourceSHA256': source_sha,
        'runtimeWebP': relative(runtime), 'runtimeSHA256': runtime_sha,
        'generatedOriginal': str(raw_path), 'decodedRGBA_SHA256': sha(rgba.tobytes()),
        'decodedRGBAIdentical': True, 'rawPNGBytesIdentical': True,
        'width': 1024, 'height': 1536, 'sourceBytes': source.stat().st_size,
        'runtimeBytes': runtime.stat().st_size, 'visibleBounds': bounds,
        'opaqueInteriorFraction': round(opaque, 6), 'majorConnectedFigures': 1,
        'visualReview': 'Complete proper suspended body, bent knees, raised hands holding fully bounded short risers, period helmet; never a standing-pose substitution.',
    }

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-manifest', action='store_true')
    parser.add_argument('--report', type=Path, default=FOLDER/'swim-provenance.json')
    args = parser.parse_args()
    manifest_path = FOLDER/'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    baseline = json.loads(subprocess.check_output(['git', 'show', 'HEAD:assets/sprites/hires/manifest.json'], cwd=ROOT))
    # Adding swimming may never alter the existing source inventory or any
    # walking/running anchor, order, scale, base pose or identity registration.
    prior = json.loads(json.dumps(manifest))
    for subject in prior['subjects'].values():
        subject.get('animations', {}).pop('swim', None)
    for subject in baseline['subjects'].values():
        subject.get('animations', {}).pop('swim', None)
    for data in (prior, baseline):
        data['subjects']['aviator']['poses'].pop('harness', None)
    if prior != baseline:
        raise ValueError('Existing photographic base/walk/run metadata changed')
    reports = []
    for subject in SUBJECTS:
        animation, report = audit_subject(subject)
        reports.append(report)
        if args.update_manifest:
            manifest['subjects'][subject]['animations']['swim'] = animation
        elif manifest['subjects'][subject]['animations'].get('swim') != animation:
            raise ValueError(f'{subject}: swim registration differs from measured complete sources')
    harness = audit_harness(manifest)
    output = {
        'version': 1, 'completeClips': 3, 'totalFrames': 24, 'totalPlates': 6,
        'originalReferencesPreserved': True,
        'method': 'Image-generation photographic derivatives; unchanged raw PNG sources and exact lossless WebP RGBA; read-only complete connected-component audit and common-scale torso/waterline render registration.',
        'limitations': 'Generated swimming approximations, not filmed biomechanics. Per-frame semantic ordering/registration does not alter source pixels. Native renderer water immersion is checked separately; actual iPhone Safari remains untested.',
        'physicalAnchor': 'Actor p.y = water surface minus .42m; h=.70m is a shared400px anatomical span, not each pose silhouette height. Pelvis/torso lies .105m below the surface, head and recovering arms above; water depth testing covers immersed limbs.',
        'visualConsistency': 'All eight NVA swim poses use plain olive cloth and unmarked field helmets after focused image-tool corrections; rejected medic-badge candidate was not registered.',
        'clips': reports, 'additionalPoses': [harness],
    }
    args.report.write_text(json.dumps(output, indent=2)+'\n')
    if args.update_manifest:
        manifest_path.write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'completeClips': 3, 'frames': 24, 'plates': 6, 'sourcePNGBytes': sum(p['sourceBytes'] for r in reports for p in r['plates']), 'runtimeWebPBytes': sum(p['runtimeBytes'] for r in reports for p in r['plates']), 'report': str(args.report)}, indent=2))

if __name__ == '__main__':
    main()
