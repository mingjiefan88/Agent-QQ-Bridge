import {readFile,writeFile,mkdir,mkdtemp,copyFile,rm,realpath} from 'node:fs/promises';
import {join,resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),base=join(root,'dist','release-boundary-tests'),run=promisify(execFile);
await mkdir(base,{recursive:true});const fixture=await mkdtemp(join(base,'case-')),files=JSON.parse(await readFile(join(root,'release-files.json'),'utf8'));
try{
 for(const file of files){const target=join(fixture,file);await mkdir(dirname(target),{recursive:true});await copyFile(join(root,file),target);}
 const check=()=>run(process.execPath,[join(root,'scripts','check-release.mjs'),fixture],{cwd:fixture});
 await check();
 const image=files.find(path=>path.endsWith('.ico')),original=await readFile(join(fixture,image));
 await writeFile(join(fixture,image),Buffer.from('untrusted image'));await assert.rejects(check(),/Image asset digest mismatch|Invalid ICO signature/);
 const lockPath=join(fixture,'third_party','assets.lock.json'),originalLock=await readFile(lockPath),assetLock=JSON.parse(originalLock);assetLock[image]=createHash('sha256').update(Buffer.from('untrusted image')).digest('hex');await writeFile(lockPath,JSON.stringify(assetLock));await assert.rejects(check(),/Invalid ICO signature/);await writeFile(lockPath,originalLock);await writeFile(join(fixture,image),original);
 await writeFile(join(fixture,'unlisted.bin'),Buffer.from([0,1,2]));await assert.rejects(check(),/Not allowlisted: unlisted.bin/);await rm(join(fixture,'unlisted.bin'));
 const readme=await readFile(join(fixture,'README.md'));await writeFile(join(fixture,'README.md'),Buffer.from([255,0]));await assert.rejects(check(),/Invalid UTF-8 text/);await writeFile(join(fixture,'README.md'),readme);
 await writeFile(join(fixture,'README.md'),'sk-'+ 'x'.repeat(40));await assert.rejects(check(),/Credential pattern/);await writeFile(join(fixture,'README.md'),readme);
 const manifest=await readFile(join(fixture,'release-files.json'));await writeFile(join(fixture,'release-files.json'),JSON.stringify([...files,'../escape.txt']));await assert.rejects(check(),/Invalid release manifest/);await writeFile(join(fixture,'release-files.json'),manifest);
 await writeFile(join(fixture,'config.json'),'{}');await writeFile(join(fixture,'release-files.json'),JSON.stringify([...files,'config.json']));await assert.rejects(check(),/Private\/runtime file prohibited/);
 console.log('PASS: release checker accepts declared source and rejects image tampering, invalid image signatures, unlisted binary, invalid UTF-8, credentials, traversal and private configuration.');
}finally{const actual=await realpath(fixture),parent=await realpath(base),rel=relative(parent,actual);if(!rel || rel.startsWith('..') || isAbsolute(rel))throw Error('Unsafe test cleanup path');await rm(actual,{recursive:true,force:true});}
