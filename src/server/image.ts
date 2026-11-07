const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ImageExt = 'jpg' | 'png' | 'webp';

function sniff(buffer: Buffer): ImageExt | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(PNG)) return 'png';
  if (
    buffer.length > 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export function decodeDataImage(value: unknown): { buffer: Buffer; ext: ImageExt } | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') throw new Error('图片格式不对');

  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/.exec(value);
  if (!match) throw new Error('图片格式不对');

  const buffer = Buffer.from(match[1]!.replace(/\s/g, ''), 'base64');
  if (!buffer.length) throw new Error('图片为空');
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error('图片超过 2MB');

  const ext = sniff(buffer);
  if (!ext) throw new Error('图片格式不支持');
  return { buffer, ext };
}
