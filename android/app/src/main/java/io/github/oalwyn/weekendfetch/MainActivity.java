package io.github.oalwyn.weekendfetch;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WFCalendarPlugin.class);   // "Add to Calendar" (src/native_app.js)
        super.onCreate(savedInstanceState);
    }
}
