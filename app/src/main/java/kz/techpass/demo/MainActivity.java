package kz.techpass.demo;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class MainActivity extends Activity {
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(24), dp(24), dp(24), dp(24));
        page.setBackgroundColor(0xfff4f3ef);
        TextView title = new TextView(this);
        title.setText("TechPass"); title.setTextSize(30); title.setTextColor(0xff183d32); title.setGravity(Gravity.CENTER);
        page.addView(title, new LinearLayout.LayoutParams(-1, -2));
        TextView note = new TextView(this);
        note.setText("Выберите приложение"); note.setTextSize(16); note.setTextColor(0xff555e58); note.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteParams = new LinearLayout.LayoutParams(-1, -2); noteParams.setMargins(0, dp(8), 0, dp(26)); page.addView(note, noteParams);
        Button technician = button("Приложение техника");
        technician.setOnClickListener(v -> startActivity(new Intent(this, TechnicianActivity.class)));
        page.addView(technician, buttonParams());
        Button registry = button("Реестр специалистов");
        registry.setOnClickListener(v -> startActivity(new Intent(this, RegistryActivity.class)));
        page.addView(registry, buttonParams());
        TextView foot = new TextView(this);
        foot.setText("Демонстрационные данные. Приложение техника и реестр работают отдельно."); foot.setTextSize(12); foot.setTextColor(0xff777f78); foot.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams footParams = new LinearLayout.LayoutParams(-1, -2); footParams.setMargins(0, dp(22), 0, 0); page.addView(foot, footParams);
        setContentView(page);
    }

    private Button button(String text) { Button b = new Button(this); b.setText(text); b.setTextColor(0xffffffff); b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xff183d32)); return b; }
    private LinearLayout.LayoutParams buttonParams() { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(56)); p.setMargins(0, dp(7), 0, dp(7)); return p; }
}
