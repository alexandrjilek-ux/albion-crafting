// Tab bar layout — používá custom GlassTabBar (blur + glass pill)
// místo defaultního expo-router Tabs designu.
//
// POZN.: Pozadí canvasu (#0A0820) je nastavené per-screen v <SafeAreaView>,
// aby se tab bar layer renderoval nad správnou barvou a Status bar se choval
// konzistentně.

import { Tabs } from 'expo-router';

import { GlassTabBar } from '../../src/components/GlassTabBar';

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Forge' }} />
      <Tabs.Screen name="refining" options={{ title: 'Materials' }} />
      <Tabs.Screen name="leveling" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="sell" options={{ title: 'Sell' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
