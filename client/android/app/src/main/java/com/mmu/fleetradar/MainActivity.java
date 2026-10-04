package com.mmu.fleetradar;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int LOCATION_PERMISSION_REQUEST = 1001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ensure app is not fullscreen: clear any fullscreen flags and fit system windows
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        // Without an explicit runtime request, navigator.geolocation.watchPosition
        // in the WebView always fails with PERMISSION_DENIED even when the
        // phone's location toggle is ON — this was why driver/student pins
        // never appeared. Ask up-front on every launch until granted.
        requestLocationPermissionsIfNeeded();
    }

    private void requestLocationPermissionsIfNeeded() {
        boolean fineGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        boolean coarseGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
        if (!fineGranted || !coarseGranted) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                    },
                    LOCATION_PERMISSION_REQUEST
            );
        }
    }
}
