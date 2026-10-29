package com.monty.study;

import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.security.MessageDigest;
import java.util.*;

final class UpdateService {
    static final String CHANNEL = "monty_updates";
    static android.content.SharedPreferences prefs(Context c) { return c.getSharedPreferences("monty-updates", 0); }
    static long installedCode(Context c) throws Exception {
        PackageInfo info = c.getPackageManager().getPackageInfo(c.getPackageName(), 0);
        return Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : info.versionCode;
    }
    static boolean arm64() { return Arrays.asList(Build.SUPPORTED_ABIS).contains("arm64-v8a"); }
    static HttpURLConnection connect(String address) throws Exception {
        URL url = new URL(address);
        for (int redirect = 0; redirect < 6; redirect++) {
            if (!"https".equals(url.getProtocol())) throw new IOException("An update requires a secure connection.");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(15000); c.setReadTimeout(30000); c.setInstanceFollowRedirects(false);
            c.setRequestProperty("User-Agent", "Monty-Android");
            c.setRequestProperty("Cache-Control", "no-cache");
            int status = c.getResponseCode();
            if (status >= 300 && status <= 399) {
                String location = c.getHeaderField("Location"); c.disconnect();
                if (location == null) throw new IOException("The update download moved without an address.");
                url = new URL(url, location); continue;
            }
            if (status != 200) {
                c.disconnect();
                throw new IOException(status == 404 ? "No release is published yet. Please check again later." :
                    "Could not reach the update service (" + status + "). Please check again later.");
            }
            return c;
        }
        throw new IOException("Too many update download redirects.");
    }
    static UpdateManifest latest(Context c) throws Exception {
        HttpURLConnection connection;
        try { connection = connect(BuildConfig.UPDATE_GATEWAY + "/updates/latest.json"); }
        catch (Exception unavailable) { connection = connect("https://github.com/" + BuildConfig.UPDATE_REPOSITORY + "/releases/latest/download/update.json"); }
        try (InputStream in = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int n;
            while ((n = in.read(buffer)) != -1) {
                if (out.size() + n > 131072) throw new IOException("Update information is too large.");
                out.write(buffer, 0, n);
            }
            UpdateManifest manifest = new UpdateManifest(new JSONObject(out.toString("UTF-8")), BuildConfig.UPDATE_REPOSITORY, c.getPackageName(), arm64());
            prefs(c).edit().putLong("lastChecked", System.currentTimeMillis()).apply();
            if (manifest.versionCode > installedCode(c)) notifyUpdate(c, manifest);
            return manifest;
        } finally { connection.disconnect(); }
    }
    static void channel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("New Monty APK releases");
            c.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    static boolean notificationsAllowed(Context c) {
        if (!NotificationManagerCompat.from(c).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = c.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL);
            if (channel != null && channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
        }
        return true;
    }
    static void notifyUpdate(Context c, UpdateManifest m) throws Exception {
        if (!prefs(c).getBoolean("notifications", false) || !notificationsAllowed(c) ||
            prefs(c).getInt("notifiedVersion", 0) >= m.versionCode) return;
        channel(c);
        Intent intent = new Intent(c, MainActivity.class).setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse("monty://settings/updates")).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(c, 2001, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            NotificationManagerCompat.from(c).notify(2001, new NotificationCompat.Builder(c, CHANNEL)
                .setSmallIcon(R.drawable.ic_update_notification).setContentTitle("Monty " + m.versionName + " is available")
                .setContentText("Tap to check and install the update.").setContentIntent(pending).setAutoCancel(true).build());
            prefs(c).edit().putInt("notifiedVersion", m.versionCode).apply();
        } catch (SecurityException ignored) { /* The user can revoke notification permission at any time. */ }
    }
    static File download(Context c, UpdateManifest m) throws Exception {
        if (m.versionCode <= installedCode(c)) throw new IOException("Monty is already up to date.");
        if (m.minSdk > Build.VERSION.SDK_INT) throw new IOException("This update needs a newer Android version.");
        File directory = new File(c.getCacheDir(), "updates");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Could not create update storage.");
        if (directory.getUsableSpace() < m.size + 32L * 1024 * 1024) throw new IOException("Free some phone storage before downloading the update.");
        File file = new File(directory, "monty-update.apk");
        if (file.exists() && !file.delete()) throw new IOException("Could not replace the previous update download.");
        HttpURLConnection connection = connect(m.url);
        boolean verified = false;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            long size = 0;
            try (InputStream in = connection.getInputStream(); FileOutputStream out = new FileOutputStream(file)) {
                byte[] buffer = new byte[65536]; int n;
                while ((n = in.read(buffer)) != -1) {
                    size += n;
                    if (size > m.size) throw new IOException("The APK size does not match the release.");
                    digest.update(buffer, 0, n); out.write(buffer, 0, n);
                }
            }
            if (size != m.size || !hex(digest.digest()).equals(m.sha256)) throw new IOException("Update verification failed. Please download again.");
            verifyPackage(c, file, m);
            verified = true;
            return file;
        } finally {
            connection.disconnect();
            if (!verified) file.delete();
        }
    }
    static String hex(byte[] bytes) {
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    private static Set<String> signers(PackageInfo info) throws Exception {
        Signature[] signatures = Build.VERSION.SDK_INT >= 28 ?
            (info.signingInfo == null ? null : info.signingInfo.getApkContentsSigners()) : info.signatures;
        if (signatures == null || signatures.length == 0) throw new IOException("The APK is not signed.");
        Set<String> hashes = new HashSet<>();
        for (Signature signature : signatures) hashes.add(hex(MessageDigest.getInstance("SHA-256").digest(signature.toByteArray())));
        return hashes;
    }
    private static void verifyPackage(Context c, File file, UpdateManifest m) throws Exception {
        int flag = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo apk = c.getPackageManager().getPackageArchiveInfo(file.getAbsolutePath(), flag);
        if (apk == null || !c.getPackageName().equals(apk.packageName)) throw new IOException("The downloaded APK is not Monty.");
        long code = Build.VERSION.SDK_INT >= 28 ? apk.getLongVersionCode() : apk.versionCode;
        PackageInfo installed = c.getPackageManager().getPackageInfo(c.getPackageName(), flag);
        if (code != m.versionCode || !m.versionName.equals(apk.versionName) || code <= installedCode(c) ||
            !signers(apk).equals(signers(installed))) throw new IOException("This APK does not match Monty's version or signing key.");
    }
    static void install(Context c, File file) {
        Uri uri = FileProvider.getUriForFile(c, c.getPackageName() + ".fileprovider", file);
        Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        c.startActivity(intent);
    }
}
