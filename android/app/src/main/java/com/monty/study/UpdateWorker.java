package com.monty.study;
import android.content.Context;
import androidx.annotation.NonNull;
import androidx.work.*;
import java.util.concurrent.TimeUnit;
public class UpdateWorker extends Worker {
    static final String NAME="monty-release-check", NOW="monty-release-check-now";
    public UpdateWorker(@NonNull Context context,@NonNull WorkerParameters params){super(context,params);}
    static void schedule(Context c){
        WorkManager manager=WorkManager.getInstance(c);
        if(!UpdateService.prefs(c).getBoolean("notifications",false)){
            manager.cancelUniqueWork(NAME);manager.cancelUniqueWork(NOW);return;
        }
        UpdateService.channel(c);
        Constraints network=new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
        PeriodicWorkRequest work=new PeriodicWorkRequest.Builder(UpdateWorker.class,15,TimeUnit.MINUTES)
            .setConstraints(network).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,1,TimeUnit.MINUTES).build();
        // UPDATE migrates the old six-hour work instead of retaining it forever.
        manager.enqueueUniquePeriodicWork(NAME,ExistingPeriodicWorkPolicy.UPDATE,work);
        manager.enqueueUniqueWork(NOW,ExistingWorkPolicy.KEEP,new OneTimeWorkRequest.Builder(UpdateWorker.class)
            .setConstraints(network).setBackoffCriteria(BackoffPolicy.EXPONENTIAL,1,TimeUnit.MINUTES).build());
    }
    protected void check(Context context)throws Exception{UpdateService.latest(context);}
    @NonNull @Override public Result doWork(){
        Context c=getApplicationContext();
        if(!UpdateService.prefs(c).getBoolean("notifications",false))return Result.success();
        UpdateService.prefs(c).edit().putLong("backgroundLastAttempt",System.currentTimeMillis()).apply();
        try{
            check(c);
            UpdateService.prefs(c).edit().putLong("lastBackgroundCheck",System.currentTimeMillis()).remove("backgroundError").apply();
            return Result.success();
        }catch(Exception e){
            UpdateService.prefs(c).edit().putString("backgroundError","Background check could not reach the update service; it will retry.").apply();
            return getRunAttemptCount()<3?Result.retry():Result.success();
        }
    }
}
