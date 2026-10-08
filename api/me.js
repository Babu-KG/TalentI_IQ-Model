import { db } from "hatchable";

export const access = "user";
export const methods = ["GET"];

export default async function(req,res){
  const p=(await db.query("SELECT * FROM profiles WHERE user_id=$1",[req.user.id])).rows[0]||null;
  const assessments=(await db.query("SELECT skill,score,created_at FROM assessments WHERE student_id=$1 ORDER BY created_at DESC",[req.user.id])).rows;
  res.json({user:{id:req.user.id,email:req.user.email,name:req.user.name||""},profile:p,assessments});
}