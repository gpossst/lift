import { requireOptionalNativeModule } from 'expo';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { AccentId, AppearanceMode } from '@/lib/appearance';

const appIcon = requireOptionalNativeModule<{ setIcon: (name: string | null) => Promise<void> }>('AppearanceAppIcon');
let pendingChange = Promise.resolve();
let simulatorIconUpdatesUnavailable = false;

export function AppearanceAppIcon({ mode, accent }: { mode: AppearanceMode; accent: AccentId }) {
  useEffect(() => {
    if (!appIcon || simulatorIconUpdatesUnavailable) return;
    const iconName = mode === 'light' && accent === 'yellow' ? null : `Lift-${mode}-${accent}`;
    let timer: ReturnType<typeof setTimeout>;
    const syncIcon = () => {
      clearTimeout(timer);
      // Combine quick appearance changes into a single system icon update.
      timer = setTimeout(() => {
        if (AppState.currentState !== 'active' || simulatorIconUpdatesUnavailable) return;
        pendingChange = pendingChange.then(() => {
          if (!simulatorIconUpdatesUnavailable) return appIcon.setIcon(iconName);
        }).catch((error: unknown) => {
          if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_APP_ICON_SIMULATOR_UNAVAILABLE') {
            simulatorIconUpdatesUnavailable = true;
            console.warn('The iOS simulator icon service is unavailable. Further icon updates are paused until the app reloads. Appearance settings are still saved; use another iOS runtime to test icon switching.');
            return;
          }
          console.warn('Could not update the app icon:', error);
        });
      }, 350);
    };
    syncIcon();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncIcon();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [mode, accent]);
  return null;
}
