package kz.techpass.demo;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.security.SecureRandom;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.List;
import java.util.HashSet;
import java.util.Set;

final class RegistryDbHelper extends SQLiteOpenHelper {
    private static final String DB_NAME = "techpass_registry.db";
    private final Context context;
    static final class ImportRow { final String fullName,companyId,demoNumber,status; final List<String> directionIds; ImportRow(String name,String company,List<String> directions,String number,String state){fullName=name;companyId=company;directionIds=directions;demoNumber=number;status=state;} }
    RegistryDbHelper(Context context) { super(context, DB_NAME, null, 1); this.context = context.getApplicationContext(); }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE companies(id TEXT PRIMARY KEY,name TEXT NOT NULL,status TEXT NOT NULL,allowed TEXT NOT NULL,max_directions INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE directions(id TEXT PRIMARY KEY,name TEXT NOT NULL,active INTEGER NOT NULL)");
        db.execSQL("CREATE TABLE employees(id TEXT PRIMARY KEY,full_name TEXT NOT NULL,demo_number TEXT UNIQUE NOT NULL,company_id TEXT NOT NULL REFERENCES companies(id),status TEXT NOT NULL,created_at TEXT NOT NULL,comments TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE assignments(id TEXT PRIMARY KEY,employee_id TEXT NOT NULL REFERENCES employees(id),company_id TEXT NOT NULL REFERENCES companies(id),direction_id TEXT NOT NULL REFERENCES directions(id),started_at TEXT NOT NULL,ended_at TEXT,status TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '')");
        db.execSQL("CREATE TABLE audit_events(id INTEGER PRIMARY KEY AUTOINCREMENT,occurred_at TEXT NOT NULL,event_type TEXT NOT NULL,entity_id TEXT NOT NULL,old_value TEXT,new_value TEXT)");
        db.execSQL("CREATE TABLE approvals(id INTEGER PRIMARY KEY AUTOINCREMENT,employee_id TEXT NOT NULL,requested_by TEXT NOT NULL,request_text TEXT NOT NULL,status TEXT NOT NULL,reviewed_by TEXT,created_at TEXT NOT NULL,decided_at TEXT,comment TEXT NOT NULL DEFAULT '')");
        loadSeed(db);
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) { }

    private void loadSeed(SQLiteDatabase db) {
        try (InputStream input = context.getAssets().open("registry-seed.json"); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int count; while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            JSONObject seed = new JSONObject(output.toString("UTF-8"));
            db.beginTransaction();
            JSONArray list = seed.getJSONArray("directions");
            for (int i = 0; i < list.length(); i++) { JSONObject item = list.getJSONObject(i); ContentValues v = new ContentValues(); v.put("id", item.getString("id")); v.put("name", item.getString("name")); v.put("active", item.optBoolean("active", true) ? 1 : 0); db.insertOrThrow("directions", null, v); }
            list = seed.getJSONArray("companies");
            for (int i = 0; i < list.length(); i++) { JSONObject item = list.getJSONObject(i); ContentValues v = new ContentValues(); v.put("id", item.getString("id")); v.put("name", item.getString("name")); v.put("status", item.optString("status", "active")); v.put("allowed", join(item.getJSONArray("allowedDirectionIds"))); v.put("max_directions", item.optInt("maxDirections", 2)); db.insertOrThrow("companies", null, v); }
            list = seed.getJSONArray("employees");
            for (int i = 0; i < list.length(); i++) { JSONObject item = list.getJSONObject(i); ContentValues v = new ContentValues(); v.put("id", item.getString("id")); v.put("full_name", item.getString("fullName")); v.put("demo_number", item.getString("demoNumber")); v.put("company_id", item.getString("companyId")); v.put("status", item.optString("status", "active")); v.put("created_at", item.optString("createdAt")); v.put("comments", ""); db.insertOrThrow("employees", null, v); }
            list = seed.getJSONArray("assignments");
            for (int i = 0; i < list.length(); i++) { JSONObject item = list.getJSONObject(i); ContentValues v = new ContentValues(); v.put("id", item.getString("id")); v.put("employee_id", item.getString("employeeId")); v.put("company_id", item.getString("companyId")); v.put("direction_id", item.getString("directionId")); v.put("started_at", item.optString("startedAt")); if (!item.isNull("endedAt")) v.put("ended_at", item.getString("endedAt")); v.put("status", item.getString("status")); v.put("comment", item.optString("comment")); db.insertOrThrow("assignments", null, v); }
            db.setTransactionSuccessful();
        } catch (Exception error) { throw new IllegalStateException("Не удалось загрузить демонстрационный реестр", error); }
        finally { if (db.inTransaction()) db.endTransaction(); }
    }

    private String join(JSONArray array) throws Exception { StringBuilder out = new StringBuilder(); for (int i = 0; i < array.length(); i++) { if (i > 0) out.append(','); out.append(array.getString(i)); } return out.toString(); }

    Cursor employees(String query) {
        String needle = "%" + (query == null ? "" : query.trim()) + "%";
        return getReadableDatabase().rawQuery("SELECT e.id,e.full_name,e.demo_number,e.company_id,e.status,c.name " +
                "FROM employees e JOIN companies c ON c.id=e.company_id WHERE e.full_name LIKE ? OR e.id LIKE ? OR e.demo_number LIKE ? OR c.name LIKE ? " +
                "OR EXISTS(SELECT 1 FROM assignments a JOIN directions d ON d.id=a.direction_id WHERE a.employee_id=e.id AND (d.name LIKE ? OR a.direction_id LIKE ?)) ORDER BY e.full_name",
                new String[]{needle,needle,needle,needle,needle,needle});
    }

    Cursor employee(String id) { return getReadableDatabase().rawQuery("SELECT e.id,e.full_name,e.demo_number,e.company_id,e.status,e.created_at,e.comments,c.name FROM employees e JOIN companies c ON c.id=e.company_id WHERE e.id=?", new String[]{id}); }
    Cursor assignments(String employeeId) { return getReadableDatabase().rawQuery("SELECT a.id,c.name,d.name,a.started_at,a.ended_at,a.status,a.comment FROM assignments a JOIN companies c ON c.id=a.company_id JOIN directions d ON d.id=a.direction_id WHERE a.employee_id=? ORDER BY a.started_at DESC", new String[]{employeeId}); }
    Cursor companies() { return getReadableDatabase().rawQuery("SELECT id,name,allowed,max_directions,status FROM companies ORDER BY name", null); }
    Cursor directions() { return getReadableDatabase().rawQuery("SELECT id,name,active FROM directions ORDER BY name", null); }
    synchronized void createDirection(String name){if(name==null||name.trim().length()<2)throw new IllegalArgumentException("Укажите название направления.");SQLiteDatabase db=getWritableDatabase();Cursor duplicate=db.rawQuery("SELECT COUNT(*) FROM directions WHERE LOWER(name)=LOWER(?)",new String[]{name.trim()});boolean exists=duplicate.moveToFirst()&&duplicate.getInt(0)>0;duplicate.close();if(exists)throw new IllegalArgumentException("Такое направление уже есть.");Cursor c=db.rawQuery("SELECT MAX(CAST(SUBSTR(id,9) AS INTEGER)) FROM directions WHERE id LIKE 'DIR-EXT-%'",null);int next=c.moveToFirst()?c.getInt(0)+1:1;c.close();String id=String.format(Locale.US,"DIR-EXT-%06d",next);ContentValues v=new ContentValues();v.put("id",id);v.put("name",name.trim());v.put("active",1);db.insertOrThrow("directions",null,v);audit(db,"direction.created",id,null,name.trim());}
    synchronized void createCompany(String name,List<String> allowed,int max){if(name==null||name.trim().length()<2)throw new IllegalArgumentException("Укажите название компании.");if(allowed==null||allowed.isEmpty()||max<1||max>Math.min(3,allowed.size()))throw new IllegalArgumentException("Проверьте разрешённые направления и лимит.");SQLiteDatabase db=getWritableDatabase();for(String direction:allowed){Cursor check=db.rawQuery("SELECT active FROM directions WHERE id=?",new String[]{direction});if(!check.moveToFirst()||check.getInt(0)!=1){check.close();throw new IllegalArgumentException("Выбрано неизвестное или отключённое направление.");}check.close();}Cursor dupe=db.rawQuery("SELECT COUNT(*) FROM companies WHERE LOWER(name)=LOWER(?)",new String[]{name.trim()});boolean exists=dupe.moveToFirst()&&dupe.getInt(0)>0;dupe.close();if(exists)throw new IllegalArgumentException("Компания уже есть.");Cursor c=db.rawQuery("SELECT MAX(CAST(SUBSTR(id,5) AS INTEGER)) FROM companies",null);int next=c.moveToFirst()?c.getInt(0)+1:1;c.close();String id=String.format(Locale.US,"CTR-%03d",next);ContentValues v=new ContentValues();v.put("id",id);v.put("name",name.trim());v.put("status","active");v.put("allowed",joinStrings(allowed));v.put("max_directions",max);db.insertOrThrow("companies",null,v);audit(db,"company.created",id,null,name.trim());}
    Cursor approvals() { return getReadableDatabase().rawQuery("SELECT a.id,e.full_name,a.request_text,a.status,a.requested_by,a.reviewed_by,a.created_at,a.comment FROM approvals a JOIN employees e ON e.id=a.employee_id ORDER BY a.created_at DESC",null); }
    synchronized void requestApproval(String employeeId,String text,String actor){if(text==null||text.trim().length()<5)throw new IllegalArgumentException("Опишите запрос подробнее.");SQLiteDatabase db=getWritableDatabase();ContentValues v=new ContentValues();v.put("employee_id",employeeId);v.put("requested_by",actor);v.put("request_text",text.trim());v.put("status","pending");v.put("created_at",timestamp());long id=db.insertOrThrow("approvals",null,v);audit(db,"approval.requested",String.valueOf(id),null,text.trim());}
    synchronized void decideApproval(long requestId,boolean approve,String actor,String comment){SQLiteDatabase db=getWritableDatabase();Cursor c=db.rawQuery("SELECT requested_by,status FROM approvals WHERE id=?",new String[]{String.valueOf(requestId)});if(!c.moveToFirst()){c.close();throw new IllegalArgumentException("Запрос не найден.");}String requestedBy=c.getString(0),status=c.getString(1);c.close();if(!"pending".equals(status))throw new IllegalArgumentException("Запрос уже рассмотрен.");if(requestedBy.equals(actor))throw new IllegalArgumentException("Инициатор не может согласовать собственный запрос.");ContentValues v=new ContentValues();v.put("status",approve?"approved":"rejected");v.put("reviewed_by",actor);v.put("decided_at",timestamp());v.put("comment",comment==null?"":comment.trim());db.update("approvals",v,"id=?",new String[]{String.valueOf(requestId)});audit(db,"approval."+(approve?"approved":"rejected"),String.valueOf(requestId),"pending",approve?"approved":"rejected");}

    synchronized String createEmployee(String fullName, String companyId, List<String> directionIds) {
        return createEmployee(fullName, companyId, directionIds, null);
    }

    synchronized String createEmployee(String fullName, String companyId, List<String> directionIds, String requestedDemoNumber) {
        if (fullName == null || fullName.trim().length() < 3) throw new IllegalArgumentException("Укажите ФИО.");
        SQLiteDatabase db = getWritableDatabase(); db.beginTransaction();
        try {
            Cursor c = db.rawQuery("SELECT allowed,max_directions,status FROM companies WHERE id=?", new String[]{companyId});
            if (!c.moveToFirst()) throw new IllegalArgumentException("Компания не найдена.");
            String allowed = c.getString(0); int max = c.getInt(1); String companyStatus = c.getString(2); c.close();
            if (!"active".equals(companyStatus)) throw new IllegalArgumentException("Компания неактивна.");
            validateDirections(allowed, max, directionIds);
            Cursor maxId = db.rawQuery("SELECT MAX(CAST(SUBSTR(id,5) AS INTEGER)) FROM employees", null); int number = maxId.moveToFirst() ? maxId.getInt(0) + 1 : 1; maxId.close();
            String id = String.format(Locale.US, "EMP-%06d", number); String demo = requestedDemoNumber == null || requestedDemoNumber.trim().isEmpty() ? uniqueNumber(db) : requestedDemoNumber.trim();
            if(!demo.matches("\\d{12}"))throw new IllegalArgumentException("Демо-номер должен содержать ровно 12 цифр.");
            Cursor duplicate=db.rawQuery("SELECT COUNT(*) FROM employees WHERE demo_number=?",new String[]{demo});boolean alreadyUsed=duplicate.moveToFirst()&&duplicate.getInt(0)>0;duplicate.close();if(alreadyUsed)throw new IllegalArgumentException("Демо-номер уже используется.");
            String now = timestamp();
            ContentValues e = new ContentValues(); e.put("id", id); e.put("full_name", fullName.trim().replaceAll("\\s+", " ")); e.put("demo_number", demo); e.put("company_id", companyId); e.put("status", "active"); e.put("created_at", now); db.insertOrThrow("employees", null, e);
            insertAssignments(db,id,companyId,directionIds,now,"Начальное назначение");
            audit(db, "employee.created", id, null, fullName.trim()); db.setTransactionSuccessful(); return id;
        } finally { db.endTransaction(); }
    }

    synchronized List<String> importEmployees(List<ImportRow> rows,String fileName,int rejected){SQLiteDatabase db=getWritableDatabase();List<String> added=new java.util.ArrayList<>();db.beginTransaction();try{for(ImportRow row:rows){String id=createEmployee(row.fullName,row.companyId,row.directionIds,row.demoNumber);if("inactive".equals(row.status))setEmployeeStatus(id,false);added.add(id);}audit(db,"import.completed","registry",null,(fileName==null?"Excel":fileName)+" · добавлено "+added.size()+" · отклонено "+rejected);db.setTransactionSuccessful();return added;}finally{db.endTransaction();}}

    synchronized void updateEmployee(String id,String fullName,String companyId,List<String> directionIds) {
        if(fullName==null||fullName.trim().length()<3)throw new IllegalArgumentException("Укажите ФИО.");
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();String now=timestamp();
        try {
            Cursor old=db.rawQuery("SELECT full_name,company_id,status FROM employees WHERE id=?",new String[]{id});if(!old.moveToFirst()){old.close();throw new IllegalArgumentException("Сотрудник не найден.");}
            String oldName=old.getString(0),oldCompany=old.getString(1),status=old.getString(2);old.close();
            Cursor co=db.rawQuery("SELECT allowed,max_directions,status FROM companies WHERE id=?",new String[]{companyId});if(!co.moveToFirst()){co.close();throw new IllegalArgumentException("Компания не найдена.");}
            String allowed=co.getString(0),companyStatus=co.getString(2);int max=co.getInt(1);co.close();if(!"active".equals(companyStatus))throw new IllegalArgumentException("Компания неактивна.");
            validateDirections(allowed,max,directionIds);
            ContentValues values=new ContentValues();values.put("full_name",fullName.trim().replaceAll("\\s+"," "));values.put("company_id",companyId);db.update("employees",values,"id=?",new String[]{id});
            Cursor active=db.rawQuery("SELECT id,direction_id FROM assignments WHERE employee_id=? AND status='active'",new String[]{id});List<String> oldActiveIds=new java.util.ArrayList<>();List<String> oldDirectionIds=new java.util.ArrayList<>();while(active.moveToNext()){oldActiveIds.add(active.getString(0));oldDirectionIds.add(active.getString(1));}active.close();
            boolean companyChanged=!oldCompany.equals(companyId);Set<String> requested=new HashSet<>(directionIds);List<String> added=new java.util.ArrayList<>();
            for(int i=0;i<oldActiveIds.size();i++){String oldDirection=oldDirectionIds.get(i);if(companyChanged||!requested.contains(oldDirection)){ContentValues closed=new ContentValues();closed.put("status","closed");closed.put("ended_at",now);closed.put("comment",companyChanged?"Закрыто при смене компании":"Закрыто при изменении назначений");db.update("assignments",closed,"id=?",new String[]{oldActiveIds.get(i)});}else requested.remove(oldDirection);}
            added.addAll(requested);
            if("active".equals(status)&&!added.isEmpty())insertAssignments(db,id,companyId,added,now,companyChanged?"Назначение после смены компании":"Новое назначение");
            audit(db,"employee.updated",id,oldName+" · "+oldCompany,fullName.trim()+" · "+companyId);db.setTransactionSuccessful();
        } finally {db.endTransaction();}
    }

    private void validateDirections(String allowed,int max,List<String> ids){if(ids==null||ids.isEmpty())throw new IllegalArgumentException("Выберите хотя бы одно направление.");if(ids.size()>Math.min(3,max))throw new IllegalArgumentException("Превышен лимит направлений компании.");Set<String> policy=allowedSet(allowed);Set<String> unique=new HashSet<>(ids);if(unique.size()!=ids.size())throw new IllegalArgumentException("Одно направление выбрано несколько раз.");for(String id:ids)if(!policy.contains(id))throw new IllegalArgumentException("Это направление запрещено для компании.");}
    private void insertAssignments(SQLiteDatabase db,String employeeId,String companyId,List<String> ids,String now,String comment){for(String directionId:ids){Cursor n=db.rawQuery("SELECT COUNT(*) FROM assignments WHERE employee_id=?",new String[]{employeeId});int serial=n.moveToFirst()?n.getInt(0)+1:1;n.close();ContentValues a=new ContentValues();a.put("id",employeeId+"-ASN-"+serial);a.put("employee_id",employeeId);a.put("company_id",companyId);a.put("direction_id",directionId);a.put("started_at",now);a.put("status","active");a.put("comment",comment);db.insertOrThrow("assignments",null,a);}}

    synchronized void setEmployeeStatus(String id, boolean active) {
        SQLiteDatabase db = getWritableDatabase(); String now = timestamp(); db.beginTransaction();
        try {
            Cursor current = db.rawQuery("SELECT status FROM employees WHERE id=?", new String[]{id});
            if (!current.moveToFirst()) throw new IllegalArgumentException("Сотрудник не найден.");
            boolean wasActive = "active".equals(current.getString(0)); current.close(); if (wasActive == active) { db.setTransactionSuccessful(); return; }
            ContentValues employee = new ContentValues(); employee.put("status", active ? "active" : "inactive"); db.update("employees", employee, "id=?", new String[]{id});
            ContentValues assignment = new ContentValues(); assignment.put("status", "closed"); assignment.put("ended_at", now); db.update("assignments", assignment, "employee_id=? AND status='active'", new String[]{id});
            if (active) {
                Cursor company = db.rawQuery("SELECT e.company_id,c.allowed,c.status FROM employees e JOIN companies c ON c.id=e.company_id WHERE e.id=?", new String[]{id});
                if (!company.moveToFirst() || !"active".equals(company.getString(2))) { company.close(); throw new IllegalArgumentException("Нельзя активировать профиль в неактивной компании."); }
                String companyId=company.getString(0), allowed=company.getString(1); company.close();
                Cursor prior=db.rawQuery("SELECT direction_id FROM assignments WHERE employee_id=? ORDER BY started_at DESC",new String[]{id}); String direction=null;
                while(prior.moveToNext()){String candidate=prior.getString(0);if(allowedSet(allowed).contains(candidate)){direction=candidate;break;}}prior.close();
                if(direction==null)throw new IllegalArgumentException("Для повторной активации выберите разрешённое направление в профиле компании.");
                ContentValues fresh=new ContentValues(); fresh.put("id",id+"-"+direction+"-"+System.currentTimeMillis()); fresh.put("employee_id",id); fresh.put("company_id",companyId); fresh.put("direction_id",direction); fresh.put("started_at",now); fresh.put("status","active"); fresh.put("comment","Назначение при повторной активации"); db.insertOrThrow("assignments",null,fresh);
            }
            audit(db, "employee.status.changed", id, wasActive ? "active" : "inactive", active ? "active" : "inactive"); db.setTransactionSuccessful();
        } finally { db.endTransaction(); }
    }

    private String uniqueNumber(SQLiteDatabase db) {
        SecureRandom random = new SecureRandom(); Set<String> used = new HashSet<>();
        try (Cursor c = db.rawQuery("SELECT demo_number FROM employees", null)) { while (c.moveToNext()) used.add(c.getString(0)); }
        for (int n = 0; n < 10000; n++) { StringBuilder b = new StringBuilder(12); for (int i=0;i<12;i++) b.append(random.nextInt(10)); if (!used.contains(b.toString())) return b.toString(); }
        throw new IllegalStateException("Не удалось создать уникальный демо-номер.");
    }
    private Set<String> allowedSet(String value) { Set<String> result = new HashSet<>(); for (String item : value.split(",")) result.add(item); return result; }
    private String joinStrings(List<String> values){StringBuilder out=new StringBuilder();for(String value:values){if(out.length()>0)out.append(',');out.append(value);}return out.toString();}
    private String timestamp() { SimpleDateFormat f=new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",Locale.US);f.setTimeZone(TimeZone.getTimeZone("UTC"));return f.format(new Date()); }
    private void audit(SQLiteDatabase db, String type, String entity, String oldValue, String newValue) { ContentValues v = new ContentValues(); v.put("occurred_at", timestamp()); v.put("event_type", type); v.put("entity_id", entity); v.put("old_value", oldValue); v.put("new_value", newValue); db.insert("audit_events", null, v); }
}
