package com.monty.study;
import android.content.*;
public class UpdateScheduleReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent){
        if(Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())||Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction()))
            UpdateWorker.schedule(context);
    }
}
