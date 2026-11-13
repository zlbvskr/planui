import json
import argparse
from pathlib import Path
from PIL import Image, ImageChops

parser = argparse.ArgumentParser()
parser.add_argument('before', nargs='?', default='qa/before')
parser.add_argument('after', nargs='?', default='qa/after')
parser.add_argument('--max-percent', type=float, default=0.1)
args = parser.parse_args()
before, after = Path(args.before), Path(args.after)
results = []
for item in json.loads((before / 'manifest.json').read_text(encoding='utf-8')):
    name = item['screen']
    filename = f'390-{name}.png'
    diff = ImageChops.difference(Image.open(before / filename).convert('RGB'),
                                Image.open(after / filename).convert('RGB'))
    changed = sum(any(pixel) for pixel in diff.get_flattened_data())
    results.append({'screen': name, 'bbox': diff.getbbox(),
                    'changed_pixels': changed,
                    'changed_percent': changed / (diff.width * diff.height) * 100,
                    'pixels_over_20': sum(max(pixel) > 20 for pixel in diff.get_flattened_data())})
    diff.save(after / f'diff-{filename}')
(after / 'comparison.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
print(json.dumps(results, indent=2))
if any(item['changed_percent'] > args.max_percent for item in results):
    raise SystemExit('Перевищено допустиму різницю пікселів')
