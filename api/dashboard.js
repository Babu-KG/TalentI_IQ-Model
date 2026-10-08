import { db } from "hatchable";
export const access="user";
export const methods=["GET"];
export default async function(req,res){const a=await db.query("SELECT COUNT(*)::int AS count FROM profiles WHERE role='student'");const j=await db.query("SELECT COUNT(*)::int AS count FROM jobs");const r=await db.query("SELECT skill,ROUND(AVG(score))::int AS score FROM assessments GROUP BY skill ORDER BY score DESC");res.json({student_count:a.rows[0].count,job_count:j.rows[0].count,assessment:r.rows})}