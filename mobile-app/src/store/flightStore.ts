/**
 * Zustand global store — flight search state, chat history, and price alerts
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Itinerary, PriceAlert, ChatMessage } from '../services/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SearchParams {
  origin: string;
  destination: string;
  departureDate: string;
  returnDate?: string;
  passengers: number;
  cabinClass: 'economy' | 'premium_economy' | 'business' | 'first';
}

export interface FlightStore {
  // Search
  searchParams: SearchParams | null;
  runId: string | null;
  searchStatus: 'idle' | 'loading' | 'success' | 'error';
  results: Itinerary[];
  recommendation: Record<string, unknown> | null;
  searchError: string | null;

  // Chat
  chatHistory: ChatMessage[];
  isChatLoading: boolean;

  // Alerts
  priceAlerts: PriceAlert[];

  // Actions
  setSearchParams: (params: SearchParams) => void;
  setRunId: (id: string) => void;
  setSearchStatus: (status: FlightStore['searchStatus']) => void;
  setResults: (results: Itinerary[], recommendation?: Record<string, unknown>) => void;
  setSearchError: (err: string | null) => void;
  appendChatMessage: (msg: ChatMessage) => void;
  setChatLoading: (loading: boolean) => void;
  clearChat: () => void;
  setPriceAlerts: (alerts: PriceAlert[]) => void;
  addPriceAlert: (alert: PriceAlert) => void;
  removePriceAlert: (alertId: string) => void;
  resetSearch: () => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFlightStore = create<FlightStore>()(
  persist(
    (set) => ({
      // Search
      searchParams: null,
      runId: null,
      searchStatus: 'idle',
      results: [],
      recommendation: null,
      searchError: null,

      // Chat
      chatHistory: [],
      isChatLoading: false,

      // Alerts
      priceAlerts: [],

      // Actions
      setSearchParams: (params) => set({ searchParams: params }),
      setRunId: (id) => set({ runId: id }),
      setSearchStatus: (status) => set({ searchStatus: status }),
      setResults: (results, recommendation) =>
        set({ results, recommendation: recommendation ?? null, searchStatus: 'success' }),
      setSearchError: (err) => set({ searchError: err, searchStatus: 'error' }),

      appendChatMessage: (msg) =>
        set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
      setChatLoading: (loading) => set({ isChatLoading: loading }),
      clearChat: () => set({ chatHistory: [] }),

      setPriceAlerts: (alerts) => set({ priceAlerts: alerts }),
      addPriceAlert: (alert) =>
        set((state) => ({ priceAlerts: [...state.priceAlerts, alert] })),
      removePriceAlert: (alertId) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.filter((a) => a.id !== alertId),
        })),

      resetSearch: () =>
        set({
          searchParams: null,
          runId: null,
          searchStatus: 'idle',
          results: [],
          recommendation: null,
          searchError: null,
        }),
    }),
    {
      name: 'flight-engine-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        chatHistory: state.chatHistory,
        priceAlerts: state.priceAlerts,
      }),
    }
  )
);
