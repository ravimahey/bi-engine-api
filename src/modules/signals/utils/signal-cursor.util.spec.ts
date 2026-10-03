import { BadRequestException } from '@nestjs/common';
import { decodeSignalCursor, encodeSignalCursor } from './signal-cursor.util';

describe('signal cursor', () => {
  const cursor = {
    createdAt: '2026-09-30T10:15:30.123456Z',
    id: '3f2b8c1e-5d4a-4b6f-9a7e-0c1d2e3f4a5b',
  };

  it('round-trips without losing microseconds', () => {
    expect(decodeSignalCursor(encodeSignalCursor(cursor))).toEqual(cursor);
  });

  it('is URL-safe', () => {
    expect(encodeSignalCursor(cursor)).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ['garbage', 'not-a-cursor'],
    ['a millisecond timestamp', encode('2026-09-30T10:15:30.123Z', cursor.id)],
    ['a non-uuid id', encode(cursor.createdAt, "1' OR '1'='1")],
    ['extra segments', encode(cursor.createdAt, `${cursor.id}|extra`)],
    ['an empty string', ''],
  ])('rejects %s', (_label, value) => {
    expect(() => decodeSignalCursor(value)).toThrow(BadRequestException);
  });
});

function encode(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}
