/**
 * ErrorBoundary Component
 *
 * A React error boundary that catches JavaScript errors anywhere in the child
 * component tree, logs those errors, and displays a fallback UI instead of
 * crashing the entire component tree.
 *
 * Features:
 * - Integrates with the app's logger system
 * - Displays user-friendly error UI with retry capability
 * - Prevents entire app crashes from component errors
 * - Automatically resets when navigation changes
 */

import { translate } from "@/i18n";
import { logger } from '@/lib/logger';
import { useThemedStyles } from "@/lib/theme";
import React, { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /**
   * A unique identifier for this boundary (used in logging)
   * Defaults to 'ErrorBoundary'
   */
  boundaryName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

/**
 * Default fallback UI component
 */
const DefaultFallback: React.FC<{
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  onReset: () => void;
  boundaryName: string;
}> = ({ error, errorInfo, onReset, boundaryName }) => {
  const { colors } = useThemedStyles();

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
    button: {
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 10,
    },
    buttonText: {
      color: "#FFFFFF",
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
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{translate('common.error')}</Text>
      <Text style={styles.message}>
        Something went wrong in this section. The error has been logged.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onReset}>
        <Text style={styles.buttonText}>Try Again</Text>
      </TouchableOpacity>

      {__DEV__ && error && (
        <ScrollView style={styles.errorDetails}>
          <Text style={styles.errorText}>
            {`Error in: ${boundaryName}\n\n`}
            {`${error.toString()}\n\n`}
            {errorInfo?.componentStack}
          </Text>
        </ScrollView>
      )}
    </View>
  );
};

export class ErrorBoundary extends Component<Props, State> {
  private log = logger.forTag('ErrorBoundary');

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const boundaryName = this.props.boundaryName || 'ErrorBoundary';

    // Log the error to our logging system
    this.log.error(
      `Error caught in ${boundaryName}: ${error.message}`,
      error
    );

    // Also log component stack if in dev mode
    if (__DEV__) {
      this.log.error(
        `Component stack for ${boundaryName}: ${errorInfo.componentStack}`,
      );
    }

    // Update state with error info
    this.setState({
      errorInfo,
    });

    // Call optional error callback
    this.props.onError?.(error, errorInfo);
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
      // Use custom fallback if provided, otherwise use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <DefaultFallback
          error={this.state.error}
          errorInfo={this.state.errorInfo}
          onReset={this.resetErrorBoundary}
          boundaryName={this.props.boundaryName || 'ErrorBoundary'}
        />
      );
    }

    return this.props.children;
  }
}
