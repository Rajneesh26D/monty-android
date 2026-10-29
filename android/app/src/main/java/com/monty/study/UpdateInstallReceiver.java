package com.monty.study;
import android.content.*;
import android.content.pm.PackageInstaller;

public class UpdateInstallReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        int status=intent.getIntExtra(PackageInstaller.EXTRA_STATUS,PackageInstaller.STATUS_FAILURE);
        String message;
        if(status==PackageInstaller.STATUS_PENDING_USER_ACTION) {
            message="Approve the update in Android's installer.";
            Intent approval=intent.getParcelableExtra(Intent.EXTRA_INTENT);
            if(approval!=null) {
                approval.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {context.startActivity(approval);}catch(Exception e){message="Return to Monty and retry the installation approval.";}
            }
        } else if(status==PackageInstaller.STATUS_SUCCESS) message="Update installed successfully.";
        else message="Android could not install the update ("+status+"): "+intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)+". Keep Monty installed; your data is retained.";
        UpdateService.prefs(context).edit().putInt("installStatus",status).putString("installMessage",message).apply();
    }
}
