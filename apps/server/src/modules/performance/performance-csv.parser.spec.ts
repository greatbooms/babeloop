import { parsePerformanceCsv } from './performance-csv.parser';

const HEADER =
  'date,platform,tracking_code,impressions,clicks,installs,signups,first_messages,cost,currency';

function csv(...rows: string[]) {
  return Buffer.from([HEADER, ...rows].join('\n'), 'utf8');
}

describe('parsePerformanceCsv', () => {
  it('정상 2행의 날짜·숫자·플랫폼을 파싱한다', () => {
    const result = parsePerformanceCsv(
      csv(
        '2026-07-01,META,BL-TW01-V1-R1,1000,50,10,5,3,2500,TWD',
        '2026-07-01,TIKTOK,BL-TW01-V2-R1,900,40,8,2,1,2200.5,TWD',
      ),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({
      date: new Date('2026-07-01T00:00:00.000Z'),
      platform: 'META',
      trackingCode: 'BL-TW01-V1-R1',
      impressions: 1000,
      clicks: 50,
      installs: 10,
      signups: 5,
      firstMessages: 3,
      cost: 2500,
      currency: 'TWD',
    });
    expect(result.rows[1].cost).toBe(2200.5);
  });

  it('가입·첫 메시지 빈 값은 null이고 숫자 0과 구분된다', () => {
    const result = parsePerformanceCsv(
      csv(
        '2026-07-01,META,BL-TW01-V1-R1,1000,50,10,,,2500,TWD',
        '2026-07-02,META,BL-TW01-V1-R1,0,0,0,0,0,0,TWD',
      ),
    );

    expect(result.rows[0].signups).toBeNull();
    expect(result.rows[0].firstMessages).toBeNull();
    expect(result.rows[1].signups).toBe(0);
    expect(result.rows[1].firstMessages).toBe(0);
  });

  it('잘못된 추적코드는 행 번호와 사유를 남기고 정상 행은 계속 처리한다', () => {
    const result = parsePerformanceCsv(
      csv(
        '2026-07-01,META,invalid,100,10,2,1,1,50,TWD',
        '2026-07-02,META,BL-TW01-V1-R1,200,20,4,2,1,100,TWD',
      ),
    );

    expect(result.rows).toHaveLength(1);
    expect(result.errors).toEqual([expect.stringMatching(/행 2.*추적코드/)]);
  });

  it('알 수 없는 플랫폼과 잘못된 날짜는 각각 오류 행이다', () => {
    const result = parsePerformanceCsv(
      csv(
        '2026-07-01,GOOGLE,BL-TW01-V1-R1,100,10,2,1,1,50,TWD',
        '2026-02-30,META,BL-TW01-V1-R1,100,10,2,1,1,50,TWD',
      ),
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([
      expect.stringMatching(/행 2.*platform/),
      expect.stringMatching(/행 3.*date/),
    ]);
  });

  it('필수 헤더가 누락되면 데이터 전체를 거부한다', () => {
    const result = parsePerformanceCsv(
      Buffer.from('date,platform,tracking_code\n2026-07-01,META,BL-TW01-V1-R1'),
    );

    expect(result.rows).toEqual([]);
    expect(result.errors[0]).toMatch(/필수 컬럼 누락/);
    expect(result.errors[0]).toContain('signups');
  });

  it('음수 숫자가 있는 행은 오류다', () => {
    const result = parsePerformanceCsv(
      csv('2026-07-01,META,BL-TW01-V1-R1,100,10,-1,1,1,50,TWD'),
    );

    expect(result.rows).toEqual([]);
    expect(result.errors).toEqual([expect.stringMatching(/행 2.*installs.*음수/)]);
  });

  it('platform 소문자는 대문자 enum으로 매핑한다', () => {
    const result = parsePerformanceCsv(
      csv('2026-07-01,meta,BL-TW01-V1-R1,100,10,2,1,1,50,TWD'),
    );

    expect(result.errors).toEqual([]);
    expect(result.rows[0].platform).toBe('META');
  });
});
