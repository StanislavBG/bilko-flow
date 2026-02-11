/**
 * Logger abstraction.
 *
 * Provides structured, level-based logging with context.
 * Replaces raw console.log throughout the codebase.
 * Consumers can replace the default implementation by calling setLogHandler().
 */

export enum LogLevel {
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

export type LogHandler = (entry: LogEntry) => void;

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  [LogLevel.Debug]: 0,
  [LogLevel.Info]: 1,
  [LogLevel.Warn]: 2,
  [LogLevel.Error]: 3,
};

/** Default log handler writes structured JSON to console. */
const defaultLogHandler: LogHandler = (entry: LogEntry) => {
  const output = {
    level: entry.level,
    ts: entry.timestamp,
    msg: entry.message,
    ...entry.context,
  };
  switch (entry.level) {
    case LogLevel.Error:
      console.error(JSON.stringify(output));
      break;
    case LogLevel.Warn:
      console.warn(JSON.stringify(output));
      break;
    default:
      console.log(JSON.stringify(output));
  }
};

let currentHandler: LogHandler = defaultLogHandler;
let currentMinLevel: LogLevel = LogLevel.Info;

/** Replace the default log handler (e.g., for testing or external log systems). */
export function setLogHandler(handler: LogHandler): void {
  currentHandler = handler;
}

/** Set the minimum log level. Messages below this level are suppressed. */
export function setLogLevel(level: LogLevel): void {
  currentMinLevel = level;
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentMinLevel];
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  currentHandler({
    level,
    message,
    context,
    timestamp: new Date().toISOString(),
  });
}

/** Create a child logger with persistent context fields. */
export function createLogger(baseContext: Record<string, unknown> = {}): Logger {
  return {
    debug: (msg, ctx) => log(LogLevel.Debug, msg, { ...baseContext, ...ctx }),
    info: (msg, ctx) => log(LogLevel.Info, msg, { ...baseContext, ...ctx }),
    warn: (msg, ctx) => log(LogLevel.Warn, msg, { ...baseContext, ...ctx }),
    error: (msg, ctx) => log(LogLevel.Error, msg, { ...baseContext, ...ctx }),
    child: (childCtx) => createLogger({ ...baseContext, ...childCtx }),
  };
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

/** Root logger instance. */
export const logger = createLogger({ component: 'bilko-flow' });
