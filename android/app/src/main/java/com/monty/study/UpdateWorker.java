package com.monty.study;

import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

public class UpdateWorker extends Worker {
    static final String NAME = "monty-release-check";
    public UpdateWorker(@NonNull Context context, @NonNull WorkerParameters params) { super(context, params); }
    static void schedule(Context c) {
        if (!UpdateService.prefs(c).getBoolean("notifications", false)) {
            WorkManager.getInstance(c).cancelUniqueWork(NAME); return;
        }
        UpdateService.channel(c);
        PeriodicWorkRequest work = new PeriodicWorkRequest.Builder(UpdateWorker.class, 6, TimeUnit.HOURS)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.MINUTES).build();
        WorkManager.getInstance(c).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, work);
    }
    @NonNull @Override public Result doWork() {
        if (!UpdateService.prefs(getApplicationContext()).getBoolean("notifications", false)) return Result.success();
        try { UpdateService.latest(getApplicationContext()); return Result.success(); }
        catch (Exception e) { return getRunAttemptCount() < 3 ? Result.retry() : Result.success(); }
    }
}
