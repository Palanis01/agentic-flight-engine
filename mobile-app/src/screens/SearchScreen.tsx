/**
 * Flight Search Screen — AI-powered natural language + structured search
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFlightStore } from '../store/flightStore';
import { initiateFlightSearch, getSearchResult } from '../services/api';
import { Colors, Typography, Spacing } from '../theme';

const CABIN_CLASSES = ['economy', 'premium_economy', 'business', 'first'] as const;

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const { setSearchParams, setRunId, setSearchStatus, setResults, setSearchError } = useFlightStore();

  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [cabinClass, setCabinClass] = useState<typeof CABIN_CLASSES[number]>('economy');
  const [loading, setLoading] = useState(false);
  const [naturalLanguage, setNaturalLanguage] = useState('');
  const [mode, setMode] = useState<'form' | 'chat'>('form');

  const handleSearch = async () => {
    if (!origin || !destination || !departureDate) return;
    setLoading(true);
    setSearchStatus('loading');
    try {
      const params = {
        origin: origin.toUpperCase(),
        destination: destination.toUpperCase(),
        departure_date: departureDate,
        return_date: returnDate || undefined,
        passengers,
        cabin_class: cabinClass,
      };
      setSearchParams({ ...params, departureDate, returnDate, cabinClass });

      const { run_id } = await initiateFlightSearch(params);
      setRunId(run_id);

      // Poll for results (max 30s)
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        const result = await getSearchResult(run_id);
        if (result?.status === 'success' || attempts > 15) {
          clearInterval(poll);
          setResults(result?.result?.ranked_results ?? [], result?.result?.recommendation);
          setLoading(false);
          navigation.navigate('Results');
        } else if (result?.status === 'error') {
          clearInterval(poll);
          setSearchError(result.error ?? 'Unknown error');
          setLoading(false);
        }
      }, 2000);
    } catch (err: any) {
      setSearchError(err.message);
      setLoading(false);
    }
  };

  const handleChatSearch = () => {
    if (!naturalLanguage.trim()) return;
    navigation.navigate('AgentChat', { initialMessage: naturalLanguage });
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>✈️ Flight Engine</Text>
          <Text style={styles.subtitle}>Powered by Agentic AI</Text>
        </View>

        {/* Mode Toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'form' && styles.modeBtnActive]}
            onPress={() => setMode('form')}
          >
            <Text style={[styles.modeBtnText, mode === 'form' && styles.modeBtnTextActive]}>
              Search
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'chat' && styles.modeBtnActive]}
            onPress={() => setMode('chat')}
          >
            <Text style={[styles.modeBtnText, mode === 'chat' && styles.modeBtnTextActive]}>
              Ask AI
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'chat' ? (
          <View style={styles.card}>
            <Text style={styles.label}>Describe your trip</Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="e.g. Find me cheap business class flights from Dallas to Tokyo next month, under $3000"
              placeholderTextColor={Colors.muted}
              multiline
              numberOfLines={4}
              value={naturalLanguage}
              onChangeText={setNaturalLanguage}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={handleChatSearch}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
              <Text style={styles.searchBtnText}>Ask Agent</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>From</Text>
                <TextInput
                  style={styles.input}
                  placeholder="DFW"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="characters"
                  maxLength={4}
                  value={origin}
                  onChangeText={setOrigin}
                />
              </View>
              <TouchableOpacity
                style={styles.swapBtn}
                onPress={() => { setOrigin(destination); setDestination(origin); }}
              >
                <Ionicons name="swap-horizontal" size={22} color={Colors.primary} />
              </TouchableOpacity>
              <View style={styles.half}>
                <Text style={styles.label}>To</Text>
                <TextInput
                  style={styles.input}
                  placeholder="JFK"
                  placeholderTextColor={Colors.muted}
                  autoCapitalize="characters"
                  maxLength={4}
                  value={destination}
                  onChangeText={setDestination}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Depart</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-09-15"
                  placeholderTextColor={Colors.muted}
                  value={departureDate}
                  onChangeText={setDepartureDate}
                />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>Return (optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2026-09-22"
                  placeholderTextColor={Colors.muted}
                  value={returnDate}
                  onChangeText={setReturnDate}
                />
              </View>
            </View>

            {/* Passengers */}
            <Text style={styles.label}>Passengers</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setPassengers((p) => Math.max(1, p - 1))}
              >
                <Ionicons name="remove" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.counterText}>{passengers}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => setPassengers((p) => Math.min(9, p + 1))}
              >
                <Ionicons name="add" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* Cabin class */}
            <Text style={styles.label}>Cabin</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cabinRow}>
              {CABIN_CLASSES.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.cabinChip, cabinClass === c && styles.cabinChipActive]}
                  onPress={() => setCabinClass(c)}
                >
                  <Text style={[styles.cabinChipText, cabinClass === c && styles.cabinChipTextActive]}>
                    {c.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={[styles.searchBtn, loading && styles.searchBtnDisabled]}
              onPress={handleSearch}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="search" size={18} color="#fff" />
                  <Text style={styles.searchBtnText}>Search Flights</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const Colors = { primary: '#0066FF', muted: '#9CA3AF', background: '#F9FAFB', card: '#FFFFFF', text: '#111827' };

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: 20, paddingTop: 60 },
  header: { alignItems: 'center', marginBottom: 28 },
  title: { fontSize: 30, fontWeight: '800', color: Colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: Colors.muted, marginTop: 4 },
  modeToggle: { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 12, padding: 4, marginBottom: 20 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  modeBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  modeBtnText: { color: Colors.muted, fontWeight: '600', fontSize: 15 },
  modeBtnTextActive: { color: Colors.text },
  card: { backgroundColor: Colors.card, borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 16 },
  half: { flex: 1 },
  swapBtn: { paddingBottom: 10 },
  label: { fontSize: 12, fontWeight: '600', color: Colors.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 14, fontSize: 16, color: Colors.text, marginBottom: 0 },
  multiline: { height: 100, textAlignVertical: 'top' },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  counterBtn: { backgroundColor: '#EEF2FF', borderRadius: 10, padding: 10 },
  counterText: { fontSize: 20, fontWeight: '700', color: Colors.text, minWidth: 30, textAlign: 'center' },
  cabinRow: { marginBottom: 20 },
  cabinChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F3F4F6', marginRight: 8 },
  cabinChipActive: { backgroundColor: Colors.primary },
  cabinChipText: { fontSize: 13, color: Colors.muted, fontWeight: '600', textTransform: 'capitalize' },
  cabinChipTextActive: { color: '#fff' },
  searchBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 4 },
  searchBtnDisabled: { opacity: 0.6 },
  searchBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
