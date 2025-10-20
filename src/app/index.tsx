import { useAuth } from '@/providers/AuthProvider';
import { Redirect, router } from 'expo-router';
import { useEffect } from 'react';

export default function RootIndex() {
  const { loginMessage } = useAuth();
  useEffect(() => {
    if (loginMessage) {
      console.log('[RootIndex] Redirecting to login due to loginMessage:', loginMessage);
      router.navigate('/login');
    }
  }, [loginMessage]);
  console.log(`[RootIndex] ${loginMessage ? 'Redirecting to login' : 'Redirecting to home'} message=${loginMessage}`);
  return <Redirect href="/(tabs)/home" />;
}
