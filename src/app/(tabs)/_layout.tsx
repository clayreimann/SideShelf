import FloatingPlayer from '@/components/ui/FloatingPlayer';
import { useThemedStyles } from '@/lib/theme';
import { useAuth } from '@/providers/AuthProvider';
import { DownloadService } from '@/services/DownloadService';
import { useRouter } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function TabLayout() {
    const router = useRouter();
    const { initialized, isAuthenticated, loginMessage } = useAuth();
    const { tabs, isDark } = useThemedStyles();
    useEffect(() => {
        if (initialized && !isAuthenticated) {
            router.push('/login');
        }
    }, [initialized, isAuthenticated]);
    useEffect(() => {
        DownloadService.getInstance().initialize();
    }, []);
    useEffect(() => {
    if (loginMessage) {
        console.log(`[TabIndex] Redirecting to login due to loginMessage: ${loginMessage}`);
        router.navigate('/login');
    }
    }, [loginMessage]);
    
    return (
        <View style={{ flex: 1 }}>
            <NativeTabs
                blurEffect={isDark ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
                iconColor={tabs.iconColor}
                labelStyle={{ color: tabs.labelColor }}
                badgeTextColor={tabs.badgeTextColor}
            >
                <NativeTabs.Trigger name="home">
                    <Label>Home</Label>
                    <Icon sf={{default: "house", selected: "house.fill"}} />
                </NativeTabs.Trigger>
                <NativeTabs.Trigger name="library">
                    <Label>Library</Label>
                    <Icon sf={{default: "books.vertical", selected: "books.vertical.fill"}} />
                </NativeTabs.Trigger>
                <NativeTabs.Trigger name="series">
                    <Label>Series</Label>
                    <Icon sf={{default: "square.stack", selected: "square.stack.fill"}} />
                </NativeTabs.Trigger>
                <NativeTabs.Trigger name="authors">
                    <Label>Authors</Label>
                    <Icon sf={{default: "person.circle", selected: "person.circle.fill"}} />
                </NativeTabs.Trigger>
                <NativeTabs.Trigger name="more">
                    <Label>More</Label>
                    <Icon sf={{default: "ellipsis.circle", selected: "ellipsis.circle.fill"}} />
                </NativeTabs.Trigger>
            </NativeTabs>

            {/* Floating Player */}
            <FloatingPlayer />
        </View>
    );
}
