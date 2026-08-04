/**
 * Agent Chat Screen — streaming conversational AI flight assistant
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, SafeAreaView, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useFlightStore } from '../store/flightStore';
import { streamAgentChat, type ChatMessage } from '../services/api';

export default function AgentChatScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { chatHistory, appendChatMessage, isChatLoading, setChatLoading, clearChat } = useFlightStore();

  const [inputText, setInputText] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Handle initial message passed from SearchScreen
  useEffect(() => {
    const initialMsg = route.params?.initialMessage;
    if (initialMsg && chatHistory.length === 0) {
      sendMessage(initialMsg);
    }
  }, []);

  const sendMessage = useCallback((text: string) => {
    if (!text.trim() || isChatLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    appendChatMessage(userMsg);
    setInputText('');
    setChatLoading(true);
    setStreamingContent('');

    let buffer = '';

    const stop = streamAgentChat(
      text,
      (token) => {
        buffer += token;
        setStreamingContent(buffer);
      },
      () => {
        // Stream done — commit to history
        if (buffer.trim()) {
          appendChatMessage({ role: 'assistant', content: buffer });
        }
        setStreamingContent('');
        setChatLoading(false);
        stopStreamRef.current = null;
      },
      (err) => {
        appendChatMessage({ role: 'assistant', content: '⚠️ Something went wrong. Please try again.' });
        setStreamingContent('');
        setChatLoading(false);
      }
    );
    stopStreamRef.current = stop;
  }, [isChatLoading, appendChatMessage, setChatLoading]);

  // Auto-scroll to bottom
  useEffect(() => {
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, [chatHistory, streamingContent]);

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.assistantRow]}>
        {!isUser && (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>✈</Text>
          </View>
        )}
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          <Text style={[styles.bubbleText, isUser && styles.userBubbleText]}>
            {item.content}
          </Text>
        </View>
      </View>
    );
  };

  const allMessages = [
    ...chatHistory,
    ...(streamingContent ? [{ role: 'assistant' as const, content: streamingContent + '▌' }] : []),
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#111" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>AI Flight Agent</Text>
          <View style={styles.onlineDot} />
        </View>
        <TouchableOpacity onPress={clearChat}>
          <Ionicons name="trash-outline" size={22} color="#9CA3AF" />
        </TouchableOpacity>
      </View>

      {/* Welcome state */}
      {allMessages.length === 0 && (
        <View style={styles.welcome}>
          <Text style={styles.welcomeEmoji}>✈️</Text>
          <Text style={styles.welcomeTitle}>Ask me anything about flights</Text>
          <Text style={styles.welcomeSubtitle}>Try: "Find me cheap flights to Tokyo next month"</Text>
          {['Find flights from DFW to NYC', 'Best time to fly to London?', 'Business class deals under $2000'].map((s) => (
            <TouchableOpacity key={s} style={styles.suggestion} onPress={() => sendMessage(s)}>
              <Text style={styles.suggestionText}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={allMessages}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
      />

      {/* Typing indicator */}
      {isChatLoading && !streamingContent && (
        <View style={styles.typingRow}>
          <ActivityIndicator size="small" color="#0066FF" />
          <Text style={styles.typingText}>Agent is thinking...</Text>
        </View>
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask about flights..."
            placeholderTextColor="#9CA3AF"
            value={inputText}
            onChangeText={setInputText}
            multiline
            onSubmitEditing={() => sendMessage(inputText)}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!inputText.trim() || isChatLoading) && styles.sendBtnDisabled]}
            onPress={() => sendMessage(inputText)}
            disabled={!inputText.trim() || isChatLoading}
          >
            <Ionicons name="send" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' },
  welcome: { alignItems: 'center', padding: 40, flex: 1 },
  welcomeEmoji: { fontSize: 48, marginBottom: 16 },
  welcomeTitle: { fontSize: 20, fontWeight: '700', color: '#111', textAlign: 'center', marginBottom: 8 },
  welcomeSubtitle: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  suggestion: { backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 8, width: '100%' },
  suggestionText: { fontSize: 14, color: '#4F46E5', fontWeight: '500' },
  messageList: { paddingHorizontal: 16, paddingVertical: 12 },
  messageRow: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start', gap: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#0066FF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14 },
  bubble: { maxWidth: '75%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  userBubble: { backgroundColor: '#0066FF', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#fff', borderBottomLeftRadius: 4, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 },
  bubbleText: { fontSize: 15, color: '#111', lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  typingText: { fontSize: 13, color: '#9CA3AF' },
  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#F3F4F6', gap: 10 },
  input: { flex: 1, backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#111', maxHeight: 120 },
  sendBtn: { backgroundColor: '#0066FF', borderRadius: 20, width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { opacity: 0.4 },
});
