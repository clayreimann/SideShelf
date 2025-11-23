# SideShelf Paid Upgrades Implementation Plan

**Date:** November 23, 2025
**Version:** 1.0
**Status:** Planning Phase

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Strategic Approach](#strategic-approach)
3. [Architecture Overview](#architecture-overview)
4. [RevenueCat Integration](#revenuecat-integration)
5. [Feature Tier Design](#feature-tier-design)
6. [Multi-Library Access Implementation](#multi-library-access-implementation)
7. [Feature Gating System](#feature-gating-system)
8. [User Flows](#user-flows)
9. [Implementation Roadmap](#implementation-roadmap)
10. [Technical Implementation Details](#technical-implementation-details)
11. [Testing Strategy](#testing-strategy)
12. [Risk Assessment](#risk-assessment)

---

## Executive Summary

This plan outlines the implementation of paid upgrades for SideShelf using **in-app purchases** managed by RevenueCat. Unlike traditional build variants (separate free/pro apps), this approach provides a **single app** with unlockable premium features.

**First Paid Feature:** Multi-library access

**Key Changes:**
- Free users select ONE library at login and must log out to change
- Pro users can access all libraries and switch freely
- RevenueCat handles subscription management, receipts, and cross-platform purchases
- Feature gating system controls access based on subscription status
- Seamless upgrade path without data loss

**Benefits:**
- Single app to maintain (no separate free/pro builds)
- Dynamic feature unlocking (immediate access after purchase)
- Cross-platform purchase recognition
- Easy to add more premium features
- Better user experience (upgrade without reinstalling)

---

## Strategic Approach

### Why In-App Purchases vs Build Variants

| Aspect | Build Variants | In-App Purchases |
|--------|----------------|------------------|
| User Experience | Must install different app | Upgrade within same app |
| Maintenance | 2 codebases to maintain | 1 codebase |
| Feature Unlocking | Requires reinstall | Instant |
| Cross-Platform | Separate purchases | Shared via RevenueCat |
| Analytics | Split between apps | Unified |
| App Store Presence | 2 listings | 1 listing with IAP |
| Code Complexity | Compile-time flags | Runtime checks |

**Decision:** In-app purchases provide superior UX and maintainability.

### Monetization Model

**Free Tier (Default):**
- Single library access (user chooses at login)
- All basic features unlocked
- Can use all downloaded content
- Full playback functionality

**Pro Tier (Subscription):**
- Multi-library access with seamless switching
- Series browsing
- Author browsing
- Advanced statistics
- Custom playback speeds (future)
- Unlimited downloads (future)

**Pricing Strategy:**
- Monthly subscription: $2.99/month
- Annual subscription: $19.99/year (save 44%)
- Free trial: 7 days (optional)

---

## Architecture Overview

### Current Architecture Analysis

Based on comprehensive investigation of SideShelf's codebase:

**Strengths:**
1. **Modular State Management** - Zustand slices can be conditionally initialized
2. **Centralized Authentication** - Single AuthProvider handles all auth
3. **Flexible Navigation** - Expo Router allows dynamic tab configuration
4. **Shared Database** - Same SQLite schema works for all tiers
5. **Service Layer** - Clean separation of business logic

**Implementation Strategy:**
```
┌─────────────────────────────────────────────────────┐
│                    App Entry                        │
│            (Single build configuration)             │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│               RevenueCat Provider                   │
│         (Loads subscription status)                 │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│              Feature Gate Module                    │
│    (Determines available features from sub)         │
└─────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────┐
│          Conditional UI & Navigation                │
│      (Tabs, screens, components adapt)              │
└─────────────────────────────────────────────────────┘
```

### Key Files to Create/Modify

**New Files:**
```
src/lib/subscriptions/
  ├── RevenueCatProvider.tsx       # RevenueCat integration wrapper
  ├── subscriptionConfig.ts        # Entitlement & product IDs
  ├── subscriptionHelpers.ts       # Helper functions for checking features
  └── types.ts                     # TypeScript types

src/lib/features.ts                # Feature gating logic
src/lib/paywall/
  ├── PaywallScreen.tsx            # Upgrade/paywall UI
  └── FeatureLockedView.tsx        # Shown when feature is locked

src/components/subscription/
  ├── UpgradeButton.tsx            # CTA for upgrades
  └── SubscriptionStatus.tsx       # Show current subscription

src/db/schema/subscriptions.ts     # Cache subscription data locally
src/db/helpers/subscriptions.ts    # DB helpers for subscription state
```

**Modified Files:**
```
src/app/_layout.tsx                # Add RevenueCat provider
src/app/login.tsx                  # Add library selection for free users
src/app/(tabs)/_layout.tsx         # Conditional tab rendering
src/providers/StoreProvider.tsx    # Conditional slice initialization
src/stores/slices/librarySlice.ts  # Library selection restrictions
src/app/(tabs)/more/index.tsx      # Add subscription management
package.json                       # Add RevenueCat dependencies
app.json                           # Configure RevenueCat
```

---

## RevenueCat Integration

### Why RevenueCat?

RevenueCat provides:
- ✅ Cross-platform subscription management (iOS, Android, Web)
- ✅ Server-side receipt validation
- ✅ Subscription status caching
- ✅ Webhooks for status changes
- ✅ Analytics and revenue tracking
- ✅ Free tier up to $10k MRR
- ✅ Handles App Store/Google Play complexity

### Setup Steps

#### 1. RevenueCat Account Setup

```bash
# Create account at https://app.revenuecat.com
# Create new project: "SideShelf"
# Note your API keys:
#   - iOS App-Specific Shared Secret
#   - Google Service Credentials
#   - Public SDK Key
```

#### 2. App Store Connect Configuration

**iOS (App Store Connect):**
1. Create in-app purchase products:
   - `sideshelf_pro_monthly` - SideShelf Pro Monthly ($2.99)
   - `sideshelf_pro_annual` - SideShelf Pro Annual ($19.99)
2. Configure subscription group: "SideShelf Pro"
3. Set up introductory offers (7-day free trial)
4. Submit for review

**Android (Google Play Console):**
1. Create subscription products (same IDs)
2. Configure pricing
3. Submit for review

#### 3. RevenueCat Dashboard Configuration

**Products Setup:**
```
Product ID: sideshelf_pro_monthly
Duration: 1 month
Price: $2.99

Product ID: sideshelf_pro_annual
Duration: 1 year
Price: $19.99
```

**Entitlements Setup:**
```
Entitlement ID: pro
Products: sideshelf_pro_monthly, sideshelf_pro_annual
```

**Offerings Setup:**
```
Offering ID: default
Packages:
  - $rc_monthly (sideshelf_pro_monthly)
  - $rc_annual (sideshelf_pro_annual)
```

### Installation & Dependencies

```bash
npm install react-native-purchases
```

**package.json:**
```json
{
  "dependencies": {
    "react-native-purchases": "^8.0.0"
  }
}
```

**app.json (Expo config):**
```json
{
  "expo": {
    "plugins": [
      [
        "react-native-purchases",
        {
          "apiKey": "appl_xxxxxxxxxxxxxx"
        }
      ]
    ]
  }
}
```

### RevenueCat Provider Implementation

**Location:** `src/lib/subscriptions/RevenueCatProvider.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import Purchases, {
  CustomerInfo,
  PurchasesOffering,
  LOG_LEVEL,
} from 'react-native-purchases';
import { Platform } from 'react-native';

type SubscriptionContextValue = {
  // Subscription state
  isProUser: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;

  // Loading states
  isLoading: boolean;

  // Actions
  purchasePackage: (packageId: string) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;

  // Feature checks (derived from entitlements)
  hasFeature: (featureName: string) => boolean;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(
  undefined
);

export function RevenueCatProvider({ children }: { children: React.ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeRevenueCat();
  }, []);

  async function initializeRevenueCat() {
    try {
      // Configure RevenueCat
      Purchases.setLogLevel(LOG_LEVEL.DEBUG);

      if (Platform.OS === 'ios') {
        await Purchases.configure({
          apiKey: 'appl_xxxxxxxxxxxxxx', // iOS API key
        });
      } else {
        await Purchases.configure({
          apiKey: 'goog_xxxxxxxxxxxxxx', // Android API key
        });
      }

      // Get customer info
      const info = await Purchases.getCustomerInfo();
      setCustomerInfo(info);

      // Get available offerings
      const offerings = await Purchases.getOfferings();
      if (offerings.current) {
        setOfferings(offerings.current);
      }

      // Listen for customer info updates
      Purchases.addCustomerInfoUpdateListener((info) => {
        setCustomerInfo(info);
      });

      setIsLoading(false);
    } catch (error) {
      console.error('[RevenueCat] Initialization failed:', error);
      setIsLoading(false);
    }
  }

  async function purchasePackage(packageId: string): Promise<boolean> {
    if (!offerings) return false;

    try {
      const packageToPurchase = offerings.availablePackages.find(
        (pkg) => pkg.identifier === packageId
      );

      if (!packageToPurchase) {
        throw new Error(`Package ${packageId} not found`);
      }

      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);
      setCustomerInfo(customerInfo);

      // Check if they now have pro entitlement
      return customerInfo.entitlements.active['pro'] !== undefined;
    } catch (error: any) {
      if (error.userCancelled) {
        console.log('[RevenueCat] Purchase cancelled by user');
        return false;
      }
      console.error('[RevenueCat] Purchase failed:', error);
      throw error;
    }
  }

  async function restorePurchases(): Promise<boolean> {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return info.entitlements.active['pro'] !== undefined;
    } catch (error) {
      console.error('[RevenueCat] Restore failed:', error);
      return false;
    }
  }

  function hasFeature(featureName: string): boolean {
    if (!customerInfo) return false;

    // Check if user has active "pro" entitlement
    const proEntitlement = customerInfo.entitlements.active['pro'];
    if (!proEntitlement) return false;

    // All pro features are included in "pro" entitlement
    const proFeatures = [
      'multi_library',
      'series',
      'authors',
      'statistics',
      'advanced_filters',
    ];

    return proFeatures.includes(featureName);
  }

  const isProUser = customerInfo?.entitlements.active['pro'] !== undefined;

  const value: SubscriptionContextValue = {
    isProUser,
    customerInfo,
    offerings,
    isLoading,
    purchasePackage,
    restorePurchases,
    hasFeature,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within RevenueCatProvider');
  }
  return context;
}
```

### Subscription Configuration

**Location:** `src/lib/subscriptions/subscriptionConfig.ts`

```typescript
export const ENTITLEMENTS = {
  PRO: 'pro',
} as const;

export const PACKAGE_IDS = {
  MONTHLY: '$rc_monthly',
  ANNUAL: '$rc_annual',
} as const;

export const PRODUCT_IDS = {
  MONTHLY: 'sideshelf_pro_monthly',
  ANNUAL: 'sideshelf_pro_annual',
} as const;

// Feature flags tied to entitlements
export const FEATURES = {
  MULTI_LIBRARY: 'multi_library',
  SERIES: 'series',
  AUTHORS: 'authors',
  STATISTICS: 'statistics',
  ADVANCED_FILTERS: 'advanced_filters',
  CUSTOM_SPEEDS: 'custom_speeds',
  UNLIMITED_DOWNLOADS: 'unlimited_downloads',
} as const;

// Map features to entitlements
export const FEATURE_ENTITLEMENT_MAP = {
  [FEATURES.MULTI_LIBRARY]: ENTITLEMENTS.PRO,
  [FEATURES.SERIES]: ENTITLEMENTS.PRO,
  [FEATURES.AUTHORS]: ENTITLEMENTS.PRO,
  [FEATURES.STATISTICS]: ENTITLEMENTS.PRO,
  [FEATURES.ADVANCED_FILTERS]: ENTITLEMENTS.PRO,
  [FEATURES.CUSTOM_SPEEDS]: ENTITLEMENTS.PRO,
  [FEATURES.UNLIMITED_DOWNLOADS]: ENTITLEMENTS.PRO,
} as const;
```

---

## Feature Tier Design

### Free Tier Features

**Core Functionality (Always Available):**
- ✅ Single library access (user selects at login)
- ✅ Full playback controls (play, pause, seek, chapters)
- ✅ Progress tracking and sync
- ✅ Smart rewind
- ✅ Download for offline (up to 3 items)
- ✅ Sleep timer
- ✅ Basic search within library
- ✅ Continue listening / Recently added
- ✅ Library item details
- ✅ Listening sessions

**Restrictions:**
- ❌ Only ONE library accessible (must log out to change)
- ❌ No series browsing tab
- ❌ No author browsing tab
- ❌ No advanced statistics
- ❌ Limited downloads (3 items max)

### Pro Tier Features

**Unlocked with Subscription:**
- ✅ **Multi-library access** (switch libraries without logout)
- ✅ **Series browsing tab** (browse by series)
- ✅ **Authors browsing tab** (browse by author)
- ✅ **Advanced statistics** (listening time, streaks, etc.)
- ✅ **Unlimited downloads**
- ✅ **Custom playback speeds** (0.5x - 3.0x in 0.1x increments)
- ✅ **Advanced filters** (filter by narrator, genre, etc.)
- ✅ **Collections management**

**Future Premium Features:**
- 🔮 Cloud backup of progress
- 🔮 Multi-device sync enhancements
- 🔮 Custom themes
- 🔮 Advanced playback queue

---

## Multi-Library Access Implementation

### Current Behavior (All Users)

Currently, the app:
1. User logs in with server URL, username, password
2. All libraries from server are fetched
3. App auto-selects first library by display order
4. User can switch libraries freely via Library screen dropdown

### New Behavior for Free Users

**Login Flow Changes:**
1. User logs in with server URL, username, password
2. If NOT a Pro user, show **library selection screen**
3. User selects ONE library from available libraries
4. Selected library is stored and locked
5. User can only access that library until they log out

**Library Switching:**
- Free users: Must log out and log back in to change library
- Pro users: Can switch libraries freely from Library dropdown

### Implementation Details

#### 1. Modify Login Flow

**File:** `src/app/login.tsx`

Add library selection step after successful login for free users:

```typescript
// After successful login
const { isProUser } = useSubscription();

if (!isProUser) {
  // Show library selection modal
  router.push('/selectLibrary');
} else {
  // Pro user - proceed to app
  router.replace('/');
}
```

#### 2. Create Library Selection Screen

**File:** `src/app/selectLibrary.tsx`

```typescript
import { useSubscription } from '@/lib/subscriptions/RevenueCatProvider';
import { useLibrary } from '@/stores/appStore';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { FlatList, Text, TouchableOpacity, View } from 'react-native';

export default function SelectLibraryScreen() {
  const router = useRouter();
  const { isProUser } = useSubscription();
  const { libraries, selectLibrary } = useLibrary();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // If user is Pro, skip this screen
  useEffect(() => {
    if (isProUser) {
      router.replace('/');
    }
  }, [isProUser]);

  async function handleConfirm() {
    if (!selectedId) return;

    // Select library and mark as "locked" for free users
    await selectLibrary(selectedId, true);

    // Store that this is a free user's locked library
    await AsyncStorage.setItem('lockedLibraryId', selectedId);

    router.replace('/');
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Your Library</Text>
      <Text style={styles.subtitle}>
        Free users can access one library. Upgrade to Pro for multi-library access.
      </Text>

      <FlatList
        data={libraries}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.libraryItem,
              selectedId === item.id && styles.libraryItemSelected,
            ]}
            onPress={() => setSelectedId(item.id)}
          >
            <Text style={styles.libraryName}>{item.name}</Text>
            <Text style={styles.libraryType}>{item.mediaType}</Text>
          </TouchableOpacity>
        )}
      />

      <TouchableOpacity
        style={[styles.confirmButton, !selectedId && styles.confirmButtonDisabled]}
        onPress={handleConfirm}
        disabled={!selectedId}
      >
        <Text style={styles.confirmButtonText}>Confirm Selection</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.upgradeButton}
        onPress={() => router.push('/paywall')}
      >
        <Text style={styles.upgradeButtonText}>
          Upgrade to Pro for Multi-Library Access
        </Text>
      </TouchableOpacity>
    </View>
  );
}
```

#### 3. Restrict Library Switching for Free Users

**File:** `src/stores/slices/librarySlice.ts`

Modify the `selectLibrary` action:

```typescript
import { useSubscription } from '@/lib/subscriptions/RevenueCatProvider';
import AsyncStorage from '@react-native-async-storage/async-storage';

selectLibrary: async (libraryId: string, fetchFromApi: boolean = false) => {
  const state = get();
  if (!isReady(state)) {
    log.warn(' Slice not ready, cannot select library');
    return;
  }

  // Check if free user is trying to switch libraries
  const lockedLibraryId = await AsyncStorage.getItem('lockedLibraryId');

  // Import subscription status from context (passed via store initializer)
  const { isProUser } = get().subscription; // Add subscription slice

  if (!isProUser && lockedLibraryId && lockedLibraryId !== libraryId) {
    // Free user trying to switch - show paywall or require logout
    throw new Error('LIBRARY_LOCKED');
  }

  // Rest of selectLibrary implementation...
},
```

#### 4. Update Library Dropdown UI

**File:** `src/components/library/LibrarySelector.tsx`

```typescript
import { useSubscription } from '@/lib/subscriptions/RevenueCatProvider';

function LibrarySelector() {
  const { isProUser } = useSubscription();
  const { libraries, selectedLibraryId, selectLibrary } = useLibrary();

  async function handleLibraryChange(libraryId: string) {
    if (!isProUser) {
      // Show upgrade prompt
      Alert.alert(
        'Upgrade Required',
        'Multi-library access requires SideShelf Pro',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade', onPress: () => router.push('/paywall') },
        ]
      );
      return;
    }

    await selectLibrary(libraryId);
  }

  return (
    <Picker
      selectedValue={selectedLibraryId}
      onValueChange={handleLibraryChange}
      enabled={isProUser} // Disable for free users
    >
      {libraries.map((lib) => (
        <Picker.Item key={lib.id} label={lib.name} value={lib.id} />
      ))}
    </Picker>
  );
}
```

#### 5. Handle Logout to Change Library

**File:** `src/app/(tabs)/more/index.tsx`

```typescript
import { useSubscription } from '@/lib/subscriptions/RevenueCatProvider';

function MoreScreen() {
  const { logout } = useAuth();
  const { isProUser } = useSubscription();
  const { selectedLibrary } = useLibrary();

  async function handleChangeLibrary() {
    if (isProUser) {
      // Pro users can just navigate to library selector
      router.push('/(tabs)/library');
    } else {
      // Free users must log out
      Alert.alert(
        'Change Library',
        'To change your library, you must log out and log back in, or upgrade to Pro for seamless library switching.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log Out', onPress: logout, style: 'destructive' },
          { text: 'Upgrade to Pro', onPress: () => router.push('/paywall') },
        ]
      );
    }
  }

  return (
    <View>
      {!isProUser && (
        <TouchableOpacity onPress={handleChangeLibrary}>
          <Text>Current Library: {selectedLibrary?.name}</Text>
          <Text>Tap to change (requires logout)</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
```

---

## Feature Gating System

### Feature Gate Module

**Location:** `src/lib/features.ts`

```typescript
import { useSubscription } from './subscriptions/RevenueCatProvider';
import { FEATURES } from './subscriptions/subscriptionConfig';

/**
 * Feature gate hook
 * Checks if user has access to a specific feature
 */
export function useFeature(featureName: keyof typeof FEATURES): boolean {
  const { hasFeature } = useSubscription();
  return hasFeature(featureName);
}

/**
 * Feature gates object for inline checks
 */
export function useFeatureGates() {
  const { isProUser, hasFeature } = useSubscription();

  return {
    // Individual feature checks
    canAccessMultipleLibraries: hasFeature(FEATURES.MULTI_LIBRARY),
    canBrowseSeries: hasFeature(FEATURES.SERIES),
    canBrowseAuthors: hasFeature(FEATURES.AUTHORS),
    canViewStatistics: hasFeature(FEATURES.STATISTICS),
    canUseAdvancedFilters: hasFeature(FEATURES.ADVANCED_FILTERS),
    canUseCustomSpeeds: hasFeature(FEATURES.CUSTOM_SPEEDS),
    canDownloadUnlimited: hasFeature(FEATURES.UNLIMITED_DOWNLOADS),

    // General pro status
    isProUser,
  };
}

/**
 * HOC to wrap components that require a feature
 */
export function withFeatureGate(
  Component: React.ComponentType<any>,
  featureName: keyof typeof FEATURES,
  FallbackComponent?: React.ComponentType<any>
) {
  return function GatedComponent(props: any) {
    const hasAccess = useFeature(featureName);

    if (!hasAccess && FallbackComponent) {
      return <FallbackComponent {...props} />;
    }

    if (!hasAccess) {
      return null; // Hide component
    }

    return <Component {...props} />;
  };
}
```

### Conditional Navigation

**File:** `src/app/(tabs)/_layout.tsx`

```typescript
import { useFeatureGates } from '@/lib/features';

export default function TabLayout() {
  const { canBrowseSeries, canBrowseAuthors } = useFeatureGates();

  const tabs = [
    { name: 'home', icon: 'home', title: 'Home' },
    { name: 'library', icon: 'library', title: 'Library' },
    ...(canBrowseSeries ? [{ name: 'series', icon: 'series', title: 'Series' }] : []),
    ...(canBrowseAuthors ? [{ name: 'authors', icon: 'authors', title: 'Authors' }] : []),
    { name: 'more', icon: 'more', title: 'More' },
  ];

  return (
    <Tabs>
      {tabs.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} />,
          }}
        />
      ))}
    </Tabs>
  );
}
```

### Conditional Store Initialization

**File:** `src/providers/StoreProvider.tsx`

```typescript
import { useFeatureGates } from '@/lib/features';

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const { apiConfigured, username } = useAuth();
  const { initialized: dbInitialized } = useDb();
  const { canBrowseSeries, canBrowseAuthors } = useFeatureGates();

  // Always initialize core stores
  useLibraryStoreInitializer(apiConfigured, dbInitialized);
  usePlayerStoreInitializer();
  useDownloadsStoreInitializer();
  useHomeStoreInitializer(username);

  // Conditionally initialize pro features
  if (canBrowseSeries) {
    useSeriesStoreInitializer(apiConfigured, dbInitialized);
  }

  if (canBrowseAuthors) {
    useAuthorsStoreInitializer(apiConfigured, dbInitialized);
  }

  return <>{children}</>;
}
```

---

## User Flows

### Flow 1: New Free User

```
1. Download app
2. Open app → Login screen
3. Enter server URL, username, password
4. Login successful
5. Check subscription status → Free user
6. Show library selection screen
7. User selects "Audiobooks" library
8. Library locked, navigate to home
9. User sees Home, Library, More tabs (no Series/Authors)
10. User can browse and play content from "Audiobooks" library
```

### Flow 2: Free User Wants to Change Library

```
1. User in app (locked to "Audiobooks")
2. Go to More tab
3. See "Current Library: Audiobooks"
4. Tap "Change Library"
5. Alert: "To change library, you must log out or upgrade to Pro"
6. Options:
   a) Cancel
   b) Log Out → Returns to login screen → Can select new library
   c) Upgrade to Pro → Paywall screen
```

### Flow 3: Free User Upgrades to Pro

```
1. User navigates to More > Upgrade to Pro
2. Paywall screen shows:
   - Features comparison
   - Monthly: $2.99/month
   - Annual: $19.99/year (Save 44%)
3. User taps "Subscribe Annual"
4. Native purchase flow (Apple/Google)
5. Purchase completes
6. RevenueCat updates customerInfo
7. App immediately unlocks pro features:
   - Series tab appears
   - Authors tab appears
   - Library dropdown becomes enabled
   - Download limit removed
8. User can now switch libraries without logout
```

### Flow 4: Pro User Experience

```
1. Pro user logs in
2. Check subscription status → Pro user
3. Skip library selection (all libraries available)
4. Navigate to home
5. See all tabs: Home, Library, Series, Authors, More
6. Can freely switch libraries via dropdown
7. Access all pro features
```

### Flow 5: Subscription Expiration

```
1. Pro user's subscription expires
2. RevenueCat webhook fires → customerInfo updated
3. On next app open:
   - Check subscription → Expired
   - Show alert: "Your Pro subscription has expired"
   - Lock library selection to current library
   - Hide Series/Authors tabs
   - Show restore purchase button
4. User can:
   a) Restore purchases (if re-subscribed elsewhere)
   b) Re-subscribe
   c) Continue with free tier (current library only)
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)

**Goal:** Set up RevenueCat and feature gating infrastructure

- [ ] Create RevenueCat account and configure products
- [ ] Set up App Store Connect / Google Play in-app products
- [ ] Install `react-native-purchases` package
- [ ] Create `RevenueCatProvider` component
- [ ] Create subscription configuration file
- [ ] Create feature gating module (`features.ts`)
- [ ] Add RevenueCat provider to app layout
- [ ] Test subscription initialization

**Deliverables:**
- RevenueCat configured and connected
- Feature gating hooks working
- Basic subscription status detection

### Phase 2: Multi-Library Access (Week 2)

**Goal:** Implement library selection and restrictions for free users

- [ ] Create library selection screen (`selectLibrary.tsx`)
- [ ] Modify login flow to show library selection for free users
- [ ] Add `lockedLibraryId` storage for free users
- [ ] Update `librarySlice` to enforce library lock
- [ ] Modify library dropdown to show upgrade prompt for free users
- [ ] Add "Change Library" option in More tab
- [ ] Test free user can only access one library
- [ ] Test pro user can access all libraries

**Deliverables:**
- Free users select library at login
- Library switching restricted to pro users
- Logout required to change library (free users)

### Phase 3: Conditional Navigation (Week 2)

**Goal:** Show/hide tabs based on subscription status

- [ ] Update `_layout.tsx` for conditional tab rendering
- [ ] Hide Series tab for free users
- [ ] Hide Authors tab for free users
- [ ] Conditional store initialization in `StoreProvider`
- [ ] Test navigation adapts to subscription status
- [ ] Test deep links respect feature gates

**Deliverables:**
- Dynamic tab bar based on subscription
- Series/Authors tabs only for pro users
- Store slices initialized conditionally

### Phase 4: Paywall & Purchase Flow (Week 3)

**Goal:** Create upgrade screens and handle purchases

- [ ] Create paywall screen (`PaywallScreen.tsx`)
- [ ] Design features comparison UI
- [ ] Implement purchase flow with RevenueCat
- [ ] Add "Upgrade to Pro" buttons throughout app
- [ ] Create subscription management screen
- [ ] Implement restore purchases
- [ ] Handle purchase errors gracefully
- [ ] Test purchase flow end-to-end
- [ ] Test subscription unlocks features immediately

**Deliverables:**
- Beautiful paywall screen
- Working purchase flow
- Feature unlocking on purchase
- Subscription management UI

### Phase 5: Additional Pro Features (Week 4)

**Goal:** Implement other pro features beyond multi-library

- [ ] Add download limit (3 for free, unlimited for pro)
- [ ] Implement download count enforcement
- [ ] Add statistics feature (pro only)
- [ ] Add advanced filters (pro only)
- [ ] Add custom playback speeds (pro only)
- [ ] Show feature locked states in UI
- [ ] Test all pro features gate correctly

**Deliverables:**
- All pro features gated correctly
- Feature locked states implemented
- Download limits enforced

### Phase 6: Testing & Polish (Week 5)

**Goal:** Comprehensive testing and bug fixes

- [ ] Test free user flows
- [ ] Test pro user flows
- [ ] Test upgrade flow
- [ ] Test subscription expiration
- [ ] Test restore purchases
- [ ] Test offline mode behavior
- [ ] Handle edge cases (network errors, etc.)
- [ ] Add analytics tracking for subscriptions
- [ ] Test on physical iOS device
- [ ] Test on physical Android device

**Deliverables:**
- All flows tested and working
- Edge cases handled
- Analytics integrated

### Phase 7: Deployment (Week 6)

**Goal:** Submit to app stores and launch

- [ ] Prepare App Store screenshots and copy
- [ ] Prepare Google Play Store listing
- [ ] Submit app update with IAP
- [ ] Wait for app review approval
- [ ] Configure RevenueCat webhooks
- [ ] Monitor initial purchases
- [ ] Fix any issues reported by users
- [ ] Announce launch to users

**Deliverables:**
- App live in stores with IAP
- RevenueCat production ready
- Monitoring active

---

## Technical Implementation Details

### Database Schema for Subscription Cache

**File:** `src/db/schema/subscriptions.ts`

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const subscriptionStatus = sqliteTable('subscription_status', {
  id: integer('id').primaryKey(),
  userId: text('user_id').notNull(),
  isProUser: integer('is_pro_user', { mode: 'boolean' }).notNull().default(false),
  entitlements: text('entitlements'), // JSON string
  expirationDate: text('expiration_date'),
  productId: text('product_id'),
  lastChecked: text('last_checked').notNull(),
});
```

**Why Cache Locally?**
- Faster app startup (don't wait for RevenueCat API)
- Offline support (check cached status)
- Fallback if RevenueCat is down

### Subscription Helpers

**File:** `src/db/helpers/subscriptions.ts`

```typescript
import { db } from '@/db/client';
import { subscriptionStatus } from '@/db/schema/subscriptions';
import { eq } from 'drizzle-orm';

export async function cacheSubscriptionStatus(
  userId: string,
  isProUser: boolean,
  entitlements: any,
  expirationDate: string | null,
  productId: string | null
) {
  await db
    .insert(subscriptionStatus)
    .values({
      id: 1, // Single row
      userId,
      isProUser,
      entitlements: JSON.stringify(entitlements),
      expirationDate,
      productId,
      lastChecked: new Date().toISOString(),
    })
    .onConflictDoUpdate({
      target: subscriptionStatus.id,
      set: {
        userId,
        isProUser,
        entitlements: JSON.stringify(entitlements),
        expirationDate,
        productId,
        lastChecked: new Date().toISOString(),
      },
    });
}

export async function getCachedSubscriptionStatus() {
  const result = await db
    .select()
    .from(subscriptionStatus)
    .where(eq(subscriptionStatus.id, 1))
    .limit(1);

  if (result.length === 0) return null;

  const cached = result[0];
  return {
    userId: cached.userId,
    isProUser: cached.isProUser,
    entitlements: JSON.parse(cached.entitlements || '{}'),
    expirationDate: cached.expirationDate,
    productId: cached.productId,
    lastChecked: new Date(cached.lastChecked),
  };
}
```

### Paywall Screen

**File:** `src/lib/paywall/PaywallScreen.tsx`

```typescript
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useSubscription } from '@/lib/subscriptions/RevenueCatProvider';
import { useRouter } from 'expo-router';
import { PACKAGE_IDS } from '@/lib/subscriptions/subscriptionConfig';

export default function PaywallScreen() {
  const router = useRouter();
  const { offerings, purchasePackage, isLoading } = useSubscription();
  const [purchasing, setPurchasing] = useState(false);

  async function handlePurchase(packageId: string) {
    setPurchasing(true);
    try {
      const success = await purchasePackage(packageId);
      if (success) {
        // Success! Features unlocked
        router.back();
      }
    } catch (error: any) {
      Alert.alert('Purchase Failed', error.message);
    } finally {
      setPurchasing(false);
    }
  }

  if (isLoading || !offerings) {
    return <ActivityIndicator />;
  }

  const monthlyPackage = offerings.availablePackages.find(
    (p) => p.identifier === PACKAGE_IDS.MONTHLY
  );
  const annualPackage = offerings.availablePackages.find(
    (p) => p.identifier === PACKAGE_IDS.ANNUAL
  );

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Upgrade to SideShelf Pro</Text>
      <Text style={styles.subtitle}>
        Unlock all features and support development
      </Text>

      {/* Features List */}
      <View style={styles.features}>
        <FeatureItem
          icon="✓"
          title="Multi-Library Access"
          description="Switch between libraries without logging out"
        />
        <FeatureItem
          icon="✓"
          title="Series Browsing"
          description="Browse audiobooks organized by series"
        />
        <FeatureItem
          icon="✓"
          title="Author Browsing"
          description="Explore content by your favorite authors"
        />
        <FeatureItem
          icon="✓"
          title="Advanced Statistics"
          description="Detailed listening stats and insights"
        />
        <FeatureItem
          icon="✓"
          title="Unlimited Downloads"
          description="Download as many books as you want"
        />
      </View>

      {/* Subscription Options */}
      <View style={styles.packages}>
        {annualPackage && (
          <TouchableOpacity
            style={[styles.package, styles.packageRecommended]}
            onPress={() => handlePurchase(PACKAGE_IDS.ANNUAL)}
            disabled={purchasing}
          >
            <View style={styles.badge}>
              <Text style={styles.badgeText}>BEST VALUE</Text>
            </View>
            <Text style={styles.packageTitle}>Annual</Text>
            <Text style={styles.packagePrice}>
              {annualPackage.product.priceString}/year
            </Text>
            <Text style={styles.packageSavings}>Save 44%</Text>
          </TouchableOpacity>
        )}

        {monthlyPackage && (
          <TouchableOpacity
            style={styles.package}
            onPress={() => handlePurchase(PACKAGE_IDS.MONTHLY)}
            disabled={purchasing}
          >
            <Text style={styles.packageTitle}>Monthly</Text>
            <Text style={styles.packagePrice}>
              {monthlyPackage.product.priceString}/month
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {purchasing && <ActivityIndicator style={styles.loader} />}

      <TouchableOpacity onPress={() => router.back()}>
        <Text style={styles.restoreText}>
          Already subscribed? Restore Purchases
        </Text>
      </TouchableOpacity>

      <Text style={styles.terms}>
        Subscriptions auto-renew. Cancel anytime in Settings.
      </Text>
    </ScrollView>
  );
}

function FeatureItem({ icon, title, description }: any) {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureText}>
        <Text style={styles.featureTitle}>{title}</Text>
        <Text style={styles.featureDescription}>{description}</Text>
      </View>
    </View>
  );
}
```

---

## Testing Strategy

### Unit Tests

**Test Coverage Areas:**
1. Subscription status detection
2. Feature gate logic
3. Library selection enforcement
4. Purchase flow state management
5. Subscription cache helpers

**Example Test:**
```typescript
describe('Feature Gates', () => {
  it('should block series tab for free users', () => {
    const { result } = renderHook(() => useFeatureGates(), {
      wrapper: MockRevenueCatProvider({ isProUser: false }),
    });

    expect(result.current.canBrowseSeries).toBe(false);
  });

  it('should allow series tab for pro users', () => {
    const { result } = renderHook(() => useFeatureGates(), {
      wrapper: MockRevenueCatProvider({ isProUser: true }),
    });

    expect(result.current.canBrowseSeries).toBe(true);
  });
});
```

### Integration Tests

**Test Scenarios:**
1. Free user login → Library selection shown
2. Free user tries to switch library → Blocked
3. Free user upgrades → Features unlock immediately
4. Pro user login → No library selection, all features available
5. Subscription expires → Features lock, user notified

### Manual Testing Checklist

**Free User Testing:**
- [ ] Login shows library selection
- [ ] Only selected library accessible
- [ ] Library dropdown shows upgrade prompt
- [ ] Series tab hidden
- [ ] Authors tab hidden
- [ ] Download limited to 3 items
- [ ] Logout and re-login allows library change

**Pro User Testing:**
- [ ] Login skips library selection
- [ ] All libraries accessible
- [ ] Library dropdown works
- [ ] Series tab visible and functional
- [ ] Authors tab visible and functional
- [ ] Unlimited downloads
- [ ] All pro features unlocked

**Purchase Testing:**
- [ ] Paywall screen displays correctly
- [ ] Monthly purchase works
- [ ] Annual purchase works
- [ ] Purchase unlocks features immediately
- [ ] Restore purchases works
- [ ] Subscription shown in settings

**Edge Cases:**
- [ ] Offline mode uses cached subscription
- [ ] Network error during purchase handled gracefully
- [ ] Subscription expiration handled correctly
- [ ] Multiple devices with same account
- [ ] User cancels purchase

---

## Risk Assessment

### Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| RevenueCat API downtime | High | Low | Cache subscription status locally |
| Purchase flow bugs | High | Medium | Extensive testing, sandbox testing |
| Feature gate bypass | Medium | Low | Server-side validation for critical features |
| Subscription not syncing | Medium | Medium | Implement retry logic, manual refresh |
| Database migration issues | Medium | Low | Thorough testing, rollback plan |

### Business Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Low conversion rate | High | Medium | Generous free tier, clear value prop |
| Negative user feedback | Medium | Medium | Clear communication, fair pricing |
| App store rejection | High | Low | Follow guidelines, proper IAP setup |
| Subscription management issues | Medium | Low | Clear cancellation instructions |

### Mitigation Strategies

**1. RevenueCat API Downtime:**
- Cache subscription status in local database
- Use cached status if API unavailable
- Refresh periodically in background

**2. Purchase Flow Bugs:**
- Test in sandbox environment extensively
- Use RevenueCat's debug logs
- Implement comprehensive error handling
- Provide restore purchases option

**3. Low Conversion:**
- A/B test paywall messaging
- Offer 7-day free trial
- Show upgrade prompts at right moments (when value is clear)
- Provide clear feature comparison

**4. User Feedback:**
- Monitor app store reviews closely
- Provide in-app support/feedback mechanism
- Be responsive to user concerns
- Iterate based on feedback

---

## Success Metrics

### Key Performance Indicators (KPIs)

**Conversion Metrics:**
- Paywall view rate (% of users who see paywall)
- Conversion rate (% who purchase after seeing paywall)
- Trial start rate (% who start free trial)
- Trial-to-paid conversion (% who convert after trial)

**Revenue Metrics:**
- Monthly Recurring Revenue (MRR)
- Annual Recurring Revenue (ARR)
- Average Revenue Per User (ARPU)
- Customer Lifetime Value (LTV)

**Engagement Metrics:**
- Free user retention (7-day, 30-day)
- Pro user retention (30-day, 90-day)
- Feature usage (which features drive upgrades)
- Time to upgrade (days from install to purchase)

**Target Metrics (First 3 Months):**
- Paywall view rate: >30%
- Conversion rate: >5%
- 30-day retention (free): >40%
- 30-day retention (pro): >80%
- MRR: $500+

### Analytics Implementation

**Track Events:**
```typescript
// Paywall events
analytics.track('paywall_viewed', { source: 'library_switch' });
analytics.track('paywall_package_selected', { package: 'annual' });
analytics.track('purchase_completed', { package: 'annual', price: 19.99 });

// Feature usage
analytics.track('library_selected', { libraryId, isPro });
analytics.track('series_tab_accessed', { isPro });
analytics.track('download_attempted', { isPro, downloadCount });

// Conversion funnel
analytics.track('upgrade_prompt_shown', { feature: 'multi_library' });
analytics.track('upgrade_prompt_clicked', { feature: 'multi_library' });
```

---

## Next Steps

### Immediate Actions (This Week)

1. **Create RevenueCat Account**
   - Sign up at https://app.revenuecat.com
   - Create "SideShelf" project
   - Configure API keys

2. **Set Up App Store Products**
   - Create in-app purchase products in App Store Connect
   - Configure subscription group
   - Set pricing

3. **Install Dependencies**
   ```bash
   npm install react-native-purchases
   npx expo prebuild --clean
   ```

4. **Create Feature Branch**
   ```bash
   git checkout -b feature/paid-upgrades
   ```

5. **Start Implementation**
   - Begin with Phase 1: Foundation
   - Create RevenueCatProvider
   - Set up feature gating

### Weekly Milestones

**Week 1:** RevenueCat integrated, feature gates working
**Week 2:** Multi-library access implemented
**Week 3:** Paywall and purchase flow complete
**Week 4:** Additional pro features implemented
**Week 5:** Testing and polish
**Week 6:** Deployment and launch

---

## Appendix

### RevenueCat Resources

- **Getting Started:** https://www.revenuecat.com/docs/getting-started
- **React Native SDK:** https://www.revenuecat.com/docs/react-native
- **Entitlements Guide:** https://www.revenuecat.com/docs/entitlements
- **Testing Guide:** https://www.revenuecat.com/docs/sandbox
- **Dashboard:** https://app.revenuecat.com

### App Store Guidelines

- **In-App Purchase Guide:** https://developer.apple.com/in-app-purchase/
- **Subscription Best Practices:** https://developer.apple.com/app-store/subscriptions/
- **Auto-Renewable Subscriptions:** https://developer.apple.com/documentation/storekit/in-app_purchase/original_api_for_in-app_purchase/subscriptions_and_offers

### Design Resources

- **Paywall Examples:** https://www.revenuecat.com/blog/paywall-examples
- **Pricing Psychology:** https://www.revenuecat.com/blog/subscription-pricing
- **Feature Comparison Best Practices:** https://www.revenuecat.com/blog/feature-comparison

---

## Changelog

**v1.0 - November 23, 2025**
- Initial plan created
- Consolidated investigation docs
- Added RevenueCat integration details
- Defined multi-library access implementation
- Created implementation roadmap

---

**End of Plan**

For questions or clarifications, refer to:
- Investigation docs in `docs/investigation/`
- RevenueCat documentation
- Existing codebase patterns in `src/`
