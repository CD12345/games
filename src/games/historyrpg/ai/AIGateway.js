// History RPG - AI Gateway
// Manages API key storage and AI requests (Claude or OpenAI)

import { onMessage, offMessage, sendMessage, isConnected } from '../../../core/peer.js';
import { debugLog } from '../../../ui/DebugOverlay.js';

// API endpoints
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

// Storage keys
const API_KEY_STORAGE_KEY = 'historyrpg_api_key';
const API_PROVIDER_STORAGE_KEY = 'historyrpg_api_provider';

export class AIGateway {
    constructor(options = {}) {
        // Mode: 'local' (use own key), 'gateway' (route through host), 'none'
        this.mode = options.mode || 'local';
        this.isHost = options.isHost || false;

        // API configuration
        this.apiKey = options.apiKey || this.loadStoredApiKey();
        this.provider = options.provider || this.loadStoredProvider();

        // Request tracking
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;

        // Gateway mode handlers (for P2P routing)
        this.gatewayHandlersBound = false;

        // Rate limiting
        this.lastRequestTime = 0;
        this.minRequestInterval = 500; // ms between requests

        // Cache for responses
        this.cache = new Map();
        this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
    }

    // Load API key from localStorage
    loadStoredApiKey() {
        try {
            return localStorage.getItem(API_KEY_STORAGE_KEY) || null;
        } catch (e) {
            return null;
        }
    }

    // Save API key to localStorage
    saveApiKey(key) {
        this.apiKey = key;
        try {
            if (key) {
                localStorage.setItem(API_KEY_STORAGE_KEY, key);
            } else {
                localStorage.removeItem(API_KEY_STORAGE_KEY);
            }
        } catch (e) {
            console.warn('[AIGateway] Failed to save API key:', e);
        }
    }

    // Load provider from localStorage
    loadStoredProvider() {
        try {
            return localStorage.getItem(API_PROVIDER_STORAGE_KEY) || 'claude';
        } catch (e) {
            return 'claude';
        }
    }

    // Save provider to localStorage
    saveProvider(provider) {
        this.provider = provider;
        try {
            localStorage.setItem(API_PROVIDER_STORAGE_KEY, provider);
        } catch (e) {
            console.warn('[AIGateway] Failed to save provider:', e);
        }
    }

    // Check if we have a valid API key
    hasApiKey() {
        const has = !!this.apiKey && this.apiKey.length > 10;
        debugLog(`[AIGateway] hasApiKey: ${has} (key length: ${this.apiKey?.length || 0})`);
        return has;
    }

    // Check if AI is available (either local key or gateway connection)
    isAvailable() {
        debugLog(`[AIGateway] isAvailable check - mode: ${this.mode}, provider: ${this.provider}`);
        if (this.mode === 'local') {
            const available = this.hasApiKey();
            debugLog(`[AIGateway] Local mode available: ${available}`);
            return available;
        }
        if (this.mode === 'gateway') {
            const connected = isConnected();
            debugLog(`[AIGateway] Gateway mode connected: ${connected}`);
            return connected;
        }
        debugLog(`[AIGateway] Mode '${this.mode}' - not available`);
        return false;
    }

    // Set up gateway mode (host receives requests from guests)
    setupGatewayMode() {
        if (this.gatewayHandlersBound) return;
        this.gatewayHandlersBound = true;

        if (this.isHost) {
            // Host handles AI requests from guests
            onMessage('ai_request', async (data) => {
                const { requestId, prompt, options } = data;

                try {
                    const response = await this.callAPI(prompt, options);
                    sendMessage('ai_response', {
                        requestId,
                        success: true,
                        data: response
                    });
                } catch (error) {
                    sendMessage('ai_response', {
                        requestId,
                        success: false,
                        error: error.message
                    });
                }
            });
        } else {
            // Guest receives AI responses from host
            onMessage('ai_response', (data) => {
                const { requestId, success, data: responseData, error } = data;
                const pending = this.pendingRequests.get(requestId);

                if (pending) {
                    this.pendingRequests.delete(requestId);
                    if (success) {
                        pending.resolve(responseData);
                    } else {
                        pending.reject(new Error(error || 'AI request failed'));
                    }
                }
            });
        }
    }

    // Clean up gateway mode handlers
    cleanupGatewayMode() {
        if (!this.gatewayHandlersBound) return;
        this.gatewayHandlersBound = false;

        offMessage('ai_request');
        offMessage('ai_response');

        // Reject any pending requests
        for (const [id, pending] of this.pendingRequests) {
            pending.reject(new Error('Gateway closed'));
        }
        this.pendingRequests.clear();
    }

    // Generate a unique request ID
    generateRequestId() {
        return `req_${Date.now()}_${++this.requestIdCounter}`;
    }

    // Main generate method - routes to appropriate handler
    async generate(prompt, options = {}) {
        debugLog(`[AIGateway] generate() called`);
        debugLog(`[AIGateway] Prompt preview: ${prompt.substring(0, 100)}...`);

        // Check cache first
        const cacheKey = this.getCacheKey(prompt, options);
        const cached = this.getFromCache(cacheKey);
        if (cached) {
            debugLog(`[AIGateway] Returning cached response`);
            return cached;
        }

        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            debugLog(`[AIGateway] Rate limiting - waiting ${this.minRequestInterval - timeSinceLastRequest}ms`);
            await this.delay(this.minRequestInterval - timeSinceLastRequest);
        }
        this.lastRequestTime = Date.now();

        let response;

        if (this.mode === 'gateway' && !this.isHost) {
            debugLog(`[AIGateway] Routing through gateway`);
            response = await this.requestViaGateway(prompt, options);
        } else {
            debugLog(`[AIGateway] Making direct API call to ${this.provider}`);
            response = await this.callAPI(prompt, options);
        }

        debugLog(`[AIGateway] Response received (${response?.length || 0} chars)`);
        debugLog(`[AIGateway] Response preview: ${response?.substring(0, 200)}...`);

        // Cache the response
        this.addToCache(cacheKey, response);

        return response;
    }

    // Request via P2P gateway (guest -> host)
    async requestViaGateway(prompt, options) {
        return new Promise((resolve, reject) => {
            const requestId = this.generateRequestId();

            // Set timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error('AI request timed out'));
            }, 60000); // 60 second timeout

            this.pendingRequests.set(requestId, {
                resolve: (data) => {
                    clearTimeout(timeout);
                    resolve(data);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                }
            });

            sendMessage('ai_request', {
                requestId,
                prompt,
                options
            });
        });
    }

    // Direct API call
    async callAPI(prompt, options = {}) {
        debugLog(`[AIGateway] callAPI() - provider: ${this.provider}`);
        if (!this.hasApiKey()) {
            debugLog(`[AIGateway] ERROR: No API key configured`);
            throw new Error('No API key configured');
        }

        if (this.provider === 'openai') {
            return this.callOpenAI(prompt, options);
        } else {
            return this.callClaude(prompt, options);
        }
    }

    // Call Claude API
    async callClaude(prompt, options = {}) {
        const model = options.model || 'claude-sonnet-4-20250514';
        debugLog(`[AIGateway] Calling Claude API - model: ${model}`);
        debugLog(`[AIGateway] Prompt length: ${prompt.length} chars`);

        try {
            const response = await fetch(CLAUDE_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': '2023-06-01',
                    'anthropic-dangerous-direct-browser-access': 'true'
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: options.maxTokens || 4096,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });

            debugLog(`[AIGateway] Claude response status: ${response.status}`);

            if (!response.ok) {
                const error = await response.text();
                debugLog(`[AIGateway] Claude API ERROR: ${response.status} - ${error}`);
                throw new Error(`Claude API error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            debugLog(`[AIGateway] Claude response received - ${data.content?.[0]?.text?.length || 0} chars`);
            return data.content[0].text;
        } catch (error) {
            debugLog(`[AIGateway] Claude fetch error: ${error.message}`);
            throw error;
        }
    }

    // Call OpenAI API
    async callOpenAI(prompt, options = {}) {
        const model = options.model || 'gpt-4o';
        debugLog(`[AIGateway] Calling OpenAI API - model: ${model}`);
        debugLog(`[AIGateway] Prompt length: ${prompt.length} chars`);

        try {
            const response = await fetch(OPENAI_API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: model,
                    max_tokens: options.maxTokens || 4096,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                })
            });

            debugLog(`[AIGateway] OpenAI response status: ${response.status}`);

            if (!response.ok) {
                const error = await response.text();
                debugLog(`[AIGateway] OpenAI API ERROR: ${response.status} - ${error}`);
                throw new Error(`OpenAI API error: ${response.status} - ${error}`);
            }

            const data = await response.json();
            debugLog(`[AIGateway] OpenAI response received - ${data.choices?.[0]?.message?.content?.length || 0} chars`);
            return data.choices[0].message.content;
        } catch (error) {
            debugLog(`[AIGateway] OpenAI fetch error: ${error.message}`);
            throw error;
        }
    }

    // Cache helpers
    getCacheKey(prompt, options) {
        return `${this.provider}:${JSON.stringify(options)}:${prompt.substring(0, 100)}`;
    }

    getFromCache(key) {
        const entry = this.cache.get(key);
        if (!entry) return null;

        if (Date.now() - entry.timestamp > this.cacheMaxAge) {
            this.cache.delete(key);
            return null;
        }

        return entry.data;
    }

    addToCache(key, data) {
        // Limit cache size
        if (this.cache.size > 100) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    clearCache() {
        this.cache.clear();
    }

    // Utility
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Cleanup
    destroy() {
        this.cleanupGatewayMode();
        this.pendingRequests.clear();
        this.cache.clear();
    }
}
