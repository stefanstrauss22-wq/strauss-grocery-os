import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let _client = null;

export function claude() {
  if (!config.anthropicApiKey) {
    const err = new Error('ANTHROPIC_API_KEY is not set — AI features are disabled. Add it to server/.env');
    err.status = 503;
    throw err;
  }
  if (!_client) _client = new Anthropic({ apiKey: config.anthropicApiKey });
  return _client;
}

export function aiEnabled() {
  return Boolean(config.anthropicApiKey);
}

/** Extract the first text block from a Messages API response. */
export function firstText(message) {
  const block = message.content.find(b => b.type === 'text');
  return block ? block.text : '';
}
