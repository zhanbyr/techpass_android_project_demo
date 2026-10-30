package kz.techpass.demo;

import android.util.Xml;

import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Small first-sheet reader for ordinary .xlsx files; no workbook dependency is required. */
final class XlsxReader {
    private XlsxReader() { }

    static List<List<String>> read(InputStream source) throws Exception {
        byte[] sharedBytes=null, sheetBytes=null; long expanded=0;
        try(ZipInputStream zip=new ZipInputStream(source)) {
            ZipEntry entry;
            while((entry=zip.getNextEntry())!=null) {
                String name=entry.getName();
                boolean needed="xl/sharedStrings.xml".equals(name)||"xl/worksheets/sheet1.xml".equals(name);ByteArrayOutputStream out=needed?new ByteArrayOutputStream():null;byte[] buffer=new byte[8192];int count;
                while((count=zip.read(buffer))!=-1){expanded+=count;if(expanded>20L*1024*1024)throw new IllegalArgumentException("Excel-файл слишком большой (лимит 20 МБ).");if(needed)out.write(buffer,0,count);}
                if(out!=null){if("xl/sharedStrings.xml".equals(name))sharedBytes=out.toByteArray();else sheetBytes=out.toByteArray();}
                zip.closeEntry();
            }
        }
        if(sheetBytes==null)throw new IllegalArgumentException("В Excel-файле не найден первый лист.");
        List<String> shared=sharedBytes==null?new ArrayList<>():readShared(new String(sharedBytes,java.nio.charset.StandardCharsets.UTF_8));
        return readSheet(new String(sheetBytes,java.nio.charset.StandardCharsets.UTF_8),shared);
    }

    private static List<String> readShared(String xml)throws Exception {
        List<String> values=new ArrayList<>();XmlPullParser parser=Xml.newPullParser();parser.setInput(new StringReader(xml));boolean inside=false;StringBuilder value=null;int event;
        while((event=parser.next())!=XmlPullParser.END_DOCUMENT){if(event==XmlPullParser.START_TAG&&"si".equals(parser.getName())){inside=true;value=new StringBuilder();}else if(inside&&event==XmlPullParser.TEXT){value.append(parser.getText());}else if(event==XmlPullParser.END_TAG&&"si".equals(parser.getName())){values.add(value==null?"":value.toString());inside=false;value=null;}}
        return values;
    }

    private static List<List<String>> readSheet(String xml,List<String> shared)throws Exception {
        List<List<String>> rows=new ArrayList<>();XmlPullParser parser=Xml.newPullParser();parser.setInput(new StringReader(xml));Map<Integer,String> row=null;int cellIndex=-1;String cellType="";StringBuilder cellValue=null;int event;
        while((event=parser.next())!=XmlPullParser.END_DOCUMENT){
            if(event==XmlPullParser.START_TAG){String tag=parser.getName();
                if("row".equals(tag))row=new TreeMap<>();
                else if("c".equals(tag)&&row!=null){cellIndex=columnIndex(parser.getAttributeValue(null,"r"));cellType=parser.getAttributeValue(null,"t");cellValue=new StringBuilder();}
                else if(cellValue!=null&&("v".equals(tag)||"t".equals(tag))){/* captured in text events */}
            } else if(event==XmlPullParser.TEXT&&cellValue!=null)cellValue.append(parser.getText());
            else if(event==XmlPullParser.END_TAG){String tag=parser.getName();
                if("c".equals(tag)&&row!=null&&cellIndex>=0){String value=cellValue==null?"":cellValue.toString();if("s".equals(cellType)){try{int i=Integer.parseInt(value);value=i>=0&&i<shared.size()?shared.get(i):"";}catch(NumberFormatException ignored){value="";}}row.put(cellIndex,value);cellIndex=-1;cellValue=null;cellType="";}
                else if("row".equals(tag)&&row!=null){int width=0;for(Integer index:row.keySet())width=Math.max(width,index+1);List<String> values=new ArrayList<>();for(int i=0;i<width;i++)values.add(row.containsKey(i)?row.get(i):"");rows.add(values);row=null;}
            }
        }
        return rows;
    }

    private static int columnIndex(String reference){if(reference==null)return -1;int value=0,count=0;for(char c:reference.toCharArray()){if(c>='A'&&c<='Z'){value=value*26+(c-'A'+1);count++;}else if(c>='a'&&c<='z'){value=value*26+(c-'a'+1);count++;}else break;}return count==0?-1:value-1;}
}
