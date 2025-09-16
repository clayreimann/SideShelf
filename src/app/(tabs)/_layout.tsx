import { useRouter } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { useThemedStyles } from '../../lib/theme';
import { useAuth } from '../../providers/AuthProvider';

export default function TabLayout() {
    const router = useRouter();
    const { initialized, isAuthenticated } = useAuth();
    const { tabs } = useThemedStyles();
    useEffect(() => {
        if (initialized && !isAuthenticated) {
            router.push('/login');
        }
    }, [initialized, isAuthenticated]);
    return (
        <NativeTabs
            backgroundColor={tabs.backgroundColor}
            iconColor={tabs.iconColor}
            labelStyle={{ color: tabs.labelColor }}
            badgeTextColor={tabs.badgeTextColor}
            shadowColor={tabs.shadowColor}
        >
            <NativeTabs.Trigger name="index">
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
    );
}
