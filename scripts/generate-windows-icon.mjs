import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createCanvas, loadImage } from "canvas";

const sourcePath = resolve("build/mdautopsy-icon.png");
const pngOutputPath = resolve("build/icon.png");
const icoOutputPath = resolve("build/icon.ico");
const faviconOutputPath = resolve("public/mdautopsy-icon.png");
const sizes = [16, 24, 32, 48, 64, 128, 256];

function isBorderBackground(r, g, b, a) {
  if (a < 12) return true;
  return r > 226 && g > 226 && b > 226 && Math.max(r, g, b) - Math.min(r, g, b) < 28;
}

function removeConnectedBorderBackground(canvas) {
  const context = canvas.getContext("2d");
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = image;
  const visited = new Uint8Array(width * height);
  const queue = [];

  function enqueue(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const point = y * width + x;
    if (visited[point]) return;

    const offset = point * 4;
    if (!isBorderBackground(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) return;

    visited[point] = 1;
    queue.push(point);
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x, 0);
    enqueue(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueue(0, y);
    enqueue(width - 1, y);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const point = queue[index];
    const x = point % width;
    const y = Math.floor(point / width);
    const offset = point * 4;
    data[offset + 3] = 0;

    enqueue(x + 1, y);
    enqueue(x - 1, y);
    enqueue(x, y + 1);
    enqueue(x, y - 1);
  }

  context.putImageData(image, 0, 0);
}

function makeSquareSourceCanvas(image) {
  const side = Math.min(image.width, image.height);
  const sourceX = Math.round((image.width - side) / 2);
  const sourceY = Math.round((image.height - side) / 2);
  const canvas = createCanvas(side, side);
  const context = canvas.getContext("2d");

  context.drawImage(image, sourceX, sourceY, side, side, 0, 0, side, side);
  removeConnectedBorderBackground(canvas);
  return canvas;
}

function renderPng(sourceCanvas, size) {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext("2d");
  const inset = Math.max(1, Math.round(size * 0.045));
  const targetSize = size - inset * 2;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, size, size);
  context.drawImage(sourceCanvas, inset, inset, targetSize, targetSize);
  return canvas.toBuffer("image/png");
}

function createIco(pngImages) {
  const headerSize = 6 + pngImages.length * 16;
  const totalSize = headerSize + pngImages.reduce((sum, image) => sum + image.data.length, 0);
  const ico = Buffer.alloc(totalSize);

  ico.writeUInt16LE(0, 0);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(pngImages.length, 4);

  let imageOffset = headerSize;
  pngImages.forEach((image, index) => {
    const entryOffset = 6 + index * 16;
    ico[entryOffset] = image.size === 256 ? 0 : image.size;
    ico[entryOffset + 1] = image.size === 256 ? 0 : image.size;
    ico[entryOffset + 2] = 0;
    ico[entryOffset + 3] = 0;
    ico.writeUInt16LE(1, entryOffset + 4);
    ico.writeUInt16LE(32, entryOffset + 6);
    ico.writeUInt32LE(image.data.length, entryOffset + 8);
    ico.writeUInt32LE(imageOffset, entryOffset + 12);
    image.data.copy(ico, imageOffset);
    imageOffset += image.data.length;
  });

  return ico;
}

const sourceImage = await loadImage(sourcePath);
const sourceCanvas = makeSquareSourceCanvas(sourceImage);
const pngImages = sizes.map((size) => ({ size, data: renderPng(sourceCanvas, size) }));

await mkdir(dirname(icoOutputPath), { recursive: true });
await mkdir(dirname(faviconOutputPath), { recursive: true });
await writeFile(pngOutputPath, renderPng(sourceCanvas, 1024));
await writeFile(faviconOutputPath, renderPng(sourceCanvas, 512));
await writeFile(icoOutputPath, createIco(pngImages));

console.log(`Generated ${icoOutputPath}`);
console.log(`Generated ${pngOutputPath}`);
console.log(`Generated ${faviconOutputPath}`);
