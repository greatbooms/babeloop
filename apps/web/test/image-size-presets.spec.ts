import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_IMAGE_SIZE_PRESET,
  IMAGE_SIZE_PRESET_OPTIONS,
  imageSizePresetCaption,
  resolveImageSizePresetId,
} from '../src/lib/image-size-presets';

test('exposes the seven ad size preset ids in display order', () => {
  assert.deepEqual(
    IMAGE_SIZE_PRESET_OPTIONS.map((preset) => preset.id),
    [
      'square_1200x1200',
      'landscape_600x500',
      'portrait_960x1200',
      'portrait_300x500',
      'landscape_1200x628',
      'banner_600x200',
      'banner_908x226',
    ],
  );
});

test('defaults missing or unknown selections to the square preset', () => {
  assert.equal(DEFAULT_IMAGE_SIZE_PRESET, 'square_1200x1200');
  assert.equal(resolveImageSizePresetId(), DEFAULT_IMAGE_SIZE_PRESET);
  assert.equal(resolveImageSizePresetId('unknown_size'), DEFAULT_IMAGE_SIZE_PRESET);
  assert.equal(resolveImageSizePresetId('banner_600x200'), 'banner_600x200');
});

test('shows dimensions only for images that record a known preset', () => {
  assert.equal(imageSizePresetCaption('landscape_1200x628'), '1200×628');
  assert.equal(imageSizePresetCaption(null), null);
  assert.equal(imageSizePresetCaption('unknown_size'), null);
});
