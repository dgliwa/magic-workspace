import { execFile } from "node:child_process";import { fileURLToPath } from "node:url";import { promisify } from "node:util";import type { CollectionEntry,DeckSnapshot } from "./types.js";
const run=promisify(execFile);const helper=fileURLToPath(new URL("../python/moxfield_fetch.py",import.meta.url));
async function fetchViaHelper(mode:"deck"|"collection",input:string){const {stdout}=await run("python3",[helper,mode,input],{timeout:180_000,maxBuffer:64*1024*1024,encoding:"utf8"});return JSON.parse(stdout);}
export async function fetchMoxfieldDeck(input:string):Promise<DeckSnapshot>{return fetchViaHelper("deck",input);}
export async function fetchMoxfieldCollection(input:string):Promise<CollectionEntry[]>{return fetchViaHelper("collection",input);}
