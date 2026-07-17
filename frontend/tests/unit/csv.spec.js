import { parseCSV } from '@/utils/csv';

describe('parseCSV — RFC 4180 (BUG-135)', () => {
  it('parses a simple comma-separated file with a header row', () => {
    const text = 'name,eventDate\nConcert A,2026-07-20\nConcert B,2026-08-01';
    expect(parseCSV(text)).toEqual([
      ['name', 'eventDate'],
      ['Concert A', '2026-07-20'],
      ['Concert B', '2026-08-01'],
    ]);
  });

  it('does not split a quoted field containing a newline', () => {
    const text = 'name,description\n"Concert A","Line one\nLine two"\nConcert B,Simple';
    expect(parseCSV(text)).toEqual([
      ['name', 'description'],
      ['Concert A', 'Line one\nLine two'],
      ['Concert B', 'Simple'],
    ]);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const text = 'name\n"Say ""hello"""';
    expect(parseCSV(text)).toEqual([
      ['name'],
      ['Say "hello"'],
    ]);
  });

  it('handles a quoted field containing a comma', () => {
    const text = 'name,location\n"Concert, the sequel","Paris, France"';
    expect(parseCSV(text)).toEqual([
      ['name', 'location'],
      ['Concert, the sequel', 'Paris, France'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const text = 'name,eventDate\r\nConcert A,2026-07-20\r\nConcert B,2026-08-01';
    expect(parseCSV(text)).toEqual([
      ['name', 'eventDate'],
      ['Concert A', '2026-07-20'],
      ['Concert B', '2026-08-01'],
    ]);
  });

  it('drops fully blank lines but keeps a mid-file blank inside a quoted field', () => {
    const text = 'name,description\n"A","x\n\ny"\n\nB,ok';
    expect(parseCSV(text)).toEqual([
      ['name', 'description'],
      ['A', 'x\n\ny'],
      ['B', 'ok'],
    ]);
  });

  it('returns an empty array for an empty or header-only input', () => {
    expect(parseCSV('')).toEqual([]);
    expect(parseCSV('name,eventDate')).toEqual([['name', 'eventDate']]);
  });
});
