import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),repo=process.cwd();
const out=path.join(repo,".superpowers/sdd/2026-09-14-organizer-master-workspace/task-7-fix-1-browser");
await fs.mkdir(out,{recursive:true});
const esbuild=createRequire(require.resolve("tsx"))("esbuild");
const css=(await require("postcss")([require("@tailwindcss/postcss")()]).process(await fs.readFile("src/app/globals.css","utf8"),{from:path.join(repo,"src/app/globals.css")})).css;
const entry=`
import React from "react";import {createRoot} from "react-dom/client";import {NextIntlClientProvider} from "next-intl";
import en from "./messages/en.json";import id from "./messages/id.json";
import {OrganizerMasterShell} from "./src/components/v3/organizer/OrganizerMasterShell";
import {CompetitionWorkspace} from "./src/components/v3/competition/CompetitionWorkspace";
import {generateCompetitionGraph} from "./src/lib/tournament/competition";
import {TOURNAMENT_FORMAT_PRESETS} from "./src/lib/tournament/formats/types";
const locale=location.pathname.startsWith("/id/")?"id":"en",query=Object.fromEntries(new URLSearchParams(location.search)),view=location.pathname.split("/").at(-1),preset=query.preset||sessionStorage.getItem("task7preset")||"groupPlayoffs";sessionStorage.setItem("task7preset",preset);
const teams=Array.from({length:16},(_,i)=>({id:"team-"+i,name:["Garuda Nova Community","Vortex Indonesia","Phoenix Core","Titan Esports"][i%4]+" "+(i+1),seed:i+1}));
const graph=generateCompetitionGraph({eventId:"cup",config:TOURNAMENT_FORMAT_PRESETS[preset],teams});
const matches=graph.matches.map((m,i)=>({id:m.id,homeTeamId:teams[(i*2)%16].id,awayTeamId:teams[(i*2+1)%16].id,homeScore:i%3,awayScore:0,status:i===0?"Live":i%4===0?"Completed":"Scheduled",scheduleStatus:i===0?"live":i%4===0?"completed":"confirmed",scheduleVersion:3,resultVersion:i%4===0&&i>0?1:0,bestOf:m.bestOf,roundLabel:"Round "+m.round,phaseId:m.phaseId,groupId:m.groupId,start:"2026-09-12T02:00:00Z",end:"2026-09-12T02:30:00Z",room:i%2?"Room B":"Room A",games:[]}));
const state={event:{id:"cup",name:"Flash Peak Championship",status:"Ongoing",version:4,timezone:"Asia/Jakarta",startsAt:"2026-09-12T02:00:00Z",publishedScheduleVersion:3,config:graph.config},graph,teams,drawingPublished:true,drawing:{status:"published",teams},matches,standings:(graph.groups.length?graph.groups:[{id:null,phaseId:graph.phases[0].id}]).map(group=>({phaseId:group.phaseId,groupId:group.id,complete:false,rows:teams.slice(0,4).map((team,i)=>({teamId:team.id,rank:i+1,played:3,points:9-i*3,tied:false}))})),readiness:[],actions:[{id:"tiebreak-action",matchId:null,priority:"critical",title:"Standings require a tiebreak decision",detail:"Unresolved ranks cannot qualify automatically"}],schedule:null,publishedSchedule:null,incidents:[],announcements:[],audit:[],unavailableSections:[]};
window.fetch=async()=>({ok:true,json:async()=>state});
const summary={event:{id:"cup",title:state.event.name,game:"Mobile Legends",format:preset},lifecycle:"ongoing",publication:"published",role:"organizer",updatedAt:"2026-09-12T02:00:00Z",capabilities:{overview:true,registration:true,participants:true,competition:true,schedule:true,"match-control":true,completion:true,announcements:false,settings:false},badges:{"match-control":2},blockers:[]};
createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale={locale} messages={locale==="id"?id:en} timeZone="Asia/Jakarta"><OrganizerMasterShell summary={summary} locale={locale}><CompetitionWorkspace initialState={state} locale={locale} view={view} masterShell query={query}/></OrganizerMasterShell></NextIntlClientProvider>);
`;
const built=await esbuild.build({stdin:{contents:entry,resolveDir:repo,loader:"tsx",sourcefile:"task-7-fixture.tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"fixture-boundaries",setup(build){
build.onResolve({filter:/^next\/navigation$|^@\/i18n\/navigation$|^@\/lib\/actions\/competition-v3-actions$/},args=>({path:args.path,namespace:"fixture"}));
build.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"tsx",resolveDir:repo,contents:args.path.includes("competition-v3-actions")?'export async function mutateCompetitionWorkspaceAction(){return {status:"saved",receipt:{version:5}}};export async function previewCompetitionResultCorrectionAction(){return {}}':args.path==="next/navigation"?'export const useRouter=()=>({refresh(){}});':'import React from "react";export const usePathname=()=>location.pathname.replace(/^\\/(id|en)/,"");export const Link=React.forwardRef(({locale,href,...props},ref)=><a {...props} ref={ref} href={(locale?"/"+locale:"")+href}/>);'}));
}}]});
const fontDir=path.join(path.dirname(require.resolve("@fontsource/montserrat/400.css")),"files");
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","text/javascript");res.end(built.outputFiles[0].text);}else if(url.pathname==="/style.css"){res.setHeader("Content-Type","text/css");res.end(css);}else if(url.pathname.endsWith(".woff2")||url.pathname.endsWith(".woff"))res.end(await fs.readFile(path.join(fontDir,path.basename(url.pathname))));else if(url.pathname.startsWith("/logo/")){res.setHeader("Content-Type","image/svg+xml");res.end(await fs.readFile(path.join(repo,"public",url.pathname)));}else{res.setHeader("Content-Type","text/html");res.end('<!doctype html><html data-panel-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}}catch(error){res.statusCode=500;res.end(String(error));}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,browser=await require("playwright-core").chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const results=[],errors=[];
try{
for(const locale of ["id","en"])for(const width of [360,1440])for(const view of ["match-control"])for(const preset of ["roundRobin","groupPlayoffs"]){
 const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:"reduce"});
 page.on("pageerror",error=>errors.push(String(error)));
 await page.goto(`http://127.0.0.1:${port}/${locale}/organizer/events/cup/${view}?preset=${preset}`);
 await page.locator("[data-operations]").waitFor();await page.evaluate(()=>document.fonts.ready);
 const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector("[data-operations] h1")).fontFamily,smallTargets:[...document.querySelectorAll("[data-operations] button,[data-operations] a,[data-operations] input,[data-operations] select,[data-operations] summary")].filter(el=>el.getClientRects().length&&el.type!=="hidden"&&el.type!=="checkbox"&&el.getBoundingClientRect().height<43.9).map(el=>({text:el.textContent,height:el.getBoundingClientRect().height}))}));
 if(geometry.scroll!==width||geometry.smallTargets.length||!geometry.font.includes("Montserrat"))throw Error(JSON.stringify({locale,width,view,preset,geometry}));
 const first=page.locator("[data-operations] form select").first();await first.focus();await page.keyboard.press("Tab");
 if(!await page.evaluate(()=>document.activeElement?.matches("[data-operations] select,[data-operations] button")))throw Error("Filter keyboard order");

 const action=page.locator('[data-event-action="tiebreak-action"]');
 const reason=locale==="id"?"Klasemen memerlukan keputusan pemecah seri":"Standings require a tiebreak decision";
 const detail=locale==="id"?"Peringkat yang belum ditentukan tidak dapat lolos secara otomatis.":"Unresolved ranks cannot qualify automatically";
 if(!(await action.textContent()).includes(reason)||!(await action.textContent()).includes(detail))throw Error("Missing localized tiebreak context");
 const destination=await action.getAttribute("href");
 if(destination!==`/${locale}/organizer/events/cup/competition#competition-standings`)throw Error("Wrong tiebreak destination: "+destination);
 if(locale==="id"&&/Standings require|Unresolved ranks/.test(await action.textContent()))throw Error("Untranslated tiebreak");
 await action.focus();
 if(!await action.evaluate(el=>el===document.activeElement&&getComputedStyle(el).outlineStyle!=="none"))throw Error("Action visible focus");
 await page.screenshot({path:path.join(out,`${locale}-${width}-${preset}-action.png`),fullPage:true});
 await action.press("Enter");await page.waitForURL(/competition#competition-standings$/);
 await page.locator("#competition-standings").waitFor();
 const context=await page.locator("#competition-standings").textContent();
 if(!(locale==="id"?/Klasemen/:/standings/i).test(context))throw Error("Missing standings context");
 if(preset==="roundRobin"&&!(locale==="id"?/Klasemen liga/:/League standings/).test(context))throw Error("Lost league context");
 if(await page.evaluate(()=>document.documentElement.scrollWidth!==innerWidth))throw Error("Destination overflow");
 await page.screenshot({path:path.join(out,`${locale}-${width}-${preset}-standings.png`),fullPage:true});
 results.push({locale,width,view,preset,...geometry});await page.close();
}
if(errors.length)throw Error(errors.join("\n"));
await fs.writeFile(path.join(out,"results.json"),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,overflow:0,smallTargets:0,keyboard:"passed",tiebreakContextAndDestination:"passed",errors}));
}finally{await browser.close();server.close();}
