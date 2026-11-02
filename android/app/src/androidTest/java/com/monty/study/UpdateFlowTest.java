package com.monty.study;
import android.app.*;
import android.content.*;
import android.os.*;
import android.view.accessibility.AccessibilityNodeInfo;
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
    private AccessibilityNodeInfo installButton(AccessibilityNodeInfo node){
        if(node==null)return null;
        String text=String.valueOf(node.getText()), pkg=String.valueOf(node.getPackageName());
        if((pkg.contains("packageinstaller")||pkg.contains("permissioncontroller")) && node.isEnabled() && node.isClickable() &&
            ("update".equalsIgnoreCase(text)||"install".equalsIgnoreCase(text)))return node;
        for(int i=0;i<node.getChildCount();i++){AccessibilityNodeInfo found=installButton(node.getChild(i));if(found!=null)return found;}
        return null;
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
        // Use this instrumentation's accessibility connection for the real
        // installer UI; a second shell UIAutomator connection would conflict.
        AccessibilityNodeInfo button=null;
        long until=SystemClock.uptimeMillis()+20000;
        while(button==null && SystemClock.uptimeMillis()<until){
            button=installButton(instrumentation.getUiAutomation().getRootInActiveWindow());
            if(button==null)Thread.sleep(100);
        }
        assertNotNull("Monty must open Android's real Install/Update confirmation",button);
        Bundle ready=new Bundle();ready.putString("stream","\nMONTY_INSTALLER_READY: "+button.getPackageName()+" / "+button.getText()+"\n");
        instrumentation.sendStatus(0,ready);
        assertTrue("Android installer button must accept confirmation",button.performAction(AccessibilityNodeInfo.ACTION_CLICK));
        // Successful replacement intentionally terminates this instrumentation.
        Thread.sleep(90000);
        fail("Android did not replace the app after opening its installer.");
    }
}
