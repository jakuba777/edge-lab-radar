'use strict';
/* Source fixture hours appear aligned with Europe/Warsaw for covered leagues, but
   open-matchday does NOT provide verified timezone metadata or actual LIVE status.
   Same-day events are RESEARCH ONLY and require a fresh source + 15 minute buffer. */
(function(root){
 const ZONE='Europe/Warsaw';
 function clock(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{
   timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',
   hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:[parts.year,parts.month,parts.day].join('-'),
   minute:Number(parts.hour)*60+Number(parts.minute)};
 }
 function timeMinute(v){
  const m=String(v||'').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  return m&&Number(m[1])<24&&Number(m[2])<60?Number(m[1])*60+Number(m[2]):null;
 }
 function status(f,now=new Date(),sourceAgeHours=0){
  const time=timeMinute(f?.time);
  const day=String(f?.date||'');
  const current=clock(now);
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(day))return 'invalid';
  if(day<current.date)return 'past';
  if(day>current.date)return 'future'; // Tomorrow: include even with unknown hour.
  if(!Number.isFinite(sourceAgeHours)||sourceAgeHours<0||sourceAgeHours>8)return 'today_unverified';
  if(time===null)return 'today_unknown_time';
  if(time<=current.minute+15)return 'today_started_or_imminent';
  return 'today_remaining_unverified_time_zone';
 }
 function eligible(f,now=new Date(),sourceAgeHours=0){
  const s=status(f,now,sourceAgeHours);
  return s==='future'||s==='today_remaining_unverified_time_zone';
 }
 function sortKey(m){
  const n=timeMinute(m.time);
  return m.date+' '+String(n===null?1440:n).padStart(4,'0');
 }
 const API={clock,timeMinute,status,eligible,sortKey};
 if(typeof module!=='undefined'&&module.exports)module.exports=API;
 if(root)root.EDGEWINDOW=API;
})(typeof window!=='undefined'?window:null);
