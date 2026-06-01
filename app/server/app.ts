/**
 * This is a API server
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import * as Sentry from '@sentry/node'
import v1AuthRoutes from './routes/v1/auth.js'
import v1InternalRoutes from './routes/v1/internal.js'
import v1InternalProspectionRoutes from './routes/v1/internalProspection.js'
import v1InternalCompaniesRoutes from './routes/v1/internalCompanies.js'
import v1InternalCommissionsRoutes from './routes/v1/internalCommissions.js'
import v1SiteRoutes from './routes/v1/site.js'
import v1AnalyticsRoutes from './routes/v1/analytics.js'
import v1BackofficeRoutes from './routes/v1/backoffice.js'
import v1AdminRoutes from './routes/v1/admin.js'
import v1TwilioRoutes from './routes/v1/twilio.js'
import v1PublicRoutes from './routes/v1/public.js'

// for esm mode
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// load env
dotenv.config()

const sentryDsn = process.env.SENTRY_DSN || ''
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.VERCEL_GIT_COMMIT_SHA || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0'),
    integrations: [Sentry.expressIntegration()],
  })
}

const app: express.Application = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)

const origins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

app.use(
  cors({
    origin: origins.length ? origins : true,
    credentials: true,
  }),
)

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
)

app.use((req: Request, _res: Response, next: NextFunction) => {
  const rid = String(req.header('x-request-id') || '') || crypto.randomUUID()
  ;(req as any).request_id = rid
  next()
})

const limiterPublic = rateLimit({
  windowMs: 60_000,
  limit: 240,
  standardHeaders: true,
  legacyHeaders: false,
})

const limiterSensitive = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
})

const limiterWrite = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
})

app.use('/api/v1/site', limiterPublic)
app.use('/api/v1/analytics', limiterWrite)
app.use('/api/v1/backoffice', limiterWrite)
app.use('/api/v1/admin', limiterSensitive)
app.use('/api/v1/twilio', limiterPublic)
app.use('/api/v1/public', limiterPublic)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))


app.use('/api/v1', v1AuthRoutes)
app.use('/api/v1', v1InternalRoutes)
app.use('/api/v1', v1InternalProspectionRoutes)
app.use('/api/v1', v1InternalCompaniesRoutes)
app.use('/api/v1', v1InternalCommissionsRoutes)
app.use('/api/v1', v1SiteRoutes)
app.use('/api/v1', v1AnalyticsRoutes)
app.use('/api/v1', v1BackofficeRoutes)
app.use('/api/v1', v1AdminRoutes)
app.use('/api/v1', v1TwilioRoutes)
app.use('/api/v1', v1PublicRoutes)

app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')))

/**
 * health
 */
app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

if (sentryDsn) {
  Sentry.setupExpressErrorHandler(app)
}

/**
 * error handler middleware
 */
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(JSON.stringify({ level: 'error', request_id: (req as any).request_id, path: req.path, message: error.message }))
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

/**
 * 404 handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
