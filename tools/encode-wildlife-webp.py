#!/usr/bin/env python3
"""Exact lossless container encoding; preserves PNG bytes and decoded RGBA."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
FOLDERS = (ROOT / 'assets/wildlife/hires', ROOT / 'assets/jungle')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--encoder', default=shutil.which('cwebp') or '/tmp/intruder-motion-webp/usr/bin/cwebp')
    parser.add_argument('--workers', type=int, default=3)
    parser.add_argument('--folder', choices=('wildlife', 'jungle'), action='append', help='Encode only named asset groups during generation; defaults to both')
    parser.add_argument('--pattern', default='*.png', help='PNG filename glob for incremental generation; final audit still requires every asset')
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.report is None:
        if args.folder or args.pattern != '*.png':
            raise ValueError('Incremental encoding needs an explicit --report; do not replace the complete encoding receipt with a subset')
        args.report = ROOT / 'assets/wildlife/hires/encoding-provenance.json'
    encoder = Path(args.encoder)
    if not encoder.is_file():
        raise ValueError('Install cwebp or pass its executable with --encoder')
    selected = FOLDERS if not args.folder else tuple(folder for name, folder in zip(('wildlife', 'jungle'), FOLDERS) if name in args.folder)
    if '/' in args.pattern or '\\' in args.pattern or not args.pattern.endswith('.png'):
        raise ValueError('The incremental encoding pattern must select PNG filenames only')
    files = sorted(file for folder in selected for file in folder.glob(args.pattern))
    if not files:
        raise ValueError('No generated wildlife/botanical PNG sources exist')

    def encode(file):
        source_bytes = file.read_bytes()
        source_hash = sha(source_bytes)
        source = np.array(Image.open(file).convert('RGBA'))
        runtime = file.with_suffix('.webp')
        current = None
        if runtime.is_file():
            current = np.array(Image.open(runtime).convert('RGBA'))
        if current is None or current.shape != source.shape or not np.array_equal(current, source):
            with tempfile.TemporaryDirectory(prefix='intruder-wildlife-webp-') as temp:
                candidate = Path(temp) / runtime.name
                subprocess.run([str(encoder), '-quiet', '-lossless', '-exact', '-q', '100', '-m', '6', str(file), '-o', str(candidate)], check=True)
                decoded = np.array(Image.open(candidate).convert('RGBA'))
                if source.shape != decoded.shape or not np.array_equal(source, decoded):
                    raise ValueError(f'{file.name}: encoder changed decoded RGBA pixels')
                if sha(file.read_bytes()) != source_hash:
                    raise ValueError(f'{file.name}: source changed during encoding; retry on the finished PNG')
                runtime.write_bytes(candidate.read_bytes())
        decoded = np.array(Image.open(runtime).convert('RGBA'))
        if not np.array_equal(source, decoded) or sha(file.read_bytes()) != source_hash:
            raise ValueError(f'{file.name}: source/runtime changed during final equality check')
        return {'sourcePNG': file.relative_to(ROOT).as_posix(), 'runtimeWebP': runtime.relative_to(ROOT).as_posix(),
                'sourceSHA256': source_hash, 'runtimeSHA256': sha(runtime.read_bytes()),
                'dimensions': [int(source.shape[1]), int(source.shape[0])], 'sourceBytes': len(source_bytes), 'runtimeBytes': runtime.stat().st_size,
                'decodedRGBA_SHA256': sha(source.tobytes()), 'allRGBAIdentical': True, 'includesInvisibleRGB': True}

    with ThreadPoolExecutor(max_workers=max(1, min(args.workers, 4))) as pool:
        rows = list(pool.map(encode, files))
    output = {'encoder': subprocess.check_output([str(encoder), '-version'], text=True).strip(),
              'arguments': ['-lossless', '-exact', '-q', '100', '-m', '6'],
              'method': 'Technical lossless WebP container conversion only; unchanged generated PNG sources remain preserved. No resizing, cropping, color, pose, alpha or metadata edits to PNG sources.',
              'count': len(rows), 'files': rows,
              'sourceBytes': sum(row['sourceBytes'] for row in rows), 'runtimeBytes': sum(row['runtimeBytes'] for row in rows)}
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(output, indent=2) + '\n')
    print(json.dumps({'count': len(rows), 'sourceBytes': output['sourceBytes'], 'runtimeBytes': output['runtimeBytes'], 'report': str(args.report)}, indent=2))


if __name__ == '__main__':
    main()
