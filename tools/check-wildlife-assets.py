#!/usr/bin/env python3
"""Measure complete wildlife/botanical photographs without editing image pixels.

The optional manifest update writes registration JSON only. PNG and runtime
WebP are independently decoded and must match every RGBA byte, including RGB
under transparent pixels. Four-pose plates are measured as complete connected
figures instead of blindly slicing nominal atlas cells.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import statistics

import numpy as np
from PIL import Image
from scipy.ndimage import find_objects, label

ROOT = Path(__file__).resolve().parents[1]
WILDLIFE = ROOT / 'assets/wildlife/hires'
JUNGLE = ROOT / 'assets/jungle'
SPECS = {
    'boar': {'mode': 'billboard', 'length': 1.65, 'width': .7, 'height': .95, 'clips': {'walk': (16, 1.7), 'run': (16, 4.8)}},
    'tiger': {'mode': 'billboard', 'length': 2.65, 'width': .68, 'height': 1.05, 'clips': {'walk': (16, 2.2), 'run': (16, 6.3)}},
    'krait': {'mode': 'ground', 'length': 1.15, 'width': .62, 'height': .1, 'clips': {'crawl': (8, .628318530718), 'threat': (4, .628318530718)}},
    'cobra': {'mode': 'ground', 'length': 1.45, 'width': .62, 'height': .45, 'clips': {'crawl': (8, .628318530718), 'threat': (4, .628318530718)}},
    'pit-viper': {'mode': 'ground', 'length': .9, 'width': .62, 'height': .1, 'clips': {'crawl': (8, .628318530718), 'threat': (4, .628318530718)}},
    'scorpion': {'mode': 'ground', 'length': .14, 'width': .09, 'height': .045, 'clips': {'crawl': (8, .12)}},
    'centipede': {'mode': 'ground', 'length': .23, 'width': .055, 'height': .025, 'clips': {'crawl': (8, .18)}},
    'weaver-ants': {'mode': 'ground', 'length': .016, 'width': .012, 'height': .006, 'clips': {'crawl': (8, .025)}},
}
PLANTS = ('canopy', 'bamboo', 'nipa', 'fern', 'liana', 'litter')
# Independent tight-head self-matched correlation and opaque torso-thickness
# measurements found higher camera magnification in these three packed plates.
# Register the whole photograph uniformly; never edit or normalize its pixels.
# Any replacement source requires a fresh review before this correction applies.
CAMERA_REGISTRATION = {
    ('tiger', 'run'): {
        1: {'scale': .88, 'sourceSHA256': 'ba97eb718c84b25e0712f650338b87b48495777c6d607db33320543479f9a602'},
        2: {'scale': .86, 'sourceSHA256': '2562aab55471cb4d79c50c83a0e3c96e8d89a5d1582453f571545e1c48d49f7e'},
        3: {'scale': .86, 'sourceSHA256': '46ed19e5ea56c758a9bdf954573c83e43fe140f1304a812ec86794bf7a1d33ec'},
    }
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(file):
    return file.relative_to(ROOT).as_posix()


def pair(file):
    runtime = file.with_suffix('.webp')
    missing = [relative(f) for f in (file, runtime) if not f.is_file()]
    if missing:
        return None, {'missing': missing}
    source = np.array(Image.open(file).convert('RGBA'))
    decoded = np.array(Image.open(runtime).convert('RGBA'))
    if source.shape != decoded.shape or not np.array_equal(source, decoded):
        raise ValueError(f'{runtime.name}: decoded runtime RGBA differs from the unchanged PNG')
    return source, {
        'sourcePNG': relative(file), 'sourceSHA256': sha(file.read_bytes()),
        'runtimeWebP': relative(runtime), 'runtimeSHA256': sha(runtime.read_bytes()),
        'dimensions': [int(source.shape[1]), int(source.shape[0])],
        'sourceBytes': file.stat().st_size, 'runtimeBytes': runtime.stat().st_size,
        'decodedRGBA_SHA256': sha(source.tobytes()), 'decodedRGBAIdentical': True,
        'includesInvisibleRGB': True,
    }


def complete_figures(rgba, filename, plate_index):
    alpha = rgba[:, :, 3]
    labels, _ = label(alpha > 8, structure=np.ones((3, 3), dtype=np.uint8))
    counts = np.bincount(labels.ravel())
    if len(counts) < 5:
        raise ValueError(f'{filename}: fewer than four separate complete figures')
    ids = [int(i) for i in np.argsort(counts[1:])[-4:] + 1]
    if min(counts[i] for i in ids) < 1500:
        raise ValueError(f'{filename}: a main figure has fewer than 1500 visible pixels')
    objects = find_objects(labels)
    figures = []
    for component in ids:
        sy, sx = objects[component - 1]
        box = [sx.start, sy.start, sx.stop, sy.stop]
        if sx.start == 0 or sy.start == 0 or sx.stop == rgba.shape[1] or sy.stop == rgba.shape[0]:
            raise ValueError(f'{filename}: complete figure touches the PNG boundary {box}')
        figures.append({'component': component, 'box': box})
    figures.sort(key=lambda c: (c['box'][1] + c['box'][3]) / 2)
    if rgba.shape[1] >= rgba.shape[0]:
        figures = sorted(figures[:2], key=lambda c: c['box'][0]) + sorted(figures[2:], key=lambda c: c['box'][0])
    # Capture detached bristles/antennae that remain next to their main body.
    # A region must still contain zero pixels from any other major figure.
    result = []
    for index, figure in enumerate(figures):
        left, top, right, bottom = figure['box']
        foreign = [i for i in ids if i != figure['component']]
        for guard in (8, 6, 4, 3, 2, 1, 0):
            x, y = max(0, left - guard), max(0, top - guard)
            end_x, end_y = min(rgba.shape[1], right + guard), min(rgba.shape[0], bottom + guard)
            foreign_pixels = int(np.isin(labels[y:end_y, x:end_x], foreign).sum())
            if not foreign_pixels:
                break
        if foreign_pixels:
            raise ValueError(f'{filename}: frame {plate_index * 4 + index} rectangular extraction contains another figure')
        region = rgba[y:end_y, x:end_x]
        mask = (labels[y:end_y, x:end_x] == figure['component']) & (region[:, :, 3] > 128)
        ys, xs = np.nonzero(mask)
        if not len(xs):
            raise ValueError(f'{filename}: empty opaque figure')
        core = [int(xs.min()) + x, int(ys.min()) + y, int(xs.max()) + x + 1, int(ys.max()) + y + 1]
        opaque = float(np.mean(region[:, :, 3][mask] >= 240))
        detail = float(np.mean(np.std(region[:, :, :3][mask].astype(np.float64), axis=0)))
        if opaque < .85 or detail < 5:
            raise ValueError(f'{filename}: frame {plate_index * 4 + index} has patchy body alpha or insufficient photographic detail')
        # The upper body centroid excludes changing feet/tail recovery as far
        # as practical without inventing anatomical landmarks in source art.
        band_top = int(core[1] + (core[3] - core[1]) * .12)
        band_bottom = max(band_top + 1, int(core[1] + (core[3] - core[1]) * .6))
        band = np.where(labels[band_top:band_bottom] == figure['component'], alpha[band_top:band_bottom], 0).astype(np.float64)
        columns = band.sum(axis=0)
        center_x = float(np.dot(columns, np.arange(rgba.shape[1]) + .5) / max(columns.sum(), 1))
        result.append({
            'frame': plate_index * 4 + index, 'sourceRegion': [x, y, end_x - x, end_y - y],
            'sourceComponentBounds': figure['box'], 'sourceOpaqueBounds': core,
            'sourceBodyCenterX': center_x, 'componentPixels': int(counts[figure['component']]),
            'visiblePixels': int(mask.sum()), 'foreignFigurePixels': 0,
            'componentComplete': True, 'guardPixels': guard,
            'opaqueInteriorFraction': round(opaque, 6), 'visibleColorDeviation': round(detail, 6),
            'rgbaSHA256': sha(region.tobytes()),
            'lowerBodyRGBA_SHA256': sha(region[int(region.shape[0] * .55):].tobytes()),
        })
    accounted = sum(int(counts[i]) for i in ids)
    extra = int(counts[1:].sum()) - accounted
    if extra > max(80, int(accounted * .002)):
        raise ValueError(f'{filename}: {extra} alpha pixels lie outside the four principal bodies; review detached parts/background')
    return result


def clip(subject, action, expected, stride):
    files = [WILDLIFE / f'{subject}-{action}-{letter}.png' for letter in 'abcd'[:expected // 4]]
    missing = [relative(f) for p in files for f in (p, p.with_suffix('.webp')) if not f.is_file()]
    if missing:
        return None, {'subject': subject, 'clip': action, 'missing': missing}
    plates, cells, corrections = [], [], []
    for plate_index, file in enumerate(files):
        rgba, receipt = pair(file)
        height, width = rgba.shape[:2]
        if max(width, height) < 1536 or min(width, height) < 1024 or width % 2 or height % 2:
            raise ValueError(f'{file.name}: four-pose source must be at least 1536×1024 landscape or 1024×1536 portrait')
        receipt['sourceLayout'] = {'cols': 2, 'rows': 2} if width >= height else {'cols': 1, 'rows': 4}
        correction = CAMERA_REGISTRATION.get((subject, action), {}).get(plate_index)
        scale = correction['scale'] if correction else 1.
        if correction and receipt['sourceSHA256'] != correction['sourceSHA256']:
            raise ValueError(f'{file.name}: source changed; review the SHA-pinned whole-photo camera registration before replacing it')
        measured = complete_figures(rgba, file.name, plate_index)
        for cell in measured:
            cell['cameraScale'] = scale
        cells.extend(measured)
        receipt['cameraScale'] = scale
        if correction:
            corrections.append({'plate': 'abcd'[plate_index], 'scale': scale, 'sourceSHA256': receipt['sourceSHA256'], 'runtimeSHA256': receipt['runtimeSHA256'], 'method': 'SHA-pinned uniform whole-photograph runtime camera registration; source RGBA unchanged'})
        plates.append(receipt)
    mode = SPECS[subject]['mode']
    grounded = mode == 'ground' and action != 'threat'
    running = action == 'run'
    max_height = max(c['sourceRegion'][3] * c['cameraScale'] + 8 for c in cells)
    # Whole-photo centring keeps the common canvas compact. The renderer uses
    # the measured per-frame body pivot to compensate varying transparent side
    # space, so long tails do not waste retained GPU detail. Source image pixels
    # remain untouched; the explicit reviewed whole-photo camera registrations
    # above are the only size corrections.
    required_width = max(c['sourceRegion'][2] * c['cameraScale'] + 16 for c in cells)
    width = int(np.ceil(max(768, required_width) / 8) * 8)
    height = int(np.ceil(max(512, max_height) / 8) * 8)
    stance_height = max((c['sourceComponentBounds'][3] - c['sourceComponentBounds'][1]) * c['cameraScale'] for c in cells)
    floor_y = 8 + stance_height if running else height - 8
    for cell in cells:
        x, y, rw, rh = cell['sourceRegion']
        left, top, right, bottom = cell['sourceComponentBounds']
        scale = cell['cameraScale']
        if grounded:
            dx, dy = (width - rw * scale) / 2, (height - rh * scale) / 2
        else:
            dx = (width - rw * scale) / 2
            dy = 8 - (top - y) * scale if running else height - 8 - (bottom - y) * scale
        if scale == 1:
            dx, dy = int(round(dx)), int(round(dy))
        else:
            dx, dy = round(dx, 9), round(dy, 9)
        if dx < -1e-6 or dy < -1e-6 or dx + rw * scale > width + 1e-6 or dy + rh * scale > height + 1e-6:
            raise ValueError(f'{subject}:{action}: complete source region does not fit the common frame canvas')
        core = cell['sourceOpaqueBounds']
        bounds = [core[0] - x + dx, core[1] - y + dy, core[2] - x + dx, core[3] - y + dy] if scale == 1 else [round((core[0] - x) * scale + dx, 9), round((core[1] - y) * scale + dy, 9), round((core[2] - x) * scale + dx, 9), round((core[3] - y) * scale + dy, 9)]
        cell.update({
            'destination': [dx, dy], 'bounds': bounds,
            'registration': {'baseline': round(floor_y / height, 9), 'center': round(((cell['sourceBodyCenterX'] - x) * scale + dx) / width, 9)},
            'predictedGroundClearanceFraction': round((stance_height - (bottom - top) * scale) / max(stance_height, 1), 9) if running else 0,
        })
    if len({c['rgbaSHA256'] for c in cells}) != expected:
        raise ValueError(f'{subject}:{action}: repeated complete source frames')
    body_height = (stance_height if running else statistics.median((c['sourceOpaqueBounds'][3] - c['sourceOpaqueBounds'][1]) * c['cameraScale'] for c in cells)) / height
    heights = [statistics.median(c['sourceOpaqueBounds'][3] - c['sourceOpaqueBounds'][1] for c in cells[i:i + 4]) for i in range(0, len(cells), 4)]
    spread = (max(heights) - min(heights)) / max(statistics.median(heights), 1)
    corrected_heights = [statistics.median((c['sourceOpaqueBounds'][3] - c['sourceOpaqueBounds'][1]) * c['cameraScale'] for c in cells[i:i + 4]) for i in range(0, len(cells), 4)]
    corrected_spread = (max(corrected_heights) - min(corrected_heights)) / max(statistics.median(corrected_heights), 1)
    metadata = {
        'plates': [f.with_suffix('.webp').name for f in files], 'cols': 2, 'rows': 2,
        # cols/rows above enumerate four logical slots per plate. Actual source
        # packing may vary; complete sourceRegions always control extraction.
        'plateLayouts': [plate['sourceLayout'] for plate in plates],
        'frames': expected, 'stride': stride, 'frameSize': [width, height],
        'sourceRegions': [{'source': c['sourceRegion'], 'dest': c['destination'], **({'scale': c['cameraScale']} if c['cameraScale'] != 1 else {})} for c in cells],
        'registration': [c['registration'] for c in cells],
        'bounds': [c['bounds'] for c in cells],
        'baseline': round(floor_y / height, 9), 'bodyHeight': round(body_height, 9),
        'facing': 'right', 'mode': 'ground' if grounded else 'billboard',
    }
    report = {
        'subject': subject, 'clip': action, 'frames': expected, 'plates': plates, 'cells': cells,
        'frameSize': [width, height], 'verticalAlignment': 'groundPlaneCentered' if grounded else 'topWithSharedStanceFloor' if running else 'groundedBase',
        'plateMedianOpaqueBodyHeights': heights, 'plateBodyScaleSpreadFraction': round(spread, 6),
        'cameraScaleCorrection': corrections,
        'correctedPlateMedianOpaqueBodyHeights': corrected_heights,
        'correctedPlateBodyScaleSpreadFraction': round(corrected_spread, 6),
        'bodyScaleReviewThreshold': .08, 'bodyScaleReviewRequired': bool(spread > .08),
        'uniqueCompleteFrames': len({c['rgbaSHA256'] for c in cells}),
        'uniqueLowerBodyFrames': len({c['lowerBodyRGBA_SHA256'] for c in cells}),
    }
    return metadata, report


def single(file):
    rgba, receipt = pair(file)
    if rgba is None:
        return None, receipt
    height, width = rgba.shape[:2]
    if max(width, height) < 1024 or min(width, height) < 768:
        raise ValueError(f'{file.name}: complete source below 1024×768 resolution')
    alpha = rgba[:, :, 3]
    ys, xs = np.nonzero(alpha > 8)
    if len(xs) < 1000:
        raise ValueError(f'{file.name}: empty or incomplete photographic asset')
    box = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
    if box[0] == 0 or box[1] == 0 or box[2] == width or box[3] == height:
        raise ValueError(f'{file.name}: photographic object touches the source boundary')
    lower = np.where(np.indices(alpha.shape)[0] >= box[3] - max(1, (box[3] - box[1]) * .1), alpha, 0).astype(np.float64)
    columns = lower.sum(axis=0)
    center = float(np.dot(columns, np.arange(width) + .5) / max(columns.sum(), 1)) / width
    metadata = {'file': file.with_suffix('.webp').name, 'width': width, 'height': height,
                'bounds': box, 'baseline': round(box[3] / height, 9), 'center': round(center, 9),
                'bodyHeight': round((box[3] - box[1]) / height, 9)}
    receipt.update({'bounds': box, 'transparentPixels': int((alpha <= 8).sum()), 'opaquePixels': int((alpha >= 240).sum()),
                    'visiblePixels': int(len(xs)), 'completeSource': True})
    return metadata, receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-manifest', action='store_true', help='Write measured registration JSON, never source/runtime image pixels')
    parser.add_argument('--allow-incomplete', action='store_true', help='Record generation progress while some required plates are absent')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.report is None:
        if args.allow_incomplete:
            raise ValueError('Generation-progress audits need an explicit --report; do not replace a complete audit receipt with a subset')
        args.report = WILDLIFE / 'provenance.json'
    references = []
    for group in ('wildlife', 'jungle'):
        source_manifest = ROOT / 'reference_media' / group / 'provenance.json'
        reference = json.loads(source_manifest.read_text())
        for row in reference['files']:
            path = ROOT / row['file']
            if not path.is_file() or sha(path.read_bytes()) != row['sha256']:
                raise ValueError(f'Original supplied reference changed: {row["file"]}')
        references.append({'group': group, 'manifest': relative(source_manifest),
                           'manifestSHA256': sha(source_manifest.read_bytes()),
                           'count': len(reference['files']), 'allOriginalSHA256Preserved': True})
    manifest = {'version': 1, 'subjects': {}}
    reports, incomplete, invalid = [], [], []
    for subject, spec in SPECS.items():
        entry = {key: value for key, value in spec.items() if key != 'clips'}
        entry['animations'] = {}
        for action, (count, stride) in spec['clips'].items():
            try:
                metadata, report = clip(subject, action, count, stride)
                if metadata is None:
                    incomplete.append(report)
                else:
                    entry['animations'][action] = metadata
                    reports.append(report)
            except ValueError as error:
                invalid.append({'subject': subject, 'clip': action, 'error': str(error)})
        manifest['subjects'][subject] = entry
    botanical = {'version': 1, 'plants': {}}
    singles = []
    for name, file in [('nest', WILDLIFE / 'nest.png')] + [(name, JUNGLE / f'{name}.png') for name in PLANTS]:
        try:
            metadata, report = single(file)
            if metadata is None:
                incomplete.append({'subject': name, **report})
            else:
                if name == 'nest':
                    manifest['nest'] = metadata
                else:
                    botanical['plants'][name] = metadata
                singles.append(report)
        except ValueError as error:
            invalid.append({'subject': name, 'error': str(error)})
    output = {
        'version': 1, 'originalReferencesPreserved': True,
        'method': 'Image-generation/editing tool creates complete photographic derivatives from the preserved supplied wildlife and jungle references. Exact lossless runtime WebP encoding preserves every decoded source RGBA byte.',
        'measurement': 'Read-only alpha>8 8-connected component audit identifies four complete bodies per plate. Guarded rectangular regions include zero pixels from another major body; alpha>128 defines the opaque silhouette. Registration JSON fits each complete source in a shared clip canvas. Walking aligns its base; mammal running stabilizes the top and preserves clearance above a shared stance floor; top-down crawlers are centered on a ground plane. Three SHA-pinned tiger running plates receive explicit uniform whole-photograph runtime camera registration, independently supported by tight-head self-matched correlation and torso-thickness measurements. Raw source/silhouette review flags remain visible beside corrected bounds. All source PNG/WebP RGBA remains identical. Single botanical images include all alpha components, including detached leaves.',
        'limitations': 'Generated photographic derivatives approximate appearance and discrete pose transitions; they are not filmed movement or recovered higher-resolution originals. Anatomical scale flags require visual review, not automatic pixel normalization.',
        'references': references,
        'completeClips': len(reports), 'totalFrames': sum(r['frames'] for r in reports),
        'totalPlates': sum(len(r['plates']) for r in reports),
        'singleImages': singles, 'clips': reports, 'incomplete': incomplete, 'invalid': invalid,
    }
    if (incomplete or invalid) and not args.allow_incomplete:
        raise ValueError(f'{len(incomplete)} incomplete asset groups; {len(invalid)} invalid: ' + '; '.join(row['error'] for row in invalid))
    if not args.update_manifest and not args.allow_incomplete:
        if json.loads((WILDLIFE / 'manifest.json').read_text()) != manifest:
            raise ValueError('Wildlife registration differs from measured complete source images')
        if json.loads((JUNGLE / 'manifest.json').read_text()) != botanical:
            raise ValueError('Botanical metadata differs from measured complete source images')
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2) + '\n')
    if args.update_manifest:
        WILDLIFE.mkdir(parents=True, exist_ok=True)
        JUNGLE.mkdir(parents=True, exist_ok=True)
        (WILDLIFE / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
        (JUNGLE / 'manifest.json').write_text(json.dumps(botanical, indent=2) + '\n')
    print(json.dumps({'completeClips': output['completeClips'], 'totalFrames': output['totalFrames'], 'totalPlates': output['totalPlates'], 'singleImages': len(singles), 'incomplete': len(incomplete), 'invalid': invalid, 'report': str(args.report)}, indent=2))


if __name__ == '__main__':
    main()
