// Type definitions for packages without official @types

// ============================================
// @clickhouse/client
// Official @types not available, custom definitions
// ============================================
declare module "@clickhouse/client" {
  export interface ClickHouseClientConfig {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
    request_timeout?: number;
    compression?: {
      request?: boolean;
      response?: boolean;
    };
  }

  export interface QueryParams {
    query: string;
    query_params?: Record<string, unknown>;
    format?: string;
  }

  export interface ResultSet<T = unknown> {
    json<R = T>(): Promise<R[]>;
    text(): Promise<string>;
  }

  export interface ClickHouseClient {
    query<T = unknown>(options: QueryParams): Promise<ResultSet<T>>;
    insert<T = unknown>(options: {
      table: string;
      values: T[];
      format?: string;
    }): Promise<void>;
    exec(options: { query: string }): Promise<void>;
    close(): Promise<void>;
    ping(): Promise<boolean>;
  }

  export function createClient(config: ClickHouseClientConfig): ClickHouseClient;
}

// ============================================
// better-sqlite3
// Official @types not available, custom definitions
// ============================================
declare module "better-sqlite3" {
  export interface DatabaseOptions {
    readonly?: boolean;
    fileMustExist?: boolean;
    timeout?: number;
    verbose?: (message?: unknown, ...additionalArgs: unknown[]) => void;
  }

  export interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  export interface Statement<BindParameters extends unknown[] = unknown[]> {
    run(...params: BindParameters): RunResult;
    get<T = unknown>(...params: BindParameters): T | undefined;
    all<T = unknown>(...params: BindParameters): T[];
    iterate<T = unknown>(...params: BindParameters): IterableIterator<T>;
    pluck(toggle?: boolean): this;
    expand(toggle?: boolean): this;
    raw(toggle?: boolean): this;
    bind(...params: BindParameters): this;
  }

  class Database {
    constructor(filename: string, options?: DatabaseOptions);

    prepare<BindParameters extends unknown[] = unknown[]>(
      sql: string
    ): Statement<BindParameters>;

    exec(sql: string): this;

    pragma(pragma: string, options?: { simple?: boolean }): unknown;

    function(name: string, fn: (...args: unknown[]) => unknown): this;
    function(
      name: string,
      options: { deterministic?: boolean; varargs?: boolean },
      fn: (...args: unknown[]) => unknown
    ): this;

    aggregate(
      name: string,
      options: {
        start?: unknown;
        step: (total: unknown, next: unknown) => unknown;
        inverse?: (total: unknown, dropped: unknown) => unknown;
        result?: (total: unknown) => unknown;
        deterministic?: boolean;
        varargs?: boolean;
      }
    ): this;

    transaction<F extends (...args: unknown[]) => unknown>(fn: F): F;

    close(): this;

    readonly open: boolean;
    readonly inTransaction: boolean;
    readonly name: string;
    readonly memory: boolean;
    readonly readonly: boolean;
  }

  export default Database;
}
