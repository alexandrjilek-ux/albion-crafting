// Root layout - Stack navigator, theme provider, status bar and safe areas.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ActivitiesBonusProvider } from '../src/activities/ActivitiesBonusProvider';
import { LanguageProvider } from '../src/i18n/LanguageProvider';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

export default function RootLayout() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <ActivitiesBonusProvider>
          <RootLayoutInner />
        </ActivitiesBonusProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

function RootLayoutInner() {
  const { colors, isDark } = useTheme();

  useEffect(() => {
    // Hook pro font loading / data prewarming. Zatim nic.
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: colors.bgCanvas }}>
          <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.bgCanvas} />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bgCanvas },
              animation: 'fade',
            }}
          >
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="item/[id]"
              options={{
                presentation: 'modal',
                headerShown: false,
              }}
            />
          </Stack>
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
