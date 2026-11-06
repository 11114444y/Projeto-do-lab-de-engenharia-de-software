import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calculateSalary } from '../src/lib/salary.ts';
test('INSS 2026 progressivo mínimo', ()=>{
  const s=calculateSalary(1621);
  assert.equal(s.inss,121.58);assert.equal(s.irrf,0);assert.equal(s.net,1499.42);
});
test('isenção IR 2026 até 5000 e redução parcial',()=>{
  assert.equal(calculateSalary(5000).irrf,0);
  assert.ok(calculateSalary(6500).irrf>0);
  assert.ok(calculateSalary(6500).irrf<calculateSalary(7500).irrf);
});
test('teto progressivo INSS e FGTS não descontado',()=>{
  assert.equal(calculateSalary(9000).inss,988.09);
  assert.equal(calculateSalary(9000).fgts,720);
});
