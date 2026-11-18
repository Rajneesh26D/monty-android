import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  readJob: vi.fn(),
  saveJob: vi.fn(),
  readPdf: vi.fn(),
  openPdf: vi.fn(),
}));
vi.mock('../src/storage/repository', () => mock);
vi.mock('../src/pdf/reader', () => mock);

import { vocabularyImage } from '../src/services/vocabularyImage';

it('rechecks a saved PDF after an illustration was missed and caches only a usable crop', async () => {
  const background = [0, 0, 960, 540];
  const illustration = [36, 175, 296, 369];
  const image = vi.fn().mockResolvedValue('data:image/jpeg;base64,cGhvdG8=');
  mock.openPdf.mockResolvedValue({
    page: vi.fn().mockResolvedValue({
      width: 960,
      height: 540,
      items: [{ text: 'Deplorable :- very bad', x: 55, y: 79, width: 280, height: 22 }],
    }),
    graphics: vi
      .fn()
      .mockResolvedValueOnce({ images: [background] })
      .mockResolvedValueOnce({ images: [background, illustration] }),
    image,
    close: vi.fn().mockResolvedValue(undefined),
  });
  mock.readJob.mockResolvedValue(undefined);
  mock.readPdf.mockResolvedValue(new Uint8Array());
  const source = { documentId: 'lec1', page: 2 };
  await expect(vocabularyImage('Deplorable', source)).resolves.toBeNull();
  expect(mock.saveJob).not.toHaveBeenCalled();

  await expect(vocabularyImage('Deplorable', source)).resolves.toBe(
    'data:image/jpeg;base64,cGhvdG8=',
  );
  expect(mock.readJob).toHaveBeenCalledWith('vocab-image-v2-lec1-2-deplorable');
  expect(image).toHaveBeenCalledWith(2, illustration);
  expect(mock.saveJob).toHaveBeenCalledWith(
    'vocab-image-v2-lec1-2-deplorable',
    'data:image/jpeg;base64,cGhvdG8=',
  );
});
