type LogLevel = 'INFO' | 'ERROR' | 'WARN' | 'DEBUG';

function log(level: LogLevel, message: string, context?: Record<string, any>) {
  const timestamp = new Date().toISOString();
  const formattedContext = context ? ` ${JSON.stringify(context)}` : '';
  console.log(`[${timestamp}] [${level}] ${message}${formattedContext}`);
}

export const logger = {
  info: (message: string, context?: Record<string, any>) => log('INFO', message, context),
  error: (message: string, error?: Error, context?: Record<string, any>) => {
    log('ERROR', message, { error: error?.message, stack: error?.stack, ...context });
  },
  warn: (message: string, context?: Record<string, any>) => log('WARN', message, context),
  debug: (message: string, context?: Record<string, any>) => log('DEBUG', message, context),
};
