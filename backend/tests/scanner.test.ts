import assert from 'node:assert/strict'
import { createServer } from 'node:net'
import type { Socket } from 'node:net'
import { test } from 'node:test'
import { createClamAvScanner, readScannerConfig } from '../src/modules/files/clamav-scanner.ts'
import { inspectUpload, MAX_UPLOAD_BYTES } from '../src/modules/files/upload-policy.ts'

const pdf = Buffer.from('%PDF-1.4\nSynthetic content\n%%EOF\n')
test('upload inspection enforces the approved size and byte signatures instead of names', async () => {
  assert.equal((await inspectUpload(pdf,'synthetic.png')).mimeType,'application/pdf')
  for (const name of ['../synthetic.pdf','folder\\synthetic.pdf','synthetic\0.pdf','synthetic\r.pdf',' ','x'.repeat(256)]) await assert.rejects(inspectUpload(pdf,name),{status:422})
  await assert.rejects(inspectUpload(Buffer.alloc(0),'synthetic.pdf'),{status:413})
  await assert.rejects(inspectUpload(Buffer.alloc(MAX_UPLOAD_BYTES+1),'synthetic.pdf'),{status:413})
  for (const bytes of [Buffer.from('arbitrary executable bytes'),Buffer.from('%P'),Buffer.from('<svg>synthetic</svg>')]) await assert.rejects(inspectUpload(bytes,'synthetic.pdf'),{status:415})
  const maximum = Buffer.alloc(MAX_UPLOAD_BYTES,32);pdf.copy(maximum);assert.equal((await inspectUpload(maximum,'maximum.pdf')).sizeBytes,MAX_UPLOAD_BYTES)
})
async function withScanner(result: string | null, run: (scanner: ReturnType<typeof createClamAvScanner>) => Promise<void>, ageHours = 0) {
  const sockets = new Set<Socket>(); const received: Buffer[] = []
  const server = createServer((socket) => {
    sockets.add(socket); socket.on('close',()=>sockets.delete(socket)); socket.on('error',()=>{}); let pending = Buffer.alloc(0); let hasCommand = false; let remaining: number | undefined
    socket.on('data',(chunk: Buffer)=>{
      pending=Buffer.concat([pending,chunk])
      if (!hasCommand) {
        const end=pending.indexOf(0);if(end<0)return
        const command=pending.subarray(0,end).toString();pending=pending.subarray(end+1);hasCommand=true
        if(command==='zVERSION'){socket.end(`ClamAV 1.5.4/12345/${new Date(Date.now()-ageHours*3600000).toUTCString().replace(' GMT','')}\0`);return}
        assert.equal(command,'zINSTREAM')
      }
      while(true){
        if(remaining===undefined){if(pending.length<4)return;remaining=pending.readUInt32BE(0);pending=pending.subarray(4);if(remaining===0){if(result!==null)socket.end(result);return}}
        if(pending.length<remaining)return
        received.push(pending.subarray(0,remaining));pending=pending.subarray(remaining);remaining=undefined
      }
    })
  })
  await new Promise<void>((resolve)=>server.listen(0,'127.0.0.1',resolve));const address=server.address();if(!address||typeof address==='string')throw new Error('Missing scanner listener.')
  try { await run(createClamAvScanner({host:'127.0.0.1',port:address.port,timeoutMs:100})); if(result==='stream: OK\0')assert.deepEqual(Buffer.concat(received),pdf) }
  finally {for(const socket of sockets)socket.destroy();await new Promise<void>((resolve,reject)=>server.close((error)=>error?reject(error):resolve()))}
}
test('ClamAV streams exact bytes and accepts only a complete clean verdict', async () => {
  await withScanner('stream: OK\0',async(scanner)=>assert.equal(await scanner.scan(pdf),'clean'))
  await withScanner('stream: Eicar-Signature FOUND\0',async(scanner)=>assert.equal(await scanner.scan(pdf),'rejected'))
  for(const result of ['stream: OK\0stream: Eicar FOUND\0','stream: OK','stream: scan failed ERROR\0','UNKNOWN COMMAND\0','x'.repeat(4097),null])await withScanner(result,async(scanner)=>{await assert.rejects(scanner.scan(pdf),{status:503,code:'SCANNER_UNAVAILABLE'})})
  await withScanner(null,async(scanner)=>{await assert.rejects(scanner.scan(pdf),{status:503,code:'SCANNER_UNAVAILABLE'})},73)
})
test('scanner configuration is bounded and sanitized',()=>{
  for(const env of [{CLAMAV_PORT:'0'},{CLAMAV_TIMEOUT_MS:'10001'},{CLAMAV_HOST:'https://secret@example.test'}])assert.throws(()=>readScannerConfig(env),{message:'Invalid scanner configuration. See backend/.env.example.'})
})
test('upload configuration is opt-in and bounds the durable admission limit',async()=>{
 const {readUploadConfig}=await import('../src/modules/files/upload-config.ts')
 assert.deepEqual(readUploadConfig({}),{isEnabled:false,attemptsPerMinute:12})
 assert.deepEqual(readUploadConfig({PRIVATE_UPLOADS_ENABLED:'true',FILE_UPLOAD_ATTEMPTS_PER_MINUTE:'20'}),{isEnabled:true,attemptsPerMinute:20})
 for(const input of [{PRIVATE_UPLOADS_ENABLED:'yes'},{FILE_UPLOAD_ATTEMPTS_PER_MINUTE:'0'},{FILE_UPLOAD_ATTEMPTS_PER_MINUTE:'101'}])assert.throws(()=>readUploadConfig(input),/Invalid private storage configuration/)
})
