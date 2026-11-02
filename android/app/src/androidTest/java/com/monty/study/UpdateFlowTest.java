package com.monty.study;
import android.app.*;
import android.content.*;
import android.os.*;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.work.*;
import androidx.work.testing.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import java.io.*;
import java.util.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public class UpdateFlowTest {
    private Context context(){return InstrumentationRegistry.getInstrumentation().getTargetContext();}
    @Test public void backgroundNotificationWithoutOpeningMonty()throws Exception {
        Context c=context();
        if(Build.VERSION.SDK_INT>=33)InstrumentationRegistry.getInstrumentation().getUiAutomation().grantRuntimePermission(c.getPackageName(),android.Manifest.permission.POST_NOTIFICATIONS);
        assertTrue("Android notification permission must be granted",UpdateService.notificationsAllowed(c));
        String metadata="{\"schemaVersion\":1,\"applicationId\":\"com.monty.study\",\"versionCode\":999999,\"versionName\":\"background-test\",\"minSdk\":24,\"packages\":{\"universal\":{\"url\":\"https://github.com/Rajneesh26D/monty-android/releases/download/test/test.apk\",\"sha256\":\""+String.join("",Collections.nCopies(64,"a"))+"\",\"size\":100}}}";
        UpdateManifest release=new UpdateManifest(new JSONObject(metadata),BuildConfig.UPDATE_REPOSITORY,c.getPackageName(),false);
        Configuration configuration=new Configuration.Builder().setExecutor(new SynchronousExecutor()).setWorkerFactory(new WorkerFactory(){
            @Override public ListenableWorker createWorker(Context context,String name,WorkerParameters params){
                return new UpdateWorker(context,params){@Override protected void check(Context target)throws Exception{UpdateService.notifyUpdate(target,release);}};
            }
        }).build();
        WorkManagerTestInitHelper.initializeTestWorkManager(c,configuration);
        UpdateService.prefs(c).edit().putBoolean("notifications",true).putInt("notifiedVersion",0).remove("lastBackgroundCheck").commit();
        try{
            UpdateWorker.schedule(c);
            WorkManager manager=WorkManager.getInstance(c);
            List<WorkInfo> works=manager.getWorkInfosForUniqueWork(UpdateWorker.NAME).get();assertEquals(1,works.size());
            UUID id=works.get(0).getId();
            UpdateWorker.schedule(c);
            assertEquals(id,manager.getWorkInfosForUniqueWork(UpdateWorker.NAME).get().get(0).getId());
            TestDriver driver=WorkManagerTestInitHelper.getTestDriver(c);assertNotNull(driver);
            driver.setAllConstraintsMet(id);driver.setPeriodDelayMet(id);
            long until=System.currentTimeMillis()+10000;
            while(UpdateService.prefs(c).getLong("lastBackgroundCheck",0)==0 && System.currentTimeMillis()<until)Thread.sleep(50);
            assertTrue(UpdateService.prefs(c).getLong("lastBackgroundCheck",0)>0);
            boolean found=false;
            until=System.currentTimeMillis()+10000;
            while(!found && System.currentTimeMillis()<until){
                for(android.service.notification.StatusBarNotification notice:c.getSystemService(NotificationManager.class).getActiveNotifications())
                    if(notice.getId()==2001 && notice.getNotification().extras.getString(Notification.EXTRA_TITLE,"").contains("background-test"))found=true;
                if(!found)Thread.sleep(100);
            }
            assertTrue("Worker must post without foreground activity; allowed="+UpdateService.notificationsAllowed(c)+" notifiedVersion="+UpdateService.prefs(c).getInt("notifiedVersion",0),found);
        }finally{UpdateService.prefs(c).edit().putBoolean("notifications",false).commit();UpdateWorker.schedule(c);c.getSystemService(NotificationManager.class).cancel(2001);}
    }
    @Test public void openInstallerFromForegroundActivity()throws Exception {
        Context c=context();
        File directory=new File(c.getCacheDir(),"updates");assertTrue(directory.isDirectory()||directory.mkdirs());
        File apk=new File(directory,"installer-flow-test.apk");
        ParcelFileDescriptor descriptor=InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand("cat /data/local/tmp/monty-installer-test.apk");
        try(InputStream in=new ParcelFileDescriptor.AutoCloseInputStream(descriptor);FileOutputStream out=new FileOutputStream(apk)){FileTransfer.copy(in,out,300L*1024*1024);}
        assertTrue(apk.length()>1000000);
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Activity activity=instrumentation.startActivitySync(new Intent(c,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        instrumentation.waitForIdleSync();
        Intent installer=UpdateService.prepareInstall(c,apk);
        assertEquals(Intent.ACTION_VIEW,installer.getAction());
        assertEquals("content",installer.getData().getScheme());
        assertNotNull(installer.getClipData());
        instrumentation.runOnMainSync(()->{try{UpdateService.launchInstaller(activity,installer);}catch(Exception e){throw new RuntimeException(e);}});
        // Finishing instrumentation tears down its activity/task. Keep it alive
        // while the external UI driver confirms the self-update, which will
        // intentionally terminate this process when Android replaces the APK.
        Bundle ready=new Bundle();ready.putString("stream","\nMONTY_INSTALLER_READY\n");
        instrumentation.sendStatus(0,ready);
        Thread.sleep(90000);
        fail("Android did not replace the app after opening its installer.");
    }
}
