import winston from 'winston'
import { env } from '@/env.mjs'

// Configuração do logger
const logger = winston.createLogger({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'boot-clinic-crm' },
  transports: [
    // Erros em arquivo separado
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error'
    }),
    // Todos os logs em arquivo
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
})

// Adicionar transport no console em desenvolvimento
if (env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }))
}

// Funções utilitárias
export const auditLogger = {
  // Logs de auditoria
  logAction: async (data: {
    userId?: string
    userName?: string
    action: string
    entityType: string
    entityId: string
    oldValues?: any
    newValues?: any
    ipAddress?: string
    userAgent?: string
    companyId: string
  }) => {
    try {
      await fetch('/api/audit/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
    } catch (error) {
      logger.error('Failed to log audit action:', error)
    }
  },

  // Logs de aplicação
  info: (message: string, meta?: any) => logger.info(message, meta),
  warn: (message: string, meta?: any) => logger.warn(message, meta),
  error: (message: string, meta?: any) => logger.error(message, meta),
  debug: (message: string, meta?: any) => logger.debug(message, meta),
}

export default logger