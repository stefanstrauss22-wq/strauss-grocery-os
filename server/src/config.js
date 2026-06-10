import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  databaseUrl: process.env.DATABASE_URL || null,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || null,
  plannerModel: process.env.PLANNER_MODEL || 'claude-opus-4-8',
  extractionModel: process.env.EXTRACTION_MODEL || 'claude-opus-4-8',
  whatsapp: {
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
    token: process.env.WHATSAPP_TOKEN || null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
  },
  openaiApiKey: process.env.OPENAI_API_KEY || null,
};
