import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),repo=process.cwd();
const out=path.join(repo,".superpowers/sdd/2026-09-14-organizer-master-workspace/task-8-browser");
await fs.mkdir(out,{recursive:true});
const esbuild=createRequire(require.resolve("tsx"))("esbuild");
const css=(await require("postcss")([require("@tailwindcss/postcss")()]).process(await fs.readFile("src/app/globals.css","utf8"),{from:path.join(repo,"src/app/globals.css")})).css;
const testSource=await fs.readFile("src/components/v3/organizer/matches/match-result-statistics.test.tsx","utf8");
const fixture=testSource.split("\n").find(line=>line.startsWith("function fixture()"));
const statistics=testSource.split("\n").find(line=>line.startsWith("function statistics()"));
const entry=`
import React from "react";import {createRoot} from "react-dom/client";import {NextIntlClientProvider} from "next-intl";
import en from "./messages/en.json";import id from "./messages/id.json";
import {OrganizerMasterShell} from "./src/components/v3/organizer/OrganizerMasterShell";
import {MatchResultStatisticsWorkspace} from "./src/components/v3/organizer/matches/MatchResultStatisticsWorkspace";
${fixture}
${statistics}
const locale=location.pathname.startsWith("/id/")?"id":"en",query=new URLSearchParams(location.search),view=query.get("view")||"result",bestOf=Number(query.get("bestOf")||3);
const state=fixture(),data=statistics();
if(query.has("status")){state.matches[0].status=query.get("status");state.matches[0].resultVersion=0;data.resultVersion=0;}
state.matches[0].bestOf=bestOf;
data.games=Array.from({length:bestOf},(_,i)=>({gameNumber:i+1,homeScore:i+2,awayScore:1}));
state.matches[0].games=data.games;
data.scoreGameNumbers=data.games.map(game=>game.gameNumber);
data.teams[0].players=Array.from({length:5},(_,i)=>({id:"player"+(i+1),teamId:"home",nickname:["Nyx","Raven","Orion","Atlas","Echo"][i],position:"Forward"}));
data.stats.player1.scores=data.scoreGameNumbers.map((_,i)=>i===0?7.6:null);
data.submissions[0].stats.player1.scores=data.scoreGameNumbers.map((_,i)=>i===0?8.1:null);
window.__calls=[];window.fetch=async()=>({ok:true,json:async()=>state});
const summary={event:{id:"event",title:"Flash Peak Championship",game:"Flashpeak",format:"Single Elimination"},lifecycle:"ongoing",publication:"published",role:"organizer",updatedAt:"2026-09-16T00:00:00Z",capabilities:{overview:true,registration:true,participants:true,competition:true,schedule:true,"match-control":true,completion:true,announcements:false,settings:false},badges:{"match-control":1},blockers:[]};
createRoot(document.getElementById("root")).render(<NextIntlClientProvider locale={locale} messages={locale==="id"?id:en} timeZone="Asia/Jakarta"><OrganizerMasterShell summary={summary} locale={locale}><MatchResultStatisticsWorkspace initialState={state} statistics={data} matchId="match:1" locale={locale} view={view}/></OrganizerMasterShell></NextIntlClientProvider>);
`;
const built=await esbuild.build({stdin:{contents:entry,resolveDir:repo,loader:"tsx",sourcefile:"task-8-fixture.tsx"},bundle:true,write:false,platform:"browser",format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"development"'},plugins:[{name:"fixture-boundaries",setup(build){
build.onResolve({filter:/^next\/navigation$|^@\/i18n\/navigation$|^@\/lib\/actions\/(competition-v3-actions|player-stats-v3-actions)$/},args=>({path:args.path,namespace:"fixture"}));
build.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"tsx",resolveDir:repo,contents:args.path.includes("player-stats-v3-actions")?'const save=async(form)=>{window.__calls.push(Object.fromEntries(form));return {status:"saved"}};export const saveEventPlayerStatsAction=save,approveEventPlayerStatsAction=save,rejectEventPlayerStatsAction=save;':args.path.includes("competition-v3-actions")?'export async function mutateCompetitionWorkspaceAction(input){window.__calls.push(input);return {status:"saved",receipt:{version:8}}};export async function previewCompetitionResultCorrectionAction(){return {token:"preview",competitionVersion:7,affectedMatchIds:[],blockedMatchIds:[],participants:[],standings:[],schedule:null}}':args.path==="next/navigation"?'export const useRouter=()=>({refresh(){}});':'import React from "react";export const usePathname=()=>location.pathname.replace(/^\\/(id|en)/,"");export const Link=React.forwardRef(({locale,href,...props},ref)=><a {...props} ref={ref} href={(locale?"/"+locale:"")+href}/>);'}));
}}]});
const fontDir=path.join(path.dirname(require.resolve("@fontsource/montserrat/400.css")),"files");
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,"http://localhost");if(url.pathname==="/bundle.js"){res.setHeader("Content-Type","text/javascript");res.end(built.outputFiles[0].text);}else if(url.pathname==="/style.css"){res.setHeader("Content-Type","text/css");res.end(css);}else if(url.pathname.endsWith(".woff2")||url.pathname.endsWith(".woff"))res.end(await fs.readFile(path.join(fontDir,path.basename(url.pathname))));else if(url.pathname.startsWith("/logo/")){res.setHeader("Content-Type","image/svg+xml");res.end(await fs.readFile(path.join(repo,"public",url.pathname)));}else{res.setHeader("Content-Type","text/html");res.end('<!doctype html><html data-panel-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');}}catch(error){res.statusCode=500;res.end(String(error));}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const port=server.address().port,browser=await require("playwright-core").chromium.launch({executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",headless:true});
const results=[],errors=[];
try{
 for(const locale of ["id","en"])for(const width of [360,390,768,1024,1440])for(const view of ["result","statistics","history"])for(const bestOf of [1,3,5]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:"reduce"});
  page.on("pageerror",error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/${locale}/organizer/events/event/matches/match%3A1?view=${view}&bestOf=${bestOf}`);
  await page.locator("[data-match-workspace]").waitFor();await page.evaluate(()=>document.fonts.ready);
  if(view==="result"){await page.getByRole("button",{name:locale==="id"?"Buka kembali untuk koreksi":"Reopen for correction",exact:true}).click();if(await page.locator('input[name^="home-"]').count()!==bestOf)throw Error("Played game order");}
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,font:getComputedStyle(document.querySelector("[data-match-workspace] h1")).fontFamily,smallTargets:[...document.querySelectorAll("[data-match-workspace] button,[data-match-workspace] a,[data-match-workspace] input,[data-match-workspace] textarea,[data-match-workspace] summary")].filter(el=>el.getClientRects().length&&el.type!=="hidden"&&el.getBoundingClientRect().height<43.9).map(el=>({text:el.textContent,height:el.getBoundingClientRect().height}))}));
  if(geometry.scroll!==width||geometry.smallTargets.length||!geometry.font.includes("Montserrat"))throw Error(JSON.stringify({locale,width,view,bestOf,geometry}));
  await page.locator('[data-match-view="result"]').focus();await page.keyboard.press("Tab");
  if(!await page.locator('[data-match-view="statistics"]').evaluate(el=>el===document.activeElement))throw Error("Tab navigation");
  if(view==="statistics"){
   const score=page.locator('input[name="score_player1_1"]');await score.fill("10.1");
   await page.locator('[data-player-form="home"] button[type="submit"]').click();
   if(!await score.evaluate(el=>el===document.activeElement&&el.getAttribute("aria-invalid")==="true"))throw Error("Inline validation focus");
   if(await page.evaluate(()=>window.__calls.length)!==0)throw Error("Invalid mutation");
   await score.fill("7.6");await page.locator('[data-player-form="home"] button[type="submit"]').click();
   const payload=await page.evaluate(()=>window.__calls[0]);
   if(payload.stat_player1_goal!=="3"||payload.score_player1_1!=="7.6"||payload.expectedResultVersion!=="2"||!payload.operationId)throw Error("Canonical payload");
   await page.locator("[data-submission] button[type=submit]").click();
   if(!await page.locator("[data-submission] textarea").evaluate(el=>el===document.activeElement))throw Error("Review note focus");
  }
  if([360,1440].includes(width)&&bestOf===3)await page.screenshot({path:path.join(out,`${locale}-${width}-${view}.png`),fullPage:true});
  results.push({locale,width,view,bestOf,...geometry});await page.close();
 }
 for(const locale of ["id","en"])for(const width of [360,390,768,1024,1440])for(const status of ["Scheduled","Live"]){
  const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:"reduce"});
  page.on("pageerror",error=>errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${port}/${locale}/organizer/events/event/matches/match%3A1?view=result&status=${status}`);
  await page.locator("[data-match-workspace]").waitFor();await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll("[data-match-workspace] button,[data-match-workspace] input,[data-match-workspace] summary")].filter(el=>el.getClientRects().length&&el.type!=="hidden"&&el.getBoundingClientRect().height<43.9).length}));
  if(geometry.scroll!==width||geometry.smallTargets)throw Error(JSON.stringify({locale,width,status,geometry}));
  if(width<980){const trigger=page.locator('button[aria-controls][aria-expanded]');await trigger.click();const dialog=page.getByRole("dialog");await dialog.waitFor();if(!await dialog.evaluate(el=>el.contains(document.activeElement)))throw Error("Drawer initial focus");await page.keyboard.press("Shift+Tab");if(!await dialog.evaluate(el=>el.contains(document.activeElement)))throw Error("Drawer trapped focus");await page.keyboard.press("Escape");if(!await trigger.evaluate(el=>el===document.activeElement))throw Error("Drawer restored focus");}
  await page.locator('[data-match-view="statistics"]').click();await page.waitForURL(/view=statistics/);await page.goBack();await page.waitForURL(/status=/);
  results.push({locale,width,status,view:"result",...geometry});await page.close();
 }
 if(errors.length)throw Error(errors.join("\n"));
 await fs.writeFile(path.join(out,"results.json"),JSON.stringify(results,null,2));console.log(JSON.stringify({cases:results.length,overflow:0,smallTargets:0,keyboard:"passed",validation:"passed",canonicalPayload:"passed",errors}));
}finally{await browser.close();server.close();}
