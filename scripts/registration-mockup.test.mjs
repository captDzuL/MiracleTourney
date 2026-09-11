import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'public/miracle-organizer-v3-registration-mockup.html');
const html = readFileSync(target, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
new Function(scripts.at(-1)[1]);

const expectedSourceContracts = ["source:'Captain'", "source:'Import'", "source:'Manual'"];
for (const contract of expectedSourceContracts) {
  if (!html.includes(contract)) throw new Error(`Missing unified registration contract: ${contract}`);
}

const scratch = mkdtempSync(join(tmpdir(), 'miracle-registration-test-'));
const harness = join(scratch, 'harness.html');
writeFileSync(harness, `<!doctype html><body data-result="running"><pre id="result">running</pre>
<iframe id="app" src="${pathToFileURL(target).href}" style="width:375px;height:900px;border:0"></iframe>
<script>
const finish=(state,message)=>{document.body.dataset.result=state;document.querySelector('#result').textContent=message};
document.querySelector('#app').addEventListener('load',()=>setTimeout(()=>{try{
 const doc=document.querySelector('#app').contentDocument;
 for(const id of ['registration-next-action','captain-channel','import-channel','add-team','copy-registration-link','preview-registration','registration-settings','registration-status-tabs']) if(!doc.getElementById(id)) throw Error('missing #'+id);
 const steps=[...doc.querySelectorAll('.import-step')].map(node=>node.textContent.trim());
 for(const label of ['Upload','Column Mapping','Validate','Preview','Import']) if(!steps.some(step=>step.includes(label))) throw Error('missing import step '+label);
 doc.querySelector('#preview-registration').click();
 if(doc.querySelector('#drawer-layer').hidden) throw Error('Preview does not open');
 doc.querySelector('#close-drawer').click();
 doc.querySelector('#add-team').click();
 if(!doc.querySelector('#manual-team-form')) throw Error('Manual team form does not open');
 doc.querySelector('#close-drawer').click();
 const status=doc.querySelector('[data-registration-status="Perlu diperiksa"]');status.click();
 if(status.getAttribute('aria-selected')!=='true') throw Error('Status selection is not exposed');
 if(doc.documentElement.scrollWidth>doc.documentElement.clientWidth) throw Error('Mobile layout overflows');
 finish('pass','registration control center behavior passed');
}catch(error){finish('fail',error.message)}},500));
</script></body>`, 'utf8');

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const run = spawnSync(edge, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--virtual-time-budget=2500', '--dump-dom', pathToFileURL(harness).href], { encoding: 'utf8' });
rmSync(scratch, { recursive: true, force: true });
if (run.error) throw run.error;
if (run.status !== 0) throw new Error(run.stderr || `Edge exited with ${run.status}`);
const match = run.stdout.match(/<body[^>]*data-result="([^"]+)"[^>]*>[\s\S]*?<pre id="result">([^<]*)<\/pre>/i);
if (!match || match[1] !== 'pass') throw new Error(match?.[2] || 'Browser test did not complete');
console.log(`PASS: ${match[2]}`);
