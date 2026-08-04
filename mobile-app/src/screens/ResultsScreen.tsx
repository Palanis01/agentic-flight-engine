/**
 * Flight Results Screen — shows ranked itineraries + AI recommendation
 */
import React, { useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, SafeAreaView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as SecureStore from 'expo-secure-store';
import { useFlightStore } from '../store/flightStore';
import { createPriceAlert } from '../services/api';
import type { Itinerary } from '../services/api';

const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
};

function ItineraryCard({ item, onAlert }: { item: Itinerary; onAlert: (item: Itinerary) => void }) {
  return (
    <View style={[styles.card, item.is_deal && styles.dealCard]}>
      {item.is_deal && (
        <View style={styles.dealBadge}><Text style={styles.dealText}>🔥 Deal</Text></View>
      )}
      <View style={styles.cardTop}>
        <View style={styles.airlineRow}>
          <Text style={styles.airline}>{item.airline}</Text>
          <Text style={styles.flightNum}>{item.flight_number}</Text>
        </View>
        <Text style={styles.price}>${item.price.toLocaleString()}</Text>
      </View>
      <View style={styles.routeRow}>
        <View style={styles.routePoint}>
          <Text style={styles.iata}>{item.origin}</Text>
          <Text style={styles.time}>{item.departure_at?.slice(11, 16)}</Text>
        </View>
        <View style={styles.routeMiddle}>
          <Text style={styles.duration}>{formatDuration(item.duration_minutes)}</Text>
          <View style={styles.routeLine} />
          <Text style={styles.stops}>{item.stops === 0 ? 'Direct' : `${item.stops} stop${item.stops > 1 ? 's' : ''}`}</Text>
        </View>
        <View style={styles.routePoint}>
          <Text style={styles.iata}>{item.destination}</Text>
          <Text style={styles.time}>{item.arrival_at?.slice(11, 16)}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.provider}>via {item.provider}</Text>
        <TouchableOpacity style={styles.alertBtn} onPress={() => onAlert(item)}>
          <Ionicons name="notifications-outline" size={14} color="#0066FF" />
          <Text style={styles.alertBtnText}>Set Alert</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function ResultsScreen() {
  const navigation = useNavigation<any>();
  const { results, recommendation, searchParams, addPriceAlert } = useFlightStore();
  const [alertLoading, setAlertLoading] = useState<string | null>(null);

  const handleSetAlert = async (item: Itinerary) => {
    Alert.prompt(
      'Set Price Alert',
      `Get notified when ${item.origin} → ${item.destination} drops below:`,
      async (priceStr) => {
        const targetPrice = parseFloat(priceStr);
        if (!priceStr || isNaN(targetPrice)) return;
        setAlertLoading(item.id);
        try {
          const pushToken = await SecureStore.getItemAsync('push_token');
          const alert = await createPriceAlert({
            origin: item.origin,
            destination: item.destination,
            departure_date: searchParams?.departureDate ?? '',
            target_price: targetPrice,
            push_token: pushToken ?? undefined,
          });
          addPriceAlert(alert);
          Alert.alert('Alert Set!', `We'll notify you when the price drops below $${targetPrice}.`);
        } catch {
          Alert.alert('Error', 'Could not set price alert. Please try again.');
        } finally {
          setAlertLoading(null);
        }
      },
      'plain-text',
      String(Math.floor((item.price ?? 0) * 0.9))
    );
  };

  const rec = recommendation as any;
  const bestItinerary: Itinerary | null = rec?.best_itinerary ?? null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {searchParams?.origin} → {searchParams?.destination}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {/* AI Recommendation Banner */}
      {bestItinerary && (
        <View style={styles.recBanner}>
          <Text style={styles.recTitle}>🤖 AI Recommendation</Text>
          <Text style={styles.recRationale}>{rec?.rationale}</Text>
          <View style={styles.recItinerary}>
            <Text style={styles.recAirline}>{bestItinerary.airline} {bestItinerary.flight_number}</Text>
            <Text style={styles.recPrice}>${bestItinerary.price?.toLocaleString()}</Text>
          </View>
        </View>
      )}

      {/* Results List */}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No results found. Try adjusting your search.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ItineraryCard item={item} onAlert={handleSetAlert} />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  recBanner: { margin: 16, backgroundColor: '#EEF2FF', borderRadius: 16, padding: 16 },
  recTitle: { fontSize: 13, fontWeight: '700', color: '#4F46E5', marginBottom: 6 },
  recRationale: { fontSize: 13, color: '#374151', lineHeight: 20, marginBottom: 10 },
  recItinerary: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  recAirline: { fontSize: 15, fontWeight: '700', color: '#111' },
  recPrice: { fontSize: 18, fontWeight: '800', color: '#0066FF' },
  list: { padding: 16, paddingTop: 4 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  dealCard: { borderWidth: 1.5, borderColor: '#F59E0B' },
  dealBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  dealText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  airlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  airline: { fontSize: 15, fontWeight: '700', color: '#111' },
  flightNum: { fontSize: 13, color: '#6B7280' },
  price: { fontSize: 20, fontWeight: '800', color: '#0066FF' },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  routePoint: { alignItems: 'center', width: 60 },
  iata: { fontSize: 18, fontWeight: '800', color: '#111' },
  time: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  routeMiddle: { flex: 1, alignItems: 'center' },
  duration: { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  routeLine: { height: 1, width: '100%', backgroundColor: '#E5E7EB', marginVertical: 2 },
  stops: { fontSize: 11, color: '#9CA3AF', marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 10 },
  provider: { fontSize: 12, color: '#9CA3AF' },
  alertBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EEF2FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  alertBtnText: { fontSize: 12, color: '#0066FF', fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyText: { color: '#9CA3AF', fontSize: 15, textAlign: 'center' },
});
