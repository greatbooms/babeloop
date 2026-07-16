import { readFileSync } from 'fs';
import { join } from 'path';
import { parseSensorTowerCreativeGalleryCsv } from './sensortower-csv.parser';

const FIXTURE = join(__dirname, '../../../../../fixtures/sensortower-creative-gallery-sample.csv');

describe('parseSensorTowerCreativeGalleryCsv', () => {
  it('UTF-16LE(BOM) 실물 픽스처를 파싱한다', () => {
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(readFileSync(FIXTURE));
    expect(errors).toHaveLength(0);
    expect(rows.length).toBe(10);
    const r = rows[0];
    expect(r.advertiserAppName).toBe('Character AI: Chat, Talk, Text');
    expect(r.creativeUrl).toMatch(/^https:\/\//);
    expect(r.firstSeen).toBeInstanceOf(Date);
    expect(r.lastSeen).toBeInstanceOf(Date);
    expect(r.countries.length).toBeGreaterThan(0);
    expect(['video', 'image', 'playable', 'other']).toContain(r.type);
  });

  it('UTF-8 콘텐츠도 파싱한다', () => {
    const utf8 = Buffer.from(
      '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
        '"abc"\t"WHIF"\t"https://cdn.example.com/x"\t"TikTok"\t10\t"2026-06-01"\t"2026-07-01"\t0.5\t"TW,JP"\t"video"\t"other"\t"feed"\t"720x1280"\t15.2\n',
      'utf8',
    );
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(utf8);
    expect(errors).toHaveLength(0);
    expect(rows[0].advertiserAppName).toBe('WHIF');
    expect(rows[0].impressionShare).toBeCloseTo(0.5);
    expect(rows[0].countries).toEqual(['TW', 'JP']);
  });

  it('필수 컬럼(Creative URL) 없는 행은 오류 목록으로 분리한다', () => {
    const bad = Buffer.from(
      '"Advertiser App ID"\t"Advertiser App Name"\t"Creative URL"\t"Networks"\t"Duration"\t"First Seen"\t"Last Seen"\t"Impression Share"\t"Countries"\t"Type"\t"Format"\t"Placements"\t"Dimensions"\t"Video Duration"\n' +
        '"abc"\t"WHIF"\t""\t"TikTok"\t10\t"2026-06-01"\t"2026-07-01"\t0.5\t"TW"\t"video"\t"o"\t"f"\t"720x1280"\t15\n',
      'utf8',
    );
    const { rows, errors } = parseSensorTowerCreativeGalleryCsv(bad);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('행 2');
  });
});
