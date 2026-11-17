package io.github.oalwyn.weekendfetch;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Calendar;
import java.util.TimeZone;

/**
 * "Add to Calendar" on Android: opens the phone's calendar app on a new event, filled in.
 * Same call as the iPhone plugin (ios/App/App/WFCalendarPlugin.swift), so src/native_app.js works on both.
 * No calendar permission is needed: the person saves (or cancels) in their calendar app.
 */
@CapacitorPlugin(name = "WFCalendar")
public class WFCalendarPlugin extends Plugin {

    @PluginMethod
    public void addEvent(PluginCall call) {
        boolean allDay = Boolean.TRUE.equals(call.getBoolean("allDay", false));
        long start = call.getData().optLong("start", System.currentTimeMillis());
        long end = call.getData().optLong("end", start);
        if (allDay) {
            // calendar apps expect all-day events at UTC midnight, ending the next day
            Calendar local = Calendar.getInstance();
            local.setTimeInMillis(start);
            Calendar utc = Calendar.getInstance(TimeZone.getTimeZone("UTC"));
            utc.clear();
            utc.set(local.get(Calendar.YEAR), local.get(Calendar.MONTH), local.get(Calendar.DAY_OF_MONTH));
            start = utc.getTimeInMillis();
            end = start + 24L * 60 * 60 * 1000;
        }
        Intent i = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, call.getString("title", ""))
            .putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("location", ""))
            .putExtra(CalendarContract.Events.DESCRIPTION, call.getString("notes", ""))
            .putExtra(CalendarContract.EXTRA_EVENT_ALL_DAY, allDay)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end);
        try {
            getActivity().startActivity(i);
            JSObject r = new JSObject();
            r.put("opened", true);   // Android doesn't say whether it was saved
            call.resolve(r);
        } catch (ActivityNotFoundException e) {
            call.reject("No calendar app");
        }
    }
}
