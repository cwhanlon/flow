package im.freeflow.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

/**
 * Keeps a huddle alive while the app is in the background (ANDROID.md phase 4).
 *
 * Android kills a backgrounded app's audio unless a foreground service with
 * the `microphone` type is running; without this, switching apps mid-call
 * drops the call. The page tells the shell when a huddle starts and ends
 * (FlowShell.setHuddleActive, from packages/web/src/components/
 * ShellHuddleBridge.tsx), and this service is that signal made visible: an
 * ongoing "In a huddle" notification that returns to the app when tapped.
 *
 * It also owns the audio route for the call's duration: MODE_IN_COMMUNICATION
 * (echo cancellation, call volume) and the speaker on — a group call on a
 * phone held in the hand, not to the ear. Restored on stop.
 */
public class HuddleService extends Service {
  static final String ACTION_START = "im.freeflow.app.huddle.START";
  static final String ACTION_STOP = "im.freeflow.app.huddle.STOP";
  static final String EXTRA_TITLE = "title";
  static final String CHANNEL_ID = "huddle";
  static final int NOTIFICATION_ID = 4101;
  static final String DEFAULT_TEXT = "In a huddle";

  static void start(Context context, String title) {
    Intent intent = new Intent(context, HuddleService.class).setAction(ACTION_START).putExtra(EXTRA_TITLE, title);
    ContextCompat.startForegroundService(context, intent);
  }

  static void stop(Context context) {
    context.startService(new Intent(context, HuddleService.class).setAction(ACTION_STOP));
  }

  /** What the ongoing notification says. Pure, so it is unit-testable. */
  static String notificationText(String title) {
    if (title == null) return DEFAULT_TEXT;
    String t = title.replaceAll("\\s+", " ").trim();
    if (t.isEmpty()) return DEFAULT_TEXT;
    return t.length() > 60 ? t.substring(0, 59).trim() + "…" : t;
  }

  @Override
  public int onStartCommand(Intent intent, int flags, int startId) {
    String action = intent == null ? null : intent.getAction();
    if (ACTION_STOP.equals(action) || action == null) {
      stopForeground(true);
      stopSelf();
      return START_NOT_STICKY;
    }
    if (!ACTION_START.equals(action)) return START_NOT_STICKY;

    ensureChannel();
    Notification notification = buildNotification(intent.getStringExtra(EXTRA_TITLE));
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
    } else {
      startForeground(NOTIFICATION_ID, notification);
    }
    AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (audio != null) {
      audio.setMode(AudioManager.MODE_IN_COMMUNICATION);
      audio.setSpeakerphoneOn(true);
    }
    return START_NOT_STICKY;
  }

  @Override
  public void onDestroy() {
    AudioManager audio = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
    if (audio != null) {
      audio.setSpeakerphoneOn(false);
      audio.setMode(AudioManager.MODE_NORMAL);
    }
    super.onDestroy();
  }

  @Override
  public IBinder onBind(Intent intent) {
    return null;
  }

  private void ensureChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
    NotificationManager nm = getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
    NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Ongoing huddle", NotificationManager.IMPORTANCE_LOW);
    channel.setDescription("Shown while you are in a huddle so the call keeps running in the background");
    channel.setSound(null, null);
    nm.createNotificationChannel(channel);
  }

  private Notification buildNotification(String title) {
    Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
    int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
    PendingIntent tap = PendingIntent.getActivity(this, 0, open, flags);
    return new NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle(notificationText(title))
        .setContentText("Tap to return to Flow")
        .setOngoing(true)
        .setSilent(true)
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setContentIntent(tap)
        .build();
  }
}
