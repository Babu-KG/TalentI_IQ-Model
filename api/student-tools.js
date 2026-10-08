import { db, ai } from "hatchable";

export const access = "user";
export const methods = ["POST","GET"];

const vocab=["python","java","c","c++","javascript","sql","react","flask","django","node.js","machine learning","deep learning","tensorflow","pytorch","nlp","computer vision","data science","data analysis","pandas","numpy","scikit-learn","aws","docker","kubernetes","git","html","css","mongodb","mysql","rest api","agile","statistics","tableau","power bi","excel","linux","figma","communication","leadership","testing","ci/cd","cloud"];

function skills(t){const x=String(t||"").toLowerCase();return vocab.filter(s=>x.includes(s));}

async function profile(id){return (await db.query("SELECT * FROM profiles WHERE user_id=$1",[id])).rows[0];}

export default async function(req,res){
  const d=req.body||{};
  const p=await profile(req.user.id);

  if(req.method==="GET"){
    const apps=(await db.query("SELECT a.*,j.title FROM job_applications a JOIN jobs j ON j.id=a.job_id WHERE a.student_id=$1 ORDER BY a.created_at DESC",[req.user.id])).rows;
    return res.json({profile:p||null,applications:apps});
  }

  const action=d.action||"save_profile";

  if(action==="save_profile"){
    const s=Array.isArray(d.skills)?d.skills:[];
    await db.query("INSERT INTO profiles(user_id,role,name,email,skills,education,experience,projects,certifications,achievements,resume_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,name=EXCLUDED.name,skills=EXCLUDED.skills,education=EXCLUDED.education,experience=EXCLUDED.experience,projects=EXCLUDED.projects,certifications=EXCLUDED.certifications,achievements=EXCLUDED.achievements,resume_text=CASE WHEN EXCLUDED.resume_text<>'' THEN EXCLUDED.resume_text ELSE profiles.resume_text END",[req.user.id,d.role||"student",d.name||req.user.name||"",req.user.email,JSON.stringify(s),d.education||"",d.experience||"",d.projects||"",JSON.stringify(d.certifications||[]),JSON.stringify(d.achievements||[]),d.resume_text||""]);
    return res.json({ok:true});
  }

  if(action==="apply"){
    const j=(await db.query("SELECT id FROM jobs WHERE id=$1",[d.job_id])).rows[0];
    if(!j)return res.status(404).json({error:"job not found"});
    const a=await db.query("INSERT INTO job_applications(job_id,student_id,status) VALUES($1,$2,'applied') ON CONFLICT(job_id,student_id) DO UPDATE SET status='applied' RETURNING *",[d.job_id,req.user.id]);
    return res.json({application:a.rows[0]});
  }

  if(action==="whatif"){
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[d.job_id])).rows[0];
    if(!p||!j)return res.status(404).json({error:"profile or job not found"});
    const extra=Array.isArray(d.added_skills)?d.added_skills:[];
    const have=new Set([...skills(p.resume_text),...skills(p.experience),...skills(p.projects),...skills(JSON.stringify(p.skills))]);
    const need=[...new Set(skills(j.description))];
    const before=need.length?Math.round(need.filter(x=>have.has(x)).length/need.length*100):0;
    extra.forEach(x=>have.add(String(x).toLowerCase()));
    const after=need.length?Math.round(need.filter(x=>have.has(x)).length/need.length*100):0;
    await db.query("INSERT INTO whatif_runs(student_id,job_id,added_skills,score_before,score_after) VALUES($1,$2,$3,$4,$5)",[req.user.id,j.id,JSON.stringify(extra),before,after]);
    return res.json({before,after,delta:after-before});
  }

  if(action==="recommend"){
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[d.job_id])).rows[0];
    if(!p||!j)return res.status(404).json({error:"profile or job not found"});
    try{
      const r=await ai.generateText({model:"haiku",purpose:"talentiq-recommendation",userId:req.user.id,messages:[{role:"system",content:"Give concise career advice: strengths, top gaps, next actions, interview focus."},{role:"user",content:JSON.stringify({student:{skills:p.skills,education:p.education,experience:p.experience,projects:p.projects},job:{title:j.title,description:j.description}})}],maxTokens:600});
      await db.query("INSERT INTO recommendations(student_id,job_id,recommendation,source) VALUES($1,$2,$3,'ai')",[req.user.id,j.id,r.text]);
      return res.json({recommendation:r.text,source:"ai"});
    }catch(e){
      const fallback="Use the job description to identify missing skills, strengthen the top two gaps with projects, complete a relevant assessment, and tailor your resume before applying.";
      await db.query("INSERT INTO recommendations(student_id,job_id,recommendation,source) VALUES($1,$2,$3,'local')",[req.user.id,j.id,fallback]);
      return res.json({recommendation:fallback,source:"local"});
    }
  }

  return res.status(400).json({error:"Unknown action"});
}