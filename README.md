# Audiobookshelf React Native Client

A modern, feature-rich React Native client for [Audiobookshelf](https://www.audiobookshelf.org/) - the self-hosted audiobook and podcast server.

## 📱 About

This app provides a native mobile experience for your Audiobookshelf library, featuring offline downloads, progress synchronization, and a beautiful, intuitive interface optimized for audiobook and podcast consumption.

### ✨ Key Features

- **📚 Complete Library Management**: Browse, search, and organize your audiobook and podcast collections
- **⬇️ Offline Downloads**: Download content for offline listening with intelligent storage management
- **🎵 Advanced Audio Player**: Full-featured player with progress tracking, playback speed control, and chapter navigation
- **🔄 Real-time Sync**: Seamless progress synchronization across all your devices
- **📊 Progress Tracking**: Detailed listening statistics and progress visualization
- **🎨 Beautiful UI**: Modern design with dark/light theme support and customizable layouts
- **🔍 Smart Search**: Find content quickly with advanced filtering and sorting options
- **📱 Platform Native**: Optimized for both iOS and Android with platform-specific features

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or later)
- Expo CLI
- iOS Simulator (for iOS development) or Android Studio (for Android development)
- An active Audiobookshelf server

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/abs-react-native.git
   cd abs-react-native
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npx expo start
   ```

4. **Run on your preferred platform**
   - **iOS Simulator**: Press `i` in the terminal or scan the QR code with your iOS device
   - **Android Emulator**: Press `a` in the terminal or scan the QR code with your Android device
   - **Physical Device**: Install Expo Go and scan the QR code

### Development Setup

For development with database features:

```bash
# Generate database migrations
npm run drizzle:generate

# Push database changes
npm run drizzle:push
```

## 🏗️ Architecture

### Tech Stack

- **Framework**: React Native with Expo
- **Navigation**: Expo Router (file-based routing)
- **State Management**: Zustand
- **Database**: SQLite with Drizzle ORM
- **Audio Playback**: react-native-track-player
- **Downloads**: Background downloader with progress tracking
- **Styling**: React Native StyleSheet with theme support

### Project Structure

```
src/
├── app/                    # File-based routing (Expo Router)
├── components/            # Reusable UI components
├── db/                    # Database schema, migrations, and helpers
├── lib/                   # Utility functions and API clients
├── providers/             # React context providers
├── services/              # Business logic and background services
├── stores/                # Zustand state management
└── types/                 # TypeScript type definitions
```

### Key Services

- **PlayerService**: Audio playback management with TrackPlayer integration
- **DownloadService**: Content download management with progress tracking
- **UnifiedProgressService**: Progress tracking and server synchronization
- **AuthProvider**: Authentication and token management

## 📖 Usage

### First Time Setup

1. **Server Connection**: Enter your Audiobookshelf server URL and credentials
2. **Library Selection**: Choose your default library from available options
3. **Download Preferences**: Configure download quality and storage settings

### Core Features

#### Library Browsing
- Browse your audiobook and podcast collections
- Sort by title, author, date added, or progress
- Switch between grid and list views
- Filter by download status, progress, or genre

#### Content Playback
- Stream directly from your server or play downloaded content
- Automatic progress synchronization across devices
- Chapter navigation and bookmarking
- Variable playback speed and sleep timer

#### Download Management
- Download individual books or entire series
- Monitor download progress with detailed statistics
- Automatic cleanup of old downloads
- Background downloading support

## 🛠️ Development

### Available Scripts

```bash
npm start          # Start Expo development server
npm run ios        # Run on iOS simulator
npm run android    # Run on Android emulator
npm test           # Run test suite
npm run lint       # Run ESLint
npm run test:coverage # Run tests with coverage report
```

### Testing

The project includes comprehensive testing with Jest and React Native Testing Library:

```bash
npm test           # Run all tests
npm run test:watch # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow the existing ESLint configuration
- Use TypeScript for all new code
- Write tests for new features
- Follow the established project structure

## 📋 Roadmap

See our [TODO.md](./TODO.md) for detailed development plans and feature roadmap.

### Upcoming Features

- **Real-time Updates**: WebSocket integration for live progress sync
- **Podcast Support**: Enhanced podcast features with episode management
- **Advanced Player**: Sleep timer, bookmarking, and advanced controls
- **Series Management**: Better series organization and tracking
- **CarPlay/Android Auto**: Vehicle integration support

## 🐛 Known Issues

- Background downloads may be interrupted on iOS due to system limitations
- Some older Android devices may experience performance issues with large libraries

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🤝 Acknowledgments

- [Audiobookshelf](https://www.audiobookshelf.org/) - The amazing self-hosted audiobook server
- [Expo](https://expo.dev/) - For making React Native development delightful
- [react-native-track-player](https://react-native-track-player.js.org/) - For excellent audio playback capabilities

## 📞 Support

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/your-username/abs-react-native/issues)
- **Discussions**: Join the conversation in [GitHub Discussions](https://github.com/your-username/abs-react-native/discussions)
- **Audiobookshelf Community**: Connect with the broader community on [Discord](https://discord.gg/audiobookshelf)

---

**Built with ❤️ for the Audiobookshelf community**
