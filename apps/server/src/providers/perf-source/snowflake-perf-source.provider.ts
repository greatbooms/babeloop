import { readFileSync } from 'fs';
import type { ConnectionOptions } from 'snowflake-sdk';
import { FetchPerfSignupsInput, PerfSignupRow, PerfSourceProvider } from './perf-source.provider';

const CODE_REGEX = 'BL-[A-Z0-9]+-V[0-9]+-R[0-9]+';
const TS_FIELDS = ['Event Datetime', 'Event Timestamp', 'Server Datetime', 'event_datetime'];
const UID_FIELDS = ['User ID', 'user_id', 'Airbridge Device ID'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const IDENTIFIER_PATTERN = /^[A-Z0-9_]+$/i;

const coalesceFields = (fields: string[], cast: string) =>
  `COALESCE(${fields.map((field) => `RAW_DATA:"${field}"::${cast}`).join(', ')})`;

interface SnowflakeSignupRow {
  DT?: string;
  CODE?: string;
  SIGNUPS?: number | string;
}

export class SnowflakePerfSourceProvider implements PerfSourceProvider {
  readonly name = 'snowflake';
  readonly configured: boolean;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.configured = Boolean(
      env.SNOWFLAKE_ACCOUNT
      && env.SNOWFLAKE_USERNAME
      && (env.SNOWFLAKE_PASSWORD || env.SNOWFLAKE_PRIVATE_KEY_PATH),
    );
  }

  async fetchSignups(input: FetchPerfSignupsInput): Promise<PerfSignupRow[]> {
    if (!this.configured) {
      throw new Error('Snowflake performance source is not configured');
    }
    if (!DATE_PATTERN.test(input.from) || !DATE_PATTERN.test(input.to)) {
      throw new Error('Snowflake performance source dates must use YYYY-MM-DD');
    }

    const database = this.env.SNOWFLAKE_DATABASE || 'BABECHAT_TW';
    if (!IDENTIFIER_PATTERN.test(database)) {
      throw new Error('SNOWFLAKE_DATABASE must be a Snowflake identifier');
    }

    const snowflake = await import('snowflake-sdk');
    snowflake.configure({ logLevel: 'ERROR' });
    const connection = snowflake.createConnection(this.connectionOptions(database));

    try {
      await new Promise<void>((resolve, reject) => {
        connection.connect((error) => (error ? reject(error) : resolve()));
      });
      const rows = await new Promise<SnowflakeSignupRow[]>((resolve, reject) => {
        connection.execute({
          sqlText: this.extractSql(database, input),
          complete: (error, _statement, resultRows) => {
            if (error) reject(error);
            else resolve((resultRows ?? []) as SnowflakeSignupRow[]);
          },
        });
      });

      return rows.map((row) => ({
        date: String(row.DT ?? ''),
        trackingCode: String(row.CODE ?? ''),
        signups: Number(row.SIGNUPS ?? 0),
      }));
    } finally {
      await new Promise<void>((resolve) => connection.destroy(() => resolve()));
    }
  }

  private connectionOptions(database: string): ConnectionOptions {
    const options: ConnectionOptions = {
      account: this.env.SNOWFLAKE_ACCOUNT!,
      username: this.env.SNOWFLAKE_USERNAME!,
      role: this.env.SNOWFLAKE_ROLE,
      warehouse: this.env.SNOWFLAKE_WAREHOUSE,
      database,
      timeout: 60_000,
    };

    if (this.env.SNOWFLAKE_PRIVATE_KEY_PATH) {
      options.authenticator = 'SNOWFLAKE_JWT';
      options.privateKey = readFileSync(this.env.SNOWFLAKE_PRIVATE_KEY_PATH, 'utf8');
      options.privateKeyPass = this.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE;
    } else {
      options.password = this.env.SNOWFLAKE_PASSWORD;
    }
    return options;
  }

  private extractSql(database: string, input: FetchPerfSignupsInput): string {
    return `
WITH touches AS (
  SELECT ${coalesceFields(UID_FIELDS, 'string')} uid,
         REGEXP_SUBSTR(TO_JSON(RAW_DATA), '${CODE_REGEX}') code,
         ${coalesceFields(TS_FIELDS, 'timestamp')} ts
  FROM ${database}.AIRBRIDGE.WEB_EVENTS
  QUALIFY code IS NOT NULL AND uid IS NOT NULL
),
first_touch AS (
  SELECT uid, code
  FROM touches
  QUALIFY ROW_NUMBER() OVER (PARTITION BY uid ORDER BY ts NULLS LAST) = 1
),
signups AS (
  SELECT RAW_DATA:user_id::string uid, DATE(MIN(RAW_DATA:created_at::timestamp)) d
  FROM ${database}.BABECHAT.USERS GROUP BY 1
)
SELECT TO_CHAR(s.d, 'YYYY-MM-DD') dt, f.code, COUNT(DISTINCT s.uid) signups
FROM first_touch f JOIN signups s ON s.uid = f.uid
WHERE s.d BETWEEN '${input.from}' AND '${input.to}'
GROUP BY 1, 2 ORDER BY 1, 2`;
  }
}
