import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { UserNotification } from './notifications';

type RealtimeNotification = UserNotification & { recipient_id: string };

type UseRealtimeNotificationsOptions = {
  accessToken: string;
  onInsert: (notification: UserNotification) => void | Promise<void>;
};

/**
 * Subscribes to notifications for the currently authenticated profile only.
 * The API polling loop remains the fallback when Realtime is unavailable.
 */
export function useRealtimeNotifications({
  accessToken,
  onInsert,
}: UseRealtimeNotificationsOptions) {
  const onInsertRef = useRef(onInsert);
  onInsertRef.current = onInsert;

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const subscribe = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user.id;
      if (cancelled || !userId) return;

      channel = supabase
        .channel(`user-notifications:${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'user_notifications',
            // The migration names this column recipient_id (not user_id).
            filter: `recipient_id=eq.${userId}`,
          },
          (payload) => {
            const row = payload.new as RealtimeNotification;
            // Keep this guard even with the server-side filter: a malformed
            // or misconfigured Realtime binding must never leak another row.
            if (row.recipient_id !== userId) return;
            void onInsertRef.current(row);
          },
        );
      // If Realtime is not enabled for this table, enable it in Supabase
      // Studio > Database > Replication for public.user_notifications.
      channel.subscribe();
    };

    void subscribe();

    return () => {
      cancelled = true;
      if (channel) void channel.unsubscribe();
    };
  }, [accessToken]);
}
