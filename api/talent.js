import { db, ai } from "hatchable";

export const access = "user";
export const methods = ["GET","POST"];

const vocab=["python","java","c","c++","javascript","sql","react","flask","django","node.js","machine learning","deep learning","tensorflow","pytorch","nlp","computer vision","data science","data analysis","pandas","numpy","scikit-learn","aws","docker","kubernetes","git","html","css","mongodb","mysql","rest api","agile","statistics","tableau","power bi","excel","linux","figma","communication","leadership","testing","ci/cd","cloud"];
const alias={"ml":"machine learning","predictive modeling":"machine learning","neural network":"deep learning","natural language processing":"nlp","version control":"git","container":"docker","rest service":"rest api","dashboard":"power bi","spreadsheet":"excel","k8s":"kubernetes"};
function skills(t){let x=String(t||"").toLowerCase();for(const [a,b] of Object.entries(alias))if(x.includes(a))x+=" "+b;return [...new Set(vocab.filter(s=>x.includes(s)))];}
function match(p,j){const have=new Set(skills([p.resume_text,p.experience,p.projects,JSON.stringify(p.skills)].join(" ")));const need=skills(j.description);const skill=need.length?Math.round(need.filter(x=>have.has(x)).length/need.length*100):0;const exp=need.length?Math.round(skills(p.experience).filter(x=>need.includes(x)).length/need.length*100):0;const pro=need.length?Math.round(skills(p.projects).filter(x=>need.includes(x)).length/need.length*100):0;const edu=p.education?80:30;const total=Math.round(skill*(j.weight_skill||40)/100+exp*(j.weight_experience||25)/100+pro*(j.weight_projects||20)/100+edu*(j.weight_education||15)/100);return {total,skill,exp,pro,edu,matched:need.filter(x=>have.has(x)),missing:need.filter(x=>!have.has(x))};}
export default async function(req,res){
  const me=(await db.query("SELECT * FROM profiles WHERE user_id=$1",[req.user.id])).rows[0]||null;
  const action=req.body?.action||req.query?.action||"summary";

  if(req.method==="GET"){
    const jobs=(await db.query("SELECT j.*,p.name company_name FROM jobs j LEFT JOIN profiles p ON p.user_id=j.company_id ORDER BY j.created_at DESC")).rows;
    const assessments=(await db.query("SELECT skill,score,created_at FROM assessments WHERE student_id=$1 ORDER BY created_at DESC",[req.user.id])).rows;
    const apps=(await db.query("SELECT a.*,j.title FROM job_applications a JOIN jobs j ON j.id=a.job_id WHERE a.student_id=$1 ORDER BY a.created_at DESC",[req.user.id])).rows;
    let college=null;
    if(me?.role==="college"){
      const cs=(await db.query("SELECT COUNT(*)::int count FROM profiles WHERE role='student'")).rows[0].count;
      const cj=(await db.query("SELECT COUNT(*)::int count FROM jobs")).rows[0].count;
      const ca=(await db.query("SELECT COUNT(*)::int count FROM job_applications")).rows[0].count;
      college={students:cs,jobs:cj,applications:ca};
    }
    return res.json({role:me?.role||"student",profile:me,jobs,assessments,applications:apps,college});
  }

  if(action==="save_profile"){
    const d=req.body||{};
    const s=Array.isArray(d.skills)?d.skills:[];
    await db.query("INSERT INTO profiles(user_id,role,name,email,skills,education,experience,projects,certifications,achievements,resume_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,name=EXCLUDED.name,skills=EXCLUDED.skills,education=EXCLUDED.education,experience=EXCLUDED.experience,projects=EXCLUDED.projects,certifications=EXCLUDED.certifications,achievements=EXCLUDED.achievements,resume_text=CASE WHEN EXCLUDED.resume_text<>'' THEN EXCLUDED.resume_text ELSE profiles.resume_text END",[req.user.id,d.role||me?.role||"student",d.name||req.user.name||"",req.user.email,JSON.stringify(s),d.education||"",d.experience||"",d.projects||"",JSON.stringify(d.certifications||[]),JSON.stringify(d.achievements||[]),d.resume_text||""]);
    return res.json({ok:true});
  }

  if(action==="apply"){
    if(!req.body.job_id)return res.status(400).json({error:"job_id required"});
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[req.body.job_id])).rows[0];
    if(!j)return res.status(404).json({error:"job not found"});
    const p=me||{};
    const m=match(p,j);
    const a=await db.query("INSERT INTO job_applications(job_id,student_id,status,match_score) VALUES($1,$2,'applied',$3) ON CONFLICT(job_id,student_id) DO UPDATE SET status='applied',match_score=EXCLUDED.match_score RETURNING *",[j.id,req.user.id,m.total]);
    return res.json({application:a.rows[0],match:m});
  }

  if(action==="job_match"){
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[req.body.job_id])).rows[0];
    if(!j||!me)return res.status(404).json({error:"job or profile not found"});
    return res.json({job:j,match:match(me,j)});
  }

  if(action==="whatif"){
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[req.body.job_id])).rows[0];
    if(!j||!me)return res.status(404).json({error:"job or profile not found"});
    const extra=Array.isArray(req.body.added_skills)?req.body.added_skills:[];
    const copy={...me,skills:[...(Array.isArray(me.skills)?me.skills:[]),...extra]};
    const before=match(me,j).total, after=match(copy,j).total;
    await db.query("INSERT INTO whatif_runs(student_id,job_id,added_skills,score_before,score_after) VALUES($1,$2,$3,$4,$5)",[req.user.id,j.id,JSON.stringify(extra),before,after]);
    return res.json({before,after,delta:after-before});
  }

  if(action==="recommend"){
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1",[req.body.job_id])).rows[0];
    if(!j||!me)return res.status(404).json({error:"job or profile not found"});
    const m=match(me,j);
    try{
      const r=await ai.generateText({model:"haiku",purpose:"talentiq-recommendation",userId:req.user.id,messages:[{role:"system",content:"Give practical career advice with strengths, top gaps, three actions, and interview focus."},{role:"user",content:JSON.stringify({student:{skills:me.skills,education:me.education,experience:me.experience,projects:me.projects},job:{title:j.title,description:j.description},match:m})}],maxTokens:700});
      await db.query("INSERT INTO recommendations(student_id,job_id,recommendation,source) VALUES($1,$2,$3,'ai')",[req.user.id,j.id,r.text]);
      return res.json({recommendation:r.text,source:"ai"});
    }catch(e){
      const fallback="Strengths: "+m.matched.join(", ")+"\nTop gaps: "+m.missing.slice(0,3).join(", ")+"\nNext: build one project using the top gap, complete a focused assessment, and tailor your resume to this role.";
      await db.query("INSERT INTO recommendations(student_id,job_id,recommendation,source) VALUES($1,$2,$3,'local')",[req.user.id,j.id,fallback]);
      return res.json({recommendation:fallback,source:"local"});
    }
  }

  if(action==="create_job"){
    if(me?.role!=="company")return res.status(403).json({error:"Company role required."});
    const d=req.body||{}; if(!d.title||!d.description)return res.status(400).json({error:"Title and description are required."});
    const q=await db.query("INSERT INTO jobs(company_id,title,description,weight_skill,weight_experience,weight_projects,weight_education) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",[req.user.id,d.title,d.description,Number(d.weight_skill)||40,Number(d.weight_experience)||25,Number(d.weight_projects)||20,Number(d.weight_education)||15]);
    return res.json({job:q.rows[0]});
  }

  if(action==="company_candidates"){
    if(me?.role!=="company")return res.status(403).json({error:"Company role required."});
    const j=(await db.query("SELECT * FROM jobs WHERE id=$1 AND company_id=$2",[req.body.job_id,req.user.id])).rows[0];
    if(!j)return res.status(404).json({error:"Job not found."});
    const students=(await db.query("SELECT * FROM profiles WHERE role='student'")).rows;
    return res.json({job:j,candidates:students.map(p=>({user_id:p.user_id,name:p.name,email:p.email,match:match(p,j)})).sort((a,b)=>b.match.total-a.match.total)});
  }

  if(action==="college_stats"){
    if(me?.role!=="college")return res.status(403).json({error:"College role required."});
    const students=(await db.query("SELECT COUNT(*)::int count FROM profiles WHERE role='student'")).rows[0].count;
    const jobs=(await db.query("SELECT COUNT(*)::int count FROM jobs")).rows[0].count;
    const applications=(await db.query("SELECT COUNT(*)::int count FROM job_applications")).rows[0].count;
    const assessments=(await db.query("SELECT skill,ROUND(AVG(score))::int score,COUNT(*)::int attempts FROM assessments GROUP BY skill ORDER BY score DESC")).rows;
    const skillRows=(await db.query("SELECT skills FROM profiles WHERE role='student'")).rows;
    const freq={}; for(const row of skillRows){for(const s of (Array.isArray(row.skills)?row.skills:[])){freq[s]=(freq[s]||0)+1;}}
    const demand=Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([skill,count])=>({skill,count}));
    return res.json({students,jobs,applications,top_skills:demand,assessment_scores:assessments});
  }

  return res.status(400).json({error:"Unknown action"});
}