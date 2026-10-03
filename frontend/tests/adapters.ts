import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import os from '../../shared/contracts/observation.schema.json';
import as from '../../shared/contracts/analysis.schema.json';
import { mockApi, httpApi, demoObservation } from '../src/api.ts';
async function main() {
 const ajv = new Ajv({strict:false}); addFormats(ajv);
 assert(ajv.compile(os)(demoObservation));
 const result = await mockApi.analyze(demoObservation);
 assert(ajv.compile(as)(result)); assert.equal(result.data_mode, 'demo');
 const original = globalThis.fetch;
 globalThis.fetch = async () => new Response(JSON.stringify(result), {status:200});
 assert.deepEqual(await httpApi('http://example.invalid').analyze(demoObservation), result);
 globalThis.fetch = async () => { throw new Error('offline'); };
 await assert.rejects(httpApi('http://example.invalid').analyze(demoObservation), {code:'network_unavailable',retryable:true});
 globalThis.fetch = original;
 console.log('Fixtures and mock/HTTP adapters passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
