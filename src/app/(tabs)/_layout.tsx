import { useRouter } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { useEffect } from 'react';
import { useAuth } from '../../providers/AuthProvider';

export default function TabLayout() {
    const router = useRouter();
    const { initialized, isAuthenticated } = useAuth();
    useEffect(() => {
        if (initialized && !isAuthenticated) {
            router.push('/login');
        }
    }, [initialized, isAuthenticated]);
    return (
        <NativeTabs>
            <NativeTabs.Trigger name="index">
                <Label>Home</Label>
                <Icon sf="house" />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="library">
                <Label>Library</Label>
                <Icon sf="books.vertical" />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="series">
                <Label>Series</Label>
                <Icon sf="square.stack" />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="collections">
                <Label>Collections</Label>
                <Icon sf="list.bullet" />
            </NativeTabs.Trigger>
            <NativeTabs.Trigger name="authors">
                <Label>Authors</Label>
                <Icon sf="person.circle" />
            </NativeTabs.Trigger>
        </NativeTabs>
    );
}
