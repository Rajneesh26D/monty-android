package com.monty.study;

import android.Manifest;
import android.app.ActivityManager;
import android.os.PowerManager;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;


@CapacitorPlugin(name = "MontyUpdater", permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }))
public class MontyUpdaterPlugin extends Plugin {

    @PluginMethod public void getStatus(PluginCall call) {
        try {
            JSObject status = new JSObject();
            status.put("versionCode", UpdateService.installedCode(getContext()));
            status.put("versionName", getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0).versionName);
            status.put("notificationsEnabled", UpdateService.prefs(getContext()).getBoolean("notifications", false));
            status.put("notificationsAllowed", UpdateService.notificationsAllowed(getContext()));
            status.put("lastBackgroundCheck",UpdateService.prefs(getContext()).getLong("lastBackgroundCheck",0));
            status.put("backgroundError",UpdateService.prefs(getContext()).getString("backgroundError",""));
            status.put("backgroundRestricted",Build.VERSION.SDK_INT>=28 && getContext().getSystemService(ActivityManager.class).isBackgroundRestricted());
            status.put("batteryOptimized",!getContext().getSystemService(PowerManager.class).isIgnoringBatteryOptimizations(getContext().getPackageName()));
            status.put("lastChecked", UpdateService.prefs(getContext()).getLong("lastChecked", 0));
            String installMessage = UpdateService.prefs(getContext()).getString("installMessage", "");
            long fromVersion = UpdateService.prefs(getContext()).getLong("installVersion", 0);
            if (fromVersion > 0 && UpdateService.installedCode(getContext()) > fromVersion && !"error".equals(UpdateService.prefs(getContext()).getString("updateStage","")) && !"checking".equals(UpdateService.prefs(getContext()).getString("updateStage",""))) installMessage = "Update installed successfully.";
            status.put("installMessage", installMessage);
            status.put("updateStage",UpdateService.prefs(getContext()).getString("updateStage",""));
            status.put("packageName", getContext().getPackageName());
            status.put("architecture", UpdateService.arm64() ? "arm64-v8a" : "universal");
            call.resolve(status);
        } catch (Exception e) { call.reject("Could not read app version."); }
    }
    @PluginMethod public void checkForUpdate(PluginCall call) {
        getBridge().execute(() -> {
            try {
                UpdateManifest m = UpdateService.latest(getContext());
                JSObject result = new JSObject();
                result.put("available", m.versionCode > UpdateService.installedCode(getContext()));
                result.put("compatible", m.minSdk <= Build.VERSION.SDK_INT);
                result.put("versionName", m.versionName);
                result.put("versionCode", m.versionCode);
                result.put("notes", m.notes);
                result.put("size", m.size);
                call.resolve(result);
            } catch (Exception e) { call.reject(message(e)); }
        });
    }
    @PluginMethod public void installLatest(PluginCall call) {
        getActivity().runOnUiThread(()->{
            try {getActivity().startActivity(new Intent(getActivity(),UpdateActivity.class));call.resolve();}
            catch(Exception e){call.reject("Could not open the update screen: "+message(e));}
        });
    }
    @PluginMethod public void setNotifications(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (enabled && Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationPermission"); return;
        }
        saveNotificationPreference(call, enabled);
    }
    @PermissionCallback private void notificationPermission(PluginCall call) {
        saveNotificationPreference(call, getPermissionState("notifications") == PermissionState.GRANTED);
    }
    private void saveNotificationPreference(PluginCall call, boolean enabled) {
        UpdateService.prefs(getContext()).edit().putBoolean("notifications", enabled).apply();
        UpdateWorker.schedule(getContext());
        JSObject result = new JSObject();
        result.put("enabled", enabled); result.put("allowed", UpdateService.notificationsAllowed(getContext()));
        call.resolve(result);
    }
    @PluginMethod public void openBackgroundSettings(PluginCall call){
        getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName())));call.resolve();
    }
    @PluginMethod public void openNotificationSettings(PluginCall call) {
        Intent intent = Build.VERSION.SDK_INT >= 26 ? new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID, UpdateService.CHANNEL) :
            new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
        UpdateService.channel(getContext());
        getActivity().startActivity(intent); call.resolve();
    }
    private String message(Exception e) {
        if (e instanceof java.net.UnknownHostException || e instanceof java.net.SocketTimeoutException)
            return "Could not reach the update service. Check your internet connection and try again.";
        return e.getMessage() == null ? "Could not check the update. Please try again." : e.getMessage();
    }
}
