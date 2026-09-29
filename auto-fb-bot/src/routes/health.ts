import { Router, Request, Response } from 'express';
import { isConfiguredForFacebook, isConfiguredForGemini, env } from '../config/env';

const router = Router();

/**
 * Health check endpoint
 * Route: GET /health
 * Returns service status, system uptime, and timestamp
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    brand: 'ByteBangla Content Bot',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: env.NODE_ENV,
    services: {
      geminiConfigured: isConfiguredForGemini(),
      facebookConfigured: isConfiguredForFacebook(),
      cronSchedule: env.CRON_SCHEDULE,
    },
  });
});

export default router;
