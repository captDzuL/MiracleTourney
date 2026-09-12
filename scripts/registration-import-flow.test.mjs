import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/miracle-organizer-v3-registration-mockup.html');
const scratch = mkdtempSync(join(tmpdir(), 'miracle-import-flow-'));
const harness = join(scratch, 'harness.html');
writeFileSync(harness, `<!doctype html><body data-result="running"><pre id="result">running</pre><iframe id="app" src="${pathToFileURL(target).href}"></iframe><script>
const finish=(state,message)=>{document.body.dataset.result=state;document.querySelector('#result').textContent=message};
document.querySelector('#app').addEventListener('load',()=>setTimeout(()=>{try{const doc=document.querySelector('#app').contentDocument;
doc.querySelector('#channel-import').click();if(doc.querySelector('#import-view').hidden)throw Error('channel did not open wizard');
doc.querySelector('#sample-data').click();if(doc.querySelector('#mapping-stage').hidden)throw Error('sample did not reach mapping');
doc.querySelector('#to-review').click();if(doc.querySelector('#review-stage').hidden)throw Error('validation did not reach preview');
doc.querySelector('#review-selected').click();if(doc.querySelector('#confirm-stage').hidden)throw Error('preview did not reach confirmation');
doc.querySelector('#commit-import').click();if(doc.querySelector('#success-stage').hidden)throw Error('import did not reach success');
doc.querySelector('#show-results').click();if(doc.querySelector('#source-filter').value!=='Import')throw Error('result did not return to unified list');
finish('pass','upload → mapping → validate → preview → import passed')}catch(error){finish('fail',error.message)}},500));</script></body>`, 'utf8');
const edge='C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const run=spawnSync(edge,['--headless=new','--disable-gpu','--allow-file-access-from-files','--virtual-time-budget=3500','--dump-dom',pathToFileURL(harness).href],{encoding:'utf8'});
rmSync(scratch,{recursive:true,force:true});
if(run.error)throw run.error;if(run.status!==0)throw Error(run.stderr||`Edge exited with ${run.status}`);
const match=run.stdout.match(/<body[^>]*data-result="([^"]+)"[^>]*>[\s\S]*?<pre id="result">([^<]*)<\/pre>/i);
if(!match||match[1]!=='pass')throw Error(match?.[2]||'Browser test did not complete');
console.log(`PASS: ${match[2]}`);
