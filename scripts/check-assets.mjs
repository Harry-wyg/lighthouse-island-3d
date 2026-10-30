// Requires ffprobe and ffmpeg on PATH. Checks the actual media bytes, not filenames.
// Assets live on Cloudinary: each URL is downloaded to a temp dir and validated there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { IMG, VIDEO, ROLE_TYPES, NPC_KEYS, MOODS } from '../public/js/assets.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = [
  [IMG.title, 1920, 1080], [IMG.share, 1200, 630],
  ...ROLE_TYPES.map(t => [IMG.role(t), 768, 768]),
  ...NPC_KEYS.flatMap(k => MOODS.map(m => [IMG.portrait(k, m), 512, 512])),
  ...['NT', 'NF', 'SJ', 'SP'].map(t => [IMG.temper(t), 1080, 1920]),
  ...Array.from({ length: 12 }, (_, i) => [IMG.shell(i + 1), 256, 256, true]),
];
const videos = [[VIDEO.opening, 1920, 1080, false, 15, 25], [VIDEO.openingV, 1080, 1920, false, 15, 25], [VIDEO.hiddenV, 1080, 1920, false, 10, 16]];
const imageOnly = process.argv.includes('--images');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'island-assets-'));
async function download(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const file = path.join(tmp, path.basename(new URL(url).pathname));
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
      return file;
    } catch (e) {
      if (i >= tries) return null; // 网络偶发失败时重试
      await new Promise(res => setTimeout(res, 1000 * i));
    }
  }
}
const checked = [];
for (const [url, width, height, alpha, minDuration, maxDuration] of [...images, ...(imageOnly ? [] : videos)]) {
  const file = await download(url).catch(() => null);
  const entry = { path: url, status: 'pass', errors: [] };
  if (!file) {
    entry.status = 'missing'; entry.errors.push('File missing'); checked.push(entry); continue;
  }
  entry.bytes = fs.statSync(file).size;
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  if (probe.status !== 0) {
    entry.status = 'fail'; entry.errors.push(probe.error?.message || probe.stderr); checked.push(entry); continue;
  }
  const metadata = JSON.parse(probe.stdout);
  const stream = metadata.streams.find(s => s.codec_type === 'video');
  entry.width = stream?.width; entry.height = stream?.height; entry.codec = stream?.codec_name;
  if (entry.width !== width || entry.height !== height) entry.errors.push(`Expected ${width}x${height}, got ${entry.width}x${entry.height}`);
  const expectedCodec = minDuration ? 'h264' : url.endsWith('.jpg') ? 'mjpeg' : 'webp';
  if (entry.codec !== expectedCodec) entry.errors.push(`Expected ${expectedCodec}, got ${entry.codec}`);
  if (minDuration) {
    entry.duration = Number(metadata.format.duration);
    if (!(entry.duration >= minDuration && entry.duration <= maxDuration + 0.05)) entry.errors.push('Duration outside PRD range');
    if (stream.pix_fmt !== 'yuv420p') entry.errors.push('Expected yuv420p for browser compatibility');
    const data = fs.readFileSync(file);
    const moov = data.indexOf(Buffer.from('moov')), mdat = data.indexOf(Buffer.from('mdat'));
    if (moov < 0 || mdat < 0 || moov > mdat) entry.errors.push('MP4 needs faststart');
  }
  const decodeArgs = alpha ? ['-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'] : ['-f', 'null', '-'];
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-i', file, ...decodeArgs], { maxBuffer: 16 * 1024 * 1024 });
  if (decode.status !== 0) entry.errors.push(decode.error?.message || decode.stderr.toString());
  if (alpha && decode.status === 0) {
    let transparent = 0, visible = 0;
    for (let i = 3; i < decode.stdout.length; i += 4) {
      if (decode.stdout[i] === 0) transparent++;
      if (decode.stdout[i] > 128) visible++;
    }
    entry.transparentPixels = transparent; entry.visiblePixels = visible;
    if (!transparent || !visible) entry.errors.push('Expected both transparent background and visible object pixels');
  }
  if (entry.errors.length) entry.status = 'fail';
  checked.push(entry);
}
fs.rmSync(tmp, { recursive: true, force: true });
const failed = checked.filter(x => x.status !== 'pass');
const report = { scope: imageOnly ? 'images' : 'images-and-videos', checkedAt: new Date().toISOString(), passed: checked.length - failed.length, expected: checked.length, bytes: checked.reduce((n, x) => n + (x.bytes || 0), 0), assets: checked };
fs.writeFileSync(path.join(root, 'scripts', 'asset-validation.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`${report.passed}/${report.expected} assets passed; ${(report.bytes / 1048576).toFixed(2)} MiB`);
for (const entry of failed) console.log(`${entry.status.toUpperCase()}: ${entry.path}: ${entry.errors.join('; ')}`);
process.exitCode = failed.length ? 1 : 0;
