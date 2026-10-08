import { db, storage } from "hatchable";
import crypto from "node:crypto";

export const access = "user";
export const methods = ["POST"];

export default async function(req,res){
  const file=(req.files||[]).find(f=>f.field==="file");
  if(!file)return res.status(400).json({error:"Choose a PDF resume."});
  if(file.contentType!=="application/pdf")return res.status(415).json({error:"Only PDF resumes are supported."});
  if(file.buffer.length>10*1024*1024)return res.status(413).json({error:"Resume must be under 10 MB."});
  const key="resumes/"+req.user.id+"/"+crypto.randomUUID()+".pdf";
  await storage.put(key,file.buffer,file.contentType);
  const r=await db.query("INSERT INTO resume_files(user_id,file_name,storage_key,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id,file_name,created_at",[req.user.id,file.filename,key,file.contentType,file.buffer.length]);
  res.json({ok:true,file:r.rows[0]});
}