/**
 * Price Alerts Screen — list and manage active price alerts
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFlightStore } from '../store/flightStore';
import { listPriceAlerts, deletePriceAlert, type PriceAlert } from '../services/api';

export default function AlertsScreen() {
  const { priceAlerts, setPriceAlerts, removePriceAlert } = useFlightStore();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await listPriceAlerts();
      setPriceAlerts(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, []);

  const handleDelete = (alert: PriceAlert) => {
    Alert.alert(
      'Delete Alert',
      `Remove price alert for ${alert.origin} → ${alert.destination}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePriceAlert(alert.id);
              removePriceAlert(alert.id);
            } catch {
              Alert.alert('Error', 'Could not delete alert.');
            }
          },
        },
      ]
    );
  };

  const renderAlert = ({ item }: { item: PriceAlert }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.routeRow}>
          <Text style={styles.iata}>{item.origin}</Text>
          <Ionicons name="arrow-forward" size={16} color="#9CA3AF" style={{ marginHorizontal: 6 }} />
          <Text style={styles.iata}>{item.destination}</Text>
        </View>
        <Text style={styles.date}>{item.departure_date}</Text>
        <View style={styles.priceRow}>
          <Ionicons name="notifications" size={14} color="#F59E0B" />
          <Text style={styles.priceLabel}>Alert below </Text>
          <Text style={styles.price}>${item.target_price.toLocaleString()}</Text>
        </View>
      </View>
      <View style={styles.cardRight}>
        <View style={[styles.badge, item.is_active ? styles.badgeActive : styles.badgeInactive]}>
          <Text style={[styles.badgeText, item.is_active ? styles.badgeTextActive : styles.badgeTextInactive]}>
            {item.is_active ? 'Active' : 'Triggered'}
          </Text>
        </View>
        <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
          <Ionicons name="trash-outline" size={18} color="#EF4444" />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Price Alerts</Text>
        <TouchableOpacity onPress={() => fetchAlerts()}>
          <Ionicons name="refresh-outline" size={22} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#0066FF" />
        </View>
      ) : (
        <FlatList
          data={priceAlerts}
          keyExtractor={(item) => item.id}
          renderItem={renderAlert}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); fetchAlerts(true); }}
              tintColor="#0066FF"
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="notifications-off-outline" size={48} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>No active alerts</Text>
              <Text style={styles.emptySubtitle}>
                Search for a flight and tap "Set Alert" to get notified of price drops.
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  list: { padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  cardLeft: { flex: 1 },
  cardRight: { alignItems: 'flex-end', gap: 12 },
  routeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  iata: { fontSize: 18, fontWeight: '800', color: '#111' },
  date: { fontSize: 13, color: '#6B7280', marginBottom: 8 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  priceLabel: { fontSize: 13, color: '#6B7280' },
  price: { fontSize: 14, fontWeight: '700', color: '#0066FF' },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeActive: { backgroundColor: '#D1FAE5' },
  badgeInactive: { backgroundColor: '#FEE2E2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  badgeTextActive: { color: '#065F46' },
  badgeTextInactive: { color: '#991B1B' },
  deleteBtn: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginTop: 16, marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 22 },
});
