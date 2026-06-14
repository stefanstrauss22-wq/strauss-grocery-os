import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  plannerModel: process.env.PLANNER_MODEL || 'claude-opus-4-8',
  extractionModel: process.env.EXTRACTION_MODEL || 'claude-opus-4-8',
  // Translation: Sonnet is much faster/cheaper than Opus with near-identical
  // latency to Haiku on small batches, but Haiku's Afrikaans is unreliable
  // (mistranslates food terms), so Sonnet is the quality/speed sweet spot.
  translateModel: process.env.TRANSLATE_MODEL || 'claude-sonnet-4-6',
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
    token: process.env.WHATSAPP_TOKEN || null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    appId: process.env.WHATSAPP_APP_ID || '2040786109842671', // public app id (not a secret)
  },
  openaiApiKey: process.env.OPENAI_API_KEY || null,
};
