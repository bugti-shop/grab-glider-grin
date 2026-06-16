package nota.npd.com.widgets;

import android.content.Intent;
import android.widget.RemoteViewsService;

public class TasksListRemoteViewsService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new TasksListRemoteViewsFactory(getApplicationContext());
    }
}