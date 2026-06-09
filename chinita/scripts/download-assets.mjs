import { createWriteStream, mkdirSync } from 'fs';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import path from 'path';

const BASE = 'https://capsules.moyra.co/_ipx/q_80/images/';
const VIDEO_BASE = 'https://capsules.moyra.co/video/';

const images = [
  'cap1.png', 'cap2.png', 'cap3.png',
  'welcome-1.png', 'welcome-2.png',
  'cap3-square.jpg', 'cap2-square.jpg', 'cap1-square.jpg',
  'activities-1.png', 'activities-2.png', 'activities-3.png',
  'review1.png', 'review2.png', 'review3.png',
  'pin.png',
  'cap1-mobile.png', 'cap2-mobile.png', 'cap3-mobile.png',
];

const videos = ['smoke_final.mp4'];

async function downloadFile(url, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  const res = await fetch(url);
  if (!res.ok) { console.error(`FAIL ${url}: ${res.status}`); return; }
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(`OK ${path.basename(dest)}`);
}

async function batch(items, fn, concurrency = 4) {
  for (let i = 0; i < items.length; i += concurrency) {
    await Promise.all(items.slice(i, i + concurrency).map(fn));
  }
}

await batch(images, img => downloadFile(BASE + img, `public/images/${img}`));
await batch(videos, vid => downloadFile(VIDEO_BASE + vid, `public/videos/${vid}`));
console.log('Done.');
