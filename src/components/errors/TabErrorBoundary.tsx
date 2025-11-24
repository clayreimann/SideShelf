/**
 * TabErrorBoundary Component
 *
 * A specialized error boundary for tab components that provides tab-specific
 * error handling and fallback UI. This prevents errors in one tab from crashing
 * the entire app or affecting other tabs.
 *
 * Features:
 * - Tab-specific error logging
 * - User-friendly error UI with navigation options
 * - Automatic reset when switching tabs
 * - Integrates with app's logger system
 */

import { logger } from "@/lib/logger";
import { useThemedStyles } from "@/lib/theme";
import { useRouter } from "expo-router";
import React, { Component, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  children: ReactNode;
  tabName: string;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Tab-specific fallback UI component
 */
class TabFallback extends React.Component<{
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
  tabName: string;
}> {
  render() {
    const { error, errorInfo, onReset, tabName } = this.props;

    return (
      <TabFallbackContent error={error} errorInfo={errorInfo} onReset={onReset} tabName={tabName} />
    );
  }
}

/**
 * Functional component for the tab fallback content (so we can use hooks)
 */
const TabFallbackContent: React.FC<{
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
  tabName: string;
}> = ({ error, errorInfo, onReset, tabName }) => {
  const { colors } = useThemedStyles();
  const router = useRouter();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
      backgroundColor: colors.background,
    },
    title: {
      fontSize: 20,
      fontWeight: "bold",
      color: colors.textPrimary,
      marginBottom: 10,
      textAlign: "center",
    },
    message: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
      textAlign: "center",
      paddingHorizontal: 20,
    },
    buttonContainer: {
      flexDirection: "column",
      gap: 10,
      width: "100%",
      maxWidth: 300,
    },
    button: {
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    buttonSecondary: {
      backgroundColor: colors.coverBackground,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: colors.separator,
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
    buttonTextSecondary: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: "600",
    },
    errorDetails: {
      marginTop: 20,
      padding: 15,
      backgroundColor: colors.coverBackground,
      borderRadius: 8,
      maxHeight: 200,
      width: "100%",
    },
    errorText: {
      fontFamily: "monospace",
      fontSize: 12,
      color: colors.textSecondary,
    },
    tabName: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 15,
      textAlign: "center",
    },
  });

  const handleGoHome = () => {
    try {
      router.push("/(tabs)/home");
    } catch (navError) {
      console.error("Failed to navigate to home:", navError);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.tabName}>{tabName} Tab</Text>
      <Text style={styles.title}>Something Went Wrong</Text>
      <Text style={styles.message}>
        An error occurred in this tab. Other tabs should still work normally.
      </Text>

      <View style={styles.buttonContainer}>
        <TouchableOpacity style={styles.button} onPress={onReset}>
          <Text style={styles.buttonText}>Try Again</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.buttonSecondary} onPress={handleGoHome}>
          <Text style={styles.buttonTextSecondary}>Go to Home</Text>
        </TouchableOpacity>
      </View>

      {__DEV__ && error && (
        <ScrollView style={styles.errorDetails}>
          <Text style={styles.errorText}>
            {`Error in ${tabName} tab:\n\n`}
            {`${error.toString()}\n\n`}
            {errorInfo?.componentStack}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

export class TabErrorBoundary extends Component<Props, State> {
  private log = logger.forTag(`Tab:${this.props.tabName}`);

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { tabName } = this.props;

    // Log the error to our logging system
    this.log.error(`Error in ${tabName} tab: ${error.message}`, error);

    // Also log component stack if in dev mode
    if (__DEV__) {
      this.log.error(`Component stack for ${tabName} tab: ${errorInfo.componentStack}`);
    }

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: Props): void {
    // Reset error state when tab changes (children change)
    // This allows the tab to recover when the user navigates away and back
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.log.info(`Resetting error boundary for ${this.props.tabName} tab`);
      this.resetErrorBoundary();
    }
  }

  resetErrorBoundary = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <TabFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.resetErrorBoundary}
          tabName={this.props.tabName}
        />
      );
    }

    return this.props.children;
  }
}
