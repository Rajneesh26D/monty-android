package com.monty.study;

import org.json.JSONObject;
import java.net.URI;

/** Strictly bounded release metadata. The APK's signer is checked separately. */
final class UpdateManifest {
    final int versionCode, minSdk;
    final String versionName, notes, url, sha256;
    final long size;
    UpdateManifest(JSONObject json, String repository, String packageName, boolean arm64) throws Exception {
        if (json.getInt("schemaVersion") != 1 || !packageName.equals(json.getString("applicationId")))
            throw new IllegalArgumentException("This update is for another app.");
        versionCode = json.getInt("versionCode");
        versionName = json.getString("versionName");
        minSdk = json.getInt("minSdk");
        notes = json.optString("notes", "A new Monty version is available.");
        if (versionCode <= 0 || versionName.isEmpty() || versionName.length() > 100 || minSdk < 24)
            throw new IllegalArgumentException("Invalid update version.");
        JSONObject packages = json.getJSONObject("packages");
        JSONObject apk = packages.getJSONObject(arm64 && packages.has("arm64-v8a") ? "arm64-v8a" : "universal");
        url = apk.getString("url");
        sha256 = apk.getString("sha256").toLowerCase(java.util.Locale.ROOT);
        size = apk.getLong("size");
        URI uri = new URI(url);
        URI gateway = new URI(BuildConfig.UPDATE_GATEWAY);
        boolean trustedDownload = ("github.com".equals(uri.getHost()) && uri.getPath().startsWith("/" + repository + "/releases/download/")) ||
            (gateway.getHost().equals(uri.getHost()) && uri.getPath().startsWith("/downloads/"));
        if (!"https".equals(uri.getScheme()) || !trustedDownload ||
            uri.getUserInfo() != null || uri.getPort() != -1 || uri.getQuery() != null || uri.getFragment() != null ||
            !uri.getPath().endsWith(".apk") ||
            !sha256.matches("[a-f0-9]{64}") || size <= 0 || size > 300L * 1024 * 1024)
            throw new IllegalArgumentException("Invalid update download.");
    }
}
