package com.monty.study;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.provider.Settings;
import android.widget.*;
import android.view.View;
import java.io.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

/** A visible owner for download, permission return, verification and installation. */
public class UpdateActivity extends Activity {
    interface Source {
        UpdateManifest latest(Activity activity)throws Exception;
        File download(Activity activity,UpdateManifest manifest,UpdateService.DownloadProgress progress)throws Exception;
    }
    // A test factory can replace network transport in the target process. No
    // exported component, URL preference or JavaScript option can set this.
    static Source source=new Source(){
        public UpdateManifest latest(Activity activity)throws Exception{return UpdateService.latest(activity);}
        public File download(Activity activity,UpdateManifest manifest,UpdateService.DownloadProgress progress)throws Exception{return UpdateService.download(activity,manifest,progress);}
    };
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final AtomicBoolean running=new AtomicBoolean();
    private TextView status;
    private ProgressBar progress;
    private Button retry;
    private UpdateManifest manifest;
    private File apk;
    private boolean waitingPermission,permissionPaused,installerOpened,installerPaused;
    private boolean returningPermission;
    private long lastProgress;
    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        returningPermission=state!=null&&state.getBoolean("permission",false);
        LinearLayout panel=new LinearLayout(this);panel.setOrientation(LinearLayout.VERTICAL);
        panel.setPadding(24,48,24,24);panel.setBackgroundColor(Color.rgb(246,247,240));
        panel.setOnApplyWindowInsetsListener((view,insets)->{
            int top=Build.VERSION.SDK_INT>=30?insets.getInsets(android.view.WindowInsets.Type.systemBars()).top:insets.getSystemWindowInsetTop();
            int bottom=Build.VERSION.SDK_INT>=30?insets.getInsets(android.view.WindowInsets.Type.systemBars()).bottom:insets.getSystemWindowInsetBottom();
            view.setPadding(24,top+24,24,bottom+24);return insets;
        });
        TextView title=new TextView(this);title.setText("Monty update");title.setTextSize(26);title.setTextColor(Color.rgb(24,65,55));panel.addView(title);
        status=new TextView(this);status.setTextSize(17);status.setPadding(0,24,0,24);panel.addView(status);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(100);progress.setIndeterminate(true);panel.addView(progress);
        retry=new Button(this);retry.setVisibility(View.GONE);panel.addView(retry);
        Button close=new Button(this);close.setText("Back to Monty");close.setOnClickListener(v->finish());panel.addView(close);
        setContentView(panel);check();
    }
    private void show(String stage,String text){
        UpdateService.prefs(this).edit().putString("updateStage",stage).putString("installMessage",text).apply();
        if(isFinishing()||isDestroyed())return;
        runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())status.setText(text);});
    }
    private void error(Exception error){
        String reason=error.getMessage()==null?error.getClass().getSimpleName():error.getMessage();
        show("error","Update could not finish: "+reason+". Your existing app and study data are kept.");
        runOnUiThread(()->{if(isFinishing()||isDestroyed())return;progress.setIndeterminate(false);retry.setText("Retry update");retry.setVisibility(View.VISIBLE);retry.setOnClickListener(v->check());});
    }
    private void check(){
        if(!running.compareAndSet(false,true))return;
        retry.setVisibility(View.GONE);progress.setIndeterminate(true);show("checking","Checking the latest Monty release…");
        executor.execute(()->{
            try{
                manifest=source.latest(this);
                long installed=UpdateService.installedCode(this);
                if(manifest.versionCode<=installed){show("current","Monty is up to date.");runOnUiThread(()->progress.setIndeterminate(false));running.set(false);return;}
                if(manifest.minSdk>Build.VERSION.SDK_INT)throw new IOException("This release needs a newer Android version");
                running.set(false);
                runOnUiThread(()->{if(isFinishing()||isDestroyed())return;if(needsPermission())permission(!returningPermission);else download();});
            }catch(Exception e){running.set(false);error(e);}
        });
    }
    private boolean needsPermission(){return Build.VERSION.SDK_INT>=26&&!getPackageManager().canRequestPackageInstalls();}
    private void permission(boolean open){
        show("permission","Allow Monty to install updates in Android settings, then return here. The download will continue automatically.");
        retry.setText("Allow installation");retry.setVisibility(View.VISIBLE);retry.setOnClickListener(v->permission(true));
        if(open){waitingPermission=true;permissionPaused=false;startActivityForResult(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,Uri.parse("package:"+getPackageName())),42);}
    }
    private void download(){
        if(!running.compareAndSet(false,true))return;
        retry.setVisibility(View.GONE);show("downloading","Downloading Monty "+manifest.versionName+"…");progress.setIndeterminate(false);
        executor.execute(()->{
            try{
                apk=source.download(this,manifest,(bytes,total)->{
                    if(Thread.currentThread().isInterrupted())throw new InterruptedIOException("Download paused");
                    long now=android.os.SystemClock.uptimeMillis();if(now-lastProgress<200&&bytes!=total)return;lastProgress=now;
                    show("downloading",String.format(java.util.Locale.ROOT,"Downloading Monty %s · %.1f / %.1f MB",manifest.versionName,bytes/1048576.0,total/1048576.0));
                    runOnUiThread(()->{if(!isFinishing()&&!isDestroyed())progress.setProgress((int)(100*bytes/Math.max(1,total)));});
                });
                show("verifying","Verifying the update’s version and signing key…");
                UpdateService.verifyPackage(this,apk,manifest);
                Intent installer=UpdateService.prepareInstall(this,apk);
                runOnUiThread(()->openInstaller(installer));
            }catch(Exception e){error(e);}finally{running.set(false);}
        });
    }
    private void openInstaller(Intent intent){
        if(isFinishing()||isDestroyed())return;
        try{
            if(needsPermission()){permission(true);return;}
            show("confirmation","Tap Update in Android’s installer to complete installation.");
            installerOpened=true;installerPaused=false;
            UpdateService.launchInstaller(this,intent);
        }catch(Exception e){error(e);}
    }
    @Override protected void onPause(){super.onPause();if(waitingPermission)permissionPaused=true;if(installerOpened)installerPaused=true;}
    @Override protected void onResume(){
        super.onResume();
        if(waitingPermission&&permissionPaused){waitingPermission=false;permissionPaused=false;returningPermission=true;if(!needsPermission())download();else permission(false);}
        else if(installerOpened&&installerPaused){
            installerOpened=false;installerPaused=false;
            show("confirmation","If Android did not finish installation, tap Open installer again. The verified APK is saved inside Monty.");
            retry.setText("Open installer again");retry.setVisibility(View.VISIBLE);
            retry.setOnClickListener(v->executor.execute(()->{try{Intent intent=UpdateService.prepareInstall(this,apk);runOnUiThread(()->openInstaller(intent));}catch(Exception e){error(e);}}));
        }
    }
    @Override protected void onSaveInstanceState(Bundle state){state.putBoolean("permission",waitingPermission);super.onSaveInstanceState(state);}
    @Override protected void onDestroy(){executor.shutdownNow();super.onDestroy();}
}
