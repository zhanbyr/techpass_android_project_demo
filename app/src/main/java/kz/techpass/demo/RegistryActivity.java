package kz.techpass.demo;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.MultiFormatWriter;
import com.google.zxing.WriterException;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import com.google.zxing.common.BitMatrix;

import android.database.Cursor;

import java.io.OutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

public class RegistryActivity extends Activity {
    private RegistryDbHelper db;
    private LinearLayout list;
    private EditText search;
    private Bitmap pendingQr;
    private String pendingQrId;
    private String role="IT_ADMIN";
    private List<List<String>> importSheet;
    private String importFileName;
    private List<RegistryDbHelper.ImportRow> importReadyRows;
    private int importRejected;
    private final int saveQrRequest = 741;
    private int dp(float value) { return Math.round(value * getResources().getDisplayMetrics().density); }

    @Override public void onCreate(Bundle state) { super.onCreate(state); db = new RegistryDbHelper(this); render(); }
    @Override protected void onDestroy() { if (db != null) db.close(); super.onDestroy(); }

    private void render() {
        LinearLayout page = new LinearLayout(this); page.setOrientation(LinearLayout.VERTICAL); page.setBackgroundColor(0xfff4f3ef);
        LinearLayout header = new LinearLayout(this); header.setGravity(Gravity.CENTER_VERTICAL); header.setPadding(dp(16),dp(12),dp(16),dp(12)); header.setBackgroundColor(0xff183d32);
        TextView title = new TextView(this); title.setText("РЕЕСТР · ДЕМО"); title.setTextColor(Color.WHITE); title.setTextSize(17); title.setTypeface(null,1); header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Spinner roles=new Spinner(this);String[] roleNames={"IT_ADMIN","SECURITY_MANAGER","TECHNICIAN","USER"};roles.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,roleNames));roles.setSelection(java.util.Arrays.asList(roleNames).indexOf(role));roles.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){}public void onItemSelected(android.widget.AdapterView<?> p,View v,int position,long row){role=roleNames[position];renderRows();}});header.addView(roles,new LinearLayout.LayoutParams(dp(140),dp(48)));
        Button home = smallButton("Домой"); home.setOnClickListener(v -> finish()); header.addView(home); page.addView(header);
        LinearLayout tools = new LinearLayout(this); tools.setPadding(dp(12),dp(9),dp(12),dp(5)); tools.setOrientation(LinearLayout.VERTICAL);
        search = new EditText(this); search.setSingleLine(true); search.setHint("Поиск: ФИО, EMP-ID, номер, компания, направление"); tools.addView(search,new LinearLayout.LayoutParams(-1,dp(52)));
        LinearLayout actions = new LinearLayout(this); Button add=smallButton("+ Сотрудник"); add.setVisibility("IT_ADMIN".equals(role)?View.VISIBLE:View.GONE);add.setOnClickListener(v->addEmployeeDialog()); actions.addView(add,new LinearLayout.LayoutParams(0,dp(48),1)); Button scan=smallButton("Сканировать QR"); scan.setOnClickListener(v->new IntentIntegrator(this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE).setPrompt("Наведите камеру на QR с EMP-ID").setBeepEnabled(false).setOrientationLocked(false).initiateScan()); LinearLayout.LayoutParams ap=new LinearLayout.LayoutParams(0,dp(48),1); ap.setMargins(dp(8),0,0,0); actions.addView(scan,ap); tools.addView(actions);
        Button excel=smallButton("Импорт сотрудников из Excel (.xlsx)");excel.setVisibility("IT_ADMIN".equals(role)?View.VISIBLE:View.GONE);excel.setOnClickListener(v->{Intent pick=new Intent(Intent.ACTION_OPEN_DOCUMENT);pick.addCategory(Intent.CATEGORY_OPENABLE);pick.setType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");startActivityForResult(pick,742);});LinearLayout.LayoutParams ep=new LinearLayout.LayoutParams(-1,dp(44));ep.setMargins(0,dp(5),0,0);tools.addView(excel,ep);
        Button approvals=smallButton("Справочники · согласования · журнал");approvals.setOnClickListener(v->{if("IT_ADMIN".equals(role))showDictionaries();else if("SECURITY_MANAGER".equals(role))showApprovals();else showAudit();});LinearLayout.LayoutParams rp=new LinearLayout.LayoutParams(-1,dp(45));rp.setMargins(0,dp(6),0,0);tools.addView(approvals,rp);page.addView(tools);
        ScrollView scroll = new ScrollView(this); list = new LinearLayout(this); list.setOrientation(LinearLayout.VERTICAL); list.setPadding(dp(12),dp(6),dp(12),dp(20)); scroll.addView(list); page.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        TextView foot=new TextView(this); foot.setText("Локальная SQLite база · демонстрационные данные · роли не являются серверной защитой"); foot.setTextSize(11); foot.setTextColor(0xff69736c); foot.setGravity(Gravity.CENTER); foot.setPadding(dp(12),dp(8),dp(12),dp(12)); page.addView(foot);
        setContentView(page); search.addTextChangedListener(new android.text.TextWatcher(){public void beforeTextChanged(CharSequence s,int st,int c,int a){} public void onTextChanged(CharSequence s,int start,int before,int count){renderRows();}public void afterTextChanged(android.text.Editable e){}}); renderRows();
    }

    private void renderRows() {
        if (list == null) return; list.removeAllViews(); Cursor c = db.employees(search == null ? "" : search.getText().toString());
        while(c.moveToNext()) {
            final String id=c.getString(0), name=c.getString(1), number=c.getString(2), company=c.getString(5), status=c.getString(4);
            if("TECHNICIAN".equals(role)&&!"EMP-000001".equals(id))continue;
            LinearLayout card=new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL); card.setPadding(dp(15),dp(13),dp(15),dp(11)); card.setBackgroundColor(Color.WHITE); card.setElevation(dp(1)); LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-1,-2); cp.setMargins(0,0,0,dp(10)); list.addView(card,cp);
            TextView heading=new TextView(this); heading.setText(name); heading.setTextColor(0xff202820); heading.setTypeface(null,1); heading.setTextSize(17); card.addView(heading);
            TextView info=new TextView(this); info.setText(id+" · "+company+"\nДемо-номер: "+number+" · "+("active".equals(status)?"Активен":"Неактивен")); info.setTextColor(0xff5b665e); info.setTextSize(13); info.setPadding(0,dp(5),0,dp(9)); card.addView(info);
            LinearLayout row=new LinearLayout(this); Button profile=smallButton("Профиль"); profile.setOnClickListener(v->showProfile(id)); row.addView(profile); Button qr=smallButton("Показать QR"); LinearLayout.LayoutParams qp=new LinearLayout.LayoutParams(-2,dp(44)); qp.setMargins(dp(7),0,0,0); row.addView(qr,qp); qr.setOnClickListener(v->showQr(id,name)); card.addView(row);
        }
        if("TECHNICIAN".equals(role)&&list.getChildCount()==0){TextView empty=new TextView(this);empty.setText("Собственный профиль EMP-000001 не найден.");empty.setTextColor(0xff69736c);list.addView(empty);}
        c.close();
    }

    private void showProfile(String id) {
        if("TECHNICIAN".equals(role)&&!"EMP-000001".equals(id)){toast("Для роли TECHNICIAN доступен только собственный профиль.");return;}
        Cursor c=db.employee(id); if(!c.moveToFirst()){c.close();toast("Сотрудник не найден");return;}
        String name=c.getString(1), number=c.getString(2), companyId=c.getString(3), status=c.getString(4), created=c.getString(5), comments=c.getString(6), company=c.getString(7); c.close();
        StringBuilder text=new StringBuilder(name).append("\nВнутренний ID: ").append(id).append("\nДемо-номер: ").append(number).append("\nКомпания: ").append(company).append("\nСтатус: ").append("active".equals(status)?"Активен":"Неактивен").append("\nДобавлен: ").append(created).append("\n\nИстория назначений:");
        Cursor a=db.assignments(id); while(a.moveToNext()) text.append("\n• ").append(a.getString(2)).append(" · ").append(a.getString(1)).append(" · ").append("active".equals(a.getString(5))?"активно":"закрыто").append(" · ").append(a.getString(3)).append(a.getString(4)==null?"":" — "+a.getString(4)); a.close(); if(comments!=null&&!comments.isEmpty())text.append("\n\nКомментарий: ").append(comments);
        LinearLayout content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(20),dp(10),dp(20),dp(4)); TextView body=new TextView(this); body.setText(text.toString()); body.setTextSize(15); body.setTextColor(0xff202820); content.addView(body);
        AlertDialog dialog=new AlertDialog.Builder(this).setTitle("Профиль сотрудника").setView(content).setPositiveButton("Закрыть",null).setNeutralButton("Редактировать",null).setNegativeButton("Изменить статус",null).create(); dialog.setOnShowListener(x->{if(!"IT_ADMIN".equals(role)){dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setVisibility(View.GONE);dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setVisibility(View.GONE);}dialog.getButton(AlertDialog.BUTTON_NEUTRAL).setOnClickListener(v->{dialog.dismiss();addEmployeeDialog(id);});dialog.getButton(AlertDialog.BUTTON_NEGATIVE).setOnClickListener(v->{boolean active="active".equals(status); try{db.setEmployeeStatus(id,!active);dialog.dismiss();renderRows();showProfile(id);}catch(Exception e){toast(e.getMessage());}});});dialog.show();
    }

    private void addEmployeeDialog() { addEmployeeDialog(null); }

    private void addEmployeeDialog(String employeeId) {
        Cursor companiesCursor=db.companies(); List<String> companyIds=new ArrayList<>(), companyNames=new ArrayList<>(), companyPolicies=new ArrayList<>();List<Integer> companyMaxima=new ArrayList<>(); while(companiesCursor.moveToNext()){companyIds.add(companiesCursor.getString(0));companyNames.add(companiesCursor.getString(1));companyPolicies.add(companiesCursor.getString(2));companyMaxima.add(companiesCursor.getInt(3));}companiesCursor.close();
        Cursor directionsCursor=db.directions(); List<String> directionIds=new ArrayList<>(), directionNames=new ArrayList<>(); while(directionsCursor.moveToNext()){directionIds.add(directionsCursor.getString(0));directionNames.add(directionsCursor.getString(1));}directionsCursor.close();
        LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(20),dp(5),dp(20),0);EditText name=new EditText(this);name.setHint("ФИО");form.addView(name);Spinner company=new Spinner(this);company.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,companyNames));form.addView(company);TextView policy=new TextView(this);policy.setTextColor(0xff69736c);policy.setTextSize(12);form.addView(policy);Button choose=new Button(this);choose.setText("Выбрать направления");form.addView(choose);
        final List<String> selectedIds=new ArrayList<>();
        if(employeeId!=null){Cursor current=db.employee(employeeId);if(current.moveToFirst()){name.setText(current.getString(1));int index=companyIds.indexOf(current.getString(3));if(index>=0)company.setSelection(index);}current.close();Cursor assigned=db.assignments(employeeId);while(assigned.moveToNext())if("active".equals(assigned.getString(5)))selectedIds.add(assigned.getString(6));assigned.close();}
        Runnable updatePolicy=()->{int ci=Math.max(0,company.getSelectedItemPosition());List<String> keep=new ArrayList<>();for(String id:selectedIds)if(companyPolicies.get(ci).contains(id))keep.add(id);selectedIds.clear();selectedIds.addAll(keep);policy.setText("Разрешены: "+companyPolicies.get(ci).replace(',', ' ') +" · максимум "+companyMaxima.get(ci));};
        company.setOnItemSelectedListener(new android.widget.AdapterView.OnItemSelectedListener(){public void onNothingSelected(android.widget.AdapterView<?> p){} public void onItemSelected(android.widget.AdapterView<?> p,View v,int position,long row){updatePolicy.run();}});
        choose.setOnClickListener(v->{int ci=company.getSelectedItemPosition();List<Integer> availableIndexes=new ArrayList<>();List<String> labels=new ArrayList<>();List<Boolean> checked=new ArrayList<>();for(int i=0;i<directionIds.size();i++)if(companyPolicies.get(ci).contains(directionIds.get(i))){availableIndexes.add(i);labels.add(directionNames.get(i));checked.add(selectedIds.contains(directionIds.get(i)));}boolean[] flags=new boolean[checked.size()];for(int i=0;i<flags.length;i++)flags[i]=checked.get(i);new AlertDialog.Builder(this).setTitle("Направления работ").setMultiChoiceItems(labels.toArray(new String[0]),flags,(dialog,which,isChecked)->{int cap=companyMaxima.get(ci);int count=0;for(boolean flag:flags)if(flag)count++;if(isChecked&&!flags[which]&&count>=cap){((AlertDialog)dialog).getListView().setItemChecked(which,false);toast("Для этой компании максимум "+cap+" направления.");}else flags[which]=isChecked;}).setPositiveButton("Сохранить",(dialog,which)->{selectedIds.clear();for(int i=0;i<flags.length;i++)if(flags[i])selectedIds.add(directionIds.get(availableIndexes.get(i)));}).setNegativeButton("Отмена",null).show();});
        if(employeeId==null&&selectedIds.isEmpty()) selectedIds.add("DIR-FACE");
        updatePolicy.run();
        new AlertDialog.Builder(this).setTitle(employeeId==null?"Новый сотрудник":"Редактировать сотрудника").setView(form).setPositiveButton(employeeId==null?"Добавить":"Сохранить",(dialog,which)->{try{String id;if(employeeId==null)id=db.createEmployee(name.getText().toString(),companyIds.get(company.getSelectedItemPosition()),selectedIds);else{id=employeeId;db.updateEmployee(id,name.getText().toString(),companyIds.get(company.getSelectedItemPosition()),selectedIds);}renderRows();showProfile(id);}catch(Exception e){toast(e.getMessage());}}).setNegativeButton("Отмена",null).show();
    }

    private void readXlsx(Uri uri){try(InputStream input=getContentResolver().openInputStream(uri)){if(input==null)throw new IllegalArgumentException("Не удалось открыть файл.");importSheet=XlsxReader.read(input);if(importSheet.size()<2||importSheet.get(0).isEmpty())throw new IllegalArgumentException("Нужна строка заголовков и хотя бы одна строка с данными.");importFileName=uri.getLastPathSegment();showImportMapping();}catch(Exception e){toast("Не удалось прочитать Excel: "+e.getMessage());}}

    private void showImportMapping(){List<String> headers=importSheet.get(0);String[] fields={"ФИО · обязательно","Компания · обязательно","Направления · обязательно","Демо-номер · необязательно","Статус · необязательно"};String[][] hints={{"фио","имя","сотрудник","name"},{"компан","подряд","company"},{"направ","работ","scope","direction"},{"номер","идентифик","iin","иин"},{"статус","status"}};int[] mapping=new int[fields.length];List<Spinner> selectors=new ArrayList<>();LinearLayout form=new LinearLayout(this);form.setOrientation(LinearLayout.VERTICAL);form.setPadding(dp(18),dp(6),dp(18),0);
        List<String> options=new ArrayList<>();options.add("— не сопоставлять —");for(int i=0;i<headers.size();i++)options.add(headers.get(i).isEmpty()?"Столбец "+(i+1):headers.get(i));
        for(int i=0;i<fields.length;i++){TextView label=new TextView(this);label.setText(fields[i]);label.setTextColor(0xff354239);label.setPadding(0,dp(6),0,0);form.addView(label);Spinner selector=new Spinner(this);selector.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,options));int found=-1;for(int j=0;j<headers.size();j++){String value=headers.get(j).toLowerCase(java.util.Locale.ROOT);for(String hint:hints[i])if(value.contains(hint)){found=j;break;}if(found>=0)break;}selector.setSelection(found+1);selectors.add(selector);form.addView(selector);}
        new AlertDialog.Builder(this).setTitle("Сопоставление столбцов").setMessage("Файл: "+importFileName+" · строк данных: "+(importSheet.size()-1)).setView(form).setPositiveButton("Проверить и показать",(d,w)->{for(int i=0;i<mapping.length;i++)mapping[i]=selectors.get(i).getSelectedItemPosition()-1;createXlsxPreview(mapping);}).setNegativeButton("Отмена",null).show();}

    private void createXlsxPreview(int[] mapping){if(mapping[0]<0||mapping[1]<0||mapping[2]<0){toast("Сопоставьте ФИО, компанию и направления.");return;}List<RegistryDbHelper.ImportRow> valid=new ArrayList<>();List<String> report=new ArrayList<>();java.util.Set<String> seenPeople=new java.util.HashSet<>(),seenNumbers=new java.util.HashSet<>();importRejected=0;
        for(int rowIndex=1;rowIndex<importSheet.size();rowIndex++){List<String> cells=importSheet.get(rowIndex);String name=value(cells,mapping[0]),companyValue=value(cells,mapping[1]),directionValue=value(cells,mapping[2]),number=mapping[3]<0?"":value(cells,mapping[3]),statusValue=mapping[4]<0?"":value(cells,mapping[4]);if(name.trim().isEmpty()&&companyValue.trim().isEmpty()&&directionValue.trim().isEmpty())continue;String error=null;String companyId=null,allowed="";int max=0;
            if(name.trim().length()<3)error="Не указано корректное ФИО.";
            companyId=db.findCompanyId(companyValue.trim());if(companyId!=null){Cursor company=db.getReadableDatabase().rawQuery("SELECT allowed,max_directions FROM companies WHERE id=?",new String[]{companyId});if(company.moveToFirst()){allowed=company.getString(0);max=company.getInt(1);}company.close();}if(companyId==null&&error==null)error="Компания не найдена.";
            List<String> directionIds=new ArrayList<>();for(String token:directionValue.split("[;,|]+")){String clean=token.trim();if(clean.isEmpty())continue;String directionId=db.directionIdForName(clean);if(directionId!=null)directionIds.add(directionId);else if(error==null)error="Неизвестное направление: "+clean;}
            java.util.Set<String> permitted=new java.util.HashSet<>(java.util.Arrays.asList(allowed.split(",")));if(directionIds.isEmpty()&&error==null)error="Укажите направления.";if(directionIds.size()>Math.min(3,max)&&error==null)error="Превышен лимит направлений компании.";for(String id:directionIds)if(!permitted.contains(id)&&error==null)error="Направление запрещено политикой компании.";
            String personKey=name.trim().toLowerCase(java.util.Locale.ROOT)+"|"+(companyId==null?companyValue:companyId).toLowerCase(java.util.Locale.ROOT);if(companyId!=null&&db.employeeNameExistsInCompany(name.trim(),companyId)&&error==null)error="Такой сотрудник уже есть в компании.";if(seenPeople.contains(personKey)&&error==null)error="ФИО компании повторяется в файле.";
            if(!number.isEmpty()){if(!number.matches("\\d{12}")&&error==null)error="Демо-номер должен содержать 12 цифр.";boolean exists=db.demoNumberExists(number);if((exists||seenNumbers.contains(number))&&error==null)error="Демо-номер уже используется.";}
            String status="active";String normalized=statusValue.trim().toLowerCase(java.util.Locale.ROOT);if(!normalized.isEmpty()){if(normalized.equals("inactive")||normalized.equals("неактивен")||normalized.equals("неактивна")||normalized.equals("уволен")||normalized.equals("уволена"))status="inactive";else if(!normalized.equals("active")&&!normalized.equals("активен")&&!normalized.equals("активна")&&!normalized.equals("работает")&&error==null)error="Неизвестный статус.";}
            if(error==null){seenPeople.add(personKey);if(!number.isEmpty())seenNumbers.add(number);valid.add(new RegistryDbHelper.ImportRow(name.trim(),companyId,directionIds,number,status));report.add("✓ Строка "+(rowIndex+1)+": "+name.trim());}else{importRejected++;report.add("✗ Строка "+(rowIndex+1)+": "+name+" — "+error);}}
        importReadyRows=valid;StringBuilder text=new StringBuilder("Будет добавлено: ").append(valid.size()).append("\nОшибки/дубли: ").append(importRejected).append("\n\n");for(int i=0;i<report.size()&&i<35;i++)text.append(report.get(i)).append('\n');if(report.size()>35)text.append("… ещё ").append(report.size()-35).append(" строк.");AlertDialog.Builder dialog=new AlertDialog.Builder(this).setTitle("Предварительный просмотр Excel").setMessage(text.toString()).setNegativeButton("Отмена",null);if(!valid.isEmpty())dialog.setPositiveButton("Импортировать "+valid.size(),(d,w)->{try{List<String> ids=db.importEmployees(importReadyRows,importFileName,importRejected);renderRows();new AlertDialog.Builder(this).setTitle("Импорт завершён").setMessage("Добавлено: "+ids.size()+"\nОтклонено: "+importRejected+"\nДанные сохранены в SQLite на этом устройстве.").setPositiveButton("Готово",null).show();}catch(Exception e){toast("Импорт отменён, данные не изменены: "+e.getMessage());}});dialog.show();}
    private String value(List<String> row,int index){return index<0||index>=row.size()?"":row.get(index).trim();}

    private void showQr(String id,String name) {
        try { BitMatrix matrix=new MultiFormatWriter().encode(id,BarcodeFormat.QR_CODE,720,720);Bitmap bmp=Bitmap.createBitmap(720,720,Bitmap.Config.ARGB_8888);for(int x=0;x<720;x++)for(int y=0;y<720;y++)bmp.setPixel(x,y,matrix.get(x,y)?Color.BLACK:Color.WHITE);pendingQr=bmp;pendingQrId=id;
            LinearLayout wrap=new LinearLayout(this);wrap.setOrientation(LinearLayout.VERTICAL);wrap.setGravity(Gravity.CENTER);wrap.setPadding(dp(16),dp(10),dp(16),dp(8));ImageView image=new ImageView(this);image.setImageBitmap(bmp);wrap.addView(image,new LinearLayout.LayoutParams(dp(270),dp(270)));TextView caption=new TextView(this);caption.setText(name+"\n"+id+"\nQR содержит только EMP-ID");caption.setGravity(Gravity.CENTER);caption.setTextColor(0xff354239);wrap.addView(caption);
            new AlertDialog.Builder(this).setTitle("QR профиля").setView(wrap).setPositiveButton("Сохранить PNG",(d,w)->{Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType("image/png");intent.putExtra(Intent.EXTRA_TITLE,id+"-qr.png");startActivityForResult(intent,saveQrRequest);}).setNegativeButton("Закрыть",null).show();
        } catch(WriterException e){toast("Не удалось сгенерировать QR-код");}
    }

    private void requestApprovalDialog(String id,String name){if(!"IT_ADMIN".equals(role)){toast("Запросы инициирует IT_ADMIN.");return;}EditText input=new EditText(this);input.setHint("Например: запрос на специальный просмотр");new AlertDialog.Builder(this).setTitle("Запрос специальных прав · "+name).setView(input).setPositiveButton("Отправить",(d,w)->{try{db.requestApproval(id,input.getText().toString(),"demo-it-admin");toast("Запрос передан SECURITY_MANAGER.");}catch(Exception e){toast(e.getMessage());}}).setNegativeButton("Отмена",null).show();}

    private void showDictionaries(){String[] options={"Просмотреть компании и ограничения","Добавить компанию","Просмотреть направления","Добавить направление","Журнал действий"};new AlertDialog.Builder(this).setTitle("Справочники · IT_ADMIN").setItems(options,(d,index)->{if(index==0)showCompanies();else if(index==1)addCompanyDialog();else if(index==2)showDirections();else if(index==3)addDirectionDialog();else showAudit();}).setNegativeButton("Закрыть",null).show();}
    private void showCompanies(){Cursor c=db.companies();StringBuilder text=new StringBuilder();while(c.moveToNext())text.append(c.getString(1)).append(" · ").append(c.getString(0)).append("\nРазрешено: ").append(c.getString(2).replace(',', ' ')).append(" · макс. ").append(c.getInt(3)).append(" · ").append(c.getString(4)).append("\n\n");c.close();new AlertDialog.Builder(this).setTitle("Компании и политики").setMessage(text.toString()).setPositiveButton("Закрыть",null).show();}
    private void showDirections(){Cursor c=db.directions();StringBuilder text=new StringBuilder();while(c.moveToNext())text.append(c.getString(1)).append(" · ").append(c.getString(0)).append(c.getInt(2)==1?"":" · отключено").append('\n');c.close();new AlertDialog.Builder(this).setTitle("Справочник направлений").setMessage(text.toString()).setPositiveButton("Закрыть",null).show();}
    private void addDirectionDialog(){EditText input=new EditText(this);input.setHint("Название направления");new AlertDialog.Builder(this).setTitle("Новое направление").setView(input).setPositiveButton("Добавить",(d,w)->{try{db.createDirection(input.getText().toString());showDirections();}catch(Exception e){toast(e.getMessage());}}).setNegativeButton("Отмена",null).show();}
    private void addCompanyDialog(){Cursor c=db.directions();List<String> ids=new ArrayList<>(),names=new ArrayList<>();while(c.moveToNext())if(c.getInt(2)==1){ids.add(c.getString(0));names.add(c.getString(1));}c.close();List<CheckBox> boxes=new ArrayList<>();EditText name=new EditText(this);name.setHint("Название компании");LinearLayout form=new LinearLayout(this);form.setPadding(dp(18),dp(6),dp(18),0);form.setOrientation(LinearLayout.VERTICAL);form.addView(name);TextView label=new TextView(this);label.setText("Разрешённые направления");label.setPadding(0,dp(8),0,dp(4));form.addView(label);for(String value:names){CheckBox box=new CheckBox(this);box.setText(value);form.addView(box);boxes.add(box);}new AlertDialog.Builder(this).setTitle("Новая компания").setView(form).setPositiveButton("Создать",(d,w)->{List<String> allowed=new ArrayList<>();for(int i=0;i<boxes.size();i++)if(boxes.get(i).isChecked())allowed.add(ids.get(i));try{db.createCompany(name.getText().toString(),allowed,allowed.size());showCompanies();}catch(Exception e){toast(e.getMessage());}}).setNegativeButton("Отмена",null).show();}

    private void showApprovals(){if(!"SECURITY_MANAGER".equals(role)){toast("Согласования доступны роли SECURITY_MANAGER.");return;}Cursor c=db.approvals();List<Long> ids=new ArrayList<>();List<String> rows=new ArrayList<>();while(c.moveToNext()){ids.add(c.getLong(0));rows.add(c.getString(1)+" · "+c.getString(3)+"\n"+c.getString(2)+"\nИнициатор: "+c.getString(4));}c.close();if(rows.isEmpty()){new AlertDialog.Builder(this).setTitle("Согласования").setMessage("Запросов пока нет.").setPositiveButton("Закрыть",null).show();return;}new AlertDialog.Builder(this).setTitle("Запросы · SECURITY_MANAGER").setItems(rows.toArray(new String[0]),(d,index)->{long id=ids.get(index);EditText comment=new EditText(this);comment.setHint("Комментарий к решению");new AlertDialog.Builder(this).setTitle("Решение по запросу").setView(comment).setPositiveButton("Согласовать",(x,w)->decideApproval(id,true,comment.getText().toString())).setNegativeButton("Отклонить",(x,w)->decideApproval(id,false,comment.getText().toString())).setNeutralButton("Отмена",null).show();}).setNegativeButton("Закрыть",null).show();}
    private void decideApproval(long id,boolean approve,String comment){try{db.decideApproval(id,approve,"demo-security-manager",comment);toast(approve?"Запрос согласован.":"Запрос отклонён.");}catch(Exception e){toast(e.getMessage());}}
    private void showAudit(){Cursor c=db.getReadableDatabase().rawQuery("SELECT occurred_at,event_type,entity_id,old_value,new_value FROM audit_events ORDER BY id DESC LIMIT 100",null);StringBuilder out=new StringBuilder();while(c.moveToNext())out.append(c.getString(0)).append(" · ").append(c.getString(1)).append(" · ").append(c.getString(2)).append("\n");c.close();new AlertDialog.Builder(this).setTitle("Журнал событий · последние 100").setMessage(out.length()==0?"Событий пока нет.":out.toString()).setPositiveButton("Закрыть",null).show();}

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){super.onActivityResult(requestCode,resultCode,data);IntentResult result=IntentIntegrator.parseActivityResult(requestCode,resultCode,data);if(result!=null){if(result.getContents()==null)toast("Сканирование отменено");else{String id=result.getContents().trim();Cursor c=db.employee(id);boolean found=c.moveToFirst();c.close();if(found)showProfile(id);else toast("Сотрудник не найден: "+id);}return;}if(requestCode==saveQrRequest&&resultCode==RESULT_OK&&data!=null)saveQr(data.getData());if(requestCode==742&&resultCode==RESULT_OK&&data!=null&&data.getData()!=null)readXlsx(data.getData());}
    private void saveQr(Uri uri){if(uri==null||pendingQr==null)return;try(OutputStream output=getContentResolver().openOutputStream(uri)){pendingQr.compress(Bitmap.CompressFormat.PNG,100,output);toast("QR сохранён: "+pendingQrId);}catch(Exception e){toast("Не удалось сохранить QR: "+e.getMessage());}}
    private Button smallButton(String label){Button b=new Button(this);b.setText(label);b.setTextSize(12);b.setTextColor(Color.WHITE);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xff183d32));return b;}
    private void toast(String text){Toast.makeText(this,text==null?"Ошибка":text,Toast.LENGTH_LONG).show();}
}
