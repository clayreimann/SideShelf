import { translate } from "@/i18n";
import { useThemedStyles } from "@/lib/theme";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { MenuView } from "@react-native-menu/menu";
import { SymbolView, SymbolViewProps } from "expo-symbols";
import { Platform, Pressable, Text, View } from "react-native";

// Common jump interval options (in seconds)
const JUMP_INTERVALS = [5, 10, 15, 30, 45, 60, 90, 120];

/**
 * SkipButton component
 *
 * Displays a skip forward or backward button with platform-specific icons:
 * - iOS: Uses SF Symbols with dynamic interval display
 * - Android: Uses Material Icons with text overlay showing interval
 *
 * The interval is configurable and shows the actual seconds on the button.
 * Long-press the button to open a menu with different jump interval options.
 */
export interface SkipButtonProps {
    direction: 'forward' | 'backward';
    /** Number of seconds to skip (default: forward=30, backward=15) */
    interval?: number;
    hitBoxSize?: number;
    iconSize?: number;
    onPress: () => void;
    /** Called when user selects a specific jump interval from the long-press menu */
    onJump?: (seconds: number) => void;
}

export default function SkipButton({
    direction,
    interval,
    hitBoxSize = 44,
    iconSize = 24,
    onPress,
    onJump
}: SkipButtonProps) {
    const { colors } = useThemedStyles();

    // Use provided interval or defaults
    const seconds = interval ?? 30;

    // Determine icon name for SF Symbols (iOS) - try dynamic name with fallback
    const getSFSymbolName = (): SymbolViewProps['name'] => {
        // SF Symbols supports specific intervals like goforward.10, goforward.15, goforward.30, etc.
        // For common intervals, use the native symbol. For others, use a generic one.
        const isCommonInterval = [5, 10, 15, 30, 45, 60, 75, 90].includes(seconds);
        const symbolBase = direction === 'forward' ? 'goforward' : 'gobackward';
        if (isCommonInterval) {
            return `${symbolBase}.${seconds}` as SymbolViewProps['name'];
        }
        // Fallback to generic forward/backward symbols
        return `${symbolBase}` as SymbolViewProps['name'];
    };

    // Format jump interval for display
    const formatInterval = (intervalSeconds: number): string => {
        if (intervalSeconds < 60) {
            return translate('player.jumpMenu.seconds', { seconds: intervalSeconds });
        } else {
            const minutes = Math.floor(intervalSeconds / 60);
            return translate('player.jumpMenu.minutes', { minutes });
        }
    };

    // Create menu actions for jump intervals
    const menuActions = JUMP_INTERVALS.map(intervalSeconds => ({
        id: intervalSeconds.toString(),
        title: formatInterval(intervalSeconds),
    }));

    const buttonContent = (
        <Pressable
            onPress={onPress}
            style={({pressed}) => ({
                width: hitBoxSize,
                height: hitBoxSize,
                justifyContent: 'center',
                alignItems: 'center',
                opacity: pressed ? 0.5 : 1,
            })}
        >
            {Platform.OS === 'ios' ? (
                <SymbolView
                    name={getSFSymbolName()}
                    size={iconSize}
                    tintColor={colors.textPrimary}
                    type="hierarchical"
                />
            ) : (
                // Android: Show icon with text overlay
                <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                    <MaterialIcons
                        name={direction === 'forward' ? 'fast-forward' : 'fast-rewind'}
                        size={iconSize}
                        color={colors.textPrimary}
                    />
                    <Text style={{
                        position: 'absolute',
                        fontSize: iconSize * 0.35,
                        fontWeight: 'bold',
                        color: colors.textPrimary,
                        marginTop: iconSize * 0.1,
                    }}>
                        {seconds}
                    </Text>
                </View>
            )}
        </Pressable>
    );

    // If no onJump handler provided, just render the button without menu
    if (!onJump) {
        return buttonContent;
    }

    return (
        <MenuView
            title={translate(
                direction === 'forward'
                    ? 'player.jumpMenu.titleForward'
                    : 'player.jumpMenu.titleBackward'
            )}
            onPressAction={({ nativeEvent }) => {
                const jumpSeconds = parseInt(nativeEvent.event);
                onJump(jumpSeconds);
            }}
            actions={menuActions}
        >
            {buttonContent}
        </MenuView>
    );
}
