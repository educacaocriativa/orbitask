import { createLogger, format, transports } from 'winston'
import { env } from '../config/env'

const { combine, timestamp, colorize, printf, json, errors } = format

// Dev format: colorized, human-readable
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} [${level}]: ${stack ?? message}${metaStr}`
  }),
)

// Prod format: structured JSON
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json(),
)

export const logger = createLogger({
  level: env.NODE_ENV === 'production' ? 'warn' : 'debug',
  format: env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
    ...(env.NODE_ENV === 'production'
      ? [
          new transports.File({ filename: 'logs/error.log', level: 'error' }),
          new transports.File({ filename: 'logs/combined.log' }),
        ]
      : []),
  ],
  exceptionHandlers: [new transports.Console()],
  rejectionHandlers: [new transports.Console()],
})

export default logger

