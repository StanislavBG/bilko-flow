/**
 * Open-Source LLM Adapters — Reference implementations for common
 * local and open-source model serving platforms.
 *
 * Each adapter translates Bilko's LLMCallOptions into the platform's
 * native API format. All four platforms expose OpenAI-compatible
 * endpoints, so the adapters share similar structure.
 *
 * Quick start:
 *   import { registerAllOpenSourceAdapters } from 'bilko-flow/llm/adapters';
 *   registerAllOpenSourceAdapters();
 */

export { createOllamaAdapter, registerOllamaAdapter, OLLAMA_DEFAULT_BASE_URL } from './ollama';
export { createVllmAdapter, registerVllmAdapter, VLLM_DEFAULT_BASE_URL } from './vllm';
export { createTgiAdapter, registerTgiAdapter, TGI_DEFAULT_BASE_URL } from './tgi';
export { createLocalAIAdapter, registerLocalAIAdapter, LOCAL_AI_DEFAULT_BASE_URL } from './local-ai';

/** Register all open-source adapters at once. */
export function registerAllOpenSourceAdapters(): void {
  // Lazy imports to avoid side effects until explicitly called
  const { registerOllamaAdapter: ollama } = require('./ollama');
  const { registerVllmAdapter: vllm } = require('./vllm');
  const { registerTgiAdapter: tgi } = require('./tgi');
  const { registerLocalAIAdapter: localAI } = require('./local-ai');

  ollama();
  vllm();
  tgi();
  localAI();
}
