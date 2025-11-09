# Architecture Investigation - Build Variant Plan

This directory contains comprehensive documentation for implementing free vs paid build variants of SideShelf.

## Documents Overview

### 1. **ARCHITECTURE_SUMMARY.md** (Quick Reference)

- Quick overview of the entire architecture
- Technology stack and key components
- File organization and data flow diagrams
- Performance considerations
- Key files reference table
- **Best for:** Getting oriented quickly, understanding the big picture

### 2. **BUILD_VARIANT_ARCHITECTURE.md** (Detailed Analysis)

- Complete investigation of current architecture
- How navigation is structured (tabs, stacks)
- Library/server connection logic
- Current app configuration structure
- Feature flags and environment config analysis
- State management architecture (Zustand slices)
- Main entry points and initialization flow
- Services architecture overview
- **Recommendations for variant implementation**
- Risk mitigation strategies
- Implementation roadmap

### 3. **VARIANT_IMPLEMENTATION_GUIDE.md** (Step-by-Step)

- Practical implementation instructions
- Code examples for all required files
- Build scripts setup
- Navigation updates with conditional tabs
- Store initialization conditional logic
- Feature-based UI components
- Testing both variants
- App store submission process
- Analytics integration
- Common implementation patterns
- Troubleshooting guide

## Quick Start

### To understand the architecture:

1. Start with **ARCHITECTURE_SUMMARY.md**
2. Read through **BUILD_VARIANT_ARCHITECTURE.md** for details
3. Use **VARIANT_IMPLEMENTATION_GUIDE.md** for implementation

### Key Findings

**Navigation Structure:**

- 5 tabs: Home, Library, Series, Authors, More
- Expo Router file-based routing
- Conditional tab visibility recommended

**Library Management:**

- AuthProvider handles credentials
- Single server connection
- SQLite database for caching
- Can support single or multiple libraries per variant

**Current Config:**

- `app.json` for Expo configuration
- `eas.json` for EAS build profiles
- No existing variant support - to be implemented

**State Management:**

- Zustand with slice pattern
- 11 slices for different domains
- Can conditionally initialize slices per variant

**Recommended Approach:**

1. Build-time variant detection (via app.json extra.variant)
2. Runtime feature flags (via variants.ts module)
3. Conditional navigation and store initialization
4. Feature checks in components for UI
5. Same database schema for both variants

## Implementation Roadmap

### Phase 1: Foundation

- Create variant detection module (variants.ts)
- Create feature flags module (features.ts)
- Setup variant-specific app.json files
- Setup variant-specific eas.json files

### Phase 2: Navigation

- Conditional tab rendering
- Upgrade prompts for locked features

### Phase 3: Store

- Conditional slice initialization
- Download limit enforcement

### Phase 4: Testing & Deployment

- Test both variants
- Build and submit to app stores

## Key Files to Create/Modify

### New Files

```
src/lib/variants.ts                    # Variant detection
src/lib/features.ts                    # Feature flags
app-free.json                          # Free variant config
app-pro.json                           # Pro variant config
eas-free.json                          # Free variant build config
eas-pro.json                           # Pro variant build config
```

### Modified Files

```
src/app/(tabs)/_layout.tsx             # Conditional tabs
src/providers/StoreProvider.tsx        # Conditional initialization
package.json                           # Build variant scripts
```

## Suggested Feature Breakdown

### Free Tier

- Single library
- Basic playback controls
- Listening history
- Limited downloads (1)

### Pro Tier

- Multiple libraries
- Series browsing
- Author browsing
- Unlimited downloads
- Advanced filtering
- Custom playback speeds
- Statistics

## Implementation Highlights

1. **Minimal code changes** - Features are additive
2. **Single database** - Both variants use same schema
3. **Clean separation** - Variant logic isolated
4. **Scalable** - Easy to add more tiers later
5. **No migration needed** - Same DB for both versions
6. **Easy testing** - Test each variant independently

## File Sizes

- ARCHITECTURE_SUMMARY.md: 13K (482 lines)
- BUILD_VARIANT_ARCHITECTURE.md: 15K (519 lines)
- VARIANT_IMPLEMENTATION_GUIDE.md: 14K (638 lines)

Total: 42K of detailed documentation

## Next Steps

1. Review all three documents
2. Create the variant detection system
3. Setup build configurations
4. Implement conditional navigation
5. Test both variants locally
6. Submit to app stores

---

**Created:** November 9, 2025
**Technology Stack:** React Native, Expo, Zustand, SQLite
**Investigation Focus:** Free vs Paid Build Variants
