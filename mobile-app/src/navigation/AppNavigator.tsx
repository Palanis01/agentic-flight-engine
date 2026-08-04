/**
 * Root navigation — Bottom Tab + Stack navigators
 */
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Ionicons } from '@expo/vector-icons';

import SearchScreen from '../screens/SearchScreen';
import ResultsScreen from '../screens/ResultsScreen';
import AgentChatScreen from '../screens/AgentChatScreen';
import AlertsScreen from '../screens/AlertsScreen';
import { registerForPushNotifications, addNotificationResponseListener } from '../services/notifications';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

function SearchStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Search" component={SearchScreen} />
      <Stack.Screen name="Results" component={ResultsScreen} />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  useEffect(() => {
    // Register for push notifications on mount
    registerForPushNotifications();

    // Handle taps on push notifications
    const unsub = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as any;
      // TODO: deep-link to relevant screen based on data.type
      console.log('Notification tapped:', data);
    });
    return unsub;
  }, []);

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: '#0066FF',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: '#F3F4F6',
            paddingBottom: 6,
            height: 60,
          },
          tabBarIcon: ({ color, size, focused }) => {
            const icons: Record<string, any> = {
              SearchTab: focused ? 'search' : 'search-outline',
              ChatTab: focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline',
              AlertsTab: focused ? 'notifications' : 'notifications-outline',
            };
            return <Ionicons name={icons[route.name]} size={size} color={color} />;
          },
        })}
      >
        <Tab.Screen name="SearchTab" component={SearchStack} options={{ title: 'Search' }} />
        <Tab.Screen name="ChatTab" component={AgentChatScreen} options={{ title: 'AI Chat' }} />
        <Tab.Screen name="AlertsTab" component={AlertsScreen} options={{ title: 'Alerts' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
