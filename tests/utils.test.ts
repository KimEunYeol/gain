import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromLocalInput, koreanDay, monthCells, safeUrl, toLocalInput, videoUrl } from '../src/utils.ts';
test('calendar handles leap years and trailing weeks',()=>{assert.equal(monthCells(2024,1).filter(Boolean).length,29);assert.equal(monthCells(2026,1).filter(Boolean).length,28);assert.equal(monthCells(2026,7).length,42);assert.equal(monthCells(2026,8)[2],1);});
test('Korea dates do not depend on browser timezone',()=>{assert.equal(koreanDay('2026-09-25T15:30:00Z'),'2026-09-26');assert.equal(fromLocalInput('2026-09-25T19:00'),'2026-09-25T10:00:00.000Z');assert.equal(toLocalInput('2026-09-25T10:00:00Z'),'2026-09-25T19:00');assert.equal(fromLocalInput(''),null);});
test('links reject executable and insecure protocols',()=>{for(const url of ['javascript:alert(1)','data:text/html,x','http://example.com','broken'])assert.equal(safeUrl(url),'');assert.equal(safeUrl('https://example.com'),'https://example.com/');});
test('video links only allow actual supported hosts',()=>{assert.ok(videoUrl('https://youtu.be/test'));assert.ok(videoUrl('https://www.instagram.com/reel/test/'));assert.equal(videoUrl('https://youtube.com.evil.test/x'),'');assert.equal(videoUrl('https://youtube.com@evil.test/x'),'');});
