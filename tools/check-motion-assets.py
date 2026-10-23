#!/usr/bin/env python3
"""Audit generated motion plates and register their measured render anchors.

Images are decoded and measured only. This tool never crops, resizes, paints,
re-encodes or writes image files. Runtime WebP must reproduce every PNG RGBA
byte, including RGB hidden underneath transparent pixels.
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
FOLDER = ROOT / 'assets/sprites/hires'
SUBJECTS = ('farmer', 'militia', 'female_vc', 'nva', 'aviator', 'cow')
WALK_ORDER = (0, 8, 1, 9, 2, 10, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15)
SCALE_REVIEW_LIMIT = .06
# One generated plate retained a different camera magnification after two image
# tool framing edits. Register that known source at the adjacent plates' scale;
# this is a uniform renderer blit, never an edit to its photographic pixels.
CAMERA_SCALE_REPAIR_SHA256 = '240fda65cb90a451a641736d04b0a41d15b4cf0f3e233fbfea54c5432adb32ff'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def relative(file):
    return file.relative_to(ROOT).as_posix()


def complete_components(rgba, filename, plate_index):
    """Locate four actual complete figures, allowing nominal gutter crossings."""
    alpha = rgba[:, :, 3]
    labels, _ = label(alpha > 8, structure=np.ones((3, 3), dtype=np.uint8))
    counts = np.bincount(labels.ravel())
    if len(counts) < 5:
        raise ValueError(f'{filename}: fewer than four separate complete figures')
    ids = [int(value) for value in np.argsort(counts[1:])[-4:] + 1]
    if min(counts[value] for value in ids) < 10000:
        raise ValueError(f'{filename}: one of four figures is empty or incomplete')
    objects = find_objects(labels)
    components = []
    for component in ids:
        sy, sx = objects[component - 1]
        if sx.start == 0 or sy.start == 0 or sx.stop == rgba.shape[1] or sy.stop == rgba.shape[0]:
            raise ValueError(f'{filename}: complete figure touches PNG outer boundary {[sx.start, sy.start, sx.stop, sy.stop]}')
        components.append({'component': component, 'box': [sx.start, sy.start, sx.stop, sy.stop]})
    components.sort(key=lambda c: (c['box'][1] + c['box'][3]) / 2)
    components = sorted(components[:2], key=lambda c: c['box'][0]) + sorted(components[2:], key=lambda c: c['box'][0])
    result = []
    for index, component in enumerate(components):
        left, top, right, bottom = component['box']
        foreign_ids = [value for value in ids if value != component['component']]
        for guard in (4, 3, 2, 1, 0):
            x, y = max(0, left - guard), max(0, top - guard)
            end_x, end_y = min(rgba.shape[1], right + guard), min(rgba.shape[0], bottom + guard)
            foreign_pixels = int(np.isin(labels[y:end_y, x:end_x], foreign_ids).sum())
            if not foreign_pixels:
                break
        if foreign_pixels:
            raise ValueError(f'{filename} stored frame {plate_index * 4 + index}: rectangular extraction contains {foreign_pixels} pixels from another figure')
        region = rgba[y:end_y, x:end_x]
        local_labels = labels[y:end_y, x:end_x]
        mask = (local_labels == component['component']) & (region[:, :, 3] > 128)
        ys, xs = np.nonzero(mask)
        core = [int(xs.min()) + x, int(ys.min()) + y, int(xs.max()) + x + 1, int(ys.max()) + y + 1]
        band_top, band_bottom = int(core[1] + (core[3] - core[1]) * .2), int(core[1] + (core[3] - core[1]) * .6)
        band_mask = (labels[band_top:band_bottom] == component['component']) & (alpha[band_top:band_bottom] > 128)
        band = np.where(band_mask, alpha[band_top:band_bottom], 0).astype(np.float64)
        columns = band.sum(axis=0)
        torso_x = float(np.dot(columns, np.arange(rgba.shape[1]) + .5) / columns.sum())
        opaque = float(np.mean(region[:, :, 3][mask] >= 240))
        detail = float(np.mean(np.std(region[:, :, :3][mask].astype(np.float64), axis=0)))
        if opaque < .85 or detail < 10:
            raise ValueError(f'{filename} stored frame {plate_index * 4 + index}: patchy interior or missing photographic detail')
        result.append({
            'storedFrame': plate_index * 4 + index,
            'sourceRegion': [x, y, end_x - x, end_y - y],
            'sourceComponentBounds': component['box'], 'sourceOpaqueBounds': core,
            'sourceTorsoCenterX': torso_x,
            'visiblePixels': int(mask.sum()), 'componentPixels': int(counts[component['component']]),
            'foreignFigurePixels': 0, 'componentComplete': True, 'guardPixels': guard,
            'opaqueInteriorFraction': round(opaque, 6), 'visibleColorDeviation': round(detail, 6),
            'rgbaSHA256': sha(region.tobytes()),
            'lowerBodyRGBA_SHA256': sha(region[int(region.shape[0] * .55):].tobytes()),
        })
    return result


def audit_clip(subject, mode):
    sources = [FOLDER / f'{subject}-{mode}-{plate}.png' for plate in 'abcd']
    runtimes = [file.with_suffix('.webp') for file in sources]
    missing = [relative(file) for file in sources + runtimes if not file.is_file()]
    if missing:
        return None, {'subject': subject, 'clip': mode, 'missing': missing}
    plates, cells = [], []
    for plate_index, (source, runtime) in enumerate(zip(sources, runtimes)):
        png = np.array(Image.open(source).convert('RGBA'))
        webp = np.array(Image.open(runtime).convert('RGBA'))
        if png.shape != webp.shape or not np.array_equal(png, webp):
            raise ValueError(f'{runtime.name}: runtime encoding changed decoded RGBA pixels')
        height, width = png.shape[:2]
        if width % 2 or height % 2:
            raise ValueError(f'{source.name}: expected four equal cells')
        cell_width, cell_height = width // 2, height // 2
        if min(cell_width, cell_height) < 512 or max(cell_width, cell_height) < 768:
            raise ValueError(f'{source.name}: resolution below complete photographic frame requirement')
        cells.extend(complete_components(png, source.name, plate_index))
        plates.append({
            'sourcePNG': relative(source), 'sourceSHA256': sha(source.read_bytes()),
            'runtimeWebP': relative(runtime), 'runtimeSHA256': sha(runtime.read_bytes()),
            'width': width, 'height': height, 'sourceBytes': source.stat().st_size,
            'runtimeBytes': runtime.stat().st_size, 'decodedRGBA_SHA256': sha(png.tobytes()),
            'decodedRGBAIdentical': True,
        })
    raw_plate_heights = [float(statistics.median(cell['sourceOpaqueBounds'][3] - cell['sourceOpaqueBounds'][1] for cell in cells[index * 4:index * 4 + 4])) for index in range(4)]
    scales = [1., 1., 1., 1.]
    camera_repairs = []
    if subject == 'female_vc' and mode == 'run':
        if plates[3]['sourceSHA256'] != CAMERA_SCALE_REPAIR_SHA256:
            raise ValueError('Female running plate D changed: review its explicit camera-scale registration before replacing this source')
        reference_height = float(statistics.median(raw_plate_heights[:3]))
        scales[3] = reference_height / raw_plate_heights[3]
        if not .85 <= scales[3] <= 1:
            raise ValueError('Female running plate D camera correction is outside its reviewed range')
        camera_repairs.append({'plate': 'd', 'scale': round(scales[3], 12), 'sourceSHA256': plates[3]['sourceSHA256'], 'referenceMedianBodyPixels': reference_height, 'rawMedianBodyPixels': raw_plate_heights[3], 'correctedMedianBodyPixels': reference_height})
    for cell in cells:
        cell['cameraScale'] = scales[cell['storedFrame'] // 4]
    min_width, min_height = (768, 512) if subject == 'cow' else (512, 768)
    half_width = max(max(cell['sourceTorsoCenterX'] - cell['sourceRegion'][0], cell['sourceRegion'][0] + cell['sourceRegion'][2] - cell['sourceTorsoCenterX']) * cell['cameraScale'] for cell in cells)
    max_height = max(4 + (cell['sourceRegion'][3] - cell['guardPixels']) * cell['cameraScale'] for cell in cells)
    stance_height = max((cell['sourceComponentBounds'][3] - cell['sourceComponentBounds'][1]) * cell['cameraScale'] for cell in cells)
    width = int(np.ceil(max(min_width, 2 * (half_width + 1)) / 8) * 8)
    height = int(np.ceil(max(min_height, max_height) / 8) * 8)
    floor_y = 4 + stance_height if mode == 'run' else height - 4
    physical_height = 1.42 if subject == 'cow' else 1.76
    for cell in cells:
        x, y, region_width, region_height = cell['sourceRegion']
        left, top, right, bottom = cell['sourceComponentBounds']
        scale = cell['cameraScale']
        # Integer blits retain the original pixel grid; the render anchor
        # compensates the remaining subpixel torso-centroid difference.
        dx = width / 2 - (cell['sourceTorsoCenterX'] - x) * scale
        dx = int(round(dx)) if scale == 1 else round(dx, 9)
        # A bent running pose is a flight phase, not a shorter person. Keep its
        # head line stable and let the feet clear a common stance-height floor.
        # Walking retains its measured sole anchor for grounded weight transfer.
        dy = 4 - (top - y) * scale if mode == 'run' else height - 4 - (bottom - y) * scale
        if dx < 0 or dy < 0 or dx + region_width * scale > width + 1e-6 or dy + region_height * scale > height + 1e-6:
            raise ValueError(f'{subject}:{mode}: region does not fit common frame canvas')
        core = cell['sourceOpaqueBounds']
        cell.update({
            'cellWidth': width, 'cellHeight': height,
            'destination': [round(dx, 9), round(dy, 9)],
            'bounds': [round((core[0] - x) * scale + dx, 9), round((core[1] - y) * scale + dy, 9), round((core[2] - x) * scale + dx, 9), round((core[3] - y) * scale + dy, 9)],
            'bodyFraction': stance_height / height if mode == 'run' else (core[3] - core[1]) * scale / height,
            'predictedGroundClearanceMeters': round((stance_height - (bottom - top) * scale) * physical_height / stance_height, 9) if mode == 'run' else 0,
            'registration': {'baseline': round(floor_y / height, 9), 'center': round(((cell['sourceTorsoCenterX'] - x) * scale + dx) / width, 9)},
        })
    order = list(WALK_ORDER) if mode == 'walk' else list(range(16))
    logical = [dict(cells[stored], frame=frame) for frame, stored in enumerate(order)]
    if len({cell['lowerBodyRGBA_SHA256'] for cell in logical}) != 16:
        raise ValueError(f'{subject}:{mode}: duplicated lower-body frames')
    body_fraction = float(statistics.median(cell['bodyFraction'] for cell in logical))
    animation = {
        'plates': [file.name for file in runtimes], 'cols': 2, 'rows': 2, 'frames': 16,
        'stride': (2.2 if mode == 'walk' else 3) if subject == 'cow' else (1.56 if mode == 'walk' else 2.4),
        'baseline': round(statistics.median(cell['registration']['baseline'] for cell in logical), 9),
        'bodyHeight': round(body_fraction, 9), 'facing': 'left' if subject == 'cow' else 'right',
        'frameSize': [width, height],
        'sourceRegions': [{'source': cell['sourceRegion'], 'dest': cell['destination'], **({'scale': round(cell['cameraScale'], 12)} if cell['cameraScale'] != 1 else {})} for cell in logical],
        'registration': [cell['registration'] for cell in logical],
    }
    if mode == 'walk':
        animation['order'] = order
    plate_heights = [raw * scale for raw, scale in zip(raw_plate_heights, scales)]
    scale_spread = (max(plate_heights) - min(plate_heights)) / statistics.median(plate_heights)
    report = {
        'subject': subject, 'clip': mode, 'frames': 16,
        'reference': f'assets/sprites/hires/{subject}-idle.png',
        'referenceSHA256': sha((FOLDER / f'{subject}-idle.png').read_bytes()),
        'plates': plates, 'cells': logical,
        'anatomicalScaleFraction': round(body_fraction, 9),
        'frameSize': [width, height],
        'verticalAlignment': 'headWithSharedStanceFloor' if mode == 'run' else 'groundedSole',
        'stanceSourceHeight': stance_height if mode == 'run' else None,
        'registeredFloorY': floor_y,
        'plateMedianOpaqueBodyHeights': plate_heights,
        'plateMedianOpaqueBodyHeightsRaw': raw_plate_heights,
        'cameraScaleCorrection': camera_repairs,
        'plateBodyScaleSpreadFraction': round(scale_spread, 6),
        'bodyScaleReviewThreshold': SCALE_REVIEW_LIMIT,
        'bodyScaleReviewRequired': scale_spread > SCALE_REVIEW_LIMIT,
        'uniqueLowerBodyFrames': len({cell['lowerBodyRGBA_SHA256'] for cell in logical}),
    }
    return animation, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--update-manifest', action='store_true', help='Register only complete audited clips; preserves existing base poses')
    parser.add_argument('--allow-incomplete', action='store_true', help='Allow generation to continue while some clips are absent')
    parser.add_argument('--report', type=Path, default=FOLDER / 'motion-provenance.json')
    args = parser.parse_args()
    manifest_path = FOLDER / 'manifest.json'
    manifest = json.loads(manifest_path.read_text())
    reports, incomplete, invalid = [], [], []
    for subject in SUBJECTS:
        for mode in ('walk', 'run'):
            try:
                animation, report = audit_clip(subject, mode)
            except ValueError as error:
                invalid.append({'subject': subject, 'clip': mode, 'error': str(error)})
                if args.update_manifest:
                    manifest['subjects'][subject].get('animations', {}).pop(mode, None)
                continue
            if animation is None:
                incomplete.append(report)
            else:
                reports.append(report)
                if args.update_manifest:
                    manifest['subjects'][subject].setdefault('animations', {})[mode] = animation
                elif not args.allow_incomplete and manifest['subjects'][subject].get('animations', {}).get(mode) != animation:
                    invalid.append({'subject': subject, 'clip': mode, 'error': 'Registered animation metadata differs from the measured complete photographs; run with --update-manifest'})
    if (incomplete or invalid) and not args.allow_incomplete:
        names = ', '.join(x['subject'] + ':' + x['clip'] for x in incomplete)
        failures = '; '.join(x['error'] for x in invalid)
        raise ValueError(f'{len(incomplete)} motion clips incomplete: {names}; {len(invalid)} invalid: {failures}')
    output = {
        'version': 1, 'originalReferencesPreserved': True,
        'method': 'Image-generation/editing tool: new complete photographic walking/running poses derived from the restored base subject; exact lossless WebP runtime encoding.',
        'limitations': 'Generated photographic derivatives approximate identity and motion. They are not recorded motion sequences or original higher-resolution camera photographs. Pose transitions are discrete photographic frames rendered along continuous movement. Per-frame alignment changes render placement only; image pixels remain unchanged.',
        'measurement': 'Read-only decoded RGBA audit. Four largest full-plate connected components at alpha greater than8 define complete figures; each extraction region includes up to four pixels of guard and zero pixels from another major figure. Guard reduces only when needed to avoid neighboring figures. Alpha greater than128 defines opaque silhouette. Renderer blits whole source regions into one shared canvas and registers the torso-band centroid. One reviewed female running plate receives a uniform renderer camera-scale correction; source PNG/WebP pixels remain identical and its raw/corrected measurements are recorded. Walking aligns the measured sole and uses median opaque silhouette height. Running stabilizes the head line, uses the maximum complete silhouette as stance height and keeps a shared floor, preserving genuine flight-phase foot clearance without lowering the upper body.',
        'completeClips': len(reports), 'totalFrames': sum(x['frames'] for x in reports),
        'totalPlates': sum(len(x['plates']) for x in reports),
        'clips': reports, 'incomplete': incomplete, 'invalid': invalid,
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2) + '\n')
    if args.update_manifest:
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps({'completeClips': output['completeClips'], 'totalFrames': output['totalFrames'], 'totalPlates': output['totalPlates'], 'incomplete': len(incomplete), 'invalid': invalid, 'report': str(args.report)}, indent=2))


if __name__ == '__main__':
    main()
