/**
 * Agentic Flight Engine — API client
 * Wraps axios with auth token injection, refresh logic, and SSE helpers.
 */
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT on every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Token refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('auth_token');
      // TODO: navigate to login screen
    }
    return Promise.reject(error);
  }
);

export default api;

// ---------------------------------------------------------------------------
// Flight API helpers
// ---------------------------------------------------------------------------

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  departure_date: string;
  return_date?: string;
  passengers?: number;
  cabin_class?: 'economy' | 'premium_economy' | 'business' | 'first';
  max_price?: number;
  flexible_dates?: boolean;
}

export interface Itinerary {
  id: string;
  provider: string;
  airline: string;
  flight_number: string;
  origin: string;
  destination: string;
  departure_at: string;
  arrival_at: string;
  duration_minutes: number;
  stops: number;
  price: number;
  currency: string;
  cabin_class: string;
  booking_url: string;
  is_deal?: boolean;
  score?: number;
}

export interface PriceAlert {
  id: string;
  origin: string;
  destination: string;
  departure_date: string;
  target_price: number;
  is_active: boolean;
}

// Search flights (returns run_id for streaming)
export const initiateFlightSearch = async (req: FlightSearchRequest) => {
  const { data } = await api.post('/api/v1/flights/search', req);
  return data as { run_id: string; status: string };
};

// Fetch completed result by run_id
export const getSearchResult = async (runId: string) => {
  const { data } = await api.get(`/api/v1/flights/search/${runId}/result`);
  return data;
};

// Create price alert
export const createPriceAlert = async (payload: {
  origin: string;
  destination: string;
  departure_date: string;
  target_price: number;
  push_token?: string;
}) => {
  const { data } = await api.post('/api/v1/flights/alerts', payload);
  return data as PriceAlert;
};

// List price alerts
export const listPriceAlerts = async () => {
  const { data } = await api.get('/api/v1/flights/alerts');
  return data as PriceAlert[];
};

// Delete price alert
export const deletePriceAlert = async (alertId: string) => {
  await api.delete(`/api/v1/flights/alerts/${alertId}`);
};

// Register device push token
export const registerDevice = async (payload: {
  push_token: string;
  platform: string;
  device_id: string;
}) => {
  const { data } = await api.post('/api/v1/notifications/register', payload);
  return data;
};

// ---------------------------------------------------------------------------
// Agent chat API helpers
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const sendAgentMessage = async (message: string, history: ChatMessage[] = []) => {
  const { data } = await api.post('/api/v1/agents/chat', { message, history });
  return data as {
    response: string;
    recommendation?: Record<string, unknown>;
    ranked_results?: Itinerary[];
    error?: string;
  };
};

// ---------------------------------------------------------------------------
// SSE streaming helper (agent chat stream)
// ---------------------------------------------------------------------------

export function streamAgentChat(
  message: string,
  onToken: (token: string) => void,
  onDone: () => void,
  onError?: (err: Error) => void
): () => void {
  const url = `${BASE_URL}/api/v1/agents/chat/stream`;
  let closed = false;

  SecureStore.getItemAsync('auth_token').then((token) => {
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({ message }),
    })
      .then(async (res) => {
        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) return;
        while (!closed) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          for (const line of text.split('\n')) {
            if (line.startsWith('data: ')) {
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') { onDone(); return; }
              try {
                const parsed = JSON.parse(raw);
                if (parsed.token) onToken(parsed.token);
              } catch { /* skip */ }
            }
          }
        }
        onDone();
      })
      .catch((err) => onError?.(err));
  });

  return () => { closed = true; };
}
